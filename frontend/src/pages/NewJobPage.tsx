import { Code2, Play } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FINAL_STATUSES, createJob, describeError } from '../api/jobs.ts';
import { CodeEditor } from '../components/CodeEditor.tsx';
import { EditorTabs } from '../components/EditorTabs.tsx';
import { FileExplorer } from '../components/FileExplorer.tsx';
import { JobConsole } from '../components/JobConsole.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { VECTOR_ADD_EXAMPLE } from '../examples/vector-add.ts';
import { useJob } from '../hooks/useJob.ts';
import {
  checkProject,
  deletePath,
  isAllowedFile,
  languageFor,
  normalizePath,
  projectPayload,
  readUploadedFiles,
  readZip,
  renamePath,
  type ProjectFiles,
  type UploadResult,
} from '../lib/project.ts';

const TIMEOUT_OPTIONS = [10, 30, 60, 120, 300];
const FIRST_FILE = 'vector_add.cu';

export function NewJobPage() {
  const [files, setFiles] = useState<ProjectFiles>({ [FIRST_FILE]: VECTOR_ADD_EXAMPLE });
  const [tabs, setTabs] = useState<string[]>([FIRST_FILE]);
  const [active, setActive] = useState<string | null>(FIRST_FILE);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState('Vector addition');
  const [timeoutSeconds, setTimeoutSeconds] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const { job, error: jobError } = useJob(jobId);
  const busy = submitting || (job !== null && !FINAL_STATUSES.includes(job.status));
  const paths = Object.keys(files);

  // ----- Tabs -----

  function open(path: string) {
    setTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActive(path);
  }

  function closeTab(path: string) {
    const index = tabs.indexOf(path);
    const next = tabs.filter((p) => p !== path);
    setTabs(next);
    if (active === path) setActive(next[Math.min(index, next.length - 1)] ?? null);
  }

  /** After renaming or deleting, tabs of files that moved or disappeared are updated. */
  function syncTabs(nextFiles: ProjectFiles, map: (path: string) => string | null) {
    const nextTabs = tabs.map(map).filter((p): p is string => p !== null && p in nextFiles);
    setTabs(nextTabs);
    const mappedActive = active ? map(active) : null;
    setActive(mappedActive && mappedActive in nextFiles ? mappedActive : (nextTabs[0] ?? null));
  }

  // ----- Explorer actions -----

  function createFile(rawPath: string): string | null {
    const path = normalizePath(rawPath);
    if (!path) return 'Invalid name';
    if (!isAllowedFile(path)) return 'Use .cu, .cuh, .h, .hpp, .c, .cc, .cpp, .txt or .md';
    if (path in files) return `${path} already exists`;
    setFiles({ ...files, [path]: '' });
    open(path);
    return null;
  }

  function rename(from: string, to: string): string | null {
    const result = renamePath(files, from, to);
    if ('error' in result) return result.error;
    const target = normalizePath(to)!;
    setFiles(result.files);
    syncTabs(result.files, (p) =>
      p === from || p.startsWith(`${from}/`) ? target + p.slice(from.length) : p,
    );
    return null;
  }

  function remove(path: string) {
    const next = deletePath(files, path);
    setFiles(next);
    syncTabs(next, (p) => p);
  }

  /**
   * A folder or a .zip replaces the whole project; loose files are added to it.
   * The job takes the name of the folder or the .zip.
   */
  function applyUpload(
    { files: uploaded, skipped }: UploadResult,
    replace: boolean,
    jobName?: string,
  ) {
    const uploadedPaths = Object.keys(uploaded);
    if (uploadedPaths.length === 0) {
      setNotice('No valid files found (.cu, .cuh, .h, .hpp, .c, .cc, .cpp, .txt or .md).');
      return;
    }
    const next = replace ? uploaded : { ...files, ...uploaded };
    setFiles(next);
    // Open main.cu if there is one; otherwise the first .cu file
    const first =
      uploadedPaths.find((p) => p.split('/').pop() === 'main.cu') ??
      uploadedPaths.find((p) => p.endsWith('.cu')) ??
      uploadedPaths[0];
    setTabs(replace ? [first] : (prev) => (prev.includes(first) ? prev : [...prev, first]));
    setActive(first);
    if (jobName) setName(jobName);
    setNotice(
      skipped.length > 0
        ? `Skipped ${skipped.length} file(s) that are not source code: ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? '…' : ''}`
        : null,
    );
  }

  async function uploadFiles(list: FileList) {
    // When a folder is chosen, each file knows its path inside it ("folder/src/a.cu")
    const folder = list[0]?.webkitRelativePath.split('/')[0];
    applyUpload(await readUploadedFiles(list), Boolean(folder), folder || undefined);
  }

  async function uploadZip(file: File) {
    try {
      applyUpload(await readZip(file), true, file.name.replace(/\.zip$/i, ''));
    } catch {
      setNotice('Could not read the .zip file.');
    }
  }

  // ----- Run -----

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    const problem = checkProject(files);
    if (problem) {
      setSubmitError(problem);
      return;
    }
    setSubmitting(true);
    try {
      const created = await createJob(projectPayload(name, timeoutSeconds, files));
      setJobId(created.id);
    } catch (err) {
      setSubmitError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New job"
        subtitle="Write or upload your CUDA project and run it on a GPU"
      />

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 gap-5 p-6">
        {/* Left: explorer + editor, and the console */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-800 bg-[#1e1e1e]">
            <FileExplorer
              paths={paths}
              activePath={active}
              onOpen={open}
              onCreate={createFile}
              onRename={rename}
              onDelete={remove}
              onUploadFiles={uploadFiles}
              onUploadZip={uploadZip}
              disabled={busy}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <EditorTabs tabs={tabs} active={active} onSelect={setActive} onClose={closeTab} />
              <div className="min-h-0 flex-1">
                {active ? (
                  <CodeEditor
                    path={active}
                    language={languageFor(active)}
                    value={files[active] ?? ''}
                    onChange={(value) => setFiles((prev) => ({ ...prev, [active]: value }))}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-500">
                    <Code2 className="size-8" />
                    Open a file from the explorer
                  </div>
                )}
              </div>
            </div>
          </div>

          {notice && (
            <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {notice}
            </p>
          )}

          <JobConsole job={job} error={submitError ?? jobError} />
        </div>

        {/* Right: settings and run button */}
        <aside className="flex w-72 shrink-0 flex-col gap-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-4 text-sm font-semibold">Settings</h2>

            <label className="mb-1.5 block text-xs font-medium text-slate-500" htmlFor="job-name">
              Job name
            </label>
            <input
              id="job-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />

            <label className="mb-1.5 block text-xs font-medium text-slate-500" htmlFor="timeout">
              Time limit
            </label>
            <select
              id="timeout"
              value={timeoutSeconds}
              onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              {TIMEOUT_OPTIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds < 60
                    ? `${seconds} seconds`
                    : `${seconds / 60} minute${seconds > 60 ? 's' : ''}`}
                </option>
              ))}
            </select>
          </section>

          <button
            type="submit"
            disabled={busy || paths.length === 0}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-500 font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play className="size-4" />
            {busy ? 'Running…' : 'Run'}
          </button>

          <p className="text-xs leading-relaxed text-slate-500">
            Every <span className="font-mono">.cu</span> file of the project is compiled together
            with <span className="font-mono">nvcc</span> and the program runs on a provider&apos;s
            NVIDIA GPU. Whatever it prints appears in the console.
          </p>
        </aside>
      </form>
    </>
  );
}
