import { ChevronDown, ChevronRight, FileCode2, Loader2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { FINAL_STATUSES, type ProjectFile } from '../api/jobs.ts';
import { useJob } from '../hooks/useJob.ts';
import { formatDateTime, formatDuration } from '../lib/format.ts';
import { JobStatusBadge } from './JobStatusBadge.tsx';

/** Right-hand panel with everything about one job. */
export function JobDetail({ jobId }: { jobId: string }) {
  const { job, error } = useJob(jobId);

  if (error && !job) {
    return (
      <Panel>
        <p className="p-4 text-sm text-red-600">{error}</p>
      </Panel>
    );
  }
  if (!job) {
    return (
      <Panel>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-slate-400" />
        </div>
      </Panel>
    );
  }

  const running = !FINAL_STATUSES.includes(job.status);

  return (
    <Panel>
      <div className="flex items-start gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{job.name}</h2>
          <p className="font-mono text-[11px] text-slate-400">{job.id}</p>
        </div>
        <Link
          to="/jobs"
          aria-label="Close"
          className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="size-4" />
        </Link>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        <div className="flex items-center gap-2">
          <JobStatusBadge status={job.status} />
          {running && <Loader2 className="size-4 animate-spin text-slate-400" />}
        </div>

        <dl className="grid grid-cols-2 gap-2">
          <Info label="Duration" value={formatDuration(job.durationMs)} />
          <Info label="Exit code" value={job.exitCode ?? '—'} />
          <Info label="Submitted" value={formatDateTime(job.createdAt)} />
          <Info label="Finished" value={formatDateTime(job.finishedAt)} />
          <Info label="Time limit" value={`${job.timeoutSeconds} s`} />
          <Info label="Attempts" value={job.attempts} />
        </dl>

        {job.kind === 'DOCKER' && (
          <dl className="space-y-2">
            <Info
              label="Docker image"
              value={<Mono>{job.image ?? `${job.imageArchiveName} (uploaded)`}</Mono>}
            />
            <Info
              label="Command"
              value={<Mono>{job.command ?? 'Default command of the image'}</Mono>}
            />
          </dl>
        )}

        {job.files && job.files.length > 0 && <JobFiles files={job.files} />}

        {job.compilerOutput && (
          <Output
            title="Compiler output"
            text={job.compilerOutput}
            tone={job.status === 'COMPILE_FAILED' ? 'text-red-400' : 'text-amber-300'}
          />
        )}
        {job.stdout && <Output title="Output" text={job.stdout} />}
        {job.stderr && <Output title="Errors" text={job.stderr} tone="text-red-400" />}
        {!job.compilerOutput && !job.stdout && !job.stderr && (
          <p className="text-sm text-slate-500">
            {running ? 'No output yet. It will appear here when the job finishes.' : 'No output.'}
          </p>
        )}
      </div>
    </Panel>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <aside className="flex w-96 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      {children}
    </aside>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold">{value}</dd>
    </div>
  );
}

function Output({
  title,
  text,
  tone = 'text-slate-200',
}: {
  title: string;
  text: string;
  tone?: string;
}) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold text-slate-600">{title}</h3>
      <pre
        className={`max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap ${tone}`}
      >
        {text}
      </pre>
    </section>
  );
}

/** Files of the project that was sent; each one can be opened to read its code. */
function JobFiles({ files }: { files: ProjectFile[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold text-slate-600">Files ({files.length})</h3>
      <ul className="overflow-hidden rounded-lg border border-slate-200">
        {sorted.map((file) => (
          <li key={file.path} className="border-b border-slate-100 last:border-0">
            <button
              type="button"
              onClick={() => setOpen(open === file.path ? null : file.path)}
              aria-expanded={open === file.path}
              className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left font-mono text-xs hover:bg-slate-50"
            >
              {open === file.path ? (
                <ChevronDown className="size-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="size-3.5 text-slate-400" />
              )}
              <FileCode2 className="size-3.5 text-brand-500" />
              {file.path}
            </button>
            {open === file.path && (
              <pre className="max-h-64 overflow-auto bg-slate-950 p-3 font-mono text-xs leading-relaxed whitespace-pre text-slate-200">
                {file.content}
              </pre>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs break-all">{children}</span>;
}
