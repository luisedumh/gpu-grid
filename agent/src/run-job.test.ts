import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import type { DockerImages } from './docker-image.js';
import { runJob, type JobDeps, type JobMessage } from './run-job.js';
import type { RunOptions } from './runner.js';

const job: JobMessage = {
  type: 'job',
  jobId: 'job-1',
  timeoutSeconds: 10,
  binaryPath: '/api/agent/jobs/job-1/binary',
};

/** A fake server that answers the binary download with the given status and bytes. */
function fakeFetch(status: number, body = 'BINARY') {
  const calls: { url: string; auth: string | null }[] = [];
  const fetch = (async (url: URL, init?: RequestInit) => {
    calls.push({
      url: url.toString(),
      auth: new Headers(init?.headers).get('Authorization'),
    });
    return new Response(body, { status });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

/** Docker that must not be used: CUDA jobs never touch images. */
const unusedDocker = new Proxy({} as DockerImages, {
  get: () => () => assert.fail('a CUDA job must not use Docker images'),
});

const baseDeps = {
  serverUrl: 'http://server:3000',
  token: 'secret',
  docker: unusedDocker,
  maxImageBytes: 10 * 1024 ** 3,
  pullTimeoutMs: 600_000,
};

describe('runJob (CUDA)', () => {
  it('downloads the binary with the agent token, runs it and returns its result', async () => {
    const { fetch, calls } = fakeFetch(200);
    let received: { options: RunOptions; content: string } | null = null;
    const deps: JobDeps = {
      ...baseDeps,
      fetch,
      runBinary: async (options) => {
        const content = await readFile(path.join(options.binaryDir, options.binaryName), 'utf8');
        received = { options, content };
        return { exitCode: 0, stdout: 'ok\n', stderr: '', durationMs: 5, timedOut: false };
      },
    };

    const result = await runJob(job, deps);

    assert.deepEqual(calls, [
      { url: 'http://server:3000/api/agent/jobs/job-1/binary', auth: 'Bearer secret' },
    ]);
    assert.equal(received!.content, 'BINARY');
    assert.equal(received!.options.timeoutMs, 10_000);
    assert.deepEqual(result, {
      type: 'result',
      jobId: 'job-1',
      exitCode: 0,
      stdout: 'ok\n',
      stderr: '',
      durationMs: 5,
      timedOut: false,
    });
  });

  it('reports a failed download as an agent error instead of throwing', async () => {
    const { fetch } = fakeFetch(404);
    const deps: JobDeps = {
      ...baseDeps,
      fetch,
      runBinary: async () => assert.fail('it must not run anything'),
    };

    const result = await runJob(job, deps);

    assert.equal(result.exitCode, null);
    assert.equal(result.stderr, 'Agent error: Binary download failed with HTTP 404');
  });

  it('reports a program that could not be started as an agent error', async () => {
    const { fetch } = fakeFetch(200);
    const deps: JobDeps = {
      ...baseDeps,
      fetch,
      runBinary: async () => {
        throw new Error('spawn docker ENOENT');
      },
    };

    const result = await runJob(job, deps);

    assert.equal(result.stderr, 'Agent error: spawn docker ENOENT');
  });
});

/** Docker image jobs never run a CUDA binary. */
const noBinary = async () => assert.fail('a Docker job must not run a CUDA binary');

/** A fake Docker that records what the agent asked it to do. */
function fakeDocker(overrides: Partial<DockerImages> = {}) {
  const calls: string[] = [];
  const docker: DockerImages = {
    async pull(image) {
      calls.push(`pull ${image}`);
      return { ref: image, remove: true };
    },
    async load(tarPath) {
      calls.push(`load ${path.basename(tarPath)} (${await readFile(tarPath, 'utf8')})`);
      return { ref: 'my-model:1.0', remove: true };
    },
    async size(ref) {
      calls.push(`size ${ref}`);
      return 500 * 1024 ** 2;
    },
    async run(options) {
      calls.push(`run ${options.image} [${options.command}] ${options.timeoutMs} ms`);
      return { exitCode: 0, stdout: 'GPU 0: RTX\n', stderr: '', durationMs: 7, timedOut: false };
    },
    async remove(ref) {
      calls.push(`remove ${ref}`);
    },
    ...overrides,
  };
  return { docker, calls };
}

const dockerJob: JobMessage = {
  type: 'job',
  jobId: 'job-2',
  timeoutSeconds: 30,
  kind: 'DOCKER',
  image: 'nvidia/cuda:12.4.1-base-ubuntu22.04',
  command: 'nvidia-smi',
};

describe('runJob (Docker image)', () => {
  it('pulls a published image, runs it with its command and deletes it afterwards', async () => {
    const { docker, calls } = fakeDocker();

    const result = await runJob(dockerJob, { ...baseDeps, docker, runBinary: noBinary });

    assert.deepEqual(calls, [
      'pull nvidia/cuda:12.4.1-base-ubuntu22.04',
      'size nvidia/cuda:12.4.1-base-ubuntu22.04',
      'run nvidia/cuda:12.4.1-base-ubuntu22.04 [nvidia-smi] 30000 ms',
      'remove nvidia/cuda:12.4.1-base-ubuntu22.04',
    ]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, 'GPU 0: RTX\n');
  });

  it('keeps an image the provider already had', async () => {
    const { docker, calls } = fakeDocker({
      async pull(image) {
        return { ref: image, remove: false };
      },
    });

    await runJob(dockerJob, { ...baseDeps, docker, runBinary: noBinary });

    assert.ok(!calls.some((call) => call.startsWith('remove')));
  });

  it('downloads an uploaded .tar with the agent token and loads it', async () => {
    const { fetch, calls: requests } = fakeFetch(200, 'TAR BYTES');
    const { docker, calls } = fakeDocker();
    const job: JobMessage = {
      ...dockerJob,
      image: null,
      archivePath: '/api/agent/jobs/job-2/archive',
      command: null,
    };

    await runJob(job, { ...baseDeps, docker, fetch, runBinary: noBinary });

    assert.deepEqual(requests, [
      { url: 'http://server:3000/api/agent/jobs/job-2/archive', auth: 'Bearer secret' },
    ]);
    assert.deepEqual(calls, [
      'load image.tar (TAR BYTES)',
      'size my-model:1.0',
      'run my-model:1.0 [null] 30000 ms',
      'remove my-model:1.0',
    ]);
  });

  it('refuses images bigger than the machine accepts, and still deletes them', async () => {
    const { docker, calls } = fakeDocker({ size: async () => 12 * 1024 ** 3 });

    const result = await runJob(dockerJob, { ...baseDeps, docker, runBinary: noBinary });

    assert.match(
      result.stderr,
      /The image is too big \(12\.0 GB; this machine accepts up to 10\.0 GB\)/,
    );
    assert.ok(!calls.some((call) => call.startsWith('run')));
    assert.ok(calls.includes('remove nvidia/cuda:12.4.1-base-ubuntu22.04'));
  });

  it('reports an image that cannot be downloaded as an agent error', async () => {
    const { docker } = fakeDocker({
      pull: async () => {
        throw new Error('pull access denied for private/model');
      },
    });

    const result = await runJob(dockerJob, { ...baseDeps, docker, runBinary: noBinary });

    assert.equal(result.exitCode, null);
    assert.equal(result.stderr, 'Agent error: pull access denied for private/model');
  });

  it('fails if the job brings no image', async () => {
    const { docker } = fakeDocker();
    const job: JobMessage = { ...dockerJob, image: null };

    const result = await runJob(job, { ...baseDeps, docker, runBinary: noBinary });

    assert.equal(result.stderr, 'Agent error: The job has no image');
  });
});
