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
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<Projeto | null>(null);
  const [createError, setCreateError] = useState('');

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
      // Pega a sessão atual (tokens já existem, sem round-trip extra)
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

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    setCreateError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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

    if (!error && data) {
      setOwnProjects(prev => [data, ...prev]);
      setShowNewProjectModal(false);
      setNewProjectName('');
      onOpenOwnProject(data.id);
    } else if (error) {
      console.error('Erro ao criar projeto:', error);
      setCreateError(error.message);
    }
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    await supabase.from('projetos').delete().eq('id', projectToDelete.id);
    setOwnProjects(prev => prev.filter(p => p.id !== projectToDelete.id));
    setProjectToDelete(null);
  };

  const tabStyle = (tab: Tab): React.CSSProperties => ({
    padding: '10px 24px', border: 'none',
    borderBottom: activeTab === tab ? '3px solid var(--primary)' : '3px solid transparent',
    background: 'transparent',
    color: activeTab === tab ? 'var(--primary)' : '#7f8c8d',
    fontWeight: activeTab === tab ? 900 : 700,
    fontSize: '1rem', cursor: 'pointer', boxShadow: 'none', borderRadius: 0, transition: 'all 0.2s',
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--background)', padding: '20px' }}>

      {/* TOPBAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', backgroundColor: 'white', padding: '15px 25px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <img src={logoSimples} alt="Oficina Code" style={{ height: '40px' }} />
          <h1 style={{ color: 'var(--dark)', fontSize: '1.5rem', fontWeight: 900 }}>Painel do Professor</h1>
        </div>

        {/* Botões do lado direito da topbar */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* ── Botão Admin ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <button
              onClick={handleOpenAdminPanel}
              disabled={adminLoading}
              style={{
                padding: '10px 20px',
                background: adminLoading ? '#b2bec3' : 'linear-gradient(135deg, #6c5ce7, #a29bfe)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 900,
                fontSize: '0.95rem',
                cursor: adminLoading ? 'not-allowed' : 'pointer',
                boxShadow: adminLoading ? 'none' : '0 4px 0px #4b3fad',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {adminLoading ? '⏳' : '🏫'} {adminLoading ? 'Abrindo…' : 'Painel Admin'}
            </button>
            {adminError && (
              <span style={{ fontSize: '0.75rem', color: '#e17055', fontWeight: 700, maxWidth: '200px', textAlign: 'right' }}>
                {adminError}
              </span>
            )}
          </div>

          <button className="btn-outline" onClick={onLogout} style={{ padding: '10px 20px' }}>Sair</button>
        </div>
      </div>

      {/* ABAS */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e0e6ed', marginBottom: '24px', backgroundColor: 'white', borderRadius: '12px 12px 0 0', padding: '0 10px' }}>
        <button style={tabStyle('turmas')} onClick={() => { setActiveTab('turmas'); setManagingTurma(null); setViewingAlunoProjects(null); }}>Minhas Turmas</button>
        <button style={tabStyle('projetos')} onClick={() => setActiveTab('projetos')}>Meus Projetos</button>
      </div>

      {/* ABA: TURMAS */}
      {activeTab === 'turmas' && (
        <>
          {!managingTurma ? (
            <div>
              {loadingTurmas
                ? <p style={{ color: '#7f8c8d' }}>Carregando turmas...</p>
                : turmas.length === 0
                  ? <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '16px', textAlign: 'center', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}><p style={{ color: '#7f8c8d', fontSize: '1.1rem' }}>Nenhuma turma encontrada. O administrador deve cadastrar suas turmas no OficinaAdmin.</p></div>
                  : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                      {turmas.map(turma => (
                        <div key={turma.id} onClick={() => openTurmaManager(turma)} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', borderTop: '5px solid var(--primary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <h3 style={{ color: '#2c3e50', fontSize: '1.3rem' }}>{turma.nome}</h3>
                          <p style={{ color: '#aaa', fontSize: '0.9rem' }}>Ano letivo: {turma.ano_letivo}</p>
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
                <h2 style={{ color: 'var(--dark)', fontSize: '1.3rem' }}>Turma: {managingTurma.nome}</h2>
              </div>
              {alunos.length === 0
                ? <p style={{ color: '#7f8c8d' }}>Nenhum aluno nesta turma ainda.</p>
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
                    {alunos.map(aluno => (
                      <div key={aluno.id} onClick={() => viewAlunoProjects(aluno)} style={{ backgroundColor: 'white', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: '5px solid var(--secondary)' }}>
                        <span style={{ color: '#2c3e50', fontWeight: 800, fontSize: '1.1rem' }}>{aluno.nome}</span>
                        <span style={{ color: '#aaa', fontSize: '0.9rem' }}>Ver projetos →</span>
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
                <h2 style={{ color: 'var(--dark)', fontSize: '1.3rem' }}>Projetos de {viewingAlunoProjects.aluno.nome}</h2>
              </div>
              {viewingAlunoProjects.projetos.length === 0
                ? <p style={{ color: '#7f8c8d' }}>Este aluno ainda não criou nenhum projeto.</p>
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                    {viewingAlunoProjects.projetos.map(proj => (
                      <div key={proj.id} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', borderTop: '5px solid var(--secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <h3 style={{ color: '#2c3e50', fontSize: '1.3rem' }}>{proj.nome}</h3>
                        <p style={{ color: '#aaa', fontSize: '0.9rem' }}>Salvo em: {new Date(proj.updated_at).toLocaleDateString()}</p>
                        <button className="btn-secondary" style={{ marginTop: 'auto', padding: '10px' }} onClick={() => onInspectStudentProject(proj.id)}>Ver Código (somente leitura)</button>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>
          )}
        </>
      )}

      {/* ABA: MEUS PROJETOS */}
      {activeTab === 'projetos' && (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <button className="btn-primary" style={{ padding: '12px 25px', fontSize: '1.1rem' }} onClick={() => setShowNewProjectModal(true)}>+ Novo Projeto</button>
          </div>
          {loadingProjects
            ? <p style={{ color: '#7f8c8d' }}>Carregando projetos...</p>
            : ownProjects.length === 0
              ? <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '16px', textAlign: 'center', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}><p style={{ color: '#7f8c8d', fontSize: '1.2rem' }}>Você ainda não tem projetos. Crie um para começar a programar!</p></div>
              : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                  {ownProjects.map(proj => (
                    <div key={proj.id} style={{ backgroundColor: 'white', padding: '25px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)', borderTop: '5px solid var(--primary)', display: 'flex', flexDirection: 'column' }}>
                      <h3 style={{ color: '#2c3e50', marginBottom: '10px', fontSize: '1.4rem' }}>{proj.nome}</h3>
                      <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '20px' }}>Salvo em: {new Date(proj.updated_at).toLocaleDateString()}</p>
                      <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                        <button className="btn-secondary" style={{ flex: 1, padding: '10px' }} onClick={() => onOpenOwnProject(proj.id)}>Abrir Código</button>
                        <button className="btn-outline" style={{ padding: '10px 15px' }} onClick={() => setProjectToDelete(proj)}>Excluir</button>
                      </div>
                    </div>
                  ))}
                </div>
              )
          }
        </div>
      )}

      {/* MODAL: NOVO PROJETO */}
      {showNewProjectModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h2 style={{ color: '#2c3e50', marginBottom: '10px' }}>Novo Projeto</h2>
            <p style={{ color: '#7f8c8d', marginBottom: '20px' }}>Dê um nome para o seu projeto:</p>
            <input type="text" placeholder="Ex: Demo Sensor Ultrassônico" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateProject()} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '2px solid #e0e6ed', fontSize: '1.1rem', marginBottom: '12px' }} />
            {createError && <p style={{ color: '#e53e3e', fontSize: '0.95rem', marginBottom: '12px', textAlign: 'left' }}>Erro: {createError}</p>}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => { setShowNewProjectModal(false); setNewProjectName(''); setCreateError(''); }}>Cancelar</button>
              <button className="btn-primary" style={{ flex: 1 }} onClick={handleCreateProject}>Criar e Abrir</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EXCLUIR PROJETO */}
      {projectToDelete && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200 }}>
          <div style={{ backgroundColor: 'white', padding: '35px', borderRadius: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
            <h2 style={{ color: '#2c3e50', marginBottom: '10px' }}>Atenção!</h2>
            <p style={{ color: '#7f8c8d', marginBottom: '25px', fontSize: '1.1rem' }}>Tem certeza que deseja apagar o projeto <b>{projectToDelete.nome}</b>? Isso não pode ser desfeito.</p>
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