import { ListChecks, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { JOB_STATUSES, type JobStatus } from '../api/jobs.ts';
import { EmptyState } from '../components/EmptyState.tsx';
import { JobDetail } from '../components/JobDetail.tsx';
import { JobStatusBadge } from '../components/JobStatusBadge.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { formatDuration, formatRelativeTime } from '../lib/format.ts';
import { useAppDispatch, useAppSelector } from '../store/hooks.ts';
import { fetchJobs, filterChanged } from '../store/jobsSlice.ts';

/** How often the list is refreshed, so states keep moving. */
const REFRESH_MS = 3000;

export function JobsPage() {
  // The selected job lives in the URL (/jobs/<id>), so a job can be shared or bookmarked
  const { jobId } = useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  // The view only reads from the store; it never keeps its own copy of the data
  const { items: jobs, counts, filter, status, error } = useAppSelector((state) => state.jobs);
  const user = useAppSelector((state) => state.auth.user);

  // Load the jobs when the page opens or the filter changes, and refresh them every few seconds
  useEffect(() => {
    dispatch(fetchJobs(filter));
    const timer = setInterval(() => dispatch(fetchJobs(filter)), REFRESH_MS);
    return () => clearInterval(timer);
  }, [dispatch, filter]);

  const sum = (...statuses: JobStatus[]) =>
    counts ? statuses.reduce((total, s) => total + counts[s], 0) : 0;

  return (
    <>
      <PageHeader
        title="My jobs"
        subtitle="Status and results of everything you have submitted"
        actions={
          user?.role !== 'PROVIDER' && (
            <Link
              to="/jobs/new"
              className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-600"
            >
              New job
            </Link>
          )
        }
      />

      <div className="flex min-h-0 flex-1 gap-5 p-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Total jobs" value={sum(...JOB_STATUSES)} />
            <StatCard
              label="In progress"
              value={sum('PENDING', 'COMPILING', 'QUEUED', 'RUNNING')}
              tone="text-blue-600"
            />
            <StatCard label="Completed" value={sum('COMPLETED')} tone="text-emerald-600" />
            <StatCard
              label="With errors"
              value={sum('COMPILE_FAILED', 'FAILED', 'TIMED_OUT')}
              tone="text-red-600"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            Status
            <select
              aria-label="Filter by status"
              value={filter ?? ''}
              onChange={(event) =>
                dispatch(filterChanged((event.target.value || null) as JobStatus | null))
              }
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm"
            >
              <option value="">All</option>
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ').toLowerCase()}
                </option>
              ))}
            </select>
          </label>

          {status === 'failed' && jobs.length === 0 && (
            <p className="text-sm text-red-600">Could not load jobs: {error}</p>
          )}

          {status === 'loading' && (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-slate-400" />
            </div>
          )}

          {status === 'succeeded' && jobs.length === 0 && (
            <EmptyState
              icon={ListChecks}
              title={filter ? 'No jobs with this status' : 'No jobs yet'}
              description="Jobs you submit from New job will appear here, with their status and output."
            />
          )}

          {jobs.length > 0 && (
            <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Job</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Duration</th>
                    <th className="px-4 py-2.5 font-semibold">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr
                      key={job.id}
                      onClick={() => navigate(`/jobs/${job.id}`)}
                      className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${
                        job.id === jobId ? 'bg-brand-50 hover:bg-brand-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold">{job.name}</div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {job.id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <JobStatusBadge status={job.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDuration(job.durationMs)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {formatRelativeTime(job.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {jobId && <JobDetail key={jobId} jobId={jobId} />}
      </div>
    </>
  );
}
