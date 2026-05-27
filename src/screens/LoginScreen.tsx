// src/screens/LoginScreen.tsx
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import logoCompleta from '../assets/LogoCompleta.png';
import TutorialModal from "../components/modals/TutorialModal";
import GuestInfoModal from "../components/modals/GuestInfoModal";
import { registerSession, isSessionActive } from "../services/sessionService";

interface LoginScreenProps {
  onLogin: (role: 'student' | 'teacher' | 'visitor') => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showGuestInfo, setShowGuestInfo] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      setError('Por favor, preencha usuário e senha.');
      return;
    }

    setLoading(true);
    setError('');

    // 1. Resolve e-mail (alunos digitam só o nome de usuário)
    const domain        = import.meta.env.VITE_EMAIL_DOMAIN ?? 'bloquin.com';
    const resolvedEmail = email.includes('@')
      ? email.trim()
      : `${email.trim()}@${domain}`;

    // 2. Autentica no Supabase
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password,
    });

    if (authError || !authData.user) {
      setError('Usuário ou senha incorretos.');
      setLoading(false);
      return;
    }

    // 3. Bloqueia se já existe sessão ativa em outro dispositivo.
    //    O heartbeat atualiza updated_at a cada 2 min; se passou mais de
    //    12 min sem atualização, a sessão é considerada expirada e o
    //    próximo usuário pode entrar normalmente.
    const active = await isSessionActive(authData.user.id);
    if (active) {
      // Desfaz o login — impede que o token seja usado
      await supabase.auth.signOut();
      setError(
        '⚠️ Esta conta já está em uso em outro dispositivo. ' +
        'A sessão é liberada automaticamente após 10 minutos de inatividade.'
      );
      setLoading(false);
      return;
    }

    // 4. Registra a nova sessão (invalida qualquer sessão anterior via upsert)
    await registerSession(authData.user.id);

    // 5. Busca o perfil para determinar o papel
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

    if (perfil.role === 'teacher')      onLogin('teacher');
    else if (perfil.role === 'student') onLogin('student');
    else                                onLogin('visitor');
  };

  const handleEnterAsGuest = () => setShowGuestInfo(true);
  const handleGuestConfirmed = () => { setShowGuestInfo(false); onLogin('visitor'); };

  return (
    <div className="login-container">
      <div className="login-card">
        <img
          src={logoCompleta}
          alt="bloquin"
          style={{ height: '50px', marginBottom: '24px' }}
        />

        <form className="login-form" onSubmit={handleLogin}>
          <input
            type="text"
            placeholder="Usuário ou email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />

          <div className="password-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
            <button
              type="button"
              className="btn-toggle-password"
              onClick={() => setShowPassword((v) => !v)}
              title={showPassword ? 'Ocultar senha' : 'Ver senha'}
              disabled={loading}
            >
              {showPassword ? '🙈' : '👀'}
            </button>
          </div>

          {error && (
            <p style={{ color: 'var(--danger)', fontWeight: 700, margin: '8px 0', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ marginTop: '16px' }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="login-divider" />

        <button
          type="button"
          className="btn-text"
          onClick={handleEnterAsGuest}
          disabled={loading}
        >
          Entrar como Visitante
        </button>
      </div>

      {/* Botão de tutorial fixo no canto inferior direito */}
      <button
        type="button"
        className="tutorial-corner-btn"
        onClick={() => setShowTutorial(true)}
        disabled={loading}
      >
        Tutorial
      </button>

      {showTutorial  && <TutorialModal  onClose={() => setShowTutorial(false)} />}
      {showGuestInfo && <GuestInfoModal onClose={handleGuestConfirmed} />}
    </div>
  );
}
