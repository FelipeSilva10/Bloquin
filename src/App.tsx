// src/App.tsx
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
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
import { VisitorDashboard } from './screens/VisitorDashboard';
import { SetupProvider, useSetup } from './state/setupStore';
import { MAX_OPEN_TABS, TabsProvider, useTabs } from './state/tabsStore';
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
import './App.css';

const IdeScreen = lazy(() => import('./screens/IdeScreen').then(({ IdeScreen: screen }) => ({ default: screen })));

export type UserRole = 'guest' | 'student' | 'teacher' | 'visitor';

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
  // A entrada padrão deve passar pela tela de login; visitante é uma escolha explícita.
  const [role, setRole]     = useState<UserRole>('guest');
  const [userId, setUserId] = useState<string | null>(null);
  const logoutInProgressRef = useRef(false);
  const logoutCleanupRef = useRef<Promise<void>>(Promise.resolve());
  const navigate = useNavigate();
  const { openProject, activateTab, resetTabs } = useTabs();

  const handleLogin = (loggedRole: 'student' | 'teacher' | 'visitor', loggedUserId?: string) => {
    logoutInProgressRef.current = false;
    resetTabs();
    setRole(loggedRole);
    if (loggedRole === 'visitor') {
      // O modo visitante é uma sessão local/offline e nunca deve herdar uma
      // autenticação persistida nem os limites aplicados a contas online.
      setUserId(null);
      // A função limpa o storage de forma síncrona antes de qualquer await,
      // portanto a entrada também funciona sem acesso ao Supabase.
      void signOutLocalSafely();
      navigate('/dashboard');
      return;
    }
    // O LoginScreen já recebeu o id da sessão criada. Reutilizá-lo evita uma
    // chamada redundante a /auth/v1/user durante cada login.
    setUserId(loggedUserId ?? null);
    navigate('/dashboard');
  };

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

  const handleBackToDashboard = () => {
    activateTab('dashboard');
    navigate('/dashboard');
  };

  const openIde = (projectId: string | undefined, viewOnly: boolean) => {
    const id = openProject({
      projectId,
      source: projectId ? 'remote' : 'memory',
      title: projectId ? 'Projeto' : 'Novo projeto',
      readOnly: viewOnly,
    });
    if (!id) {
      window.alert(`Você atingiu o limite de ${MAX_OPEN_TABS} abas abertas. Feche uma aba para continuar.`);
      return;
    }
    navigate('/ide', { state: { readOnly: viewOnly } });
  };

  return (
    // O guard só está ativo quando há um userId (usuário logado)
    <InactivityGuard
      userId={role === 'student' || role === 'teacher' ? userId : null}
      onLogout={handleLogout}
    >
      <WorkspaceTabs role={role} />
      <Routes>
        <Route
          path="/"
          element={
            role === 'guest'
              ? (
                <LoginScreen
                  onLogin={handleLogin}
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
              />
            ) : role === 'student' ? (
              <StudentDashboard
                userId={userId ?? ''}
                onLogout={handleLogout}
                onOpenIde={(id) => openIde(id, false)}
              />
            ) : role === 'visitor' ? (
              <VisitorDashboard
                onExitVisitor={handleLogout}
                onOpenProject={() => navigate('/ide')}
              />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        <Route
          path="/ide/:projectId?"
          element={
              role !== 'guest'
              ? <IdeScreenWrapper role={role} userId={userId ?? undefined} onBack={handleBackToDashboard} />
              : <Navigate to="/" replace />
          }
        />
      </Routes>
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

function IdeScreenWrapper({
  role,
  userId,
  onBack,
}: {
  role: Exclude<UserRole, 'guest'>;
  userId?: string;
  onBack: () => void;
}) {
  const { projectId } = useParams();
  const location = useLocation();
  const { activeTab } = useTabs();
  const readOnly = activeTab.readOnly ?? location.state?.readOnly ?? false;
  const currentProjectId = activeTab.projectId ?? projectId;
  if (activeTab.type === 'dashboard') return <Navigate to="/dashboard" replace />;
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

function WorkspaceTabs({ role }: { role: UserRole }) {
  const navigate = useNavigate();
  const { tabs, activeTabId, activateTab, closeTab } = useTabs();
  const [pendingClose, setPendingClose] = useState<{ id: string; title: string } | null>(null);

  if (role === 'guest') return null;

  const handleActivate = (id: string) => {
    activateTab(id);
    navigate(id === 'dashboard' ? '/dashboard' : '/ide');
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
    const index = tabs.findIndex((tab) => tab.id === id);
    const fallbackId = tabs[Math.max(0, index - 1)]?.id ?? 'dashboard';
    closeTab(id);
    if (wasActive) navigate(fallbackId === 'dashboard' ? '/dashboard' : '/ide');
  };

  return (
    <nav className="tab-bar" aria-label="Projetos abertos">
      {tabs.map((tab) => (
        <div className={`tab-item ${tab.id === activeTabId ? 'active' : ''}`} key={tab.id}>
          <button type="button" className="tab-select" onClick={() => handleActivate(tab.id)}>
            {tab.id === 'dashboard' ? '⌂ ' : tab.source === 'memory' ? '👤 ' : ''}
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

function AppContent() {
  const [splashVisible, setSplashVisible] = useState(true);
  const [installedVersion, setInstalledVersion] = useState(APP_BUILD_VERSION);
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateInfo | null>(null);

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
      void checkForUpdate().then((update) => {
        if (!disposed && update) setAvailableUpdate(update);
      });
    }

    return () => { disposed = true; };
  }, []);

  const handleUpdate = () => {
    void openOfficialSite().catch(() => {
      // Opening the external browser is best effort and must not interrupt the
      // user's current session if the operating system rejects the request.
    });
    setAvailableUpdate(null);
  };

  return (
    <>
      <Router>
        <SetupBanner />
        <AppRoutes installedVersion={installedVersion} />
      </Router>

      {!splashVisible && availableUpdate && (
        <UpdateNotice
          update={availableUpdate}
          onClose={() => setAvailableUpdate(null)}
          onUpdate={handleUpdate}
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
