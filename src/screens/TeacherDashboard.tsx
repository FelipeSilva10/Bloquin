import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import logoSimples from '../assets/LogoSimples.png';
import { BOARD_UNSET } from './IdeScreen';
import { invoke } from '@tauri-apps/api/core';

interface TeacherDashboardProps {
  onLogout: () => void;
  onOpenOwnProject: (projectId: string) => void;
  onInspectStudentProject: (projectId: string) => void;
}

interface Turma   { id: string; nome: string; ano_letivo: string; }
interface Aluno   { id: string; nome: string; }
interface Projeto { id: string; nome: string; updated_at: string; }

type Tab = 'turmas' | 'projetos';

export function TeacherDashboard({ onLogout, onOpenOwnProject, onInspectStudentProject }: TeacherDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('turmas');

  const [turmas, setTurmas] = useState<Turma[]>([]);
  const [loadingTurmas, setLoadingTurmas] = useState(true);
  const [managingTurma, setManagingTurma] = useState<Turma | null>(null);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [viewingAlunoProjects, setViewingAlunoProjects] = useState<{ aluno: Aluno; projetos: Projeto[] } | null>(null);

  const [ownProjects, setOwnProjects] = useState<Projeto[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  
  // Estados do Modal de Criação
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Estados do Modal de Exclusão
  const [projectToDelete, setProjectToDelete] = useState<Projeto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Estado do botão Admin
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');

  useEffect(() => { fetchTurmas(); fetchOwnProjects(); }, []);

  const fetchTurmas = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('turmas').select('id, nome, ano_letivo').eq('professor_id', user.id).order('created_at', { ascending: false });
    setLoadingTurmas(false);
    if (data) setTurmas(data);
  };

  const fetchOwnProjects = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('projetos').select('id, nome, updated_at').eq('dono_id', user.id).order('updated_at', { ascending: false });
    setLoadingProjects(false);
    if (data) setOwnProjects(data);
  };

  // ── Abre o OficinaAdmin em WebviewWindow com auto-login ───────────────────
  const handleOpenAdminPanel = async () => {
    setAdminLoading(true);
    setAdminError('');
    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        setAdminError('Sessão não encontrada. Faça login novamente.');
        return;
      }

      await invoke('open_admin_panel', {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
      });
    } catch (err) {
      setAdminError(`Erro ao abrir o painel: ${err}`);
    } finally {
      setAdminLoading(false);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────

  const openTurmaManager = async (turma: Turma) => {
    setManagingTurma(turma);
    setAlunos([]);
    setViewingAlunoProjects(null);
    const { data } = await supabase.from('perfis').select('id, nome').eq('turma_id', turma.id).eq('role', 'student').order('nome');
    if (data) setAlunos(data);
  };

  const viewAlunoProjects = async (aluno: Aluno) => {
    const { data } = await supabase.from('projetos').select('id, nome, updated_at').eq('dono_id', aluno.id).order('updated_at', { ascending: false });
    setViewingAlunoProjects({ aluno, projetos: data || [] });
  };

  const handleCreateProject = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newProjectName.trim() || isCreating) return;
    
    setIsCreating(true);
    setCreateError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsCreating(false);
      return;
    }

    type InsertPayload = { dono_id: string; nome: string; target_board: string; turma_id?: string };
    let payload: InsertPayload = { dono_id: user.id, nome: newProjectName.trim(), target_board: BOARD_UNSET };

    let { data, error } = await supabase.from('projetos').insert([payload]).select('id, nome, updated_at').single();

    if (error && (error.message?.includes('turma_id') || error.code === '23502')) {
      const { data: turmaProf } = await supabase.from('turmas').select('id').eq('professor_id', user.id).limit(1).single();
      if (turmaProf?.id) {
        payload = { ...payload, turma_id: turmaProf.id };
        const retry = await supabase.from('projetos').insert([payload]).select('id, nome, updated_at').single();
        data = retry.data;
        error = retry.error;
      }
    }

    setIsCreating(false);

    if (!error && data) {
      setOwnProjects(prev => [data, ...prev]);
      closeCreateModal();
      onOpenOwnProject(data.id);
    } else if (error) {
      console.error('Erro ao criar projeto:', error);
      setCreateError(error.message);
    }
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete || isDeleting) return;
    
    setIsDeleting(true);
    await supabase.from('projetos').delete().eq('id', projectToDelete.id);
    
    setOwnProjects(prev => prev.filter(p => p.id !== projectToDelete.id));
    setProjectToDelete(null);
    setIsDeleting(false);
  };

  const closeCreateModal = () => {
    setShowNewProjectModal(false);
    setNewProjectName('');
    setCreateError('');
  };

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    padding: '10px 24px', border: 'none',
    borderBottom: activeTab === tab ? '3px solid var(--primary)' : '3px solid transparent',
    background: 'transparent',
    color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
    fontWeight: activeTab === tab ? 900 : 700,
    fontSize: '1rem', cursor: 'pointer', boxShadow: 'none', borderRadius: 0, transition: 'all 0.2s',
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--background)', padding: '20px' }}>

      {/* TOPBAR */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', backgroundColor: 'var(--white)', padding: '15px 25px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <img src={logoSimples} alt="Oficina Code" style={{ height: '40px' }} />
          <h1 style={{ color: 'var(--dark)', fontSize: '1.5rem', fontWeight: 900 }}>Painel do Professor</h1>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* ── Botão Admin ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <button
              onClick={handleOpenAdminPanel}
              disabled={adminLoading}
              style={{
                padding: '10px 20px',
                background: adminLoading ? '#b2bec3' : 'linear-gradient(135deg, #6c5ce7, #4b3fad)',
                color: 'var(--white)',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 900,
                fontSize: '0.95rem',
                cursor: adminLoading ? 'not-allowed' : 'pointer',
                boxShadow: adminLoading ? 'none' : '0 4px 0px #3c328a',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              {adminLoading ? 'Abrindo…' : 'Painel Admin'}
            </button>
            {adminError && (
              <span style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 700, maxWidth: '200px', textAlign: 'right' }}>
                {adminError}
              </span>
            )}
          </div>

          <button className="btn-outline" onClick={onLogout} style={{ padding: '10px 20px' }}>Sair</button>
        </div>
      </header>

      {/* ABAS */}
      <nav style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: '24px', backgroundColor: 'var(--white)', borderRadius: '12px 12px 0 0', padding: '0 10px' }}>
        <button style={tabStyle('turmas')} onClick={() => { setActiveTab('turmas'); setManagingTurma(null); setViewingAlunoProjects(null); }}>Minhas Turmas</button>
        <button style={tabStyle('projetos')} onClick={() => setActiveTab('projetos')}>Meus Projetos</button>
      </nav>

      {/* ABA: TURMAS */}
      {activeTab === 'turmas' && (
        <main>
          {!managingTurma ? (
            <div>
              {loadingTurmas
                ? <p style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Carregando turmas...</p>
                : turmas.length === 0
                  ? <div style={{ backgroundColor: 'var(--white)', padding: '40px', borderRadius: '16px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}><p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', fontWeight: 700 }}>Nenhuma turma encontrada. O administrador deve cadastrar suas turmas no OficinaAdmin.</p></div>
                  : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                      {turmas.map(turma => (
                        <div key={turma.id} onClick={() => openTurmaManager(turma)} style={{ backgroundColor: 'var(--white)', padding: '25px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)', borderTop: '5px solid var(--primary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px', transition: 'transform 0.1s' }}>
                          <h3 style={{ color: 'var(--dark)', fontSize: '1.3rem', fontWeight: 800 }}>{turma.nome}</h3>
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>Ano letivo: {turma.ano_letivo}</p>
                          <p style={{ color: 'var(--primary)', fontSize: '0.95rem', fontWeight: 800, marginTop: 'auto' }}>Ver alunos →</p>
                        </div>
                      ))}
                    </div>
                  )
              }
            </div>
          ) : !viewingAlunoProjects ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
                <button className="btn-text" onClick={() => setManagingTurma(null)}>← Voltar</button>
                <h2 style={{ color: 'var(--dark)', fontSize: '1.3rem', fontWeight: 800 }}>Turma: {managingTurma.nome}</h2>
              </div>
              {alunos.length === 0
                ? <p style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Nenhum aluno nesta turma ainda.</p>
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
                    {alunos.map(aluno => (
                      <div key={aluno.id} onClick={() => viewAlunoProjects(aluno)} style={{ backgroundColor: 'var(--white)', padding: '20px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '5px solid var(--secondary)' }}>
                        <span style={{ color: 'var(--dark)', fontWeight: 800, fontSize: '1.1rem' }}>{aluno.nome}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 700 }}>Ver projetos →</span>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
                <button className="btn-text" onClick={() => setViewingAlunoProjects(null)}>← Voltar</button>
                <h2 style={{ color: 'var(--dark)', fontSize: '1.3rem', fontWeight: 800 }}>Projetos de {viewingAlunoProjects.aluno.nome}</h2>
              </div>
              {viewingAlunoProjects.projetos.length === 0
                ? <p style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Este aluno ainda não criou nenhum projeto.</p>
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                    {viewingAlunoProjects.projetos.map(proj => (
                      <div key={proj.id} style={{ backgroundColor: 'var(--white)', padding: '25px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)', borderTop: '5px solid var(--secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <h3 style={{ color: 'var(--dark)', fontSize: '1.3rem', fontWeight: 800 }}>{proj.nome}</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>Salvo em: {new Date(proj.updated_at).toLocaleDateString('pt-BR')}</p>
                        <button className="btn-secondary" style={{ marginTop: 'auto', padding: '10px' }} onClick={() => onInspectStudentProject(proj.id)}>Ver Código (somente leitura)</button>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          )}
        </main>
      )}

      {/* ABA: MEUS PROJETOS */}
      {activeTab === 'projetos' && (
        <main>
          <div style={{ marginBottom: '20px' }}>
            <button className="btn-primary" style={{ padding: '12px 25px', fontSize: '1.1rem' }} onClick={() => setShowNewProjectModal(true)}>+ Novo Projeto</button>
          </div>
          {loadingProjects
            ? <p style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Carregando projetos...</p>
            : ownProjects.length === 0
              ? <div style={{ backgroundColor: 'var(--white)', padding: '40px', borderRadius: '16px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}><p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', fontWeight: 700 }}>Você ainda não tem projetos. Crie um para começar a programar!</p></div>
              : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                  {ownProjects.map(proj => (
                    <div key={proj.id} style={{ backgroundColor: 'var(--white)', padding: '25px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)', borderTop: '5px solid var(--primary)', display: 'flex', flexDirection: 'column' }}>
                      <h3 style={{ color: 'var(--dark)', marginBottom: '10px', fontSize: '1.4rem', fontWeight: 800 }}>{proj.nome}</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px', fontWeight: 600 }}>Salvo em: {new Date(proj.updated_at).toLocaleDateString('pt-BR')}</p>
                      <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                        <button className="btn-secondary" style={{ flex: 1, padding: '10px' }} onClick={() => onOpenOwnProject(proj.id)}>Abrir Código</button>
                        <button className="btn-outline" style={{ padding: '10px 15px' }} onClick={() => setProjectToDelete(proj)}>Excluir</button>
                      </div>
                    </div>
                  ))}
                </div>
              )
          }
        </main>
      )}

      {/* MODAL: NOVO PROJETO */}
      {showNewProjectModal && (
        <div className="modal-overlay">
          <form 
            onSubmit={handleCreateProject}
            style={{ backgroundColor: 'var(--white)', padding: '30px', borderRadius: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: 'var(--shadow-xl)' }}
          >
            <h2 style={{ color: 'var(--dark)', marginBottom: '10px', fontWeight: 900 }}>Novo Projeto</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontWeight: 600 }}>Dê um nome para o seu projeto:</p>
            
            <input 
              type="text" 
              placeholder="Ex: Demo Sensor Ultrassônico" 
              value={newProjectName} 
              onChange={e => setNewProjectName(e.target.value)} 
              disabled={isCreating}
              style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '2px solid var(--border)', fontSize: '1.1rem', marginBottom: '12px', fontWeight: 700 }} 
              autoFocus
            />
            
            {createError && <p style={{ color: 'var(--danger)', fontSize: '0.95rem', marginBottom: '12px', textAlign: 'left', fontWeight: 700 }}>Erro: {createError}</p>}
            
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="btn-text" style={{ flex: 1 }} onClick={closeCreateModal} disabled={isCreating}>Cancelar</button>
              <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={isCreating || !newProjectName.trim()}>
                {isCreating ? 'Criando...' : 'Criar e Abrir'}
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
            <p style={{ color: 'var(--text-muted)', marginBottom: '25px', fontSize: '1.1rem', fontWeight: 600 }}>Tem certeza que deseja apagar o projeto <b style={{ color: 'var(--dark)' }}>{projectToDelete.nome}</b>? Isso não pode ser desfeito.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-text" style={{ flex: 1 }} onClick={() => setProjectToDelete(null)} disabled={isDeleting}>Cancelar</button>
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