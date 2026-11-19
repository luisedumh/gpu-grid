import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Unmount what each test rendered and undo mocks such as a fake fetch
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
