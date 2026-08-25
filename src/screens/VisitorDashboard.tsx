import { useRef, useState } from 'react';
import { MAX_OPEN_TABS, useTabs } from '../state/tabsStore';
import { MAX_PROJECT_FILE_BYTES, parseProjectFileContents } from '../types/project';
import { isTauriRuntime, openLocalProjectFile } from '../services/localProjectService';
import { EntryBackButton } from '../components/EntryBackButton';
import TutorialModal from '../components/modals/TutorialModal';
import { Cpu, FolderOpen, GraduationCap, Plus } from 'lucide-react';

interface VisitorDashboardProps {
  onExitVisitor: () => void;
  onOpenProject: (tabId: string) => void;
  onOpenComponents: () => void;
}

export function VisitorDashboard({ onExitVisitor, onOpenProject, onOpenComponents }: VisitorDashboardProps) {
  const { tabs, openProject, activateTab } = useTabs();
  const [error, setError] = useState('');
  const [isOpening, setIsOpening] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const createProject = () => {
    const id = openProject({ title: 'Projeto visitante', source: 'memory', board: null });
    if (id) {
      setError('');
      onOpenProject(id);
    } else {
      setError(`Você atingiu o limite de ${MAX_OPEN_TABS} abas abertas. Feche uma aba para continuar.`);
    }
  };

  const openParsedProject = (contents: string, filePath: string) => {
    const parsed = parseProjectFileContents(contents, filePath);
    const id = openProject({
      title: parsed.project.name,
      source: 'local-file',
      filePath,
      board: parsed.project.targetBoard,
      workspaceData: parsed.workspace,
    });
    if (!id) throw new Error(`Você atingiu o limite de ${MAX_OPEN_TABS} abas abertas. Feche uma aba para continuar.`);
    setError('');
    onOpenProject(id);
  };

  const openNativeFile = async () => {
    setIsOpening(true);
    try {
      const selected = await openLocalProjectFile();
      if (selected) openParsedProject(selected.contents, selected.path);
      else if (!isTauriRuntime()) inputRef.current?.click();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.');
    } finally {
      setIsOpening(false);
    }
  };

  const openFile = async (file: File) => {
    try {
      if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error('O arquivo é muito grande. O limite para importação é 8 MB.');
      openParsedProject(await file.text(), file.name);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.'); }
  };

  return (
    <div className="dashboard-container visitor-dashboard">
      <div className="dashboard-header">
        <div><h1>Modo Visitante</h1><p>Crie e teste projetos sem fazer cadastro.</p></div>
        <EntryBackButton onClick={onExitVisitor} disabled={isOpening} />
      </div>
      <div className="dashboard-content">
        <div className="project-grid">
          <button type="button" className="project-card new-project-card" onClick={createProject}><Plus aria-hidden="true" /><span>Novo projeto</span></button>
          <button type="button" className="project-card new-project-card" onClick={openNativeFile} disabled={isOpening}><FolderOpen aria-hidden="true" /><span>{isOpening ? 'Abrindo…' : 'Abrir arquivo JSON'}</span></button>
          <button type="button" className="project-card new-project-card" onClick={onOpenComponents}><Cpu aria-hidden="true" /><span>Componentes</span></button>
          <button type="button" className="project-card new-project-card" onClick={() => setShowTutorial(true)}><GraduationCap aria-hidden="true" /><span>Tutorial</span></button>
          {tabs.filter((tab) => tab.type === 'project').map((tab) => <button type="button" className="project-card" key={tab.id} onClick={() => { activateTab(tab.id); onOpenProject(tab.id); }}><strong>{tab.dirty ? '● ' : ''}{tab.title}</strong><small>Projeto local da sessão</small></button>)}
        </div>
        {error && <p role="alert" style={{ color: 'var(--danger)', fontWeight: 700 }}>{error}</p>}
      </div>
      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} audience="visitor" />}
      <input
        ref={inputRef}
        className="visually-hidden-file"
        tabIndex={-1}
        type="file"
        accept=".json,application/json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void openFile(file);
        }}
      />
    </div>
  );
}
