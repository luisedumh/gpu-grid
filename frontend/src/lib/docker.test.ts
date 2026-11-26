import { describe, expect, it } from 'vitest';
import { checkArchive, DOCKER_LIMITS, formatBytes, isValidImageReference } from './docker.ts';

describe('isValidImageReference', () => {
  it.each([
    'ubuntu',
    'ubuntu:24.04',
    'nvidia/cuda:12.4.1-base-ubuntu22.04',
    'ghcr.io/luisedumh/gpu-grid-agent:1.0',
    'localhost:5000/my_model',
    `pytorch/pytorch@sha256:${'a'.repeat(64)}`,
  ])('accepts %s', (reference) => {
    expect(isValidImageReference(reference)).toBe(true);
  });

  it.each(['', 'Ubuntu', 'ubuntu:', 'my image', 'nvidia/cuda:12.4 ; rm -rf /', 'a'.repeat(256)])(
    'rejects "%s"',
    (reference) => {
      expect(isValidImageReference(reference)).toBe(false);
    },
  );
});

describe('checkArchive', () => {
  it('accepts a .tar within the size limit', () => {
    expect(checkArchive({ name: 'model.tar', size: 700 * 1024 ** 2 })).toBeNull();
  });

  it('rejects other files, empty files and files that are too big', () => {
    expect(checkArchive({ name: 'model.zip', size: 10 })).toMatch(/docker save/);
    expect(checkArchive({ name: 'model.tar', size: 0 })).toBe('The file is empty');
    expect(checkArchive({ name: 'model.tar', size: DOCKER_LIMITS.maxArchiveBytes + 1 })).toMatch(
      /too big/,
    );
  });
});

describe('formatBytes', () => {
  it('uses the largest unit that fits', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(700 * 1024 ** 2)).toBe('700 MB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2 GB');
  });
});
