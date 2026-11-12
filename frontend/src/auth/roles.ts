import type { Role } from '../api/auth.ts';

/** Text shown for each role. */
export const ROLE_LABELS: Record<Role, string> = {
  CLIENT: 'Client',
  PROVIDER: 'Provider',
  ADMIN: 'Administrator',
};

/** What each role can do, shown in the profile page. */
export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  CLIENT: ['Submit CUDA jobs', 'Follow your jobs and see their results'],
  PROVIDER: ['Connect your machines with GPUs', 'See the jobs your machines run'],
  ADMIN: ['Submit jobs and see every job', 'Manage users, machines and jobs'],
};

/** First page after logging in, depending on the role. */
export function homePathFor(role: Role): string {
  return role === 'PROVIDER' ? '/providers' : '/jobs/new';
}
