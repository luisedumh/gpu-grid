import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { imageRunArgs, parseLoadOutput } from './docker-image.js';

/** The value that follows a flag, e.g. valueOf(args, '--network') === 'none'. */
const valueOf = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe('imageRunArgs', () => {
  const args = imageRunArgs(
    { image: 'my-model:1.0', command: 'python train.py', timeoutMs: 1000 },
    'test-container',
    '1000:1000',
  );

  it('gives the container access to the GPU and removes it at the end', () => {
    assert.equal(valueOf(args, '--gpus'), 'all');
    assert.ok(args.includes('--rm'));
    assert.equal(valueOf(args, '--name'), 'test-container');
  });

  it('isolates the image of a stranger: no network, read-only, no privileges', () => {
    assert.equal(valueOf(args, '--network'), 'none');
    assert.ok(args.includes('--read-only'));
    assert.equal(valueOf(args, '--cap-drop'), 'ALL');
    assert.equal(valueOf(args, '--security-opt'), 'no-new-privileges');
    assert.equal(valueOf(args, '--user'), '1000:1000');
  });

  it('only lets it write in a small /tmp where nothing can be executed', () => {
    assert.match(valueOf(args, '--tmpfs'), /^\/tmp:.*noexec/);
  });

  it('limits memory and processes', () => {
    assert.equal(valueOf(args, '--memory'), '4g');
    assert.equal(valueOf(args, '--pids-limit'), '256');
  });

  it('runs the command with sh -c after the image', () => {
    assert.equal(valueOf(args, '--entrypoint'), 'sh');
    assert.deepEqual(args.slice(-3), ['my-model:1.0', '-c', 'python train.py']);
  });

  it("runs the image's default command when there is none", () => {
    const plain = imageRunArgs(
      { image: 'hello-world', command: '  ', timeoutMs: 1000 },
      'c',
      '1:1',
    );
    assert.equal(plain.at(-1), 'hello-world');
    assert.ok(!plain.includes('--entrypoint'));
  });
});

describe('parseLoadOutput', () => {
  it('reads the name of the loaded image', () => {
    assert.equal(parseLoadOutput('Loaded image: my-model:1.0\n'), 'my-model:1.0');
  });

  it('reads the id when the image has no name', () => {
    assert.equal(parseLoadOutput('Loaded image ID: sha256:abc123\n'), 'sha256:abc123');
  });

  it('fails when Docker did not load anything', () => {
    assert.throws(() => parseLoadOutput('open image.tar: no such file'), /did not report/);
  });
});
