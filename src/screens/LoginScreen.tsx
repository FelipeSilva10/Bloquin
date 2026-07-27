// src/screens/LoginScreen.tsx
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import logoCompleta from '../assets/LogoCompleta.png';
import TutorialModal from "../components/modals/TutorialModal";
import GuestInfoModal from "../components/modals/GuestInfoModal";
import {
  clearSession,
  registerSession,
  signOutLocalSafely,
} from "../services/sessionService";

interface LoginScreenProps {
  onLogin: (role: 'student' | 'teacher' | 'visitor', userId?: string) => void;
  beforeLogin?: () => Promise<void>;
  version: string;
}

export function LoginScreen({ onLogin, beforeLogin, version }: LoginScreenProps) {
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

    // 1. Resolve e-mail
    const domain        = import.meta.env.VITE_EMAIL_DOMAIN ?? 'bloquin.com';
    const resolvedEmail = email.includes('@')
      ? email.trim()
      : `${email.trim()}@${domain}`;

    let authenticatedUserId: string | null = null;
    try {
      // Evita que a limpeza assíncrona do logout anterior apague uma sessão
      // recém-criada caso o usuário tente entrar novamente imediatamente.
      await beforeLogin?.();

      // 2. Autentica no Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: resolvedEmail,
        password,
      });

      if (authError || !authData.user) {
        setError('Usuário ou senha incorretos.');
        return;
      }
      authenticatedUserId = authData.user.id;

      // 3. Registra a nova sessão — invalida qualquer sessão anterior via upsert.
      await registerSession(authenticatedUserId);

      // 4. Busca o perfil para determinar o papel
      const { data: perfil, error: perfilError } = await supabase
        .from('perfis')
        .select('role')
        .eq('id', authenticatedUserId)
        .single();

      if (perfilError || !perfil) throw new Error('PROFILE_NOT_FOUND');

      if (perfil.role === 'teacher')      onLogin('teacher', authenticatedUserId);
      else if (perfil.role === 'student') onLogin('student', authenticatedUserId);
      else                                throw new Error('UNSUPPORTED_PROFILE_ROLE');
    } catch (loginError) {
      if (authenticatedUserId) {
        try {
          await clearSession(authenticatedUserId);
        } catch {
          // A limpeza local ainda precisa acontecer se o Supabase estiver
          // indisponível durante a remoção do registro de sessão.
        } finally {
          await signOutLocalSafely();
        }
      }
      const errorCode = loginError instanceof Error ? loginError.message : '';
      setError(
        errorCode === 'PROFILE_NOT_FOUND'
          ? 'Erro ao carregar seu perfil. Contate o suporte.'
          : errorCode === 'UNSUPPORTED_PROFILE_ROLE'
            ? 'Este perfil não tem permissão para acessar este aplicativo.'
            : 'Não foi possível concluir o login. Verifique sua conexão e tente novamente.'
      );
    } finally {
      setLoading(false);
    }
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
          <label className="sr-only" htmlFor="login-email">Usuário ou email</label>
          <input
            id="login-email"
            type="text"
            placeholder="Usuário ou email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />

          <div className="password-wrapper">
            <label className="sr-only" htmlFor="login-password">Senha</label>
            <input
              id="login-password"
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
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              disabled={loading}
            >
              {showPassword ? '🙈' : '👀'}
            </button>
          </div>

          {error && (
            <p role="alert" aria-live="assertive" style={{ color: 'var(--danger)', fontWeight: 700, margin: '8px 0', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            aria-busy={loading}
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

      <span className="app-version" aria-label={`Versão instalada ${version}`}>
        Bloquin IDE v{version}
      </span>

      {showTutorial  && <TutorialModal  onClose={() => setShowTutorial(false)} />}
      {showGuestInfo && <GuestInfoModal onClose={handleGuestConfirmed} />}
    </div>
  );
}
