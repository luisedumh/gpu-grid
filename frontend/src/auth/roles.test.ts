import { describe, expect, it } from 'vitest';
import { ROLE_LABELS, ROLE_PERMISSIONS, homePathFor } from './roles.ts';

describe('homePathFor', () => {
  it('sends clients and administrators to New job', () => {
    expect(homePathFor('CLIENT')).toBe('/jobs/new');
    expect(homePathFor('ADMIN')).toBe('/jobs/new');
  });

  it('sends providers to Providers', () => {
    expect(homePathFor('PROVIDER')).toBe('/providers');
  });
});

describe('role texts', () => {
  it('has a label and at least one permission for every role', () => {
    for (const role of ['CLIENT', 'PROVIDER', 'ADMIN'] as const) {
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });
});
