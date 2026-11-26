import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DockerJobForm } from './DockerJobForm.tsx';

function renderForm(overrides: Partial<Parameters<typeof DockerJobForm>[0]> = {}) {
  const props = {
    source: 'archive' as const,
    onSourceChange: vi.fn(),
    image: '',
    onImageChange: vi.fn(),
    archive: null,
    onArchiveChange: vi.fn(),
    command: '',
    onCommandChange: vi.fn(),
    progress: null,
    ...overrides,
  };
  render(<DockerJobForm {...props} />);
  return props;
}

describe('DockerJobForm', () => {
  it('lets the client choose between a published image and a .tar', async () => {
    const props = renderForm();

    await userEvent.click(screen.getByRole('button', { name: /Published image/ }));

    expect(props.onSourceChange).toHaveBeenCalledWith('registry');
  });

  it('accepts a .tar dropped on the drop zone', () => {
    const props = renderForm();
    const tar = new File(['image layers'], 'model.tar', { type: 'application/x-tar' });

    fireEvent.drop(screen.getByRole('button', { name: /Drop the .tar/ }), {
      dataTransfer: { files: [tar] },
    });

    expect(props.onArchiveChange).toHaveBeenCalledWith(tar);
  });

  it('rejects files that are not a .tar', async () => {
    const props = renderForm();

    await userEvent.upload(
      screen.getByTestId('docker-archive'),
      new File(['x'], 'model.zip', { type: 'application/zip' }),
      { applyAccept: false },
    );

    expect(screen.getByRole('alert')).toHaveTextContent('docker save');
    expect(props.onArchiveChange).toHaveBeenCalledWith(null);
  });

  it('shows the progress of the upload', () => {
    const tar = new File(['image layers'], 'model.tar');
    renderForm({ archive: tar, progress: 0.42 });

    expect(screen.getByText('model.tar')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText(/Uploading… 42 %/)).toBeInTheDocument();
  });

  it('asks for the image name when it is published in a registry', async () => {
    const props = renderForm({ source: 'registry' });

    await userEvent.type(screen.getByLabelText('Image'), 'u');

    expect(props.onImageChange).toHaveBeenCalledWith('u');
  });
});
