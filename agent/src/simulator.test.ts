import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { SIMULATED_GPU, simulateBinary } from './simulator.js';

describe('simulation mode', () => {
  let dir: string;

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'simulator-test-'));
    await writeFile(path.join(dir, 'program'), Buffer.alloc(1234));
  });

  after(() => rm(dir, { recursive: true, force: true }));

  it('reports a GPU that is clearly not real', () => {
    assert.match(SIMULATED_GPU.name, /Simulated/);
    assert.ok(SIMULATED_GPU.memoryMb > 0);
  });

  it('finishes the job successfully, saying it was simulated and the size of the binary', async () => {
    const result = await simulateBinary(
      { binaryDir: dir, binaryName: 'program', timeoutMs: 5000 },
      10,
    );

    assert.equal(result.exitCode, 0);
    assert.equal(result.timedOut, false);
    assert.match(result.stdout, /\[simulated\] Program received \(1234 bytes\)/);
    assert.ok(result.durationMs >= 0);
  });

  it('fails if the binary was not downloaded', async () => {
    await assert.rejects(
      simulateBinary({ binaryDir: dir, binaryName: 'missing', timeoutMs: 5000 }, 10),
      /ENOENT/,
    );
  });
});
