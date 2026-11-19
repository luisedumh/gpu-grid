import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { createSessionToken, readSessionToken, type SessionUser } from '../../src/auth/session.js';

const user: SessionUser = {
  id: 'user-1',
  name: 'Ana',
  email: 'ana@gpugrid.dev',
  role: 'CLIENT',
};

/** Signs a token by hand, to build the cases the application never creates. */
function signWith(secret: string, expiresAt: string | number = '1h', subject = user.id) {
  return new SignJWT({ name: user.name, email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(new TextEncoder().encode(secret));
}

describe('session tokens (JWT)', () => {
  it('reads back the user it was created for', async () => {
    const token = await createSessionToken(user);

    expect(await readSessionToken(token)).toEqual(user);
  });

  it('has the three parts of a JWT and lasts 7 days', async () => {
    const token = await createSessionToken(user);
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

    expect(parts).toHaveLength(3);
    expect(payload.exp - payload.iat).toBe(7 * 24 * 60 * 60);
  });

  it('rejects a token whose content was changed', async () => {
    const [header, , signature] = (await createSessionToken(user)).split('.');
    const forged = Buffer.from(JSON.stringify({ sub: user.id, role: 'ADMIN' })).toString(
      'base64url',
    );

    expect(await readSessionToken(`${header}.${forged}.${signature}`)).toBeNull();
  });

  it('rejects a token signed with another secret', async () => {
    const token = await signWith('a-different-secret-that-is-long-enough');

    expect(await readSessionToken(token)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const oneMinuteAgo = Math.floor(Date.now() / 1000) - 60;
    const token = await signWith(process.env.JWT_SECRET!, oneMinuteAgo);

    expect(await readSessionToken(token)).toBeNull();
  });

  it('answers null when there is no token or it is not a JWT', async () => {
    expect(await readSessionToken(undefined)).toBeNull();
    expect(await readSessionToken('')).toBeNull();
    expect(await readSessionToken('not.a.jwt')).toBeNull();
  });
});
