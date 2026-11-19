import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { dockerRunArgs, runBinary } from './runner.js';

const options = { binaryDir: '/tmp/job', binaryName: 'program', timeoutMs: 1000 };

/** The value that follows a flag, e.g. valueOf(args, '--network') === 'none'. */
const valueOf = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe('dockerRunArgs', () => {
  const args = dockerRunArgs(options, 'test-container', '1000:1000');

  it('removes the container when it finishes and gives it a known name', () => {
    assert.ok(args.includes('--rm'));
    assert.equal(valueOf(args, '--name'), 'test-container');
  });

  it('cuts the program off from the network', () => {
    assert.equal(valueOf(args, '--network'), 'none');
  });

  it('runs it as a normal user, not as root', () => {
    assert.equal(valueOf(args, '--user'), '1000:1000');
  });

  it('mounts the binary folder read-only', () => {
    assert.equal(valueOf(args, '-v'), '/tmp/job:/work:ro');
  });

  it('limits memory and processes', () => {
    assert.equal(valueOf(args, '--memory'), '4g');
    assert.equal(valueOf(args, '--pids-limit'), '256');
  });

  it('gives access to the GPU and runs the binary with the default image', () => {
    assert.equal(valueOf(args, '--gpus'), 'all');
    assert.deepEqual(args.slice(-2), ['ubuntu:24.04', '/work/program']);
  });

  it('can use another image', () => {
    const custom = dockerRunArgs({ ...options, image: 'debian:13' }, 'c', '1000:1000');
    assert.equal(custom.at(-2), 'debian:13');
  });
});

/**
 * runBinary is tested with a fake `docker` command placed first in the PATH,
 * so no Docker or GPU is needed. FAKE_DOCKER_MODE chooses what the "program" does.
 */
const FAKE_DOCKER = `#!/bin/sh
if [ "$1" = "kill" ]; then kill "$(cat "$FAKE_DOCKER_DIR/$2.pid")"; exit 0; fi
# docker run --rm --name <container> ...: remember our PID so "docker kill" can stop us
echo $$ > "$FAKE_DOCKER_DIR/$4.pid"
case "$FAKE_DOCKER_MODE" in
  ok) echo "Ran on a fake GPU"; echo "a warning" >&2; exit 3 ;;
  flood) head -c 3000000 /dev/zero | tr '\\0' 'a' ;;
  hang) exec sleep 10 ;;
esac
`;

describe('runBinary', () => {
  let fakeDir: string;
  const originalPath = process.env.PATH;

  before(async () => {
    fakeDir = await mkdtemp(path.join(tmpdir(), 'fake-docker-'));
    await writeFile(path.join(fakeDir, 'docker'), FAKE_DOCKER);
    await chmod(path.join(fakeDir, 'docker'), 0o755);
    process.env.PATH = `${fakeDir}${path.delimiter}${originalPath}`;
    process.env.FAKE_DOCKER_DIR = fakeDir;
  });

  after(async () => {
    process.env.PATH = originalPath;
    await rm(fakeDir, { recursive: true, force: true });
  });

  it('returns the output, the exit code and the duration', async () => {
    process.env.FAKE_DOCKER_MODE = 'ok';

    const result = await runBinary(options);

    assert.equal(result.stdout, 'Ran on a fake GPU\n');
    assert.equal(result.stderr, 'a warning\n');
    assert.equal(result.exitCode, 3);
    assert.equal(result.timedOut, false);
    assert.ok(result.durationMs >= 0);
  });

  it('stops a program that goes over its time limit', async () => {
    process.env.FAKE_DOCKER_MODE = 'hang';

    const result = await runBinary({ ...options, timeoutMs: 300 });

    assert.equal(result.timedOut, true);
    assert.ok(result.durationMs < 5000, 'it must not wait for the program to finish');
  });

  it('keeps at most about 1 MB of output, so a program cannot fill the memory', async () => {
    process.env.FAKE_DOCKER_MODE = 'flood';

    const result = await runBinary(options);

    assert.ok(result.stdout.length >= 1_000_000);
    assert.ok(result.stdout.length < 1_200_000);
  });

  it('fails if Docker is not installed', async () => {
    process.env.PATH = fakeDir + '-missing';
    try {
      await assert.rejects(runBinary(options), /ENOENT/);
    } finally {
      process.env.PATH = `${fakeDir}${path.delimiter}${originalPath}`;
    }
  });
});
