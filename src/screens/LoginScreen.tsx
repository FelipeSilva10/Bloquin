import { useState } from 'react';
import { supabase } from '../lib/supabase';
import logoSimples from '../assets/LogoSimples.png';

interface LoginScreenProps {
  onLogin: (role: 'student' | 'teacher' | 'visitor') => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [view, setView] = useState<'options' | 'student' | 'teacher'>('options');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError('');

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError || !data.user) {
      setError('Email ou senha incorretos.');
      setLoading(false);
      return;
    }

    const { data: perfil } = await supabase
      .from('perfis')
      .select('role')
      .eq('id', data.user.id)
      .single();

    setLoading(false);

    if (perfil?.role === 'teacher') onLogin('teacher');
    else if (perfil?.role === 'student') onLogin('student');
    else onLogin('visitor');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <img src={logoSimples} alt="Oficina Code" style={{ height: '80px', marginBottom: '15px' }} />

        {view === 'options' && (
          <div className="login-options">
            <button className="btn-primary" onClick={() => setView('student')}>Sou Aluno</button>
            <button className="btn-secondary" onClick={() => setView('teacher')}>Sou Professor</button>
            <button className="btn-text" onClick={() => onLogin('visitor')}>Entrar como Visitante</button>
          </div>
        )}

        {(view === 'student' || view === 'teacher') && (
          <div className="login-form">
            <h3>{view === 'student' ? 'Aluno' : 'Professor'}</h3>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <input type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} />
            {error && <p style={{ color: 'var(--danger)', fontWeight: 700 }}>{error}</p>}
            <button className="btn-primary" onClick={handleLogin} disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
            <button className="btn-text" onClick={() => setView('options')}>← Voltar</button>
          </div>
        )}
      </div>
    </div>
  );
}