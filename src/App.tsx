// src/App.tsx
import { useState, useEffect } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
  useLocation,
} from 'react-router-dom';
import { listen }  from '@tauri-apps/api/event';
import { invoke }  from '@tauri-apps/api/core';
import { supabase } from './lib/supabase';
import { useInactivity } from './hooks/useInactivity';
import { LoginScreen }      from './screens/LoginScreen';
import { IdeScreen }        from './screens/IdeScreen';
import { TeacherDashboard } from './screens/TeacherDashboard';
import { StudentDashboard } from './screens/StudentDashboard';
import './App.css';

export type UserRole = 'guest' | 'student' | 'teacher' | 'visitor';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos do setup
// ─────────────────────────────────────────────────────────────────────────────
type SetupStep = 'starting' | 'cli' | 'core' | 'done' | 'error';

interface SetupState {
  step:    SetupStep;
  message: string;
  percent: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tela de setup — bloqueia o app até tudo estar pronto
// ─────────────────────────────────────────────────────────────────────────────
function SetupGate({ children }: { children: React.ReactNode }) {
  const [setup, setSetup] = useState<SetupState>({
    step:    'starting',
    message: 'Iniciando o Bloquin...',
    percent: 0,
  });

  useEffect(() => {
    const unlistenPromise = listen<SetupState>('setup-progress', (event) => {
      setSetup(event.payload);
    });

    invoke('run_setup').catch((err) => {
      setSetup({ step: 'error', message: `Erro inesperado ao iniciar: ${err}`, percent: 0 });
    });

    return () => { unlistenPromise.then((fn) => fn()); };
  }, []);

  if (setup.step === 'done') return <>{children}</>;

  const isError = setup.step === 'error';

  const handleRetry = () => {
    setSetup({ step: 'starting', message: 'Tentando novamente...', percent: 0 });
    invoke('run_setup').catch((err) => {
      setSetup({ step: 'error', message: `Erro: ${err}`, percent: 0 });
    });
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', width: '100vw',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: "'Nunito', 'Segoe UI', sans-serif", color: '#ffffff',
      padding: '32px', boxSizing: 'border-box',
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)',
        borderRadius: '24px', padding: '48px 40px', maxWidth: '420px',
        width: '100%', textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,255,255,0.2)',
      }}>
        <div style={{ fontSize: '56px', marginBottom: '16px', lineHeight: 1 }}>
          {isError ? '⚠️' : setup.percent >= 70 ? '⚙️' : '🔧'}
        </div>

        <h2 style={{ fontSize: '1.6rem', fontWeight: 900, margin: '0 0 8px', letterSpacing: '-0.3px' }}>
          {isError ? 'Algo deu errado...' : 'Preparando o Bloquin'}
        </h2>

        {!isError && (
          <p style={{ fontSize: '0.9rem', opacity: 0.75, margin: '0 0 28px' }}>
            Isso só acontece na primeira vez. Pode demorar alguns minutos.
          </p>
        )}

        {!isError && (
          <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '100px', height: '10px', overflow: 'hidden', margin: '0 0 20px' }}>
            <div style={{
              height: '100%', borderRadius: '100px',
              background: 'linear-gradient(90deg, #ffffff, #a8edea)',
              width: `${setup.percent}%`,
              transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
            }} />
          </div>
        )}

        <p style={{ fontSize: '0.95rem', fontWeight: isError ? 700 : 600, lineHeight: 1.6, opacity: isError ? 1 : 0.9, margin: '0', whiteSpace: 'pre-line', color: isError ? '#ffd6d6' : '#ffffff' }}>
          {setup.message}
        </p>

        {!isError && (
          <p style={{ fontSize: '0.8rem', opacity: 0.55, margin: '12px 0 0' }}>
            {setup.percent}% concluído
          </p>
        )}

        {isError && (
          <button
            onClick={handleRetry}
            style={{ marginTop: '24px', padding: '12px 28px', background: 'rgba(255,255,255,0.2)', border: '2px solid rgba(255,255,255,0.5)', borderRadius: '12px', color: '#ffffff', fontSize: '0.95rem', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            ↺ Tentar novamente
          </button>
        )}
      </div>

      {!isError && (
        <p style={{ fontSize: '0.75rem', opacity: 0.45, marginTop: '24px' }}>
          Não feche o aplicativo durante este processo
        </p>
      )}
    </div>
  );
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
function AppRoutes() {
  const [role, setRole]     = useState<UserRole>('guest');
  const [userId, setUserId] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = (loggedRole: 'student' | 'teacher' | 'visitor') => {
    setRole(loggedRole);
    // Captura o userId logo após o login para alimentar o InactivityGuard
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });
    if (loggedRole === 'visitor') navigate('/ide');
    else navigate('/dashboard');
  };

  const handleLogout = () => {
    setRole('guest');
    setUserId(null);
    navigate('/');
  };

  const handleBackToDashboard = () => {
    if (role === 'visitor') { setRole('guest'); navigate('/'); }
    else navigate('/dashboard');
  };

  const openIde = (projectId: string | undefined, viewOnly: boolean) => {
    const path = projectId ? `/ide/${projectId}` : '/ide';
    navigate(path, { state: { readOnly: viewOnly } });
  };

  return (
    // O guard só está ativo quando há um userId (usuário logado)
    <InactivityGuard
      userId={role !== 'guest' ? userId : null}
      onLogout={handleLogout}
    >
      <Routes>
        <Route
          path="/"
          element={
            role === 'guest'
              ? <LoginScreen onLogin={handleLogin} />
              : <Navigate to={role === 'visitor' ? '/ide' : '/dashboard'} replace />
          }
        />

        <Route
          path="/dashboard"
          element={
            role === 'teacher' ? (
              <TeacherDashboard
                onLogout={handleLogout}
                onOpenOwnProject={(id) => openIde(id, false)}
                onInspectStudentProject={(id) => openIde(id, true)}
              />
            ) : role === 'student' ? (
              <StudentDashboard
                onLogout={handleLogout}
                onOpenIde={(id) => openIde(id, false)}
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
              ? <IdeScreenWrapper role={role} onBack={handleBackToDashboard} />
              : <Navigate to="/" replace />
          }
        />
      </Routes>
    </InactivityGuard>
  );
}

function IdeScreenWrapper({
  role,
  onBack,
}: {
  role: Exclude<UserRole, 'guest'>;
  onBack: () => void;
}) {
  const { projectId } = useParams();
  const location = useLocation();
  const readOnly = location.state?.readOnly || false;
  return (
    <IdeScreen
      role={role}
      readOnly={readOnly}
      onBack={onBack}
      projectId={projectId}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Raiz
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <SetupGate>
      <Router>
        <AppRoutes />
      </Router>
    </SetupGate>
  );
}
