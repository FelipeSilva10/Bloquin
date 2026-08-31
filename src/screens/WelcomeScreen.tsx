import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BookOpen, Cpu, ExternalLink, FolderOpen, GraduationCap, LogIn, MoreVertical, Plus, Sparkles } from 'lucide-react';
import logoSimples from '../assets/LogoSimples.png';
import abrirJsonBanner from '../assets/AbrirJSON_banner.png';
import bibliotecaBanner from '../assets/Biblioteca_banner.png';
import componentesBanner from '../assets/Componentes_banner.png';
import { MAX_OPEN_TABS, useTabs } from '../state/tabsStore';
import { MAX_PROJECT_FILE_BYTES, parseProjectFileContents, projectFileSlug } from '../types/project';
import { exportLocalProjectFile, isTauriRuntime, openLocalProjectFile } from '../services/localProjectService';
import {
  createLocalProject,
  deleteLocalProject,
  duplicateLocalProject,
  listLocalProjects,
  readLocalProject,
  renameLocalProject,
  type LocalProjectSummary,
} from '../services/localProjectStore';
import { formatProjectUpdatedAt } from '../lib/projectDate';
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

/** Miniatura do card: mosaico das cores de categoria dos blocos usados no projeto (ver blockThumbnail.ts). Puramente decorativa. */
function ProjectThumbnail({ colours }: { colours: string[] }) {
  if (colours.length === 0) {
    return (
      <span className="project-card-thumb project-card-thumb--empty" aria-hidden="true">
        <span className="project-card-thumb-chip" />
        <span className="project-card-thumb-chip" />
        <span className="project-card-thumb-chip" />
      </span>
    );
  }
  return (
    <span className="project-card-thumb" aria-hidden="true">
      {colours.map((colour, index) => (
        <span key={`${colour}-${index}`} className="project-card-thumb-chip" style={{ background: colour }} />
      ))}
    </span>
  );
}

