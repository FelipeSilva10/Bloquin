import { useState } from 'react';
import { supabase } from '../lib/supabase';
import logoCompleta from '../assets/LogoCompleta.png';
import TutorialModal from "../components/modals/TutorialModal";
import GuestInfoModal from "../components/modals/GuestInfoModal";
import { registerSession } from "../services/sessionService"; 

interface LoginScreenProps {
  onLogin: (role: 'student' | 'teacher' | 'visitor') => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Novos estados do Patch
  const [showTutorial, setShowTutorial] = useState(false);
  const [showGuestInfo, setShowGuestInfo] = useState(false);
  const [sessionWarning, setSessionWarning] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      setError('Por favor, preencha email e senha.');
      return;
    }

    setLoading(true);
    setError('');
    setSessionWarning(false);

    // 1. Autenticação centralizada com autocompletar domínio
    const domain = import.meta.env.VITE_EMAIL_DOMAIN ?? 'oficina.com';
    const resolvedEmail = email.includes('@') ? email.trim() : `${email.trim()}@${domain}`;

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ 
      email: resolvedEmail, 
      password 
    });

    if (authError || !authData.user) {
      setError('Email ou senha incorretos.');
      setLoading(false);
      return;
    }

    // 2. Verifica se já havia sessão ativa em outro dispositivo
    const { data: existing } = await supabase
      .from("user_sessions")
      .select("session_token")
      .eq("user_id", authData.user.id)
      .single();

    const hadActiveSession = !!existing?.session_token;

    // Registra nova sessão (invalida a anterior automaticamente via DB constraint/upsert)
    await registerSession(authData.user.id);

    // 3. Busca de perfil baseada no usuário autenticado (Lógica Original Mantida)
    const { data: perfil, error: perfilError } = await supabase
      .from('perfis')
      .select('role')
      .eq('id', authData.user.id)
      .single();

    setLoading(false);

    if (perfilError || !perfil) {
      setError('Erro ao carregar seu perfil. Contate o suporte.');
      return;
    }

    // Função interna para finalizar e rotear
    const finalizeLogin = () => {
      if (perfil.role === 'teacher') onLogin('teacher');
      else if (perfil.role === 'student') onLogin('student');
      else onLogin('visitor');
    };

    // 4. Fluxo de redirecionamento (Com pausa se houver aviso)
    if (hadActiveSession) {
      setSessionWarning(true);
      // Aguarda 3 segundos para o usuário ler a mensagem antes de sumir com a tela
      setTimeout(() => {
        finalizeLogin();
      }, 3000);
    } else {
      finalizeLogin();
    }
  };

  // Funções para fluxo do visitante
  const handleEnterAsGuest = () => {
    setShowGuestInfo(true);
  };

  const handleGuestConfirmed = () => {
    setShowGuestInfo(false);
    onLogin('visitor');
  };

  return (
  <div className="login-container">
    <div className="login-card">
      <img src={logoCompleta} alt="bloquin" style={{ height: '50px', marginBottom: '24px' }} />

      <form className="login-form" onSubmit={handleLogin}>
        <input
          type="text"
          placeholder="Usuário ou email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          disabled={loading}
        />

        <div className="password-wrapper">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Senha"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={loading}
          />
          <button
            type="button"
            className="btn-toggle-password"
            onClick={() => setShowPassword(v => !v)}
            title={showPassword ? 'Ocultar senha' : 'Ver senha'}
            disabled={loading}
          >
            {showPassword ? '🙈' : '👀'}
          </button>
        </div>

        {error && (
          <p style={{ color: 'var(--danger)', fontWeight: 700, margin: '8px 0' }}>{error}</p>
        )}

        {sessionWarning && (
          <div className="session-warning" role="alert" style={{ color: 'orange', fontWeight: 600, marginTop: '8px', fontSize: '0.9rem' }}>
            ⚠ Você tinha uma sessão ativa em outro dispositivo. Ela foi encerrada. Entrando...
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '16px' }}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      <div className="login-divider"></div>

      <button type="button" className="btn-text" onClick={handleEnterAsGuest} disabled={loading}>
        Entrar como Visitante
      </button>
    </div>

    {/* Tutorial - canto inferior direito da tela */}
    <button
      type="button"
      className="tutorial-corner-btn"
      onClick={() => setShowTutorial(true)}
      disabled={loading}
    >
      Tutorial
    </button>

    {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
    {showGuestInfo && <GuestInfoModal onClose={handleGuestConfirmed} />}
  </div>
);
}