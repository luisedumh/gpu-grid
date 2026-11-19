import { z } from 'zod';

// Spaces and capitals are removed BEFORE checking the format, so " Ana@Mail.com " is valid
// and is stored as "ana@mail.com" (z.email().trim() would check the format first and reject it)
const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const password = z.string().min(8, 'Use at least 8 characters').max(128);

/** Body of POST /api/auth/register. Admin accounts cannot be self-registered. */
export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email,
  password,
  role: z.enum(['CLIENT', 'PROVIDER']),
});

/** Body of POST /api/auth/login. */
export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