function LocalProjectCard({ project, isBusy, menuOpen, onOpen, onToggleMenu, onCloseMenu, onRename, onDuplicate, onExport, onDelete }: {
  project: LocalProjectSummary;
  isBusy: boolean;
  menuOpen: boolean;
  onOpen: (project: LocalProjectSummary) => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onRename: (project: LocalProjectSummary, name: string) => Promise<void>;
  onDuplicate: (project: LocalProjectSummary) => Promise<void>;
  onExport: (project: LocalProjectSummary) => Promise<void>;
  onDelete: (project: LocalProjectSummary) => Promise<void>;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = `project-card-menu-${project.filePath}`;

  useEffect(() => {
    if (!menuOpen) { setConfirmingDelete(false); return; }
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onCloseMenu();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onCloseMenu();
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen, onCloseMenu]);

  // Mede se o menu cabe abaixo do gatilho antes de pintar a tela (evita
  // corte pela borda inferior da viewport) e leva o foco ao primeiro item —
  // roda de novo a cada abertura porque a posição/altura pode mudar
  // conforme a rolagem da página.
  useLayoutEffect(() => {
    if (!menuOpen) { setOpenUpward(false); return; }
    const list = listRef.current;
    if (!list) return;
    setOpenUpward(list.getBoundingClientRect().bottom > window.innerHeight);
    list.querySelector<HTMLButtonElement>('button')?.focus();
  }, [menuOpen]);

  const commitRename = async () => {
    const trimmed = renameValue.trim();
    setIsRenaming(false);
    if (!trimmed || trimmed === project.name) { setRenameValue(project.name); return; }
    setBusy(true);
    try { await onRename(project, trimmed); } finally { setBusy(false); }
  };

  const runMenuAction = async (action: () => Promise<void>) => {
    onCloseMenu();
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  };

  const handleDeleteClick = async () => {
    if (!confirmingDelete) { setConfirmingDelete(true); return; }
    setConfirmingDelete(false);
    await runMenuAction(() => onDelete(project));
  };

  const dateLabel = formatProjectUpdatedAt(project.updatedAt);

  return (
    <article className="project-card-wrap">
      {isRenaming ? (
        <div className="project-card-surface project-card-surface--renaming">
          <ProjectThumbnail colours={project.thumbnailColours} />
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
            <small>{dateLabel}</small>
        </div>
      ) : (
        <button type="button" className="project-card-surface" onClick={() => onOpen(project)} disabled={isBusy || busy}>
          <ProjectThumbnail colours={project.thumbnailColours} />
          <strong>{project.name}</strong>
          <ProjectBoardBadge board={project.targetBoard} />
          <small>{dateLabel}</small>
        </button>
      )}

      <div className="project-card-menu" ref={menuRef}>
        <button
          type="button"
          ref={triggerRef}
          className="project-card-menu-trigger"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={`Mais ações para ${project.name}`}
          onClick={onToggleMenu}
          disabled={isBusy || busy}
        >
          <MoreVertical aria-hidden="true" />
        </button>
        {menuOpen && (
          <div
            id={menuId}
            className={`project-card-menu-list${openUpward ? ' project-card-menu-list--up' : ''}`}
            role="menu"
            ref={listRef}
          >
            <button type="button" role="menuitem" onClick={() => { onCloseMenu(); onOpen(project); }}>
              Abrir
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { onCloseMenu(); setRenameValue(project.name); setIsRenaming(true); }}
            >
              Renomear
            </button>
            <button type="button" role="menuitem" onClick={() => void runMenuAction(() => onDuplicate(project))}>
              Duplicar
            </button>
            <button type="button" role="menuitem" onClick={() => void runMenuAction(() => onExport(project))}>
              Exportar JSON
            </button>
            <button type="button" role="menuitem" className="project-card-menu-danger" onClick={() => void handleDeleteClick()}>
              {confirmingDelete ? `Excluir "${project.name}"?` : 'Excluir'}
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
  const [openMenuFilePath, setOpenMenuFilePath] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshProjects = async () => {
    const { projects: found, corruptedCount: corrupted } = await listLocalProjects();
    setProjects(found);
    setCorruptedCount(corrupted);
  };

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    refreshProjects()
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
    setOpenMenuFilePath(null);
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
      // renameLocalProject também atualiza updatedAt (writeLocalProject
      // sempre carimba a gravação), então recarregar reflete a data nova.
      await refreshProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível renomear o projeto.');
    }
  };

  const handleDuplicateProject = async (project: LocalProjectSummary) => {
    try {
      await duplicateLocalProject(project.filePath);
      await refreshProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível duplicar o projeto.');
    }
  };

  const handleExportProject = async (project: LocalProjectSummary) => {
    try {
      const file = await readLocalProject(project.filePath);
      await exportLocalProjectFile(JSON.stringify(file, null, 2), projectFileSlug(file.project.name));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível exportar o projeto.');
    }
  };

  const handleDeleteProject = async (project: LocalProjectSummary) => {
    try {
      await deleteLocalProject(project.filePath);
      await refreshProjects();
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
                  menuOpen={openMenuFilePath === project.filePath}
                  onOpen={(item) => void openProjectCard(item)}
                  onToggleMenu={() => setOpenMenuFilePath((current) => (current === project.filePath ? null : project.filePath))}
                  onCloseMenu={() => setOpenMenuFilePath((current) => (current === project.filePath ? null : current))}
                  onRename={handleRenameProject}
                  onDuplicate={handleDuplicateProject}
                  onExport={handleExportProject}
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
              <span className="welcome-secondary-card-visual" style={{ backgroundImage: `url(${abrirJsonBanner})` }}>
                <span className="welcome-secondary-card-icon"><FolderOpen aria-hidden="true" /></span>
              </span>
              <strong className="welcome-secondary-card-title">Abrir arquivo JSON</strong>
            </button>
            <button type="button" className="welcome-secondary-card welcome-secondary-card--library" onClick={onOpenLibrary}>
              <span className="welcome-secondary-card-visual" style={{ backgroundImage: `url(${bibliotecaBanner})` }}>
                <span className="welcome-secondary-card-icon"><BookOpen aria-hidden="true" /></span>
              </span>
              <strong className="welcome-secondary-card-title">Biblioteca</strong>
            </button>
            <button type="button" className="welcome-secondary-card welcome-secondary-card--components" onClick={onOpenComponents}>
              <span className="welcome-secondary-card-visual" style={{ backgroundImage: `url(${componentesBanner})` }}>
                <span className="welcome-secondary-card-icon"><Cpu aria-hidden="true" /></span>
              </span>
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
