import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import logoSimples from '../assets/LogoSimples.png';
import { BOARD_UNSET } from './IdeScreen';

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
  const [showModal, setShowModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<Projeto | null>(null);
  const [createError, setCreateError] = useState('');

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

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setCreateError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: perfil } = await supabase
      .from('perfis')
      .select('turma_id')
      .eq('id', user.id)
      .single();

    if (!perfil?.turma_id) {
      setCreateError('Seu perfil não está vinculado a uma turma. Fale com o professor.');
      return;
    }

    // target_board inserido como BOARD_UNSET ('unset').
    // A seleção real ocorre na IdeScreen, que detecta este valor e exibe o modal.
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

    if (!error && data) {
      setProjects(prev => [data, ...prev]);
      setShowModal(false);
      setNewProjectName('');
      // Abre imediatamente o projeto criado — a IDE solicitará a placa
      onOpenIde(data.id);
    } else if (error) {
      setCreateError(error.message);
    }
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    await supabase.from('projetos').delete().eq('id', projectToDelete.id);
    setProjects(prev => prev.filter(p => p.id !== projectToDelete.id));
    setProjectToDelete(null);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--background)', padding: '20px' }}>
      {/* TOPBAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', backgroundColor: 'white', padding: '15px 25px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <img src={logoSimples} alt="Oficina Code" style={{ height: '40px' }} />
          <h1 style={{ color: 'var(--dark)', fontSize: '1.5rem', fontWeight: 900 }}>Meus Projetos</h1>
        </div>
        <button className="btn-outline" onClick={onLogout} style={{ padding: '10px 20px' }}>Sair</button>
      </div>

      {/* BOTÃO NOVO PROJETO */}
      <div style={{ marginBottom: '20px' }}>
        <button className="btn-primary" style={{ padding: '12px 25px', fontSize: '1.1rem' }} onClick={() => setShowModal(true)}>
          + Novo Projeto
        </button>
      </div>

      {/* LISTA DE PROJETOS */}
      {loading
        ? <p style={{ textAlign: 'center', color: '#7f8c8d' }}>Carregando...</p>
        : projects.length === 0
          ? (
            <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '16px', textAlign: 'center', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
              <p style={{ color: '#7f8c8d', fontSize: '1.2rem' }}>Você ainda não tem projetos. Clique em Novo Projeto para começar!</p>
            </div>
          )
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
              {projects.map((proj) => (
                <div key={proj.id} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', borderTop: '5px solid #4cd137', display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ color: '#2c3e50', marginBottom: '10px', fontSize: '1.4rem' }}>{proj.nome}</h3>
                  <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '20px' }}>
                    Salvo em: {new Date(proj.updated_at).toLocaleDateString()}
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
          )
      }

      {/* MODAL: CRIAR PROJETO */}
      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h2 style={{ color: '#2c3e50', marginBottom: '10px' }}>Novo Projeto</h2>
            <p style={{ color: '#7f8c8d', marginBottom: '20px' }}>Dê um nome bem legal para a sua invenção:</p>
            <input
              type="text"
              placeholder="Ex: Robô Dançarino"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
              style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '2px solid #e0e6ed', fontSize: '1.1rem', marginBottom: '12px' }}
            />
            {createError && (
              <p style={{ color: '#e53e3e', fontSize: '0.9rem', marginBottom: '12px' }}>{createError}</p>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => { setShowModal(false); setNewProjectName(''); setCreateError(''); }}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={handleCreateProject}>Criar!</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EXCLUIR PROJETO */}
      {projectToDelete && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200 }}>
          <div style={{ backgroundColor: 'white', padding: '35px', borderRadius: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <h2 style={{ color: '#2c3e50', marginBottom: '10px' }}>Atenção!</h2>
            <p style={{ color: '#7f8c8d', marginBottom: '25px', fontSize: '1.1rem' }}>
              Tem certeza que deseja apagar o projeto <b>{projectToDelete.nome}</b>? Isso não pode ser desfeito.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-outline" style={{ flex: 1, padding: '12px' }} onClick={() => setProjectToDelete(null)}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1, padding: '12px', backgroundColor: '#ff4757', boxShadow: '0 6px 0px #ff1e34' }} onClick={confirmDeleteProject}>Sim, Apagar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}