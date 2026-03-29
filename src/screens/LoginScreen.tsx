import { useState } from 'react';
import { supabase } from '../lib/supabase';
import logoSimples from '../assets/LogoSimples.png';

interface LoginScreenProps {
  onLogin: (role: 'student' | 'teacher' | 'visitor') => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  // Estado "view" removido para reduzir complexidade
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); // Evita o recarregamento da página

    if (!email || !password) {
      setError('Por favor, preencha email e senha.');
      return;
    }

    setLoading(true);
    setError('');

    // 1. Autenticação centralizada
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !authData.user) {
      setError('Email ou senha incorretos.');
      setLoading(false);
      return;
    }

    // 2. Busca de perfil baseada no usuário autenticado
    const { data: perfil, error: perfilError } = await supabase
      .from('perfis')
      .select('role')
      .eq('id', authData.user.id)
      .single();

    setLoading(false);

    // 3. Validação de erro de perfil
    if (perfilError || !perfil) {
      setError('Erro ao carregar seu perfil. Contate o suporte.');
      // Opcional: supabase.auth.signOut() para deslogar o usuário sem perfil válido
      return;
    }

    // Redirecionamento baseado no banco de dados, não na escolha da UI
    if (perfil.role === 'teacher') onLogin('teacher');
    else if (perfil.role === 'student') onLogin('student');
    else onLogin('visitor');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <img src={logoSimples} alt="Oficina Code" style={{ height: '80px', marginBottom: '24px' }} />

        {/* Formulário único e centralizado */}
        <form className="login-form" onSubmit={handleLogin}>
          <input 
            type="email" 
            placeholder="Email" 
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
              type="button" // Importante para não submeter o formulário
              className="btn-toggle-password"
              onClick={() => setShowPassword(v => !v)}
              title={showPassword ? 'Ocultar senha' : 'Ver senha'}
              disabled={loading}
            >
              {showPassword ? '🙈' : '👀'}
            </button>
          </div>

          {error && <p style={{ color: 'var(--danger)', fontWeight: 700, margin: '8px 0' }}>{error}</p>}

          <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '16px' }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        {/* Divisória para melhorar a hierarquia visual */}
        <div className="login-divider"></div>

        {/* Opção secundária isolada e clara */}
        <button 
          type="button" 
          className="btn-text" 
          onClick={() => onLogin('visitor')} 
          disabled={loading}
        >
          Entrar como Visitante
        </button>
      </div>
    </div>
  );
}