import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { Job } from '../api/jobs.ts';
import { makeJob } from '../test/utils.tsx';
import { JobConsole } from './JobConsole.tsx';

/** The console may contain links, so it is rendered inside a router. */
function renderConsole(job: Job | null, error: string | null = null) {
  render(
    <MemoryRouter>
      <JobConsole job={job} error={error} />
    </MemoryRouter>,
  );
}

describe('JobConsole', () => {
  it('explains what to do before running anything', () => {
    renderConsole(null);
    expect(screen.getByText(/Press Run to compile/)).toBeInTheDocument();
  });

  it('shows errors from the backend', () => {
    renderConsole(null, 'name: Too long');
    expect(screen.getByText('name: Too long')).toHaveClass('text-red-400');
  });

  it('shows the compiler errors in red when the code does not compile', () => {
    const output = 'program.cu(5): error: identifier "x" is undefined';
    renderConsole(makeJob({ status: 'COMPILE_FAILED', compilerOutput: output }));

    expect(screen.getByText(output)).toHaveClass('text-red-400');
    expect(screen.getByText('Compilation error')).toBeInTheDocument();
  });

  it('says what the job is waiting for', () => {
    renderConsole(makeJob({ status: 'QUEUED' }));
    expect(screen.getByText(/Compiled\. Waiting for a free GPU/)).toBeInTheDocument();
  });

  it('shows the output, exit code and duration of a finished job', () => {
    renderConsole(
      makeJob({ status: 'COMPLETED', stdout: 'c[0] = 3.0', exitCode: 0, durationMs: 1840 }),
    );

    expect(screen.getByText(/c\[0\] = 3\.0/)).toBeInTheDocument();
    expect(screen.getByText('exit code 0')).toBeInTheDocument();
    expect(screen.getByText('1.84 s')).toBeInTheDocument();
  });
});
