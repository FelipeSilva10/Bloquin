// src/App.tsx
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
  useLocation,
} from 'react-router-dom';
import { useInactivity } from './hooks/useInactivity';
import { LoginScreen }      from './screens/LoginScreen';
import { TeacherDashboard } from './screens/TeacherDashboard';
import { StudentDashboard } from './screens/StudentDashboard';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { LibraryResourceScreen } from './screens/LibraryResourceScreen';
import { PublicLibraryScreen } from './screens/PublicLibraryScreen';
import { ComponentsScreen } from './screens/ComponentsScreen';
import { DocumentationScreen } from './screens/DocumentationScreen';
import { SagScreen } from './screens/SagScreen';
import { SetupProvider, useSetup } from './state/setupStore';
import { MAX_OPEN_TABS, TabsProvider, useTabs, type ProjectTab } from './state/tabsStore';
import {
  clearSession,
  signOutLocalSafely,
  stopWatchingSession,
  watchSession,
} from './services/sessionService';
import { getFriendlyError } from './components/modals/ErrorModal';
import { useModalA11y } from './hooks/useModalA11y';
import { SplashScreen } from './components/SplashScreen';
import {
  APP_BUILD_VERSION,
  checkForUpdate,
  getInstalledVersion,
  openOfficialSite,
  type AppUpdateInfo,
} from './services/appVersionService';
import {
  checkForNativeUpdate,
  isStorePackage,
  type DownloadEvent,
  type Update,
} from './services/appUpdaterService';
import { isTauriRuntime } from './services/localProjectService';
import './App.css';

const IdeScreen = lazy(() => import('./screens/IdeScreen').then(({ IdeScreen: screen }) => ({ default: screen })));

