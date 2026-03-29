import { useState } from 'react';
import { LoginScreen } from './screens/LoginScreen';
import { IdeScreen } from './screens/IdeScreen';
import { TeacherDashboard } from "./screens/TeacherDashboard";
import { StudentDashboard } from "./screens/StudentDashboard";
import './App.css';

// Quem é o usuário
type UserRole = 'guest' | 'student' | 'teacher' | 'visitor';
// Onde ele está
type ViewState = 'login' | 'dashboard' | 'ide';

function App() {
  const [role, setRole] = useState<UserRole>('guest');
  const [view, setView] = useState<ViewState>('login');
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>();
  const [isViewOnly, setIsViewOnly] = useState(false);

  const handleLogin = (loggedRole: 'student' | 'teacher' | 'visitor') => {
    setRole(loggedRole);
    // Visitantes vão direto para a IDE, alunos e professores vão para o Dashboard
    setView(loggedRole === 'visitor' ? 'ide' : 'dashboard');
  };

  const handleLogout = () => {
    setRole('guest');
    setView('login');
    setActiveProjectId(undefined);
    setIsViewOnly(false);
  };

  const handleBackToDashboard = () => {
    setActiveProjectId(undefined);
    setIsViewOnly(false);
    setView(role === 'visitor' ? 'login' : 'dashboard');
    if (role === 'visitor') setRole('guest');
  };

  const openIde = (projectId: string | undefined, viewOnly: boolean) => {
    setActiveProjectId(projectId);
    setIsViewOnly(viewOnly);
    setView('ide');
  };

  // --- Roteamento Visual ---

  if (view === 'login' || role === 'guest') {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (view === 'dashboard') {
    if (role === 'teacher') {
      return (
        <TeacherDashboard
          onLogout={handleLogout}
          onOpenOwnProject={(id) => openIde(id, false)}
          onInspectStudentProject={(id) => openIde(id, true)}
        />
      );
    }
    
    if (role === 'student') {
      return (
        <StudentDashboard
          onLogout={handleLogout}
          onOpenIde={(id) => openIde(id, false)}
        />
      );
    }
  }

  if (view === 'ide') {
    return (
      <IdeScreen
        // Precisamos garantir que role não seja 'guest' aqui para passar para a IDE
        role={role as Exclude<UserRole, 'guest'>} 
        readOnly={isViewOnly}
        onBack={handleBackToDashboard}
        projectId={activeProjectId}
      />
    );
  }

  return null; // Fallback de segurança
}

export default App;