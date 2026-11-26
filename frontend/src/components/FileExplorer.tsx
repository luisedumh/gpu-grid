import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderUp,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import { useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react';
import { buildTree, type TreeNode } from '../lib/project.ts';

interface FileExplorerProps {
  /** Paths of every file in the project. */
  paths: string[];
  /** File shown in the editor right now. */
  activePath: string | null;
  onOpen: (path: string) => void;
  /** Returns an error message to show, or null if the file was created. */
  onCreate: (path: string) => string | null;
  /** Returns an error message to show, or null if it was renamed. */
  onRename: (from: string, to: string) => string | null;
  onDelete: (path: string) => void;
  /** Files chosen with "Upload files" or "Upload folder". */
  onUploadFiles: (files: FileList) => void;
  /** A .zip chosen with "Upload .zip". */
  onUploadZip: (file: File) => void;
  /** Disables every action while a job is being sent or run. */
  disabled?: boolean;
}

/** Project tree on the left of the editor, like the explorer of VS Code. */
export function FileExplorer({
  paths,
  activePath,
  onOpen,
  onCreate,
  onRename,
  onDelete,
  onUploadFiles,
  onUploadZip,
  disabled = false,
}: FileExplorerProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);

  const tree = buildTree(paths);

  function toggle(folder: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }

  function finishCreate(value: string) {
    setCreating(false);
    if (value.trim() === '') return;
    setError(onCreate(value));
  }

  function finishRename(from: string, value: string) {
    setRenaming(null);
    if (value.trim() === '' || value === from) return;
    setError(onRename(from, value));
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files?.length) onUploadFiles(event.target.files);
    event.target.value = '';
  }

  function handleZip(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) onUploadZip(file);
    event.target.value = '';
  }

  function renderNode(node: TreeNode, depth: number): ReactNode {
    const indent = { paddingLeft: `${8 + depth * 14}px` };

    if (renaming === node.path) {
      return (
        <li key={node.path} style={indent} className="py-0.5 pr-2">
          <NameInput
            label={`New name for ${node.path}`}
            initial={node.path}
            onDone={(value) => finishRename(node.path, value)}
          />
        </li>
      );
    }

    const isFolder = node.kind === 'folder';
    const open = isFolder && !collapsed.has(node.path);
    const active = node.path === activePath;
    const Icon = isFolder
      ? open
        ? FolderOpen
        : Folder
      : node.name.endsWith('.md') || node.name.endsWith('.txt')
        ? FileText
        : FileCode2;

    return (
      <li key={node.path}>
        <div
          style={indent}
          className={`group flex items-center gap-1.5 py-1 pr-1.5 text-[13px] ${
            active ? 'bg-brand-500/25 text-white' : 'text-slate-300 hover:bg-white/5'
          }`}
        >
          <button
            type="button"
            onClick={() => (isFolder ? toggle(node.path) : onOpen(node.path))}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
            title={node.path}
          >
            {isFolder ? (
              open ? (
                <ChevronDown className="size-3.5 shrink-0 text-slate-500" />
              ) : (
                <ChevronRight className="size-3.5 shrink-0 text-slate-500" />
              )
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <Icon
              className={`size-4 shrink-0 ${isFolder ? 'text-amber-300' : 'text-sky-300'}`}
              strokeWidth={1.8}
            />
            <span className="truncate">{node.name}</span>
          </button>
          {!disabled && (
            <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex group-focus-within:flex">
              <IconButton label={`Rename ${node.path}`} onClick={() => setRenaming(node.path)}>
                <Pencil className="size-3.5" />
              </IconButton>
              <IconButton label={`Delete ${node.path}`} onClick={() => onDelete(node.path)}>
                <Trash2 className="size-3.5" />
              </IconButton>
            </span>
          )}
        </div>
        {open && node.children.length > 0 && (
          <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul>
        )}
      </li>
    );
  }

  return (
    <nav
      aria-label="Project files"
      className="flex w-60 shrink-0 flex-col border-r border-white/10 bg-[#181818] text-slate-300"
    >
      <div className="flex items-center gap-0.5 border-b border-white/10 px-2 py-1.5">
        <span className="flex-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Explorer
        </span>
        <IconButton label="New file" onClick={() => setCreating(true)} disabled={disabled}>
          <FilePlus2 className="size-4" />
        </IconButton>
        <IconButton
          label="Upload files"
          onClick={() => filesInput.current?.click()}
          disabled={disabled}
        >
          <Upload className="size-4" />
        </IconButton>
        <IconButton
          label="Upload folder"
          onClick={() => folderInput.current?.click()}
          disabled={disabled}
        >
          <FolderUp className="size-4" />
        </IconButton>
        <IconButton
          label="Upload .zip"
          onClick={() => zipInput.current?.click()}
          disabled={disabled}
        >
          <span className="font-mono text-[10px] font-bold">ZIP</span>
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-1">
        {creating && (
          <div className="px-2 py-0.5">
            <NameInput
              label="New file name"
              initial=""
              placeholder="src/kernels.cu"
              onDone={finishCreate}
            />
          </div>
        )}
        {paths.length === 0 && !creating ? (
          <p className="px-3 py-2 text-xs text-slate-500">
            No files. Create one or upload your project.
          </p>
        ) : (
          <ul>{tree.map((node) => renderNode(node, 0))}</ul>
        )}
      </div>

      {error && (
        <p role="alert" className="border-t border-white/10 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      <input
        ref={filesInput}
        type="file"
        multiple
        accept=".cu,.cuh,.h,.hpp,.c,.cc,.cpp,.txt,.md"
        onChange={handleFiles}
        className="hidden"
        data-testid="upload-files"
      />
      <input
        ref={folderInput}
        type="file"
        // Lets the user choose a whole folder (supported by every current browser)
        {...{ webkitdirectory: '' }}
        onChange={handleFiles}
        className="hidden"
        data-testid="upload-folder"
      />
      <input
        ref={zipInput}
        type="file"
        accept=".zip"
        onChange={handleZip}
        className="hidden"
        data-testid="upload-zip"
      />
    </nav>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Small text box to type a file name; Enter confirms and Escape cancels. */
function NameInput({
  label,
  initial,
  placeholder,
  onDone,
}: {
  label: string;
  initial: string;
  placeholder?: string;
  onDone: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  // Enter (or Escape) and then losing focus must not finish twice
  const finished = useRef(false);

  function finish(result: string) {
    if (finished.current) return;
    finished.current = true;
    onDone(result);
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(value);
    } else if (event.key === 'Escape') {
      finish('');
    }
  }

  return (
    <input
      aria-label={label}
      autoFocus
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKey}
      onBlur={() => finish(value)}
      className="w-full rounded border border-brand-500 bg-[#1f1f1f] px-1.5 py-0.5 font-mono text-[12px] text-white outline-none"
    />
  );
}
