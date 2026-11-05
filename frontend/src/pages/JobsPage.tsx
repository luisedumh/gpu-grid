import { ListChecks } from 'lucide-react';
import { useEffect } from 'react';
import { EmptyState } from '../components/EmptyState.tsx';
import { JobStatusBadge } from '../components/JobStatusBadge.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { useAppDispatch, useAppSelector } from '../store/hooks.ts';
import { fetchJobs } from '../store/jobsSlice.ts';

export function JobsPage() {
  const dispatch = useAppDispatch();
  // The view only reads from the store; it never keeps its own copy of the data
  const { items: jobs, status, error } = useAppSelector((state) => state.jobs);

  // When the page opens, dispatch the action that loads the jobs
  useEffect(() => {
    dispatch(fetchJobs());
  }, [dispatch]);

  const count = (...statuses: string[]) =>
    jobs.filter((job) => statuses.includes(job.status)).length;

  return (
    <>
      <PageHeader title="My jobs" subtitle="Status and results of everything you have submitted" />
      <div className="flex flex-1 flex-col gap-6 p-6">
        {status === 'loading' && <p className="text-sm text-slate-500">Loading jobs…</p>}
        {status === 'failed' && (
          <p className="text-sm text-red-600">Could not load jobs: {error}</p>
        )}

        {status === 'succeeded' && jobs.length === 0 && (
          <EmptyState
            icon={ListChecks}
            title="No jobs to show yet"
            description="Your jobs will appear here, updated in real time while they compile and run."
          />
        )}

        {jobs.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="Total jobs" value={jobs.length} />
              <StatCard label="Running" value={count('RUNNING')} tone="text-blue-600" />
              <StatCard label="Completed" value={count('COMPLETED')} tone="text-emerald-600" />
              <StatCard
                label="With errors"
                value={count('COMPILE_FAILED', 'FAILED', 'TIMED_OUT')}
                tone="text-red-600"
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Submitted</th>
                    <th className="px-4 py-3 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium">{job.name}</td>
                      <td className="px-4 py-3">
                        <JobStatusBadge status={job.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(job.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {job.durationMs === null ? '—' : `${(job.durationMs / 1000).toFixed(1)} s`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
