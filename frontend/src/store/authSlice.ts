import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import * as authApi from '../api/auth.ts';
import type { RegisterData, User } from '../api/auth.ts';
import { ApiError } from '../api/http.ts';

/** An error answered by the backend, with the problems of each field (if any). */
export interface AuthError {
  message: string;
  fields: Record<string, string>;
}

/** Part of the store that holds the session. */
interface AuthState {
  /** Who is logged in, or null if nobody is. */
  user: User | null;
  /** 'checking' until we know whether there is a session (on page load). */
  status: 'checking' | 'ready';
}

const initialState: AuthState = { user: null, status: 'checking' };

/** Turns any error into a message plus the problems of each field. */
function toAuthError(err: unknown): AuthError {
  if (err instanceof ApiError) {
    return {
      message: err.message,
      fields: Object.fromEntries(err.details.map((d) => [d.field, d.message])),
    };
  }
  return { message: (err as Error).message, fields: {} };
}

/** Action: asks the backend who is logged in (the session cookie survives page reloads). */
export const fetchCurrentUser = createAsyncThunk('auth/fetchCurrentUser', () =>
  authApi.getCurrentUser(),
);

/** Action: logs in. On error, the component receives the problems of each field. */
export const login = createAsyncThunk<
  User,
  { email: string; password: string },
  { rejectValue: AuthError }
>('auth/login', async ({ email, password }, { rejectWithValue }) => {
  try {
    return await authApi.login(email, password);
  } catch (err) {
    return rejectWithValue(toAuthError(err));
  }
});

/** Action: creates an account and logs in. */
export const register = createAsyncThunk<User, RegisterData, { rejectValue: AuthError }>(
  'auth/register',
  async (data, { rejectWithValue }) => {
    try {
      return await authApi.register(data);
    } catch (err) {
      return rejectWithValue(toAuthError(err));
    }
  },
);

/** Action: logs out (the backend removes the session cookie). */
export const logout = createAsyncThunk('auth/logout', () => authApi.logout());

/** Reducer: computes the new session state for each action. */
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** The backend answered 401 to a request: the session expired. */
    sessionExpired(state) {
      state.user = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.status = 'ready';
      })
      .addCase(fetchCurrentUser.rejected, (state) => {
        state.user = null;
        state.status = 'ready';
      })
      .addCase(login.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
      });
  },
});

export const { sessionExpired } = authSlice.actions;
export default authSlice.reducer;
