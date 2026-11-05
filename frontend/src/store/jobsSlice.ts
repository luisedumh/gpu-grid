import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { Job } from '../api/jobs.ts';

/** Part of the store that holds the list of jobs. */
interface JobsState {
  items: Job[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: JobsState = { items: [], status: 'idle', error: null };

/** Action: asks the backend for every job (GET /api/jobs). */
export const fetchJobs = createAsyncThunk('jobs/fetchJobs', async () => {
  const response = await fetch('/api/jobs');
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return (await response.json()) as Job[];
});

/** Reducer: computes the new state for each step of the request. */
const jobsSlice = createSlice({
  name: 'jobs',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchJobs.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchJobs.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload;
      })
      .addCase(fetchJobs.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'Unknown error';
      });
  },
});

export default jobsSlice.reducer;
