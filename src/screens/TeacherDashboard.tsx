import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import logoSimples from '../assets/LogoSimples.png';
import { BOARD_UNSET } from '../blockly/blocks';
import { invoke } from '@tauri-apps/api/core';
import { ProjectService } from '../services/projectService';
import { lockStudentScreen, unlockStudentScreen } from '../services/sessionService';
import ProjectModal from '../components/modals/ProjectModal';

interface TeacherDashboardProps {
  onLogout: () => void;
  onOpenOwnProject: (projectId: string) => void;
  onInspectStudentProject: (projectId: string) => void;
}

interface Turma   { id: string; nome: string; ano_letivo: string; }
interface Aluno   { id: string; nome: string; }
interface Projeto { id: string; nome: string; descricao?: string; target_board?: string; updated_at: string; }

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
  
  // Estados de Criação e Exclusão
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [projectToDelete, setProjectToDelete] = useState<{ projeto: Projeto; origin: 'own' | 'student' } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Estados do Admin
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');

  // ─── Novos Estados (Patch) ─────────────────────────────────────────────────
  const [lockedStudents, setLockedStudents] = useState<Set<string>>(new Set());
  const [selectedProject, setSelectedProject] = useState<Projeto | null>(null);

  // Compartilhamento
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [projectToShare, setProjectToShare] = useState<Projeto | null>(null);
  const [shareTargets, setShareTargets] = useState<string[]>([]);
  const [sharing, setSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

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
    const { data } = await supabase.from('projetos').select('id, nome, descricao, target_board, updated_at').eq('dono_id', user.id).order('updated_at', { ascending: false });
    setLoadingProjects(false);
    if (data) setOwnProjects(data);
  };

  const handleOpenAdminPanel = async () => {
    setAdminLoading(true);
    setAdminError('');
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) { setAdminError('Sessão não encontrada. Faça login novamente.'); return; }
      await invoke('open_admin_panel', { accessToken: session.access_token, refreshToken: session.refresh_token });
    } catch (err) {
      setAdminError(`Erro ao abrir o painel: ${err}`);
    } finally {
      setAdminLoading(false);
    }
  };

  const openTurmaManager = async (turma: Turma) => {
    setManagingTurma(turma);
    setAlunos([]);
    setViewingAlunoProjects(null);
    const { data } = await supabase.from('perfis').select('id, nome').eq('turma_id', turma.id).eq('role', 'student').order('nome');
    if (data) setAlunos(data);
  };

  const viewAlunoProjects = async (aluno: Aluno) => {
    const { data } = await supabase.from('projetos').select('id, nome, descricao, target_board, updated_at').eq('dono_id', aluno.id).order('updated_at', { ascending: false });
    setViewingAlunoProjects({ aluno, projetos: data || [] });
  };

  // ─── Funções de Intervenção e Compartilhamento (Patch) ───────────────────
  const handleIntervention = async (studentId: string) => {
    const isLocked = lockedStudents.has(studentId);
    if (isLocked) {
      await unlockStudentScreen(studentId);
      setLockedStudents((prev) => { const next = new Set(prev); next.delete(studentId); return next; });
    } else {
      await lockStudentScreen(studentId, "Seu Professor");
      setLockedStudents((prev) => new Set([...prev, studentId]));
    }
  };

  const handleShareProject = async () => {
    if (!projectToShare || shareTargets.length === 0) return;
    setSharing(true);

    const targetIds = shareTargets.includes("all") ? alunos.map((s) => s.id) : shareTargets;

    try {
      await ProjectService.shareProject(projectToShare.id, targetIds);
      setShareSuccess(true);
      setTimeout(() => {
        setShareSuccess(false);
        setShareModalOpen(false);
        setProjectToShare(null);
        setShareTargets([]);
      }, 1500);
    } catch (err) {
      console.error("Erro ao compartilhar:", err);
    } finally {
      setSharing(false);
    }
  };

  const handleSaveProjectMeta = async (id: string, name: string, description: string) => {
    await ProjectService.updateProjectMeta(id, name, description);
    
    // Atualiza a lista visualmente dependendo de onde o projeto estava (próprio ou do aluno)
    setOwnProjects(prev => prev.map(p => p.id === id ? { ...p, nome: name, descricao: description } : p));
    if (viewingAlunoProjects) {
      setViewingAlunoProjects({
        ...viewingAlunoProjects,
        projetos: viewingAlunoProjects.projetos.map(p => p.id === id ? { ...p, nome: name, descricao: description } : p)
      });
    }
  };

  const handleCreateProject = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newProjectName.trim() || isCreating) return;
    setIsCreating(true);
    setCreateError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsCreating(false); return; }

    type InsertPayload = { dono_id: string; nome: string; target_board: string; turma_id?: string };
    let payload: InsertPayload = { dono_id: user.id, nome: newProjectName.trim(), target_board: BOARD_UNSET };

    let { data, error } = await supabase.from('projetos').insert([payload]).select('id, nome, descricao, target_board, updated_at').single();

    if (error && (error.message?.includes('turma_id') || error.code === '23502')) {
      const { data: turmaProf } = await supabase.from('turmas').select('id').eq('professor_id', user.id).limit(1).single();
      if (turmaProf?.id) {
        payload = { ...payload, turma_id: turmaProf.id };
        const retry = await supabase.from('projetos').insert([payload]).select('id, nome, descricao, target_board, updated_at').single();
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
      setCreateError(error.message);
    }
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete || isDeleting) return;
    setIsDeleting(true);
    await ProjectService.deleteProject(projectToDelete.projeto.id);
    
    if (projectToDelete.origin === 'own') {
      setOwnProjects(prev => prev.filter(p => p.id !== projectToDelete.projeto.id));
    } else if (viewingAlunoProjects) {
      setViewingAlunoProjects({
        ...viewingAlunoProjects,
        projetos: viewingAlunoProjects.projetos.filter(p => p.id !== projectToDelete.projeto.id)
      });
    }
    
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
          <img src={logoSimples} alt="bloquin" style={{ height: '40px' }} />
          <h1 style={{ color: 'var(--dark)', fontSize: '1.5rem', fontWeight: 900 }}>Painel do Professor</h1>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <button
              onClick={handleOpenAdminPanel}
              disabled={adminLoading}
              style={{
                padding: '10px 20px',
                background: adminLoading ? '#b2bec3' : 'linear-gradient(135deg, #6c5ce7, #4b3fad)',
                color: 'var(--white)', border: 'none', borderRadius: '12px',
                fontWeight: 900, fontSize: '0.95rem', cursor: adminLoading ? 'not-allowed' : 'pointer',
                boxShadow: adminLoading ? 'none' : '0 4px 0px #3c328a', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: '12px',
              }}
            >
              {adminLoading ? 'Abrindo…' : 'Painel Admin'}
            </button>
            {adminError && <span style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 700 }}>{adminError}</span>}
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
              {loadingTurmas ? <p style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Carregando turmas...</p> : turmas.length === 0 ? (
                <div style={{ backgroundColor: 'var(--white)', padding: '40px', borderRadius: '16px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', fontWeight: 700 }}>Nenhuma turma encontrada. O administrador deve cadastrar suas turmas no bloquinAdmin.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                  {turmas.map(turma => (
                    <div key={turma.id} onClick={() => openTurmaManager(turma)} style={{ backgroundColor: 'var(--white)', padding: '25px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)', borderTop: '5px solid var(--primary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px', transition: 'transform 0.1s' }}>
                      <h3 style={{ color: 'var(--dark)', fontSize: '1.3rem', fontWeight: 800 }}>{turma.nome}</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>Ano letivo: {turma.ano_letivo}</p>
                      <p style={{ color: 'var(--primary)', fontSize: '0.95rem', fontWeight: 800, marginTop: 'auto' }}>Ver alunos e gerenciar →</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : !viewingAlunoProjects ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <button className="btn-text" onClick={() => setManagingTurma(null)}>← Voltar</button>
                  <h2 style={{ color: 'var(--dark)', fontSize: '1.3rem', fontWeight: 800 }}>Turma: {managingTurma.nome}</h2>
                </div>
                <button 
                  className="btn-primary" 
                  onClick={() => { setShareTargets(['all']); setShareModalOpen(true); }}
                >
                  📤 Enviar projeto para turma
                </button>
              </div>

              {alunos.length === 0 ? <p style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Nenhum aluno nesta turma ainda.</p> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '15px' }}>
                  {alunos.map(aluno => {
                    const isLocked = lockedStudents.has(aluno.id);
                    return (
                      <div key={aluno.id} style={{ backgroundColor: 'var(--white)', padding: '20px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', borderLeft: '5px solid var(--secondary)' }}>
                        <span style={{ color: 'var(--dark)', fontWeight: 800, fontSize: '1.2rem', marginBottom: '15px' }}>{aluno.nome}</span>
                        
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <button className="btn-secondary" style={{ flex: 1, padding: '8px' }} onClick={() => viewAlunoProjects(aluno)}>
                            Projetos
                          </button>
                          <button className="btn-outline" style={{ flex: 1, padding: '8px' }} onClick={() => { setShareTargets([aluno.id]); setShareModalOpen(true); }}>
                            📤 Enviar
                          </button>
                          <button
                            className="btn-outline"
                            style={{
                              flex: 1,
                              padding: '8px',
                              backgroundColor: isLocked ? '#ffa600' : 'transparent',
                              borderColor:     isLocked ? '#fdcb6e' : 'var(--border)',
                              color:           isLocked ? 'white'   : 'var(--text-muted)',
                              boxShadow:       isLocked ? '0 6px 0 #e09000' : 'none',
                              border:          isLocked ? 'none'    : '2px solid var(--border)',
                            }}
                            onClick={() => handleIntervention(aluno.id)}
                          >
                            {isLocked ? "🔓 Liberar" : "🔒 Intervir"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
                <button className="btn-text" onClick={() => setViewingAlunoProjects(null)}>← Voltar</button>
                <h2 style={{ color: 'var(--dark)', fontSize: '1.3rem', fontWeight: 800 }}>Projetos de {viewingAlunoProjects.aluno.nome}</h2>
              </div>
              {viewingAlunoProjects.projetos.length === 0 ? <p style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Este aluno ainda não criou nenhum projeto.</p> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                  {viewingAlunoProjects.projetos.map(proj => (
                    <div key={proj.id} style={{ backgroundColor: 'var(--white)', padding: '25px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)', borderTop: '5px solid var(--secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <h3 style={{ color: 'var(--dark)', fontSize: '1.3rem', fontWeight: 800 }}>{proj.nome}</h3>
                        <button className="btn-icon" onClick={() => setSelectedProject(proj)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✏️</button>
                      </div>
                      
                      {proj.descricao && <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>{proj.descricao}</p>}
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>Salvo em: {new Date(proj.updated_at).toLocaleDateString('pt-BR')} • {proj.target_board !== BOARD_UNSET ? proj.target_board : 'Sem placa'}</p>
                      
                      <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                        <button className="btn-secondary" style={{ flex: 1, padding: '10px' }} onClick={() => onInspectStudentProject(proj.id)}>Inspecionar Código</button>
                        <button className="btn-outline" style={{ padding: '10px' }} onClick={() => setProjectToDelete({ projeto: proj, origin: 'student' })}>🗑️</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
          {loadingProjects ? <p style={{ color: 'var(--text-muted)', fontWeight: 700 }}>Carregando projetos...</p> : ownProjects.length === 0 ? (
            <div style={{ backgroundColor: 'var(--white)', padding: '40px', borderRadius: '16px', textAlign: 'center', boxShadow: 'var(--shadow-sm)' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', fontWeight: 700 }}>Você ainda não tem projetos. Crie um para começar a programar!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
              {ownProjects.map(proj => (
                <div key={proj.id} style={{ backgroundColor: 'var(--white)', padding: '25px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)', borderTop: '5px solid var(--primary)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ color: 'var(--dark)', marginBottom: '5px', fontSize: '1.4rem', fontWeight: 800 }}>{proj.nome}</h3>
                    <button className="btn-icon" onClick={() => setSelectedProject(proj)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✏️</button>
                  </div>
                  
                  {proj.descricao && <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '10px', fontStyle: 'italic' }}>{proj.descricao}</p>}
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px', fontWeight: 600 }}>Salvo em: {new Date(proj.updated_at).toLocaleDateString('pt-BR')} • {proj.target_board !== BOARD_UNSET ? proj.target_board : 'Sem placa'}</p>
                  
                  <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                    <button className="btn-secondary" style={{ flex: 1, padding: '10px' }} onClick={() => onOpenOwnProject(proj.id)}>Abrir Código</button>
                    <button className="btn-outline" style={{ padding: '10px 15px' }} onClick={() => setProjectToDelete({ projeto: proj, origin: 'own' })}>Excluir</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {/* MODAL: COMPARTILHAR PROJETO (PATCH) */}
      {shareModalOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShareModalOpen(false)}>
          <div style={{ backgroundColor: 'var(--white)', padding: '30px', borderRadius: '24px', width: '90%', maxWidth: '450px', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 style={{ color: 'var(--dark)', fontWeight: 900, margin: 0 }}>Compartilhar Projeto</h2>
            <p style={{ color: 'var(--text-muted)', fontWeight: 600, margin: 0, fontSize: '0.95rem' }}>
              Cada aluno receberá uma cópia independente no seu painel.
            </p>

            <div>
              <label style={{ display: 'block', fontWeight: 700, color: 'var(--dark)', marginBottom: '6px', fontSize: '0.9rem' }}>Qual projeto você quer enviar?</label>
              <select
                style={{ width: '100%', padding: '13px', borderRadius: '12px', border: '2px solid var(--border)', fontSize: '1rem', fontWeight: 600, boxSizing: 'border-box' }}
                value={projectToShare?.id ?? ""}
                onChange={(e) => setProjectToShare(ownProjects.find((p) => p.id === e.target.value) ?? null)}
              >
                <option value="">Selecione um dos seus projetos…</option>
                {ownProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button className="btn-text" style={{ flex: 1 }} onClick={() => setShareModalOpen(false)}>Cancelar</button>
              <button
                className="btn-primary"
                style={{ flex: 1 }}
                onClick={handleShareProject}
                disabled={sharing || !projectToShare || shareTargets.length === 0}
              >
                {sharing ? "Enviando…" : shareSuccess ? "✓ Enviado!" : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DETALHES DO PROJETO (PATCH) */}
      {selectedProject && (
        <ProjectModal
          project={{
            id: selectedProject.id,
            name: selectedProject.nome,
            description: selectedProject.descricao || '',
            board: selectedProject.target_board || 'uno'
          }}
          onSave={handleSaveProjectMeta}
          onOpen={(proj) => {
            setSelectedProject(null);
            // Se for do professor, abre normal. Se for de aluno, inspeciona.
            if (ownProjects.find(p => p.id === proj.id)) {
              onOpenOwnProject(proj.id);
            } else {
              onInspectStudentProject(proj.id);
            }
          }}
          onClose={() => setSelectedProject(null)}
        />
      )}

      {/* MODAL: NOVO PROJETO */}
      {showNewProjectModal && (
        <div className="modal-overlay">
          <form onSubmit={handleCreateProject} style={{ backgroundColor: 'var(--white)', padding: '30px', borderRadius: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: 'var(--shadow-xl)' }}>
            <h2 style={{ color: 'var(--dark)', marginBottom: '10px', fontWeight: 900 }}>Novo Projeto</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontWeight: 600 }}>Dê um nome para o seu projeto:</p>
            <input type="text" placeholder="Ex: Demo Sensor Ultrassônico" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} disabled={isCreating} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '2px solid var(--border)', fontSize: '1.1rem', marginBottom: '12px', fontWeight: 700 }} autoFocus />
            {createError && <p style={{ color: 'var(--danger)', fontSize: '0.95rem', marginBottom: '12px', textAlign: 'left', fontWeight: 700 }}>Erro: {createError}</p>}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="btn-text" style={{ flex: 1 }} onClick={closeCreateModal} disabled={isCreating}>Cancelar</button>
              <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={isCreating || !newProjectName.trim()}>{isCreating ? 'Criando...' : 'Criar e Abrir'}</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: EXCLUIR PROJETO */}
      {projectToDelete && (
        <div className="modal-overlay">
          <div style={{ backgroundColor: 'var(--white)', padding: '35px', borderRadius: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: 'var(--shadow-xl)' }}>
            <h2 style={{ color: 'var(--dark)', marginBottom: '10px', fontWeight: 900 }}>Atenção!</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '25px', fontSize: '1.1rem', fontWeight: 600 }}>Tem certeza que deseja apagar o projeto <b style={{ color: 'var(--dark)' }}>{projectToDelete.projeto.nome}</b>? Isso não pode ser desfeito.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-text" style={{ flex: 1 }} onClick={() => setProjectToDelete(null)} disabled={isDeleting}>Cancelar</button>
              <button className="btn-danger" style={{ flex: 1 }} onClick={confirmDeleteProject} disabled={isDeleting}>{isDeleting ? 'Apagando...' : 'Sim, Apagar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}