import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildTree,
  checkProject,
  deletePath,
  isAllowedFile,
  normalizePath,
  projectPayload,
  readZip,
  renamePath,
  stripCommonRoot,
} from './project.ts';

describe('normalizePath', () => {
  it('cleans the paths typed by the user', () => {
    expect(normalizePath('./src//kernels.cu')).toBe('src/kernels.cu');
    expect(normalizePath('/main.cu')).toBe('main.cu');
    expect(normalizePath('src\\utils.h')).toBe('src/utils.h');
  });

  it('rejects empty paths and paths that leave the project', () => {
    expect(normalizePath('   ')).toBeNull();
    expect(normalizePath('../secret.cu')).toBeNull();
    expect(normalizePath('src/../../x.cu')).toBeNull();
  });
});

describe('isAllowedFile', () => {
  it('accepts source code and text files only', () => {
    expect(isAllowedFile('main.cu')).toBe(true);
    expect(isAllowedFile('include/Kernels.CUH')).toBe(true);
    expect(isAllowedFile('README.md')).toBe(true);
    expect(isAllowedFile('photo.png')).toBe(false);
    expect(isAllowedFile('program')).toBe(false);
  });
});

describe('buildTree', () => {
  it('puts folders first and sorts by name', () => {
    const tree = buildTree(['main.cu', 'src/b.cu', 'src/a.cu', 'README.md', 'include/k.cuh']);

    expect(tree.map((n) => n.name)).toEqual(['include', 'src', 'main.cu', 'README.md']);
    expect(tree[1].kind).toBe('folder');
    expect(tree[1].children.map((n) => n.path)).toEqual(['src/a.cu', 'src/b.cu']);
  });
});

describe('renamePath', () => {
  const files = { 'main.cu': 'm', 'src/a.cu': 'a', 'src/b.cu': 'b' };

  it('renames a file', () => {
    expect(renamePath(files, 'main.cu', 'app.cu')).toEqual({
      files: { 'app.cu': 'm', 'src/a.cu': 'a', 'src/b.cu': 'b' },
    });
  });

  it('renames a folder with everything inside it', () => {
    const result = renamePath(files, 'src', 'kernels');
    expect('files' in result && Object.keys(result.files).sort()).toEqual([
      'kernels/a.cu',
      'kernels/b.cu',
      'main.cu',
    ]);
  });

  it('refuses names that already exist or are not valid', () => {
    expect(renamePath(files, 'src/a.cu', 'src/b.cu')).toEqual({ error: 'src/b.cu already exists' });
    expect(renamePath(files, 'main.cu', '../main.cu')).toEqual({ error: 'Invalid name' });
  });
});

describe('deletePath', () => {
  it('deletes a folder with everything inside it, but not similar names', () => {
    const files = { 'src/a.cu': 'a', 'src2/b.cu': 'b', 'main.cu': 'm' };
    expect(deletePath(files, 'src')).toEqual({ 'src2/b.cu': 'b', 'main.cu': 'm' });
  });
});

describe('stripCommonRoot', () => {
  it('removes the folder that contains the whole project', () => {
    expect(stripCommonRoot({ 'demo/main.cu': 'm', 'demo/src/a.cu': 'a' })).toEqual({
      'main.cu': 'm',
      'src/a.cu': 'a',
    });
  });

  it('keeps the paths when there is no single root folder', () => {
    const files = { 'main.cu': 'm', 'src/a.cu': 'a' };
    expect(stripCommonRoot(files)).toEqual(files);
  });
});

describe('readZip', () => {
  // Uint8Array.from: in jsdom, TextEncoder returns arrays of another realm that fflate does not recognise
  const text = (value: string) => Uint8Array.from(strToU8(value));

  it('reads the source files of a .zip and skips the rest', async () => {
    const zip = zipSync({
      'demo/main.cu': text('int main() {}'),
      'demo/src/kernels.cu': text('__global__ void k() {}'),
      'demo/logo.png': new Uint8Array([137, 80, 78, 71, 0, 0]),
      '__MACOSX/demo/._main.cu': new Uint8Array([0, 1]),
    });

    const result = await readZip(new Blob([new Uint8Array(zip)]));

    expect(result.files).toEqual({
      'main.cu': 'int main() {}',
      'src/kernels.cu': '__global__ void k() {}',
    });
    expect(result.skipped).toEqual(['demo/logo.png']);
  });
});

describe('checkProject', () => {
  it('needs at least one .cu file', () => {
    expect(checkProject({})).toBe('The project has no files');
    expect(checkProject({ 'utils.h': '' })).toBe('The project needs at least one .cu file');
    expect(checkProject({ 'main.cu': 'int main() {}' })).toBeNull();
  });

  it('limits the number of files', () => {
    const many = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`f${i}.cu`, '']));
    expect(checkProject(many)).toMatch(/Too many files/);
  });
});

describe('projectPayload', () => {
  it('sends a single file as sourceCode, as the API always accepted', () => {
    expect(projectPayload('Job', 60, { 'main.cu': 'code' })).toEqual({
      name: 'Job',
      timeoutSeconds: 60,
      sourceCode: 'code',
    });
  });

  it('sends a project of several files with their paths', () => {
    expect(projectPayload('Job', 60, { 'main.cu': 'm', 'src/a.cu': 'a' }).files).toEqual([
      { path: 'main.cu', content: 'm' },
      { path: 'src/a.cu', content: 'a' },
    ]);
  });
});
