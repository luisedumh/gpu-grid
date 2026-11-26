import Editor from '@monaco-editor/react';
import '../lib/monaco.ts';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * File being edited. Each path keeps its own model in Monaco,
   * so switching tabs keeps the undo history and the cursor of each file.
   */
  path?: string;
  language?: string;
  readOnly?: boolean;
}

/** Code editor with C++ highlighting, which also covers CUDA syntax. */
export function CodeEditor({
  value,
  onChange,
  path,
  language = 'cpp',
  readOnly = false,
}: CodeEditorProps) {
  return (
    <Editor
      path={path}
      language={language}
      theme="vs-dark"
      value={value}
      onChange={(next) => onChange(next ?? '')}
      options={{
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        padding: { top: 12 },
        readOnly,
      }}
    />
  );
}
