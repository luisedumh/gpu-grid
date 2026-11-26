import { Box, FileArchive, ShieldCheck, Terminal, UploadCloud, X } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import { checkArchive, DOCKER_LIMITS, formatBytes } from '../lib/docker.ts';

export type DockerSource = 'registry' | 'archive';

interface DockerJobFormProps {
  source: DockerSource;
  onSourceChange: (source: DockerSource) => void;
  image: string;
  onImageChange: (image: string) => void;
  archive: File | null;
  onArchiveChange: (archive: File | null) => void;
  command: string;
  onCommandChange: (command: string) => void;
  /** Upload progress between 0 and 1, or null when nothing is being uploaded. */
  progress: number | null;
  disabled?: boolean;
}

/** Left panel of New job when the job is a Docker image instead of CUDA code. */
export function DockerJobForm({
  source,
  onSourceChange,
  image,
  onImageChange,
  archive,
  onArchiveChange,
  command,
  onCommandChange,
  progress,
  disabled = false,
}: DockerJobFormProps) {
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function choose(file: File | undefined) {
    if (!file) return;
    const problem = checkArchive(file);
    setFileError(problem);
    onArchiveChange(problem ? null : file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) choose(event.dataTransfer.files[0]);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    choose(event.target.files?.[0]);
    event.target.value = '';
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto rounded-xl border border-slate-200 bg-white p-5">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Where is the image?</legend>
        <div className="grid grid-cols-2 gap-3">
          <SourceCard
            selected={source === 'registry'}
            onSelect={() => onSourceChange('registry')}
            icon={<Box className="size-5" />}
            title="Published image"
            text="An image on Docker Hub, GHCR or another registry"
            disabled={disabled}
          />
          <SourceCard
            selected={source === 'archive'}
            onSelect={() => onSourceChange('archive')}
            icon={<FileArchive className="size-5" />}
            title="Upload a .tar"
            text="The file created with docker save"
            disabled={disabled}
          />
        </div>
      </fieldset>

      {source === 'registry' ? (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-500" htmlFor="docker-image">
            Image
          </label>
          <input
            id="docker-image"
            value={image}
            onChange={(e) => onImageChange(e.target.value)}
            placeholder="nvidia/cuda:12.4.1-base-ubuntu22.04"
            maxLength={DOCKER_LIMITS.maxImageLength}
            disabled={disabled}
            spellCheck={false}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-brand-500"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            The provider&apos;s machine downloads it with{' '}
            <span className="font-mono">docker pull</span>.
          </p>
        </div>
      ) : (
        <div>
          <div
            role="button"
            tabIndex={0}
            aria-label="Drop the .tar of the image here or click to choose it"
            onClick={() => !disabled && fileInput.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && !disabled && fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
              dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <UploadCloud className="size-8 text-brand-500" />
            <p className="text-sm font-medium">Drop the .tar of your image here</p>
            <p className="text-xs text-slate-500">
              or click to choose it · up to {formatBytes(DOCKER_LIMITS.maxArchiveBytes)}
            </p>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".tar,application/x-tar"
            onChange={handleInput}
            className="hidden"
            data-testid="docker-archive"
          />

          {fileError && (
            <p role="alert" className="mt-2 text-xs text-red-600">
              {fileError}
            </p>
          )}

          {archive && (
            <div className="mt-3 rounded-lg border border-slate-200 px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm">
                <FileArchive className="size-4 text-brand-500" />
                <span className="truncate font-mono">{archive.name}</span>
                <span className="text-xs text-slate-500">{formatBytes(archive.size)}</span>
                {progress === null && !disabled && (
                  <button
                    type="button"
                    aria-label="Remove the file"
                    onClick={() => onArchiveChange(null)}
                    className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              {progress !== null && (
                <div className="mt-2">
                  <div
                    role="progressbar"
                    aria-label="Upload progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress * 100)}
                    className="h-2 overflow-hidden rounded-full bg-slate-100"
                  >
                    <div
                      className="h-full rounded-full bg-brand-500 transition-[width]"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Uploading… {Math.round(progress * 100)} %
                  </p>
                </div>
              )}
            </div>
          )}

          <p className="mt-2 text-xs text-slate-500">
            Create it with{' '}
            <span className="rounded bg-slate-100 px-1 font-mono">
              docker save -o my-image.tar my-image:tag
            </span>
          </p>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-slate-500" htmlFor="docker-command">
          Command <span className="font-normal">(optional)</span>
        </label>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-950 px-3 py-2 focus-within:border-brand-500">
          <Terminal className="size-4 shrink-0 text-slate-500" />
          <input
            id="docker-command"
            value={command}
            onChange={(e) => onCommandChange(e.target.value)}
            placeholder="nvidia-smi"
            maxLength={DOCKER_LIMITS.maxCommandLength}
            disabled={disabled}
            spellCheck={false}
            className="w-full bg-transparent font-mono text-sm text-slate-100 outline-none placeholder:text-slate-600"
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          If empty, the image runs its default command.
        </p>
      </div>

      <div className="flex gap-2.5 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
        <ShieldCheck className="size-4 shrink-0 text-emerald-600" />
        <p>
          The container runs on the provider&apos;s GPU isolated: <b>no network</b>, read-only file
          system (only <span className="font-mono">/tmp</span> is writable), as a user{' '}
          <b>without privileges</b>, and with limits of memory, processes and time. Images that need
          internet or root will not work.
        </p>
      </div>
    </div>
  );
}

function SourceCard({
  selected,
  onSelect,
  icon,
  title,
  text,
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  text: string;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      disabled={disabled}
      className={`rounded-xl border p-3.5 text-left ${
        selected
          ? 'border-2 border-brand-500 bg-brand-50 text-brand-500'
          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
      }`}
    >
      {icon}
      <div className="mt-1.5 text-sm font-semibold text-slate-900">{title}</div>
      <div className="text-xs text-slate-500">{text}</div>
    </button>
  );
}
