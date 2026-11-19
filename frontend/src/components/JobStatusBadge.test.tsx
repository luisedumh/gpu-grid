import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { JobStatus } from '../api/jobs.ts';
import { JobStatusBadge } from './JobStatusBadge.tsx';

describe('JobStatusBadge', () => {
  it.each<[JobStatus, string]>([
    ['PENDING', 'Pending'],
    ['COMPILING', 'Compiling'],
    ['COMPILE_FAILED', 'Compilation error'],
    ['QUEUED', 'Queued'],
    ['RUNNING', 'Running'],
    ['COMPLETED', 'Completed'],
    ['FAILED', 'Failed'],
    ['TIMED_OUT', 'Timed out'],
  ])('shows %s as "%s"', (status, label) => {
    render(<JobStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('uses red for errors and green for completed jobs', () => {
    render(<JobStatusBadge status="COMPILE_FAILED" />);
    render(<JobStatusBadge status="COMPLETED" />);
    expect(screen.getByText('Compilation error')).toHaveClass('text-red-600');
    expect(screen.getByText('Completed')).toHaveClass('text-emerald-600');
  });
});