export type UserRole = 'guest' | 'student' | 'teacher';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos do setup
// ─────────────────────────────────────────────────────────────────────────────
function SetupBanner() {
  const setup = useSetup();
  if (setup.status === 'ready') return null;
  const message = setup.status === 'error' ? getFriendlyError(setup.message).message : setup.message;
  return <div role={setup.status === 'error' ? 'alert' : 'status'} aria-live="polite" style={{ position: 'fixed', bottom: 12, left: 12, right: 12, zIndex: 99999, background: 'var(--dark)', color: 'white', padding: '10px 16px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
    <span>{setup.status === 'error' ? '⚠️' : '🔧'}</span>
    <span style={{ flex: 1 }}>{message}</span>
    {setup.status !== 'error' && <small>{setup.percent}%</small>}
    {setup.status === 'error' && <button className="btn-primary" onClick={setup.retry}>Tentar novamente</button>}
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// InactivityGuard — exibe o aviso "Você ainda está aí?" e faz logout automático
// ─────────────────────────────────────────────────────────────────────────────
function InactivityGuard({
  userId,
  onLogout,
  children,
}: {
  userId: string | null;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const { showWarning, countdown, resetTimer, forceLogout } = useInactivity({
    userId,
    onLogout,
  });

  return (
    <>
      {children}

      {showWarning && (
        <div className="modal-overlay" style={{ zIndex: 999999 }}>
          <div style={{
            background: 'var(--white)',
            borderRadius: '28px',
            padding: '44px 40px',
            maxWidth: '400px',
            width: '90%',
            textAlign: 'center',
            boxShadow: 'var(--shadow-xl)',
            animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            borderTop: '6px solid var(--warning)',
          }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '16px' }}>😴</div>

            <h2 style={{ color: 'var(--dark)', fontWeight: 900, marginBottom: '12px', fontSize: '1.6rem' }}>
              Você ainda está aí?
            </h2>

            <p style={{ color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px' }}>
              Sua sessão ficou inativa por alguns minutos.
            </p>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '28px' }}>
              Saindo automaticamente em{' '}
              <strong style={{ color: 'var(--danger)', fontSize: '1.15rem' }}>
                {countdown}s
              </strong>
            </p>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn-danger"
                style={{ flex: 1, padding: '14px' }}
                onClick={forceLogout}
              >
                Sair agora
              </button>
              <button
                className="btn-primary"
                style={{ flex: 1, padding: '14px' }}
                onClick={resetTimer}
              >
                Continuar →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rotas do app
// ─────────────────────────────────────────────────────────────────────────────
function AppRoutes({ installedVersion }: { installedVersion: string }) {
  // guest é o estado padrão e permanente de quem não fez login escolar — não
  // um placeholder transitório. A tela local (WelcomeScreen) já é totalmente
  // funcional nesse estado.
  const [role, setRole]     = useState<UserRole>('guest');
  const [userId, setUserId] = useState<string | null>(null);
  const [lastLibraryResourceTabId, setLastLibraryResourceTabId] = useState<string | null>(null);
  const logoutInProgressRef = useRef(false);
  const logoutCleanupRef = useRef<Promise<void>>(Promise.resolve());
  const navigate = useNavigate();
  const location = useLocation();
  const { tabs, activeTab, openInternalPage, openLibrary, openProject, activateTab, updateTab, resetTabs } = useTabs();
  const libraryTabIsOpen = tabs.some((tab) => tab.type === 'library');
  const componentsTabIsOpen = tabs.some((tab) => tab.type === 'components');
  const sagTabIsOpen = tabs.some((tab) => tab.type === 'sag');
  const documentationTabIsOpen = tabs.some((tab) => tab.type === 'documentation');
  const keptLibraryResourceTabId = activeTab.type === 'library-resource' ? activeTab.id : lastLibraryResourceTabId;
  const requestedWorkspaceTabId = getRequestedWorkspaceTabId(location.state);

  const handleLogin = (loggedRole: 'student' | 'teacher', loggedUserId?: string) => {
    logoutInProgressRef.current = false;
    resetTabs();
    setRole(loggedRole);
    // O LoginScreen já recebeu o id da sessão criada. Reutilizá-lo evita uma
    // chamada redundante a /auth/v1/user durante cada login.
    setUserId(loggedUserId ?? null);
    navigate('/dashboard');
  };

  // O estado local (guest) nunca herda autenticação anterior. Rodar essa
  // limpeza uma vez no boot — em vez de só ao clicar em "visitante", como
  // antes — garante que ela já esteja resolvida se o usuário for para
  // /login logo em seguida (beforeLogin aguarda essa promise).
  useEffect(() => {
    logoutCleanupRef.current = signOutLocalSafely();
  }, []);

  const handleLogout = () => {
    if (logoutInProgressRef.current) return;
    logoutInProgressRef.current = true;
    const currentUserId = userId;
    resetTabs();
    setRole('guest');
    setUserId(null);
    navigate('/');
    logoutCleanupRef.current = (async () => {
      try {
        if (currentUserId) await clearSession(currentUserId);
      } catch {
        // O logout local deve concluir mesmo se o registro remoto estiver
        // temporariamente inacessível.
      } finally {
        await signOutLocalSafely();
      }
    })();
  };

  useEffect(() => {
    if (!userId || (role !== 'student' && role !== 'teacher')) return;
    watchSession(userId, handleLogout);
    return stopWatchingSession;
  }, [role, userId]);

  useEffect(() => {
    if (activeTab.type === 'library-resource') {
      setLastLibraryResourceTabId(activeTab.id);
    } else if (lastLibraryResourceTabId && !tabs.some((tab) => tab.id === lastLibraryResourceTabId)) {
      setLastLibraryResourceTabId(null);
    }
  }, [activeTab, lastLibraryResourceTabId, tabs]);

  useEffect(() => {
    const requestedTab = requestedWorkspaceTabId
      ? tabs.find((tab) => tab.id === requestedWorkspaceTabId)
      : undefined;
    if (
      requestedTab
      && requestedTab.id !== activeTab.id
      && workspacePathMatchesTab(location.pathname, requestedTab)
    ) {
      activateTab(requestedTab.id);
      return;
    }

    if (location.pathname === '/biblioteca' && (role === 'teacher' || role === 'student' || role === 'guest')) {
      const libraryId = openLibrary();
      if (!libraryId) {
        activateTab('dashboard');
        navigate('/dashboard', { replace: true, state: { workspaceTabId: 'dashboard' } });
      }
      return;
    }

    const requestedInternalPage = location.pathname === '/componentes'
      ? 'components'
      : location.pathname === '/sag'
        ? 'sag'
        : location.pathname === '/documentacao'
          ? 'documentation'
          : null;
    const canOpenRequestedPage = requestedInternalPage === 'components' || requestedInternalPage === 'documentation'
      ? role === 'teacher' || role === 'student' || role === 'guest'
      : requestedInternalPage === 'sag'
        ? role === 'teacher'
        : false;
    if (requestedInternalPage && canOpenRequestedPage) {
      const pageId = openInternalPage(requestedInternalPage);
      if (!pageId) {
        activateTab('dashboard');
        navigate('/dashboard', { replace: true, state: { workspaceTabId: 'dashboard' } });
      }
      return;
    }

    if (location.pathname === '/biblioteca/leitura' && (role === 'teacher' || role === 'student')) {
      // Uma entrada antiga do histórico pode apontar para uma mídia cuja aba
      // já foi fechada. Nesse caso, voltar ao mural é mais previsível do que
      // abrir silenciosamente outro material ainda existente.
      if (requestedWorkspaceTabId && !requestedTab) {
        const libraryId = openLibrary();
        if (libraryId) {
          navigate('/biblioteca', { replace: true, state: { workspaceTabId: libraryId } });
        } else {
          activateTab('dashboard');
          navigate('/dashboard', { replace: true, state: { workspaceTabId: 'dashboard' } });
        }
        return;
      }

      if (activeTab.type === 'library-resource') return;
      const fallbackResource = [...tabs].reverse().find((tab) => tab.type === 'library-resource');
      if (fallbackResource) {
        activateTab(fallbackResource.id);
        return;
      }

      const libraryId = openLibrary();
      if (libraryId) {
        navigate('/biblioteca', { replace: true, state: { workspaceTabId: libraryId } });
      } else {
        activateTab('dashboard');
        navigate('/dashboard', { replace: true, state: { workspaceTabId: 'dashboard' } });
      }
      return;
    }

    if (location.pathname.startsWith('/ide')) {
      if (requestedWorkspaceTabId && !requestedTab) {
        activateTab('dashboard');
        navigate('/dashboard', { replace: true, state: { workspaceTabId: 'dashboard' } });
        return;
      }

      if (activeTab.type === 'project') return;
      const projectIdFromPath = location.pathname.split('/')[2];
      const fallbackProject = projectIdFromPath
        ? tabs.find((tab) => tab.type === 'project' && tab.projectId === projectIdFromPath)
        : [...tabs].reverse().find((tab) => tab.type === 'project');
      if (fallbackProject) {
        activateTab(fallbackProject.id);
      } else {
        activateTab('dashboard');
        navigate('/dashboard', { replace: true, state: { workspaceTabId: 'dashboard' } });
      }
      return;
    }

    if (location.pathname === '/dashboard') activateTab('dashboard');
  }, [activeTab.id, activeTab.type, activateTab, location.pathname, navigate, openInternalPage, openLibrary, requestedWorkspaceTabId, role, tabs]);

  const handleBackToDashboard = () => {
    activateTab('dashboard');
    navigate('/dashboard', { state: { workspaceTabId: 'dashboard' } });
  };

  const handleOpenLibrary = () => {
    if (!openLibrary()) {
      window.alert(`Você atingiu o limite de ${MAX_OPEN_TABS} abas abertas. Feche uma aba para continuar.`);
      return;
    }
    navigate('/biblioteca', { state: { workspaceTabId: 'library' } });
  };

  const handleOpenComponents = () => {
    const id = openInternalPage('components');
    if (!id) {
      window.alert(`Você atingiu o limite de ${MAX_OPEN_TABS} abas abertas. Feche uma aba para continuar.`);
      return;
    }
    navigate('/componentes', { state: { workspaceTabId: id } });
  };

  const handleOpenSag = () => {
    const id = openInternalPage('sag');
    if (!id) {
      window.alert(`Você atingiu o limite de ${MAX_OPEN_TABS} abas abertas. Feche uma aba para continuar.`);
      return;
    }
    navigate('/sag', { state: { workspaceTabId: id } });
  };

  const handleOpenBlockDocumentation = (blockType: string) => {
    const id = openInternalPage('documentation');
    if (!id) {
      window.alert(`Você atingiu o limite de ${MAX_OPEN_TABS} abas abertas. Feche uma aba para continuar.`);
      return;
    }
    updateTab(id, { focusBlockType: blockType });
    navigate('/documentacao', { state: { workspaceTabId: id } });
  };

  const openIde = (projectId: string, viewOnly: boolean) => {
    const id = openProject({
      projectId,
      source: 'remote',
      title: 'Projeto',
      readOnly: viewOnly,
    });
    if (!id) {
      window.alert(`Você atingiu o limite de ${MAX_OPEN_TABS} abas abertas. Feche uma aba para continuar.`);
      return;
    }
    navigate('/ide', { state: { readOnly: viewOnly, workspaceTabId: id } });
  };

  return (
    // O guard só está ativo quando há um userId (usuário logado)
    <InactivityGuard
      userId={role === 'student' || role === 'teacher' ? userId : null}
      onLogout={handleLogout}
    >
      <div className="workspace-shell">
        <WorkspaceTabs />
        <div className={`workspace-viewport${location.pathname.startsWith('/ide') ? ' workspace-viewport--ide' : ''}${location.pathname === '/sag' ? ' workspace-viewport--sag' : ''}${location.pathname === '/login' ? ' workspace-viewport--entry' : ''}`}>
          {(role === 'teacher' || role === 'student') && libraryTabIsOpen && (
            <div className="workspace-keepalive" hidden={location.pathname !== '/biblioteca'}>
              <LibraryScreen userId={userId ?? ''} mode={role} />
            </div>
          )}
          {role === 'guest' && libraryTabIsOpen && (
            <div className="workspace-keepalive" hidden={location.pathname !== '/biblioteca'}>
              <PublicLibraryScreen />
            </div>
          )}
          {(role === 'teacher' || role === 'student') && keptLibraryResourceTabId && tabs.some((tab) => tab.id === keptLibraryResourceTabId) && (
            <div className="workspace-keepalive" hidden={location.pathname !== '/biblioteca/leitura'}>
              <LibraryResourceScreen key={keptLibraryResourceTabId} tabId={keptLibraryResourceTabId} mode={role as 'teacher' | 'student'} />
            </div>
          )}
          {(role === 'teacher' || role === 'student' || role === 'guest') && componentsTabIsOpen && (
            <div className="workspace-keepalive" hidden={location.pathname !== '/componentes'}>
              <ComponentsScreen onOpenBlocklyBlock={(block) => handleOpenBlockDocumentation(block.blockType)} />
            </div>
          )}
          {(role === 'teacher' || role === 'student' || role === 'guest') && documentationTabIsOpen && (
            <div className="workspace-keepalive" hidden={location.pathname !== '/documentacao'}>
              <DocumentationScreen focusBlockType={tabs.find((tab) => tab.type === 'documentation')?.focusBlockType} />
            </div>
          )}
          {role === 'teacher' && sagTabIsOpen && (
            <div className="workspace-keepalive" hidden={location.pathname !== '/sag'}>
              <SagScreen active={location.pathname === '/sag'} />
            </div>
          )}
          <Routes>
        <Route
          path="/"
          element={
            role === 'guest'
              ? (
                <WelcomeScreen
                  onLoginEscolar={() => navigate('/login')}
                  onOpenProject={(tabId) => {
                    activateTab(tabId);
                    navigate('/ide', { state: { readOnly: false, workspaceTabId: tabId } });
                  }}
                  onOpenComponents={handleOpenComponents}
                  onOpenLibrary={handleOpenLibrary}
                  version={installedVersion}
                />
              )
              : <Navigate to="/dashboard" replace />
          }
        />

        <Route
          path="/login"
          element={
            role === 'guest'
              ? (
                <LoginScreen
                  onLogin={handleLogin}
                  onBack={() => navigate('/', { replace: true })}
                  beforeLogin={() => logoutCleanupRef.current}
                  version={installedVersion}
                />
              )
              : <Navigate to="/dashboard" replace />
          }
        />

        <Route
          path="/dashboard"
          element={
            role === 'teacher' ? (
              <TeacherDashboard
                userId={userId ?? ''}
                onLogout={handleLogout}
                onOpenOwnProject={(id) => openIde(id, false)}
                onInspectStudentProject={(id) => openIde(id, true)}
                onOpenLibrary={handleOpenLibrary}
                onOpenComponents={handleOpenComponents}
                onOpenSag={handleOpenSag}
              />
            ) : role === 'student' ? (
              <StudentDashboard
                userId={userId ?? ''}
                onLogout={handleLogout}
                onOpenIde={(id) => openIde(id, false)}
                onOpenLibrary={handleOpenLibrary}
                onOpenComponents={handleOpenComponents}
              />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        <Route
          path="/biblioteca"
          element={
            role === 'teacher' || role === 'student' || role === 'guest'
              ? null
              : <Navigate to="/dashboard" replace />
          }
        />

        <Route
          path="/biblioteca/leitura"
          element={
            role === 'teacher' || role === 'student'
              ? null
              : <Navigate to="/dashboard" replace />
          }
        />

        <Route
          path="/componentes"
          element={
            role === 'teacher' || role === 'student' || role === 'guest'
              ? null
              : <Navigate to="/dashboard" replace />
          }
        />

        <Route
          path="/sag"
          element={
            role === 'teacher'
              ? null
              : <Navigate to="/dashboard" replace />
          }
        />

        <Route
          path="/documentacao"
          element={
            role === 'teacher' || role === 'student' || role === 'guest'
              ? null
              : <Navigate to="/dashboard" replace />
          }
        />

        <Route
          path="/ide/:projectId?"
          element={
            <IdeScreenWrapper role={role} userId={userId ?? undefined} onBack={handleBackToDashboard} />
          }
        />
          </Routes>
        </div>
      </div>
    </InactivityGuard>
  );
}

function UpdateNotice({ update, onClose, onUpdate }: {
  update: AppUpdateInfo;
  onClose: () => void;
  onUpdate: () => void;
}) {
  return (
    <aside className="update-notice" role="status" aria-live="polite" aria-label="Atualização disponível">
      <button type="button" className="update-notice-close" onClick={onClose} aria-label="Fechar aviso de atualização">
        ×
      </button>
      <strong>Nova versão do Bloquin disponível</strong>
      <span>Instalada: v{update.installedVersion} · Nova: v{update.latestVersion}</span>
      <div className="update-notice-actions">
        <button type="button" className="btn-primary" onClick={onUpdate}>Atualizar</button>
        <button type="button" className="btn-text" onClick={onClose}>Depois</button>
      </div>
    </aside>
  );
}

function NativeUpdateNotice({ state, onDownload, onDismiss, onRestart }: {
  state: NativeUpdateState;
  onDownload: () => void;
  onDismiss: () => void;
  onRestart: () => void;
}) {
  const version = state.stage === 'error' ? null : state.update.version;

  return (
    <aside className="update-notice" role="status" aria-live="polite" aria-label="Atualização disponível">
      {state.stage !== 'downloading' && (
        <button type="button" className="update-notice-close" onClick={onDismiss} aria-label="Fechar aviso de atualização">
          ×
        </button>
      )}

      {state.stage === 'available' && (
        <>
          <strong>Nova atualização disponível</strong>
          <span>Bloquin v{version} — esta atualização contém correções e melhorias.</span>
          <div className="update-notice-actions">
            <button type="button" className="btn-primary" onClick={onDownload}>Atualizar agora</button>
            <button type="button" className="btn-text" onClick={onDismiss}>Depois</button>
          </div>
        </>
      )}

      {state.stage === 'downloading' && (
        <>
          <strong>Baixando atualização…</strong>
          <span>Bloquin v{version}</span>
          <div className="update-notice-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.progress ?? undefined}>
            <div
              className={`update-notice-progress-fill${state.progress === null ? ' update-notice-progress-indeterminate' : ''}`}
              style={state.progress !== null ? { width: `${state.progress}%` } : undefined}
            />
          </div>
        </>
      )}

      {state.stage === 'ready' && (
        <>
          <strong>Atualização pronta</strong>
          <span>O Bloquin precisa reiniciar para concluir a atualização para v{version}.</span>
          <div className="update-notice-actions">
            <button type="button" className="btn-primary" onClick={onRestart}>Reiniciar agora</button>
            <button type="button" className="btn-text" onClick={onDismiss}>Mais tarde</button>
          </div>
        </>
      )}

      {state.stage === 'error' && (
        <>
          <strong>Não foi possível atualizar</strong>
          <span>{state.message}</span>
          <div className="update-notice-actions">
            <button type="button" className="btn-text" onClick={onDismiss}>Fechar</button>
          </div>
        </>
      )}
    </aside>
  );
}

function IdeScreenWrapper({
  role,
  userId,
  onBack,
}: {
  role: UserRole;
  userId?: string;
  onBack: () => void;
}) {
  const { projectId } = useParams();
  const location = useLocation();
  const { activeTab } = useTabs();
  const readOnly = activeTab.readOnly ?? location.state?.readOnly ?? false;
  const currentProjectId = activeTab.projectId ?? projectId;
  if (activeTab.type !== 'project') {
    return <div className="screen-loading" role="status" aria-live="polite">Restaurando aba…</div>;
  }
  return (
    <Suspense fallback={<div className="screen-loading" role="status" aria-live="polite">Carregando editor…</div>}>
      <IdeScreen
        key={activeTab.id}
        role={role}
        userId={userId}
        readOnly={readOnly}
        onBack={onBack}
        projectId={currentProjectId}
        initialWorkspaceData={activeTab.workspaceData}
        initialBoard={activeTab.board ?? null}
      />
    </Suspense>
  );
}

function WorkspaceTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tabs, activeTabId, activateTab, closeTab } = useTabs();
  const [pendingClose, setPendingClose] = useState<{ id: string; title: string } | null>(null);
  // Fechar a aba ativa mexe em dois estados que não commitam no mesmo
  // ciclo de render: o TabsProvider (fonte da lista de abas) e o router
  // (fonte de location). Se closeTab() rodasse imediatamente, a aba
  // sumiria da lista num render em que location ainda aponta pra rota
  // dela — e o efeito de reconciliação de rotas em AppRoutes, vendo essa
  // URL "órfã", reabre a aba (como se fosse um link direto). Guardar o id
  // aqui e só chamar closeTab() depois que location.key mudar garante que
  // a navegação para a aba de fallback já se refletiu antes de remover a
  // aba — sem essa janela, sem precisar de um segundo clique.
  const deferredCloseIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const pendingId = deferredCloseIdRef.current;
    if (!pendingId) return;
    deferredCloseIdRef.current = null;
    closeTab(pendingId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  if (location.pathname === '/login') return null;

  const handleActivate = (id: string) => {
    activateTab(id);
    const tab = tabs.find((item) => item.id === id);
    navigate(getWorkspaceTabPath(tab), { state: getWorkspaceTabState(tab) });
  };

  const handleClose = (id: string, dirty: boolean) => {
    if (dirty) {
      const tab = tabs.find((item) => item.id === id);
      setPendingClose(tab ? { id, title: tab.title } : null);
      return;
    }
    closeTabAndNavigate(id);
  };

  const closeTabAndNavigate = (id: string) => {
    const wasActive = id === activeTabId;
    if (!wasActive) {
      // Fechar uma aba que não está ativa não move a navegação atual —
      // fecha na hora, sem depender do efeito acima.
      closeTab(id);
      return;
    }
    const index = tabs.findIndex((tab) => tab.id === id);
    const fallbackId = tabs[Math.max(0, index - 1)]?.id ?? 'dashboard';
    const fallbackTab = tabs.find((tab) => tab.id === fallbackId);
    deferredCloseIdRef.current = id;
    navigate(getWorkspaceTabPath(fallbackTab), { state: getWorkspaceTabState(fallbackTab) });
  };

  return (
    <nav className="tab-bar" aria-label="Abas abertas">
      {tabs.map((tab) => (
        <div className={`tab-item ${tab.id === activeTabId ? 'active' : ''}`} key={tab.id}>
          <button type="button" className="tab-select" onClick={() => handleActivate(tab.id)} title={tab.title} aria-current={tab.id === activeTabId ? 'page' : undefined}>
            {tab.type === 'dashboard'
              ? '⌂ '
              : tab.type === 'library'
                ? '▦ '
                : tab.type === 'components'
                  ? '◈ '
                  : tab.type === 'sag'
                    ? '▤ '
                    : tab.type === 'documentation'
                      ? '❖ '
                      : tab.type === 'library-resource'
                      ? `${tab.libraryResourceKind === 'pdf' ? 'PDF' : tab.libraryResourceKind === 'image' ? '▧' : '✦'} `
                      : tab.source === 'memory' ? '👤 ' : ''}
            {tab.dirty ? '● ' : ''}{tab.title}
          </button>
          {tab.id !== 'dashboard' && (
            <button type="button" className="tab-close" aria-label={`Fechar ${tab.title}`} onClick={() => handleClose(tab.id, tab.dirty)}>×</button>
          )}
        </div>
      ))}
      {pendingClose && (
        <UnsavedTabDialog
          title={pendingClose.title}
          onCancel={() => setPendingClose(null)}
          onConfirm={() => { const id = pendingClose.id; setPendingClose(null); closeTabAndNavigate(id); }}
        />
      )}
    </nav>
  );
}

function getWorkspaceTabPath(tab?: ProjectTab): string {
  if (tab?.type === 'library') return '/biblioteca';
  if (tab?.type === 'library-resource') return '/biblioteca/leitura';
  if (tab?.type === 'components') return '/componentes';
  if (tab?.type === 'sag') return '/sag';
  if (tab?.type === 'documentation') return '/documentacao';
  if (tab?.type === 'dashboard' || !tab) return '/dashboard';
  return '/ide';
}

function getWorkspaceTabState(tab?: ProjectTab): { workspaceTabId: string; readOnly?: boolean } | undefined {
  if (!tab) return undefined;
  return {
    workspaceTabId: tab.id,
    ...(tab.type === 'project' ? { readOnly: tab.readOnly } : {}),
  };
}

function getRequestedWorkspaceTabId(state: unknown): string | null {
  if (!state || typeof state !== 'object' || !('workspaceTabId' in state)) return null;
  const id = (state as { workspaceTabId?: unknown }).workspaceTabId;
  return typeof id === 'string' ? id : null;
}

function workspacePathMatchesTab(pathname: string, tab: ProjectTab): boolean {
  if (tab.type === 'project') return pathname.startsWith('/ide');
  return getWorkspaceTabPath(tab) === pathname;
}

function UnsavedTabDialog({ title, onCancel, onConfirm }: { title: string; onCancel: () => void; onConfirm: () => void }) {
  const modalRef = useModalA11y<HTMLDivElement>(onCancel);
  return (
    <div className="modal-overlay" role="presentation">
      <div ref={modalRef} className="modal-box unsaved-tab-dialog" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-tab-title">
        <h2 id="unsaved-tab-title">Alterações não salvas</h2>
        <p>“{title}” possui alterações que serão perdidas se a aba for fechada.</p>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>Continuar editando</button>
          <button type="button" className="btn-danger" onClick={onConfirm}>Fechar sem salvar</button>
        </div>
      </div>
    </div>
  );
}

type NativeUpdateState =
  | { stage: 'available'; update: Update }
  | { stage: 'downloading'; update: Update; progress: number | null }
  | { stage: 'ready'; update: Update }
  | { stage: 'error'; message: string };

function AppContent() {
  const [splashVisible, setSplashVisible] = useState(true);
  const [installedVersion, setInstalledVersion] = useState(APP_BUILD_VERSION);
  // Aviso "legado" (aponta pro site oficial): único caminho fora do runtime
  // Tauri, onde o updater nativo não existe (preview de navegador/dev).
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateInfo | null>(null);
  const [nativeUpdate, setNativeUpdate] = useState<NativeUpdateState | null>(null);

  useEffect(() => {
    let disposed = false;
    void getInstalledVersion().then((version) => {
      if (!disposed) setInstalledVersion(version);
    });

    let shouldCheck = true;
    try {
      shouldCheck = !sessionStorage.getItem('bloquin.update-check');
      if (shouldCheck) sessionStorage.setItem('bloquin.update-check', '1');
    } catch {
      // Storage can be unavailable in restricted webviews; the check is still
      // safe to perform once for this mounted application instance.
    }

    if (shouldCheck) {
      void (async () => {
        // A Microsoft Store cuida das próprias atualizações do pacote MSIX —
        // nunca mostrar aviso nem tentar o updater nativo nesse canal.
        if (await isStorePackage()) return;

        const update = await checkForNativeUpdate();
        if (disposed) return;
        if (update) {
          setNativeUpdate({ stage: 'available', update });
          return;
        }

        // Sem updater nativo (fora do Tauri, ex.: preview de navegador):
        // mantém o aviso antigo, que só aponta pro site oficial.
        if (!isTauriRuntime()) {
          void checkForUpdate().then((legacyUpdate) => {
            if (!disposed && legacyUpdate) setAvailableUpdate(legacyUpdate);
          });
        }
      })();
    }

    return () => { disposed = true; };
  }, []);

  const handleLegacyUpdate = () => {
    void openOfficialSite().catch(() => {
      // Opening the external browser is best effort and must not interrupt the
      // user's current session if the operating system rejects the request.
    });
    setAvailableUpdate(null);
  };

  const handleNativeDownload = () => {
    if (!nativeUpdate || nativeUpdate.stage !== 'available') return;
    const { update } = nativeUpdate;
    let contentLength = 0;
    let receivedLength = 0;
    setNativeUpdate({ stage: 'downloading', update, progress: null });

    const onProgress = (event: DownloadEvent) => {
      if (event.event === 'Started') {
        contentLength = event.data.contentLength ?? 0;
        receivedLength = 0;
      } else if (event.event === 'Progress') {
        receivedLength += event.data.chunkLength;
        setNativeUpdate({
          stage: 'downloading',
          update,
          progress: contentLength > 0 ? Math.min(100, Math.round((receivedLength / contentLength) * 100)) : null,
        });
      }
    };

    update.download(onProgress)
      .then(() => setNativeUpdate({ stage: 'ready', update }))
      .catch((error) => setNativeUpdate({
        stage: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível baixar a atualização.',
      }));
  };

  const handleNativeDismiss = () => {
    if (nativeUpdate?.stage === 'available' || nativeUpdate?.stage === 'error') {
      if (nativeUpdate.stage === 'available') void nativeUpdate.update.close().catch(() => {});
      setNativeUpdate(null);
    }
    // Durante o download ou com a atualização pronta, fechar só esconde o
    // aviso — nunca cancela um download em andamento nem descarta uma
    // atualização já baixada; o usuário pode reiniciar depois normalmente.
  };

  const handleNativeRestart = () => {
    if (!nativeUpdate || nativeUpdate.stage !== 'ready') return;
    // No Windows, install() fecha o Bloquin ao lançar o instalador com
    // sucesso — não há relaunch() manual a fazer aqui nesse canal.
    void nativeUpdate.update.install().catch((error) => setNativeUpdate({
      stage: 'error',
      message: error instanceof Error ? error.message : 'Não foi possível instalar a atualização.',
    }));
  };

  return (
    <>
      <Router>
        <SetupBanner />
        <AppRoutes installedVersion={installedVersion} />
      </Router>

      {!splashVisible && nativeUpdate && (
        <NativeUpdateNotice
          state={nativeUpdate}
          onDownload={handleNativeDownload}
          onDismiss={handleNativeDismiss}
          onRestart={handleNativeRestart}
        />
      )}

      {!splashVisible && !nativeUpdate && availableUpdate && (
        <UpdateNotice
          update={availableUpdate}
          onClose={() => setAvailableUpdate(null)}
          onUpdate={handleLegacyUpdate}
        />
      )}

      {splashVisible && (
        <SplashScreen
          // A preparação do Arduino acontece em segundo plano. O usuário
          // pode autenticar e navegar enquanto ela termina; o upload continua
          // protegido pelo estado `setup_done` no backend Rust.
          ready
          onFinished={() => setSplashVisible(false)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Raiz
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <SetupProvider>
      <TabsProvider>
        <AppContent />
      </TabsProvider>
    </SetupProvider>
  );
}
