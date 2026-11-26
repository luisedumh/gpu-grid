import { unzipSync, strFromU8 } from 'fflate';
import type { NewJob } from '../api/jobs.ts';

/**
 * A CUDA project: the content of each file, keyed by its path
 * ("main.cu", "src/kernels.cu", "include/utils.cuh"...).
 */
export type ProjectFiles = Record<string, string>;

/** Limits checked in the browser; the backend checks the same ones. */
export const PROJECT_LIMITS = {
  maxFiles: 50,
  maxPathLength: 200,
  maxTotalChars: 500_000,
} as const;

/** Text files that make sense in a CUDA project. Anything else is skipped when uploading. */
const ALLOWED_EXTENSIONS = ['.cu', '.cuh', '.h', '.hpp', '.c', '.cc', '.cpp', '.txt', '.md'];

export function isAllowedFile(path: string): boolean {
  const lower = path.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Cleans a path typed by the user or coming from an upload: forward slashes,
 * no leading "./" or "/", no empty segments. Returns null if it is not valid
 * (empty, or trying to leave the project with "..").
 */
export function normalizePath(path: string): string | null {
  const parts = path
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part !== '' && part !== '.');
  if (parts.length === 0 || parts.includes('..')) return null;
  const clean = parts.join('/');
  return clean.length <= PROJECT_LIMITS.maxPathLength ? clean : null;
}

/** A folder or a file in the explorer tree. */
export interface TreeNode {
  name: string;
  /** Full path: "src" for a folder, "src/kernels.cu" for a file. */
  path: string;
  kind: 'folder' | 'file';
  children: TreeNode[];
}

/** Turns the list of paths into a tree: folders first, then files, both in alphabetical order. */
export function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', kind: 'folder', children: [] };

  for (const path of paths) {
    const parts = path.split('/');
    let node = root;
    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      const childPath = parts.slice(0, index + 1).join('/');
      let child = node.children.find(
        (c) => c.name === part && c.kind === (isFile ? 'file' : 'folder'),
      );
      if (!child) {
        child = { name: part, path: childPath, kind: isFile ? 'file' : 'folder', children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }

  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1,
    );
    nodes.forEach((n) => sort(n.children));
  };
  sort(root.children);
  return root.children;
}

/** True if `path` is the folder `folder` itself or something inside it. */
function isInside(path: string, folder: string) {
  return path === folder || path.startsWith(`${folder}/`);
}

/**
 * Renames a file, or a folder with everything inside it.
 * Returns the new files, or an error message if the new name is not valid or already exists.
 */
export function renamePath(
  files: ProjectFiles,
  from: string,
  to: string,
): { files: ProjectFiles } | { error: string } {
  const target = normalizePath(to);
  if (!target) return { error: 'Invalid name' };
  if (target === from) return { files };

  const next: ProjectFiles = {};
  for (const [path, content] of Object.entries(files)) {
    if (isInside(path, from)) {
      const moved = target + path.slice(from.length);
      if (files[moved] !== undefined && !isInside(moved, from)) {
        return { error: `${moved} already exists` };
      }
      next[moved] = content;
    } else {
      next[path] = content;
    }
  }
  return { files: next };
}

/** Deletes a file, or a folder with everything inside it. */
export function deletePath(files: ProjectFiles, path: string): ProjectFiles {
  return Object.fromEntries(Object.entries(files).filter(([p]) => !isInside(p, path)));
}

/** Monaco language for each kind of file: C++ highlighting for code (it covers CUDA), none for text. */
export function languageFor(path: string): string {
  return /\.(cu|cuh|h|hpp|c|cc|cpp)$/i.test(path) ? 'cpp' : 'plaintext';
}

/**
 * If every path starts with the same folder (as happens when uploading a folder
 * or a .zip of one), removes that folder so the project starts at its content.
 */
export function stripCommonRoot(files: ProjectFiles): ProjectFiles {
  const paths = Object.keys(files);
  if (paths.length === 0 || paths.some((p) => !p.includes('/'))) return files;
  const first = paths[0].split('/')[0];
  if (!paths.every((p) => p.startsWith(`${first}/`))) return files;
  return Object.fromEntries(
    Object.entries(files).map(([p, content]) => [p.slice(first.length + 1), content]),
  );
}

/** Result of reading uploaded files: what was added and what was skipped (and why). */
export interface UploadResult {
  files: ProjectFiles;
  skipped: string[];
}

/** Keeps only valid text files of the allowed kinds. */
function collect(entries: [string, string][]): UploadResult {
  const files: ProjectFiles = {};
  const skipped: string[] = [];
  for (const [rawPath, content] of entries) {
    const path = normalizePath(rawPath);
    if (!path || !isAllowedFile(path) || content.includes('\u0000')) {
      skipped.push(rawPath);
    } else {
      files[path] = content;
    }
  }
  return { files: stripCommonRoot(files), skipped };
}

/** Reads files chosen with a file input (several files, or a whole folder). */
export async function readUploadedFiles(list: FileList | File[]): Promise<UploadResult> {
  const entries = await Promise.all(
    Array.from(list).map(async (file): Promise<[string, string]> => [
      // webkitRelativePath is "folder/sub/file.cu" when a folder is chosen, "" otherwise
      file.webkitRelativePath || file.name,
      await file.text(),
    ]),
  );
  return collect(entries);
}

/** Reads the content of a .zip file. Folders inside the zip are kept. */
export async function readZip(file: Blob): Promise<UploadResult> {
  const unzipped = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const entries = Object.entries(unzipped)
    // Entries ending in "/" are folders; __MACOSX holds metadata added by macOS
    .filter(([path]) => !path.endsWith('/') && !path.startsWith('__MACOSX/'))
    .map(([path, data]): [string, string] => [path, strFromU8(data)]);
  return collect(entries);
}

/** Checks the limits before sending; returns the problem to show, or null if the project is fine. */
export function checkProject(files: ProjectFiles): string | null {
  const paths = Object.keys(files);
  if (paths.length === 0) return 'The project has no files';
  if (!paths.some((p) => p.toLowerCase().endsWith('.cu')))
    return 'The project needs at least one .cu file';
  if (paths.length > PROJECT_LIMITS.maxFiles) {
    return `Too many files (maximum ${PROJECT_LIMITS.maxFiles})`;
  }
  const total = Object.values(files).reduce((sum, content) => sum + content.length, 0);
  if (total > PROJECT_LIMITS.maxTotalChars)
    return 'The project is too big (maximum 500 000 characters)';
  return null;
}

/** What is sent for a CUDA project: one file as sourceCode (as always), several as files. */
export function projectPayload(name: string, timeoutSeconds: number, files: ProjectFiles): NewJob {
  const entries = Object.entries(files);
  if (entries.length === 1) return { name, timeoutSeconds, sourceCode: entries[0][1] };
  return {
    name,
    timeoutSeconds,
    files: entries.map(([path, content]) => ({ path, content })),
  };
}
