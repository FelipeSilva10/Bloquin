import { useEffect, useRef } from 'react';
import { normalizeExternalLink, sanitizeRichText } from '../../services/libraryMediaService';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function RichTextEditor({ value, onChange, disabled = false }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const saveSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      selectionRef.current = range.cloneRange();
    }
  };

  const restoreSelection = () => {
    const selection = window.getSelection();
    const range = selectionRef.current;
    if (!selection || !range) return;
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const handleToolbarPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    // Impede o botão de roubar o foco antes de o comando ser executado.
    event.preventDefault();
    saveSelection();
  };

  const runCommand = (command: string, commandValue?: string) => {
    if (disabled) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus({ preventScroll: true });
    restoreSelection();
    (document as Document & { execCommand?: (name: string, showUi?: boolean, value?: string) => boolean }).execCommand?.(command, false, commandValue);
    onChange(editor.innerHTML);
    saveSelection();
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    saveSelection();
    const sourceHtml = event.clipboardData.getData('text/html');
    const safeHtml = sourceHtml
      ? sanitizeRichText(sourceHtml)
      : plainTextToHtml(event.clipboardData.getData('text/plain'));
    runCommand('insertHTML', safeHtml);
  };

  return (
    <div className="library-editor">
      <div className="library-editor-toolbar" role="toolbar" aria-label="Formatação do texto">
        <button type="button" className="library-editor-tool" onPointerDown={handleToolbarPointerDown} onClick={() => runCommand('bold')} disabled={disabled} aria-label="Negrito" aria-keyshortcuts="Control+B"><strong>B</strong></button>
        <button type="button" className="library-editor-tool" onPointerDown={handleToolbarPointerDown} onClick={() => runCommand('italic')} disabled={disabled} aria-label="Itálico" aria-keyshortcuts="Control+I"><em>I</em></button>
        <button type="button" className="library-editor-tool" onPointerDown={handleToolbarPointerDown} onClick={() => runCommand('insertUnorderedList')} disabled={disabled} aria-label="Lista com marcadores">• Lista</button>
        <button type="button" className="library-editor-tool" onPointerDown={handleToolbarPointerDown} onClick={() => runCommand('insertOrderedList')} disabled={disabled} aria-label="Lista numerada">1. Lista</button>
        <button type="button" className="library-editor-tool" onPointerDown={handleToolbarPointerDown} onClick={() => runCommand('formatBlock', 'pre')} disabled={disabled} aria-label="Formatar como bloco de código">⌘ Código</button>
        <button type="button" className="library-editor-tool" onPointerDown={handleToolbarPointerDown} onClick={() => {
          const value = window.prompt('Cole o endereço do link (http:// ou https://)');
          if (!value) return;
          const url = normalizeExternalLink(value);
          if (!url) {
            window.alert('Informe um endereço válido começando com http:// ou https://.');
            return;
          }
          runCommand('createLink', url);
        }} disabled={disabled} aria-label="Inserir link">🔗 Link</button>
      </div>
      <div
        ref={editorRef}
        id="library-content"
        className="library-editor-content"
        contentEditable={!disabled}
        role="textbox"
        aria-multiline="true"
        aria-disabled={disabled}
        aria-labelledby="library-content-label"
        data-placeholder="Escreva uma explicação, aviso ou material para sua turma…"
        onInput={(event) => onChange(event.currentTarget.innerHTML)}
        onPaste={handlePaste}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onSelect={saveSelection}
        suppressContentEditableWarning
      />
    </div>
  );
}

function plainTextToHtml(value: string): string {
  const container = document.createElement('div');
  container.textContent = value;
  return container.innerHTML.replace(/\r?\n/g, '<br>');
}
