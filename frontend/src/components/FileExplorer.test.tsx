import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FileExplorer } from './FileExplorer.tsx';

const paths = ['main.cu', 'src/kernels.cu', 'include/kernels.cuh'];

function renderExplorer(overrides: Partial<Parameters<typeof FileExplorer>[0]> = {}) {
  const props = {
    paths,
    activePath: 'main.cu',
    onOpen: vi.fn(),
    onCreate: vi.fn(() => null),
    onRename: vi.fn(() => null),
    onDelete: vi.fn(),
    onUploadFiles: vi.fn(),
    onUploadZip: vi.fn(),
    ...overrides,
  };
  render(<FileExplorer {...props} />);
  return props;
}

describe('FileExplorer', () => {
  it('shows the folders and files of the project as a tree', () => {
    renderExplorer();

    expect(screen.getByTitle('src')).toBeInTheDocument();
    expect(screen.getByTitle('include')).toBeInTheDocument();
    expect(screen.getByTitle('src/kernels.cu')).toBeInTheDocument();
    expect(screen.getByTitle('main.cu')).toBeInTheDocument();
  });

  it('opens a file when it is clicked', async () => {
    const props = renderExplorer();

    await userEvent.click(screen.getByTitle('src/kernels.cu'));

    expect(props.onOpen).toHaveBeenCalledWith('src/kernels.cu');
  });

  it('folds and unfolds folders', async () => {
    renderExplorer();

    await userEvent.click(screen.getByTitle('src'));
    expect(screen.queryByTitle('src/kernels.cu')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTitle('src'));
    expect(screen.getByTitle('src/kernels.cu')).toBeInTheDocument();
  });

  it('creates a file, also inside a folder', async () => {
    const props = renderExplorer();

    await userEvent.click(screen.getByRole('button', { name: 'New file' }));
    await userEvent.type(screen.getByLabelText('New file name'), 'src/utils.cu{Enter}');

    expect(props.onCreate).toHaveBeenCalledWith('src/utils.cu');
  });

  it('renames a file and shows the error when the name is not possible', async () => {
    const props = renderExplorer({ onRename: vi.fn(() => 'src/kernels.cu already exists') });

    await userEvent.click(screen.getByRole('button', { name: 'Rename main.cu' }));
    const input = screen.getByLabelText('New name for main.cu');
    await userEvent.clear(input);
    await userEvent.type(input, 'src/kernels.cu{Enter}');

    expect(props.onRename).toHaveBeenCalledWith('main.cu', 'src/kernels.cu');
    expect(screen.getByRole('alert')).toHaveTextContent('src/kernels.cu already exists');
  });

  it('cancels renaming with Escape', async () => {
    const props = renderExplorer();

    await userEvent.click(screen.getByRole('button', { name: 'Rename main.cu' }));
    await userEvent.type(screen.getByLabelText('New name for main.cu'), 'x{Escape}');

    expect(props.onRename).not.toHaveBeenCalled();
    expect(screen.getByTitle('main.cu')).toBeInTheDocument();
  });

  it('deletes files and folders', async () => {
    const props = renderExplorer();

    await userEvent.click(screen.getByRole('button', { name: 'Delete src' }));

    expect(props.onDelete).toHaveBeenCalledWith('src');
  });

  it('passes the uploaded .zip on', async () => {
    const props = renderExplorer();
    const zip = new File(['PK'], 'project.zip', { type: 'application/zip' });

    await userEvent.upload(screen.getByTestId('upload-zip'), zip);

    expect(props.onUploadZip).toHaveBeenCalledWith(zip);
  });

  it('hides the actions while a job is running', () => {
    renderExplorer({ disabled: true });

    expect(screen.queryByRole('button', { name: 'Delete src' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New file' })).toBeDisabled();
  });
});
