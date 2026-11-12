import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice.ts';
import jobsReducer from './jobsSlice.ts';

/** Single store of the application (Flux pattern). */
export const store = configureStore({
  reducer: {
    auth: authReducer,
    jobs: jobsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
