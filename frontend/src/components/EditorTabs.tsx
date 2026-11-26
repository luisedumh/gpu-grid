import { FileCode2, X } from 'lucide-react';

interface EditorTabsProps {
  tabs: string[];
  active: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

/** Open files above the editor, like the tabs of VS Code. */
export function EditorTabs({ tabs, active, onSelect, onClose }: EditorTabsProps) {
  return (
    <div role="tablist" aria-label="Open files" className="flex overflow-x-auto bg-[#181818]">
      {tabs.map((path) => {
        const selected = path === active;
        const name = path.split('/').pop();
        return (
          <div
            key={path}
            className={`group flex shrink-0 items-center gap-1.5 border-r border-white/10 pr-1.5 pl-3 text-[13px] ${
              selected
                ? 'border-t-2 border-t-brand-500 bg-[#1e1e1e] text-white'
                : 'border-t-2 border-t-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              title={path}
              onClick={() => onSelect(path)}
              className="flex items-center gap-1.5 py-2"
            >
              <FileCode2 className="size-3.5 text-sky-300" strokeWidth={1.8} />
              {name}
            </button>
            <button
              type="button"
              aria-label={`Close ${path}`}
              onClick={() => onClose(path)}
              className={`rounded p-0.5 hover:bg-white/10 ${selected ? '' : 'opacity-0 group-hover:opacity-100'}`}
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
