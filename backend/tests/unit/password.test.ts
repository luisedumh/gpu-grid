import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/lib/password.js';

describe('hashPassword', () => {
  it('stores a random salt and the scrypt hash, never the password', async () => {
    const stored = await hashPassword('password123');

    expect(stored).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(stored).not.toContain('password123');
  });

  it('gives different results for the same password, thanks to the salt', async () => {
    expect(await hashPassword('password123')).not.toBe(await hashPassword('password123'));
  });
});

describe('verifyPassword', () => {
  it('accepts the right password and rejects any other', async () => {
    const stored = await hashPassword('password123');

    expect(await verifyPassword('password123', stored)).toBe(true);
    expect(await verifyPassword('password124', stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it('rejects stored values that are not "salt:hash"', async () => {
    expect(await verifyPassword('password123', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('password123', '')).toBe(false);
  });
});
