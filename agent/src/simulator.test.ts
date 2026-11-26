import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { SIMULATED_GPU, simulateBinary, simulatedDockerImages } from './simulator.js';

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

  it('pretends to run Docker images without downloading or deleting anything', async () => {
    const image = await simulatedDockerImages.pull('nvidia/cuda:12.4.1-base-ubuntu22.04', 1000);
    const result = await simulatedDockerImages.run({
      image: image.ref,
      command: 'nvidia-smi',
      timeoutMs: 5000,
    });

    assert.equal(image.remove, false);
    assert.equal(result.exitCode, 0);
    assert.match(
      result.stdout,
      /\[simulated\] Image nvidia\/cuda:12\.4\.1-base-ubuntu22\.04 run with nvidia-smi/,
    );
  });

  it('receives an uploaded .tar and reports its size', async () => {
    const tar = path.join(dir, 'image.tar');
    await writeFile(tar, Buffer.alloc(2048));

    const image = await simulatedDockerImages.load(tar);

    assert.equal(image.ref, 'uploaded image (2048 bytes)');
  });
});
