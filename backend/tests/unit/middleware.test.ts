import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { ZodError, z } from 'zod';
import { HttpError, NotFoundError } from '../../src/lib/http-error.js';
import { requireAuth } from '../../src/middleware/auth.js';
import { errorHandler, notFoundHandler } from '../../src/middleware/error-handler.js';
import type { SessionUser } from '../../src/auth/session.js';

/** A fake Express response that remembers the status and the JSON it was given. */
function fakeResponse() {
  const res = { statusCode: 0, body: undefined as unknown };
  const response = {
    status: (code: number) => {
      res.statusCode = code;
      return response;
    },
    json: (body: unknown) => {
      res.body = body;
      return response;
    },
  };
  return { res, response: response as unknown as Response };
}

const client: SessionUser = { id: 'u1', name: 'Ana', email: 'ana@gpugrid.dev', role: 'CLIENT' };
const asRequest = (user?: SessionUser) => ({ user }) as Request;

describe('requireAuth', () => {
  it('rejects requests without a session with 401', () => {
    const next = vi.fn();

    expect(() => requireAuth()(asRequest(), {} as Response, next)).toThrow(
      expect.objectContaining({ status: 401 }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects roles that are not allowed with 403', () => {
    expect(() => requireAuth('PROVIDER')(asRequest(client), {} as Response, vi.fn())).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });

  it('lets through any logged-in user, or the allowed roles', () => {
    const next = vi.fn();

    requireAuth()(asRequest(client), {} as Response, next);
    requireAuth('CLIENT', 'ADMIN')(asRequest(client), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(2);
  });
});

describe('errorHandler', () => {
  const handle = (err: unknown) => {
    const { res, response } = fakeResponse();
    errorHandler(err, {} as Request, response, vi.fn() as NextFunction);
    return res;
  };

  it('turns validation errors into 400 with the problem of each field', () => {
    let zodError: ZodError | undefined;
    try {
      z.object({ name: z.string().min(1) }).parse({ name: '' });
    } catch (err) {
      zodError = err as ZodError;
    }

    const res = handle(zodError);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: 'Invalid request', details: [{ field: 'name' }] });
  });

  it('uses the status of our own HTTP errors', () => {
    expect(handle(new NotFoundError('Job x not found'))).toEqual({
      statusCode: 404,
      body: { error: 'Job x not found' },
    });
    expect(handle(new HttpError(409, 'Taken')).statusCode).toBe(409);
  });

  it('keeps client errors raised by Express, such as malformed JSON', () => {
    const malformed = Object.assign(new Error('Unexpected token'), { status: 400 });

    expect(handle(malformed)).toEqual({ statusCode: 400, body: { error: 'Unexpected token' } });
  });

  it('hides the details of unexpected errors behind a 500', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = handle(new Error('database password is wrong'));

    expect(res).toEqual({ statusCode: 500, body: { error: 'Internal server error' } });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('notFoundHandler', () => {
  it('answers unknown routes with a JSON 404', () => {
    const { res, response } = fakeResponse();

    notFoundHandler({ method: 'GET', originalUrl: '/api/nope' } as Request, response);

    expect(res).toEqual({ statusCode: 404, body: { error: 'Route GET /api/nope not found' } });
  });
});
