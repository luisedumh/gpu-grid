import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeJob, renderWithProviders } from '../test/utils.tsx';
import { NewJobPage } from './NewJobPage.tsx';

// Monaco does not work in jsdom: a plain text area stands in for the editor
vi.mock('../components/CodeEditor.tsx', () => ({
  CodeEditor: ({
    value,
    onChange,
    path,
  }: {
    value: string;
    onChange: (v: string) => void;
    path?: string;
  }) => (
    <textarea
      aria-label={`Editor ${path}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// The .tar is uploaded with XMLHttpRequest; the test replaces only that function
const upload = vi.hoisted(() => vi.fn());
vi.mock('../api/jobs.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/jobs.ts')>()),
  uploadDockerArchive: upload,
}));

/** Fake backend: creating a job answers its id, and asking for it answers a pending job. */
function fakeBackend() {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return new Response(JSON.stringify({ id: 'job-1', status: 'PENDING', createdAt: '' }), {
        status: 201,
      });
    }
    return new Response(JSON.stringify(makeJob({ id: 'job-1' })), { status: 200 });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

/** Body of the POST /api/jobs that was sent. */
function sentBody(fetch: ReturnType<typeof fakeBackend>) {
  const call = fetch.mock.calls.find(([, init]) => init?.method === 'POST');
  return JSON.parse(String(call?.[1]?.body));
}

beforeEach(() => upload.mockReset());

describe('NewJobPage: CUDA project', () => {
  it('sends a project of one file as sourceCode', async () => {
    const fetch = fakeBackend();
    renderWithProviders(<NewJobPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(sentBody(fetch).sourceCode).toContain('vectorAdd'));
    expect(sentBody(fetch).files).toBeUndefined();
  });

  it('sends every file with its path when the project has several', async () => {
    const fetch = fakeBackend();
    renderWithProviders(<NewJobPage />);

    await userEvent.click(screen.getByRole('button', { name: 'New file' }));
    await userEvent.type(screen.getByLabelText('New file name'), 'src/kernels.cu{Enter}');
    await userEvent.type(screen.getByLabelText('Editor src/kernels.cu'), '// kernels');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(sentBody(fetch).files).toEqual([
        { path: 'vector_add.cu', content: expect.stringContaining('vectorAdd') },
        { path: 'src/kernels.cu', content: '// kernels' },
      ]),
    );
  });

  it('opens each file in its own tab', async () => {
    fakeBackend();
    renderWithProviders(<NewJobPage />);

    await userEvent.click(screen.getByRole('button', { name: 'New file' }));
    await userEvent.type(screen.getByLabelText('New file name'), 'utils.h{Enter}');

    expect(screen.getByRole('tab', { name: 'utils.h' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: 'vector_add.cu' }));
    expect(screen.getByLabelText('Editor vector_add.cu')).toBeInTheDocument();
  });

  it('does not send a project without .cu files', async () => {
    const fetch = fakeBackend();
    renderWithProviders(<NewJobPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Rename vector_add.cu' }));
    const input = screen.getByLabelText('New name for vector_add.cu');
    await userEvent.clear(input);
    await userEvent.type(input, 'notes.txt{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(screen.getByText('The project needs at least one .cu file')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('NewJobPage: Docker image', () => {
  it('sends a published image with its command', async () => {
    const fetch = fakeBackend();
    renderWithProviders(<NewJobPage />);

    await userEvent.click(screen.getByRole('tab', { name: 'Docker image' }));
    await userEvent.type(screen.getByLabelText('Image'), 'nvidia/cuda:12.4.1-base-ubuntu22.04');
    await userEvent.type(screen.getByLabelText(/Command/), 'nvidia-smi');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(sentBody(fetch)).toMatchObject({
        kind: 'DOCKER',
        image: 'nvidia/cuda:12.4.1-base-ubuntu22.04',
        command: 'nvidia-smi',
      }),
    );
  });

  it('does not send an image name that is not valid', async () => {
    const fetch = fakeBackend();
    renderWithProviders(<NewJobPage />);

    await userEvent.click(screen.getByRole('tab', { name: 'Docker image' }));
    await userEvent.type(screen.getByLabelText('Image'), 'My Image');
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(screen.getByText(/Write a valid image name/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uploads the .tar of the image', async () => {
    fakeBackend();
    upload.mockResolvedValue({ id: 'job-1', status: 'PENDING', createdAt: '' });
    renderWithProviders(<NewJobPage />);
    const tar = new File(['image layers'], 'model.tar', { type: 'application/x-tar' });

    await userEvent.click(screen.getByRole('tab', { name: 'Docker image' }));
    await userEvent.click(screen.getByRole('button', { name: /Upload a .tar/ }));
    await userEvent.upload(screen.getByTestId('docker-archive'), tar);
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(upload).toHaveBeenCalled());
    expect(upload.mock.calls[0][0]).toMatchObject({ archive: tar, timeoutSeconds: 60 });
  });
});
