import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { JobList, JobStatus, JobSummary } from '../api/jobs.ts';

/** Part of the store that holds the job history. */
interface JobsState {
  items: JobSummary[];
  /** Jobs in each status, over all jobs (not only the listed ones). */
  counts: Record<JobStatus, number> | null;
  /** Status chosen in the filter, or null for all of them. */
  filter: JobStatus | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: JobsState = {
  items: [],
  counts: null,
  filter: null,
  status: 'idle',
  error: null,
};

/** Action: asks the backend for the latest jobs, optionally of one status (GET /api/jobs). */
export const fetchJobs = createAsyncThunk<JobList, JobStatus | null>(
  'jobs/fetchJobs',
  async (filter) => {
    const query = new URLSearchParams({ limit: '100' });
    if (filter) query.set('status', filter);
    const response = await fetch(`/api/jobs?${query}`);
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return (await response.json()) as JobList;
  },
);

/** Reducer: computes the new state for each action. */
const jobsSlice = createSlice({
  name: 'jobs',
  initialState,
  reducers: {
    filterChanged(state, action: PayloadAction<JobStatus | null>) {
      state.filter = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchJobs.pending, (state) => {
        // While refreshing an already loaded list, keep showing it
        if (state.status !== 'succeeded') state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchJobs.fulfilled, (state, action) => {
        // Ignore an answer for a filter that is no longer selected
        if (action.meta.arg !== state.filter) return;
        state.status = 'succeeded';
        state.items = action.payload.jobs;
        state.counts = action.payload.counts;
      })
      .addCase(fetchJobs.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'Unknown error';
      });
  },
});

export const { filterChanged } = jobsSlice.actions;
export default jobsSlice.reducer;
