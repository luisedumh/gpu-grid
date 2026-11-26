import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
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

describe('runJob', () => {
  it('downloads the binary with the agent token, runs it and returns its result', async () => {
    const { fetch, calls } = fakeFetch(200);
    let received: { options: RunOptions; content: string } | null = null;
    const deps: JobDeps = {
      serverUrl: 'http://server:3000',
      token: 'secret',
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
      serverUrl: 'http://server:3000',
      token: 'secret',
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
      serverUrl: 'http://server:3000',
      token: 'secret',
      fetch,
      runBinary: async () => {
        throw new Error('spawn docker ENOENT');
      },
    };

    const result = await runJob(job, deps);

    assert.equal(result.stderr, 'Agent error: spawn docker ENOENT');
  });
});
