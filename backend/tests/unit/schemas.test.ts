import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from '../../src/schemas/auth.schema.js';
import {
  cleanProjectPath,
  createJobSchema,
  JOB_LIMITS,
  listJobsQuerySchema,
} from '../../src/schemas/jobs.schema.js';

describe('createJobSchema', () => {
  const job = { name: 'Vector addition', sourceCode: 'int main() {}' };

  it('accepts a job and trims its name', () => {
    expect(createJobSchema.parse({ ...job, name: '  Vector addition  ' })).toEqual(job);
  });

  it('makes the time limit optional, but between 1 and 300 seconds', () => {
    expect(createJobSchema.safeParse({ ...job, timeoutSeconds: 300 }).success).toBe(true);
    expect(createJobSchema.safeParse({ ...job, timeoutSeconds: 0 }).success).toBe(false);
    expect(createJobSchema.safeParse({ ...job, timeoutSeconds: 301 }).success).toBe(false);
    expect(createJobSchema.safeParse({ ...job, timeoutSeconds: 1.5 }).success).toBe(false);
  });

  it('rejects an empty name or code, and code that is too long', () => {
    expect(createJobSchema.safeParse({ ...job, name: '   ' }).success).toBe(false);
    expect(createJobSchema.safeParse({ ...job, sourceCode: '' }).success).toBe(false);
    const huge = 'x'.repeat(JOB_LIMITS.sourceCodeMaxLength + 1);
    expect(createJobSchema.safeParse({ ...job, sourceCode: huge }).success).toBe(false);
  });
});

describe('listJobsQuerySchema', () => {
  it('returns 50 jobs by default and turns ?limit= into a number', () => {
    expect(listJobsQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(listJobsQuerySchema.parse({ limit: '20', status: 'RUNNING' })).toEqual({
      limit: 20,
      status: 'RUNNING',
    });
  });

  it('rejects limits outside 1-100 and unknown statuses', () => {
    expect(listJobsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(listJobsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(listJobsQuerySchema.safeParse({ status: 'EXPLODED' }).success).toBe(false);
  });
});

describe('registerSchema', () => {
  const account = {
    name: 'Ana',
    email: 'ana@gpugrid.dev',
    password: 'password123',
    role: 'CLIENT',
  };

  it('stores emails trimmed and in lower case, so they are unique', () => {
    expect(registerSchema.parse({ ...account, email: '  Ana@GPUGrid.dev ' }).email).toBe(
      'ana@gpugrid.dev',
    );
  });

  it('only lets people sign up as clients or providers, never as administrators', () => {
    expect(registerSchema.safeParse({ ...account, role: 'PROVIDER' }).success).toBe(true);
    expect(registerSchema.safeParse({ ...account, role: 'ADMIN' }).success).toBe(false);
  });

  it('asks for at least 8 characters of password', () => {
    const result = registerSchema.safeParse({ ...account, password: 'short' });
    expect(result.error?.issues[0].message).toBe('Use at least 8 characters');
  });
});

describe('loginSchema', () => {
  it('needs a valid email and a password', () => {
    expect(loginSchema.safeParse({ email: 'ana@gpugrid.dev', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ email: 'ana', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'ana@gpugrid.dev', password: '' }).success).toBe(false);
  });
});

describe('cleanProjectPath', () => {
  it('accepts relative paths to source files and cleans Windows separators', () => {
    expect(cleanProjectPath('main.cu')).toBe('main.cu');
    expect(cleanProjectPath('src\\kernels.cu')).toBe('src/kernels.cu');
    expect(cleanProjectPath('include/my_utils-v2.cuh')).toBe('include/my_utils-v2.cuh');
  });

  it('rejects anything that could be written outside the project or is not source code', () => {
    for (const bad of [
      '../x.cu',
      '/abs.cu',
      'a//b.cu',
      './x.cu',
      '.hidden.cu',
      'x.exe',
      'a b.cu',
      'program/x.cu',
      '',
    ]) {
      expect(cleanProjectPath(bad), bad).toBeNull();
    }
  });
});
