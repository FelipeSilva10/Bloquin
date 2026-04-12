import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import logoSimples from '../assets/LogoSimples.png';
import { BOARD_UNSET } from '../blockly/blocks';

interface StudentDashboardProps {
  onLogout: () => void;
  onOpenIde: (projectId: string) => void;
}

interface Projeto {
  id: string;
  nome: string;
  updated_at: string;
}

export function StudentDashboard({ onLogout, onOpenIde }: StudentDashboardProps) {
  const [projects, setProjects] = useState<Projeto[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estados do Modal de Criação
  const [showModal, setShowModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false); // Novo estado de loading

  // Estados do Modal de Exclusão
  const [projectToDelete, setProjectToDelete] = useState<Projeto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Estados da seção de alteração de senha
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const fetchProjects = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('projetos')
      .select('id, nome, updated_at')
      .eq('dono_id', user.id)
      .order('updated_at', { ascending: false });

    setLoading(false);
    if (data) setProjects(data);
  };

  useEffect(() => { fetchProjects(); }, []);

  const handleCreateProject = async (e?: React.FormEvent) => {
    if (e) e.preventDefault(); // Evita recarregamento da página se submetido via <form>
    if (!newProjectName.trim() || isCreating) return;

    setIsCreating(true);
    setCreateError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsCreating(false);
      return;
    }

    const { data: perfil } = await supabase
      .from('perfis')
      .select('turma_id')
      .eq('id', user.id)
      .single();

    if (!perfil?.turma_id) {
      setCreateError('Seu perfil não está vinculado a uma turma. Fale com o professor.');
      setIsCreating(false);
      return;
    }

    const { data, error } = await supabase
      .from('projetos')
      .insert([{
        dono_id: user.id,
        turma_id: perfil.turma_id,
        nome: newProjectName.trim(),
        target_board: BOARD_UNSET,
      }])
      .select('id, nome, updated_at')
      .single();

    setIsCreating(false);

    if (!error && data) {
      setProjects(prev => [data, ...prev]);
      closeCreateModal();
      onOpenIde(data.id);
    } else if (error) {
      setCreateError(error.message);
    }
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete || isDeleting) return;
    
    setIsDeleting(true);
    await supabase.from('projetos').delete().eq('id', projectToDelete.id);
    
    setProjects(prev => prev.filter(p => p.id !== projectToDelete.id));
    setProjectToDelete(null);
    setIsDeleting(false);
  };

  const closeCreateModal = () => {
    setShowModal(false);
    setNewProjectName('');
    setCreateError('');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    // Validações no frontend
    if (novaSenha.length < 8) {
      setPasswordError('A nova senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setPasswordError('A nova senha e a confirmação não coincidem.');
      return;
    }
    if (novaSenha === senhaAtual) {
      setPasswordError('A nova senha não pode ser igual à senha atual.');
      return;
    }

    setIsChangingPassword(true);

    // Re-autenticação para confirmar a senha atual (o Supabase não valida isso no updateUser)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      setPasswordError('Não foi possível identificar o usuário. Tente sair e entrar novamente.');
      setIsChangingPassword(false);
      return;
    }

    const { error: reAuthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: senhaAtual,
    });

    if (reAuthError) {
      setPasswordError('Senha atual incorreta.');
      setIsChangingPassword(false);
      return;
    }

    // Troca a senha — o Supabase invalida tokens antigos e emite um novo
    const { error: updateError } = await supabase.auth.updateUser({ password: novaSenha });

    setIsChangingPassword(false);

    if (updateError) {
      setPasswordError('Erro ao alterar a senha. Tente novamente.');
      return;
    }

    setPasswordSuccess('Senha alterada com sucesso!');
    setSenhaAtual('');
    setNovaSenha('');
    setConfirmarSenha('');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--background)', padding: '20px' }}>
      
      {/* TOPBAR */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', backgroundColor: 'var(--white)', padding: '15px 25px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <img src={logoSimples} alt="bloquin" style={{ height: '40px' }} />
          <h1 style={{ color: 'var(--dark)', fontSize: '1.5rem', fontWeight: 900 }}>Meus Projetos</h1>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-outline" style={{ padding: '10px 20px' }} onClick={() => { setShowPasswordSection(true); setPasswordError(''); setPasswordSuccess(''); }}>
            🔒 Alterar senha
          </button>
          <button className="btn-outline" onClick={onLogout} style={{ padding: '10px 20px' }}>Sair</button>
        </div>
      </header>

      {/* CONTROLES */}
      <div style={{ marginBottom: '20px' }}>
        <button className="btn-primary" style={{ padding: '12px 25px', fontSize: '1.1rem' }} onClick={() => setShowModal(true)}>
          + Novo Projeto
        </button>
      </div>

      {/* LISTA DE PROJETOS */}
      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>Carregando seus projetos...</p>
      ) : projects.length === 0 ? (
        <div style={{ backgroundColor: 'var(--white)', padding: '40px', borderRadius: '16px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', fontWeight: 700 }}>
            Você ainda não tem projetos. Clique em Novo Projeto para começar!
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {projects.map((proj) => (
            <div key={proj.id} style={{ backgroundColor: 'var(--white)', padding: '25px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)', borderTop: '5px solid var(--secondary)', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ color: 'var(--dark)', marginBottom: '10px', fontSize: '1.4rem', fontWeight: 800 }}>{proj.nome}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px', fontWeight: 600 }}>
                Salvo em: {new Date(proj.updated_at).toLocaleDateString('pt-BR')}
              </p>
              <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                <button className="btn-secondary" style={{ flex: 1, padding: '10px' }} onClick={() => onOpenIde(proj.id)}>
                  Abrir Código
                </button>
                <button className="btn-outline" style={{ padding: '10px 15px' }} onClick={() => setProjectToDelete(proj)}>
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: ALTERAR SENHA */}
      {showPasswordSection && (
        <div className="modal-overlay">
          <form
            onSubmit={handleChangePassword}
            style={{ backgroundColor: 'var(--white)', padding: '30px', borderRadius: '24px', width: '90%', maxWidth: '420px', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', gap: '16px' }}
          >
            <h2 style={{ color: 'var(--dark)', fontWeight: 900, margin: 0 }}>🔒 Alterar senha</h2>
            <p style={{ color: 'var(--text-muted)', fontWeight: 600, margin: 0, fontSize: '0.95rem' }}>Preencha os campos abaixo para criar uma nova senha.</p>

            <div>
              <label style={{ display: 'block', fontWeight: 700, color: 'var(--dark)', marginBottom: '6px', fontSize: '0.9rem' }}>Senha atual</label>
              <input
                type="password"
                value={senhaAtual}
                onChange={e => setSenhaAtual(e.target.value)}
                disabled={isChangingPassword}
                style={{ width: '100%', padding: '13px', borderRadius: '12px', border: '2px solid var(--border)', fontSize: '1rem', fontWeight: 600, boxSizing: 'border-box' }}
                autoComplete="current-password"
                autoFocus
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, color: 'var(--dark)', marginBottom: '6px', fontSize: '0.9rem' }}>Nova senha</label>
              <input
                type="password"
                value={novaSenha}
                onChange={e => setNovaSenha(e.target.value)}
                disabled={isChangingPassword}
                placeholder="Mínimo 8 caracteres"
                style={{ width: '100%', padding: '13px', borderRadius: '12px', border: '2px solid var(--border)', fontSize: '1rem', fontWeight: 600, boxSizing: 'border-box' }}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontWeight: 700, color: 'var(--dark)', marginBottom: '6px', fontSize: '0.9rem' }}>Confirmar nova senha</label>
              <input
                type="password"
                value={confirmarSenha}
                onChange={e => setConfirmarSenha(e.target.value)}
                disabled={isChangingPassword}
                style={{ width: '100%', padding: '13px', borderRadius: '12px', border: `2px solid ${confirmarSenha && confirmarSenha !== novaSenha ? 'var(--danger)' : 'var(--border)'}`, fontSize: '1rem', fontWeight: 600, boxSizing: 'border-box' }}
                autoComplete="new-password"
              />
              {confirmarSenha && confirmarSenha !== novaSenha && (
                <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginTop: '5px', fontWeight: 700 }}>As senhas não coincidem</p>
              )}
            </div>

            {passwordError && <p style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '0.9rem', margin: 0 }}>{passwordError}</p>}
            {passwordSuccess && <p style={{ color: '#1a6b3c', fontWeight: 700, fontSize: '0.9rem', margin: 0 }}>{passwordSuccess}</p>}

            <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button
                type="button"
                className="btn-text"
                style={{ flex: 1 }}
                onClick={() => { setShowPasswordSection(false); setSenhaAtual(''); setNovaSenha(''); setConfirmarSenha(''); setPasswordError(''); setPasswordSuccess(''); }}
                disabled={isChangingPassword}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
                style={{ flex: 1 }}
                disabled={isChangingPassword || !senhaAtual || !novaSenha || !confirmarSenha}
              >
                {isChangingPassword ? 'Alterando...' : 'Alterar senha'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: CRIAR PROJETO */}
      {showModal && (
        <div className="modal-overlay">
          <form 
            onSubmit={handleCreateProject}
            style={{ backgroundColor: 'var(--white)', padding: '30px', borderRadius: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: 'var(--shadow-xl)' }}
          >
            <h2 style={{ color: 'var(--dark)', marginBottom: '10px', fontWeight: 900 }}>Novo Projeto</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontWeight: 600 }}>Dê um nome bem legal para a sua invenção:</p>
            
            <input
              type="text"
              placeholder="Ex: Robô Dançarino"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              disabled={isCreating}
              style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '2px solid var(--border)', fontSize: '1.1rem', marginBottom: '12px', fontWeight: 700 }}
              autoFocus
            />
            
            {createError && (
              <p style={{ color: 'var(--danger)', fontSize: '0.9rem', marginBottom: '12px', fontWeight: 700 }}>{createError}</p>
            )}
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="btn-text" style={{ flex: 1 }} onClick={closeCreateModal} disabled={isCreating}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={isCreating || !newProjectName.trim()}>
                {isCreating ? 'Criando...' : 'Criar!'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: EXCLUIR PROJETO */}
      {projectToDelete && (
        <div className="modal-overlay">
          <div style={{ backgroundColor: 'var(--white)', padding: '35px', borderRadius: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: 'var(--shadow-xl)' }}>
            <h2 style={{ color: 'var(--dark)', marginBottom: '10px', fontWeight: 900 }}>Atenção!</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '25px', fontSize: '1.1rem', fontWeight: 600 }}>
              Tem certeza que deseja apagar o projeto <b style={{ color: 'var(--dark)' }}>{projectToDelete.nome}</b>? Isso não pode ser desfeito.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-text" style={{ flex: 1 }} onClick={() => setProjectToDelete(null)} disabled={isDeleting}>
                Cancelar
              </button>
              <button className="btn-danger" style={{ flex: 1 }} onClick={confirmDeleteProject} disabled={isDeleting}>
                {isDeleting ? 'Apagando...' : 'Sim, Apagar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}