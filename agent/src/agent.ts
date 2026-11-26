import 'dotenv/config';
import WebSocket from 'ws';
import { config } from './config.js';
import { readGpuInfo } from './gpu-info.js';
import type { AgentMessage, ServerMessage } from './protocol.js';
import { runJob, type JobDeps, type JobMessage } from './run-job.js';
import { runBinary } from './runner.js';
import { SIMULATED_GPU, simulateBinary } from './simulator.js';

if (!config.token) {
  console.error('AGENT_TOKEN is not set. Add it to agent/.env (see .env.example).');
  process.exit(1);
}

const wsUrl = `${config.serverUrl.replace(/^http/, 'ws')}/ws/agent`;

/** In simulation mode the jobs are not really run on a GPU (see simulator.ts). */
const deps: JobDeps = {
  serverUrl: config.serverUrl,
  token: config.token,
  runBinary: config.simulate ? simulateBinary : runBinary,
};
if (config.simulate) console.log('Simulation mode: jobs will not really run on a GPU.');
let reconnectAttempts = 0;

/** Connects to the backend and keeps reconnecting if the connection drops. */
function connect() {
  const ws = new WebSocket(wsUrl, {
    headers: { Authorization: `Bearer ${config.token}` },
  });
  const send = (message: AgentMessage) => ws.send(JSON.stringify(message));

  ws.on('open', async () => {
    reconnectAttempts = 0;
    const gpus = config.simulate ? [SIMULATED_GPU] : await readGpuInfo();
    send({ type: 'hello', name: config.name, gpus });
    console.log(`Connected to ${config.serverUrl} as "${config.name}"`);
    gpus.forEach((gpu) =>
      console.log(`  GPU: ${gpu.name} (${gpu.memoryMb} MB, sm ${gpu.computeCapability})`),
    );
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString()) as ServerMessage;
    if (message.type === 'job') {
      void handleJob(message, send);
    }
  });

  ws.on('close', () => {
    // Wait longer after each failed attempt (1 s, 2 s, 4 s... up to 30 s)
    const delay = Math.min(30_000, 1000 * 2 ** reconnectAttempts);
    reconnectAttempts++;
    console.log(`Disconnected. Reconnecting in ${delay / 1000} s...`);
    setTimeout(connect, delay);
  });

  // The backend answered the connection request with an HTTP error instead of accepting it
  ws.on('unexpected-response', (_req, res) => {
    if (res.statusCode === 401) {
      console.error('The backend rejected the agent token. Check AGENT_TOKEN.');
      process.exit(1);
    }
    console.error(`Unexpected response from the backend: HTTP ${res.statusCode}`);
    ws.terminate();
  });

  ws.on('error', (err) => {
    console.error(`Connection error: ${err.message}`);
  });
}

/** Runs a job and reports its result to the server. */
async function handleJob(job: JobMessage, send: (message: AgentMessage) => void) {
  console.log(`Running job ${job.jobId} (limit ${job.timeoutSeconds} s)`);
  const result = await runJob(job, deps);
  send(result);
  if (result.stderr.startsWith('Agent error:')) {
    console.error(`Job ${job.jobId} failed in the agent: ${result.stderr}`);
  } else {
    console.log(`Job ${job.jobId} finished: exit code ${result.exitCode}, ${result.durationMs} ms`);
  }
}

connect();
