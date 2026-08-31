import { useEffect, useRef, useState } from 'react';
import { BookOpen, Cpu, ExternalLink, FolderOpen, GraduationCap, LogIn, MoreVertical, Plus, Sparkles } from 'lucide-react';
import logoSimples from '../assets/LogoSimples.png';
import { MAX_OPEN_TABS, useTabs } from '../state/tabsStore';
import { MAX_PROJECT_FILE_BYTES, parseProjectFileContents } from '../types/project';
import { isTauriRuntime, openLocalProjectFile } from '../services/localProjectService';
import {
  createLocalProject,
  deleteLocalProject,
  listLocalProjects,
  readLocalProject,
  renameLocalProject,
  type LocalProjectSummary,
} from '../services/localProjectStore';
import { ProjectBoardBadge } from '../components/ProjectBoardBadge';
import TutorialModal from '../components/modals/TutorialModal';
import { CREATOR_PORTFOLIO_URL, openCreatorPortfolio } from '../services/creatorPortfolioService';
import './WelcomeScreen.css';

interface WelcomeScreenProps {
  onLoginEscolar: () => void;
  onOpenProject: (tabId: string) => void;
  onOpenComponents: () => void;
  onOpenLibrary: () => void;
  version: string;
}

function LocalProjectCard({ project, isBusy, onOpen, onRename, onDelete }: {
  project: LocalProjectSummary;
  isBusy: boolean;
  onOpen: (project: LocalProjectSummary) => void;
  onRename: (project: LocalProjectSummary, name: string) => Promise<void>;
  onDelete: (project: LocalProjectSummary) => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setConfirmingDelete(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); setConfirmingDelete(false); }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  const commitRename = async () => {
    const trimmed = renameValue.trim();
    setIsRenaming(false);
    if (!trimmed || trimmed === project.name) { setRenameValue(project.name); return; }
    setBusy(true);
    try { await onRename(project, trimmed); } finally { setBusy(false); }
  };

  const handleDeleteClick = async () => {
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    setMenuOpen(false);
    setConfirmingDelete(false);
    setBusy(true);
    try { await onDelete(project); } finally { setBusy(false); }
  };

  return (
    <article className="project-card-wrap">
      {isRenaming ? (
        <div className="project-card-surface project-card-surface--renaming">
          <input
            className="project-card-rename-input"
            value={renameValue}
            autoFocus
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); void commitRename(); }
              if (event.key === 'Escape') { setRenameValue(project.name); setIsRenaming(false); }
            }}
            onBlur={() => void commitRename()}
          />
            <ProjectBoardBadge board={project.targetBoard} />
            <small>{project.updatedAt ? `Editado em ${new Date(project.updatedAt).toLocaleDateString('pt-BR')}` : 'Data desconhecida'}</small>
        </div>
      ) : (
        <button type="button" className="project-card-surface" onClick={() => onOpen(project)} disabled={isBusy || busy}>
          <strong>{project.name}</strong>
          <ProjectBoardBadge board={project.targetBoard} />
          <small>{project.updatedAt ? `Editado em ${new Date(project.updatedAt).toLocaleDateString('pt-BR')}` : 'Data desconhecida'}</small>
        </button>
      )}

      <div className="project-card-menu" ref={menuRef}>
        <button
          type="button"
          className="project-card-menu-trigger"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Mais ações para ${project.name}`}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreVertical aria-hidden="true" />
        </button>
        {menuOpen && (
          <div className="project-card-menu-list" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); setRenameValue(project.name); setIsRenaming(true); }}
            >
              Renomear
            </button>
            <button type="button" role="menuitem" className="project-card-menu-danger" onClick={() => void handleDeleteClick()}>
              {confirmingDelete ? 'Confirmar exclusão' : 'Excluir'}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export function WelcomeScreen({ onLoginEscolar, onOpenProject, onOpenComponents, onOpenLibrary, version }: WelcomeScreenProps) {
  const { tabs, openProject, activateTab } = useTabs();
  const [projects, setProjects] = useState<LocalProjectSummary[]>([]);
  const [corruptedCount, setCorruptedCount] = useState(0);
  const [isLoadingProjects, setIsLoadingProjects] = useState(isTauriRuntime());
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    listLocalProjects()
      .then(({ projects: found, corruptedCount: corrupted }) => {
        if (cancelled) return;
        setProjects(found);
        setCorruptedCount(corrupted);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Não foi possível carregar seus projetos.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingProjects(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handlePortfolioOpen = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    void openCreatorPortfolio();
  };

  const openTab = (id: string | null) => {
    if (id) {
      setError('');
      onOpenProject(id);
    } else {
      setError(`Você atingiu o limite de ${MAX_OPEN_TABS} abas abertas. Feche uma aba para continuar.`);
    }
  };

  const createProject = async () => {
    setIsBusy(true);
    try {
      if (isTauriRuntime()) {
        const { filePath, file } = await createLocalProject('Meu projeto', null);
        openTab(openProject({ title: file.project.name, source: 'local-file', filePath, board: null }));
      } else {
        openTab(openProject({ title: 'Meu projeto', source: 'memory', board: null }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível criar o projeto.');
    } finally {
      setIsBusy(false);
    }
  };

  const openParsedProject = (contents: string, filePath: string) => {
    const parsed = parseProjectFileContents(contents, filePath);
    openTab(openProject({
      title: parsed.project.name,
      source: 'local-file',
      filePath,
      board: parsed.project.targetBoard,
      workspaceData: parsed.workspace,
    }));
  };

  const openNativeFile = async () => {
    setIsBusy(true);
    try {
      const selected = await openLocalProjectFile();
      if (selected) openParsedProject(selected.contents, selected.path);
      else if (!isTauriRuntime()) inputRef.current?.click();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.');
    } finally {
      setIsBusy(false);
    }
  };

  const openFile = async (file: File) => {
    try {
      if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error('O arquivo é muito grande. O limite para importação é 8 MB.');
      openParsedProject(await file.text(), file.name);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.'); }
  };

  const openProjectCard = async (project: LocalProjectSummary) => {
    setIsBusy(true);
    try {
      const parsed = await readLocalProject(project.filePath);
      openTab(openProject({
        title: parsed.project.name,
        source: 'local-file',
        filePath: project.filePath,
        board: parsed.project.targetBoard,
        workspaceData: parsed.workspace,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir este projeto.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRenameProject = async (project: LocalProjectSummary, name: string) => {
    try {
      await renameLocalProject(project.filePath, name);
      setProjects((current) => current.map((item) => (item.filePath === project.filePath ? { ...item, name } : item)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível renomear o projeto.');
    }
  };

  const handleDeleteProject = async (project: LocalProjectSummary) => {
    try {
      await deleteLocalProject(project.filePath);
      setProjects((current) => current.filter((item) => item.filePath !== project.filePath));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível excluir o projeto.');
    }
  };

  const sessionProjects = tabs.filter((tab) => tab.type === 'project' && tab.source === 'memory');
  const hasAnyProject = projects.length > 0 || sessionProjects.length > 0;

  return (
    <div className="welcome-page">
      <header className="welcome-hero">
        <div className="welcome-hero-decor" aria-hidden="true">
          <span className="welcome-hero-block welcome-hero-block--1" />
          <span className="welcome-hero-block welcome-hero-block--2" />
          <span className="welcome-hero-block welcome-hero-block--3" />
        </div>

        <div className="welcome-hero-inner">
          <div className="welcome-hero-brand">
            <img className="welcome-hero-mark" src={logoSimples} alt="" draggable="false" />
            <h1>Bloquin</h1>
          </div>

          <div className="welcome-hero-actions">
            <button type="button" className="welcome-hero-create" onClick={() => void createProject()} disabled={isBusy}>
              <Plus aria-hidden="true" />
              <span>{isBusy ? 'Um instante…' : 'Criar novo projeto'}</span>
            </button>
            <button type="button" className="welcome-hero-login" onClick={onLoginEscolar}>
              <LogIn aria-hidden="true" />
              <span>Login escolar</span>
            </button>
          </div>
        </div>
        <div className="welcome-hero-block-train-rail" aria-hidden="true" />
      </header>

      <div className="welcome-body">
        {hasAnyProject ? (
          <section className="welcome-section">
            <div className="welcome-section-heading">
              <span className="welcome-section-label">Seus projetos</span>
              <span className="welcome-project-count">{projects.length + sessionProjects.length} {projects.length + sessionProjects.length === 1 ? 'projeto' : 'projetos'}</span>
            </div>
            <div className="project-grid welcome-projects-grid">
              {projects.map((project) => (
                <LocalProjectCard
                  key={project.filePath}
                  project={project}
                  isBusy={isBusy}
                  onOpen={(item) => void openProjectCard(item)}
                  onRename={handleRenameProject}
                  onDelete={handleDeleteProject}
                />
              ))}
              {sessionProjects.map((tab) => (
                <button type="button" className="project-card-surface project-card-surface--session" key={tab.id} onClick={() => { activateTab(tab.id); onOpenProject(tab.id); }}>
                  <strong>{tab.dirty ? '● ' : ''}{tab.title}</strong>
                  <small>Projeto desta sessão</small>
                </button>
              ))}
            </div>
          </section>
        ) : !isLoadingProjects && (
          <section className="welcome-section">
            <div className="welcome-empty-state">
              <span className="welcome-empty-state-icon"><Sparkles aria-hidden="true" /></span>
              <strong>Nenhum projeto salvo.</strong>
              <button type="button" onClick={() => void createProject()} disabled={isBusy}>
                <Plus aria-hidden="true" /> Criar projeto
              </button>
            </div>
          </section>
        )}

        {corruptedCount > 0 && (
          <p role="status" className="welcome-corrupted-notice">
            {corruptedCount === 1 ? '1 arquivo não pôde ser lido.' : `${corruptedCount} arquivos não puderam ser lidos.`}
          </p>
        )}

        <section className="welcome-section">
          <span className="welcome-section-label">Explorar</span>
          <div className="welcome-secondary-grid">
            <button type="button" className="welcome-secondary-card welcome-secondary-card--neutral" onClick={() => void openNativeFile()} disabled={isBusy}>
              <span className="welcome-secondary-card-visual"><span className="welcome-secondary-card-icon"><FolderOpen aria-hidden="true" /></span></span>
              <strong className="welcome-secondary-card-title">Abrir arquivo JSON</strong>
            </button>
            <button type="button" className="welcome-secondary-card welcome-secondary-card--library" onClick={onOpenLibrary}>
              <span className="welcome-secondary-card-visual"><span className="welcome-secondary-card-icon"><BookOpen aria-hidden="true" /></span></span>
              <strong className="welcome-secondary-card-title">Biblioteca</strong>
            </button>
            <button type="button" className="welcome-secondary-card welcome-secondary-card--components" onClick={onOpenComponents}>
              <span className="welcome-secondary-card-visual"><span className="welcome-secondary-card-icon"><Cpu aria-hidden="true" /></span></span>
              <strong className="welcome-secondary-card-title">Componentes</strong>
            </button>
          </div>
        </section>

        {error && <p role="alert" style={{ color: 'var(--danger)', fontWeight: 700 }}>{error}</p>}

        <footer className="welcome-footer-line">
          <span>Bloquin IDE v{version}</span>
          <span aria-hidden="true">·</span>
          <span>Criado por Felipe Silva</span>
          <span aria-hidden="true">·</span>
          <a
            href={CREATOR_PORTFOLIO_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handlePortfolioOpen}
            aria-label="Abrir o portfólio de Felipe Silva em uma nova aba"
          >
            Portfólio <ExternalLink aria-hidden="true" />
          </a>
        </footer>
      </div>

      <button type="button" className="welcome-tutorial-fab" onClick={() => setShowTutorial(true)} aria-label="Ver tutorial">
        <GraduationCap aria-hidden="true" />
      </button>

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
