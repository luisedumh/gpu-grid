import { config } from './config.js';
import { realDockerImages } from './docker-image.js';
import { runJob } from './run-job.js';
import { runBinary } from './runner.js';

/**
 * Runs a Docker image on this machine exactly as the agent would for a job,
 * without the server: npm run run-image -- <image> [command] [timeout-seconds]
 */
const [image, command, timeoutSeconds = '60'] = process.argv.slice(2);

if (!image) {
  console.error('Usage: npm run run-image -- <image> ["command"] [timeout-seconds]');
  process.exit(1);
}

const result = await runJob(
  {
    type: 'job',
    jobId: 'local',
    kind: 'DOCKER',
    image,
    command,
    timeoutSeconds: Number(timeoutSeconds),
  },
  {
    serverUrl: config.serverUrl,
    token: config.token,
    runBinary,
    docker: realDockerImages,
    maxImageBytes: config.maxImageBytes,
    pullTimeoutMs: config.pullTimeoutMs,
  },
);

console.log('--- stdout ---');
console.log(result.stdout.trimEnd());
console.log('--- stderr ---');
console.log(result.stderr.trimEnd());
console.log('--- result ---');
console.log({
  exitCode: result.exitCode,
  durationMs: result.durationMs,
  timedOut: result.timedOut,
});
