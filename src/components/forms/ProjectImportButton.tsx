import { useRef, useState } from 'react';
import { isTauriRuntime, openLocalProjectFile } from '../../services/localProjectService';
import {
  MAX_PROJECT_FILE_BYTES,
  parseProjectFileContents,
  type BloquinProjectFile,
} from '../../types/project';

interface ProjectImportButtonProps {
  onSelected: (file: BloquinProjectFile) => void | Promise<void>;
  onError: (message: string) => void;
  disabled?: boolean;
  className?: string;
}

export function ProjectImportButton({ onSelected, onError, disabled = false, className = 'btn-outline' }: ProjectImportButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [opening, setOpening] = useState(false);

  const processContents = async (contents: string, fileName: string) => {
    const parsed = parseProjectFileContents(contents, fileName);
    await onSelected(parsed);
  };

  const chooseFile = async () => {
    if (opening || disabled) return;
    setOpening(true);
    onError('');
    try {
      const selected = await openLocalProjectFile();
      if (selected) await processContents(selected.contents, selected.path);
      else if (!isTauriRuntime()) inputRef.current?.click();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Não foi possível importar o projeto.');
    } finally {
      setOpening(false);
    }
  };

  const processBrowserFile = async (file: File) => {
    if (file.size > MAX_PROJECT_FILE_BYTES) {
      onError('O arquivo é muito grande. O limite para importação é 8 MB.');
      return;
    }
    setOpening(true);
    onError('');
    try {
      await processContents(await file.text(), file.name);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Não foi possível importar o projeto.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={() => void chooseFile()} disabled={disabled || opening} aria-busy={opening}>
        <span aria-hidden="true">↥</span> {opening ? 'Lendo projeto…' : 'Importar projeto'}
      </button>
      <input
        ref={inputRef}
        className="visually-hidden-file"
        tabIndex={-1}
        type="file"
        accept=".json,application/json"
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void processBrowserFile(file);
        }}
      />
    </>
  );
}
