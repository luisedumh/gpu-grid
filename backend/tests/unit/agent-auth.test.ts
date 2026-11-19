import { describe, expect, it } from 'vitest';
import { isValidAgentToken } from '../../src/lib/agent-auth.js';

const TOKEN = 'agent-secret-token';

describe('isValidAgentToken', () => {
  it('accepts "Bearer" followed by the right token', () => {
    expect(isValidAgentToken(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
  });

  it('rejects a wrong token, even one that only differs in its length', () => {
    expect(isValidAgentToken('Bearer agent-secret-tokeX', TOKEN)).toBe(false);
    expect(isValidAgentToken(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
  });

  it('rejects a missing header or one without "Bearer "', () => {
    expect(isValidAgentToken(undefined, TOKEN)).toBe(false);
    expect(isValidAgentToken(TOKEN, TOKEN)).toBe(false);
    expect(isValidAgentToken(`Basic ${TOKEN}`, TOKEN)).toBe(false);
  });

  it('rejects everything when the server has no token configured', () => {
    expect(isValidAgentToken('Bearer ', '')).toBe(false);
  });
});
