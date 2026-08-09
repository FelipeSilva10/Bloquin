import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import logoSimples from '../assets/LogoSimples.png';
import { BOARD_UNSET } from '../blockly/boards';
import { ProjectService } from '../services/projectService';
import { lockStudentScreen, unlockStudentScreen } from '../services/sessionService';
import { importProjectToAccount } from '../services/projectImportService';
import type { BloquinProjectFile } from '../types/project';
import { ProjectImportButton } from '../components/forms/ProjectImportButton';
import { BloquinSelect } from '../components/forms/BloquinSelect';
import { ProjectBoardBadge } from '../components/ProjectBoardBadge';
import { useModalA11y } from '../hooks/useModalA11y';
import ProjectModal from '../components/modals/ProjectModal';

interface TeacherDashboardProps {
  userId: string;
  onLogout: () => void;
  onOpenOwnProject: (projectId: string) => void;
  onInspectStudentProject: (projectId: string) => void;
  onOpenLibrary: () => void;
  onOpenComponents: () => void;
  onOpenSag: () => void;
}

interface Turma   { id: string; nome: string; ano_letivo: string; }
interface Aluno   { id: string; nome: string; }
interface Projeto { id: string; nome: string; descricao?: string; target_board?: string | null; updated_at: string; }

type Tab = 'turmas' | 'projetos';

function ProjectImportDialog({ file, classrooms, classroomId, importing, error, onClassroomChange, onCancel, onConfirm }: {
  file: BloquinProjectFile;
  classrooms: Turma[];
  classroomId: string;
  importing: boolean;
  error: string;
  onClassroomChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const modalRef = useModalA11y<HTMLDivElement>(onCancel);
  return (
    <div className="modal-overlay" onClick={(event) => { if (event.target === event.currentTarget && !importing) onCancel(); }}>
      <div ref={modalRef} className="modal-box project-import-dialog" role="dialog" aria-modal="true" aria-labelledby="teacher-import-project-title">
        <div className="project-import-icon" aria-hidden="true">↥</div>
        <h2 id="teacher-import-project-title">Importar “{file.project.name}”</h2>
        <p>Escolha em qual turma este projeto do professor será organizado.</p>
        <label className="form-label">Turma do projeto</label>
        <BloquinSelect
          label="Turma do projeto importado"
          value={classroomId}
          onChange={onClassroomChange}
          disabled={importing}
          required
          placeholder="Selecione a turma…"
          options={classrooms.map((classroom) => ({ value: classroom.id, label: `${classroom.nome} — ${classroom.ano_letivo}` }))}
        />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-text" onClick={onCancel} disabled={importing}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={onConfirm} disabled={importing || !classroomId}>{importing ? 'Importando…' : 'Importar projeto'}</button>
        </div>
      </div>
    </div>
  );
}

export function TeacherDashboard({ userId, onLogout, onOpenOwnProject, onInspectStudentProject, onOpenLibrary, onOpenComponents, onOpenSag }: TeacherDashboardProps) {
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
  const [newProjectTurmaId, setNewProjectTurmaId] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [pendingImport, setPendingImport] = useState<BloquinProjectFile | null>(null);
  const [importTurmaId, setImportTurmaId] = useState('');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const [projectToDelete, setProjectToDelete] = useState<{ projeto: Projeto; origin: 'own' | 'student' } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // ─── Novos Estados (Patch) ─────────────────────────────────────────────────
  const [lockedStudents, setLockedStudents] = useState<Set<string>>(new Set());
  const [selectedProject, setSelectedProject] = useState<Projeto | null>(null);

  // Compartilhamento
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [projectToShare, setProjectToShare] = useState<Projeto | null>(null);
  const [shareTargets, setShareTargets] = useState<string[]>([]);
  const [sharing, setSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [pageError, setPageError] = useState('');

  useEffect(() => { void fetchTurmas(); void fetchOwnProjects(); }, [userId]);

  const fetchTurmas = async () => {
    try {
      if (!userId) throw new Error('Sessão não encontrada.');
      const { data, error } = await supabase.from('turmas').select('id, nome, ano_letivo').eq('professor_id', userId).order('created_at', { ascending: false });
      if (error) throw error;
      setTurmas(data ?? []);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Não consegui carregar suas turmas.');
    } finally {
      setLoadingTurmas(false);
    }
  };

  const fetchOwnProjects = async () => {
    try {
      if (!userId) throw new Error('Sessão não encontrada.');
      const { data, error } = await supabase.from('projetos').select('id, nome, descricao, target_board, updated_at').eq('dono_id', userId).order('updated_at', { ascending: false });
      if (error) throw error;
      setOwnProjects(data ?? []);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Não consegui carregar seus projetos.');
    } finally {
      setLoadingProjects(false);
    }
  };

  const openTurmaManager = async (turma: Turma) => {
    setManagingTurma(turma);
    setAlunos([]);
    setViewingAlunoProjects(null);
    try {
      const { data, error } = await supabase.from('perfis').select('id, nome').eq('turma_id', turma.id).eq('role', 'student').order('nome');
      if (error) throw error;
      setAlunos(data ?? []);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Não consegui carregar os alunos desta turma.');
    }
  };

  const viewAlunoProjects = async (aluno: Aluno) => {
    if (!managingTurma) return;
    try {
      const { data, error } = await supabase
        .from('projetos')
        .select('id, nome, descricao, target_board, updated_at')
        .eq('dono_id', aluno.id)
        .eq('turma_id', managingTurma.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setViewingAlunoProjects({ aluno, projetos: data || [] });
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Não consegui carregar os projetos deste aluno.');
    }
  };

  // ─── Funções de Intervenção e Compartilhamento (Patch) ───────────────────
  const handleIntervention = async (studentId: string) => {
    try {
      const isLocked = lockedStudents.has(studentId);
      if (isLocked) {
        await unlockStudentScreen(studentId);
        setLockedStudents((prev) => { const next = new Set(prev); next.delete(studentId); return next; });
      } else {
        await lockStudentScreen(studentId, "Seu Professor");
        setLockedStudents((prev) => new Set([...prev, studentId]));
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Não consegui atualizar o estado da tela do aluno.');
    }
  };

  const handleShareProject = async () => {
    if (!projectToShare || !managingTurma || shareTargets.length === 0) return;
    setSharing(true);

    const targetIds = shareTargets.includes("all") ? alunos.map((s) => s.id) : shareTargets;
    if (targetIds.length === 0) {
      setPageError('Esta turma ainda não tem alunos para receber o projeto.');
      setSharing(false);
      return;
    }

    try {
      await ProjectService.shareProject(projectToShare.id, targetIds, managingTurma.id);
      setShareSuccess(true);
      setTimeout(() => {
        setShareSuccess(false);
        setShareModalOpen(false);
        setProjectToShare(null);
        setShareTargets([]);
      }, 1500);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Não consegui compartilhar o projeto.');
    } finally {
      setSharing(false);
    }
  };

  const openShareModal = (targets: string[]) => {
    setShareTargets(targets);
    setProjectToShare(null);
    setShareSuccess(false);
    setPageError('');
    setShareModalOpen(true);
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
    if (!newProjectName.trim() || !newProjectTurmaId || isCreating) return;
    const selectedTurma = turmas.find((turma) => turma.id === newProjectTurmaId);
    if (!selectedTurma) {
      setCreateError('Selecione uma das suas turmas para criar o projeto.');
      return;
    }
    setIsCreating(true);
    setCreateError('');

    try {
      if (!userId) throw new Error('Sessão não encontrada.');

      const { data, error } = await supabase
        .from('projetos')
        .insert([{
          dono_id: userId,
          turma_id: selectedTurma.id,
          nome: newProjectName.trim(),
          target_board: BOARD_UNSET,
          tipo: 'template_professor',
        }])
        .select('id, nome, descricao, target_board, updated_at')
        .single();

      if (error) throw error;
      if (!data) throw new Error('O projeto não foi criado.');
      setOwnProjects(prev => [data, ...prev]);
      closeCreateModal();
      onOpenOwnProject(data.id);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Não consegui criar o projeto.');
    } finally {
      setIsCreating(false);
    }
  };

  const prepareProjectImport = (file: BloquinProjectFile) => {
    if (turmas.length === 0) {
      setImportError('Você precisa estar vinculado a uma turma antes de importar um projeto.');
      return;
    }
    setImportError('');
    setImportSuccess('');
    setImportTurmaId(turmas.length === 1 ? turmas[0].id : '');
    setPendingImport(file);
  };

  const confirmProjectImport = async () => {
    if (!pendingImport || !importTurmaId || isImporting) return;
    const selectedTurma = turmas.find((turma) => turma.id === importTurmaId);
    if (!selectedTurma) {
      setImportError('Selecione uma das suas turmas.');
      return;
    }
    setIsImporting(true);
    setImportError('');
    try {
      const imported = await importProjectToAccount({
        file: pendingImport,
        userId,
        classroomId: selectedTurma.id,
        existingNames: ownProjects.map((project) => project.nome),
        role: 'teacher',
      });
      setOwnProjects((current) => current.some((project) => project.id === imported.id)
        ? current
        : [imported, ...current]);
      setPendingImport(null);
      setImportTurmaId('');
      setImportSuccess(`“${imported.nome}” foi importado para sua conta.`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Não consegui importar o projeto.');
    } finally {
      setIsImporting(false);
    }
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete || isDeleting) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
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
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Não consegui excluir o projeto.');
    } finally {
      setIsDeleting(false);
    }
  };

  const closeCreateModal = () => {
    setShowNewProjectModal(false);
    setNewProjectName('');
    setNewProjectTurmaId('');
    setCreateError('');
  };

  const openCreateModal = () => {
    if (turmas.length === 0) {
      setPageError('Você precisa estar vinculado a uma turma antes de criar um projeto.');
      return;
    }
    setNewProjectTurmaId(turmas.length === 1 ? turmas[0].id : '');
    setShowNewProjectModal(true);
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
    <div style={{ minHeight: '100%', backgroundColor: 'var(--background)', padding: '20px' }}>

      {pageError && (
        <div className="dashboard-feedback dashboard-feedback-error" role="alert">
          <span>{pageError}</span>
          <button type="button" aria-label="Fechar mensagem" onClick={() => setPageError('')}>×</button>
        </div>
      )}

      {/* TOPBAR */}
      <header className="dashboard-topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', backgroundColor: 'var(--white)', padding: '15px 25px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)' }}>
        <div className="dashboard-topbar-brand" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <img src={logoSimples} alt="bloquin" style={{ height: '40px' }} />
          <h1 style={{ color: 'var(--dark)', fontSize: '1.5rem', fontWeight: 900 }}>Painel do Professor</h1>
        </div>

        <div className="dashboard-topbar-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button className="btn-secondary dashboard-library-button" onClick={onOpenLibrary}>📚 Biblioteca</button>
          <button className="btn-secondary" onClick={onOpenComponents}>⚙️ Componentes</button>
          <button
            type="button"
            className="btn-secondary"
            onClick={onOpenSag}
            aria-label="Abrir SAG em uma aba interna"
          >
            SAG
          </button>
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
                    <div key={turma.id} role="button" tabIndex={0} onClick={() => openTurmaManager(turma)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openTurmaManager(turma); } }} style={{ backgroundColor: 'var(--white)', padding: '25px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)', borderTop: '5px solid var(--primary)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px', transition: 'transform 0.1s' }}>
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
                  onClick={() => openShareModal(['all'])}
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
                          <button className="btn-outline" style={{ flex: 1, padding: '8px' }} onClick={() => openShareModal([aluno.id])}>
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
                        <button type="button" className="btn-icon" aria-label={`Editar informações de ${proj.nome}`} onClick={() => setSelectedProject(proj)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✏️</button>
                      </div>
                      
                      {proj.descricao && <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>{proj.descricao}</p>}
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '7px', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
                        <span>Salvo em: {new Date(proj.updated_at).toLocaleDateString('pt-BR')}</span>
                        <ProjectBoardBadge board={proj.target_board} />
                      </div>
                      
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
          <div className="dashboard-project-actions">
            <button className="btn-primary" style={{ padding: '12px 25px', fontSize: '1.1rem' }} onClick={openCreateModal} disabled={loadingTurmas}>
              {loadingTurmas ? 'Carregando turmas…' : '+ Novo Projeto'}
            </button>
            <ProjectImportButton
              onSelected={prepareProjectImport}
              onError={(message) => { setImportError(message); if (message) setImportSuccess(''); }}
              disabled={loadingTurmas || loadingProjects || isImporting}
            />
          </div>
          {importError && !pendingImport && <div className="dashboard-feedback dashboard-feedback-error" role="alert"><span>{importError}</span><button type="button" aria-label="Fechar mensagem" onClick={() => setImportError('')}>×</button></div>}
          {importSuccess && <div className="dashboard-feedback dashboard-feedback-success" role="status"><span>{importSuccess}</span><button type="button" aria-label="Fechar mensagem" onClick={() => setImportSuccess('')}>×</button></div>}
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
                    <button type="button" className="btn-icon" aria-label={`Editar informações de ${proj.nome}`} onClick={() => setSelectedProject(proj)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✏️</button>
                  </div>
                  
                  {proj.descricao && <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '10px', fontStyle: 'italic' }}>{proj.descricao}</p>}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '7px', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px', fontWeight: 600 }}>
                    <span>Salvo em: {new Date(proj.updated_at).toLocaleDateString('pt-BR')}</span>
                    <ProjectBoardBadge board={proj.target_board} />
                  </div>
                  
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
          <div role="dialog" aria-modal="true" aria-labelledby="share-project-title" style={{ backgroundColor: 'var(--white)', padding: '30px', borderRadius: '24px', width: '90%', maxWidth: '450px', boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 id="share-project-title" style={{ color: 'var(--dark)', fontWeight: 900, margin: 0 }}>Compartilhar Projeto</h2>
            <p style={{ color: 'var(--text-muted)', fontWeight: 600, margin: 0, fontSize: '0.95rem' }}>
              Cada aluno receberá uma cópia independente no seu painel.
            </p>

            <div>
              <label style={{ display: 'block', fontWeight: 700, color: 'var(--dark)', marginBottom: '6px', fontSize: '0.9rem' }}>Qual projeto você quer enviar?</label>
              <BloquinSelect
                label="Qual projeto você quer enviar?"
                value={projectToShare?.id ?? ""}
                onChange={(value) => setProjectToShare(ownProjects.find((project) => project.id === value) ?? null)}
                placeholder="Selecione um dos seus projetos…"
                options={ownProjects.map((project) => ({ value: project.id, label: project.nome }))}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button type="button" className="btn-text" style={{ flex: 1 }} onClick={() => { setShareModalOpen(false); setProjectToShare(null); setShareTargets([]); }}>Cancelar</button>
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
            board: selectedProject.target_board
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
          <form role="dialog" aria-modal="true" aria-labelledby="teacher-new-project-title" onSubmit={handleCreateProject} style={{ backgroundColor: 'var(--white)', padding: '30px', borderRadius: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: 'var(--shadow-xl)' }}>
            <h2 id="teacher-new-project-title" style={{ color: 'var(--dark)', marginBottom: '10px', fontWeight: 900 }}>Novo Projeto</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontWeight: 600 }}>Dê um nome para o seu projeto:</p>
            <input type="text" placeholder="Ex: Demo Sensor Ultrassônico" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} disabled={isCreating} style={{ width: '100%', padding: '15px', borderRadius: '12px', border: '2px solid var(--border)', fontSize: '1.1rem', marginBottom: '12px', fontWeight: 700 }} autoFocus />
            <label htmlFor="teacher-project-class" style={{ display: 'block', textAlign: 'left', color: 'var(--dark)', fontWeight: 800, marginBottom: '6px' }}>
              Turma do projeto
            </label>
            <BloquinSelect
              id="teacher-project-class"
              label="Turma do projeto"
              value={newProjectTurmaId}
              onChange={setNewProjectTurmaId}
              disabled={isCreating}
              required
              placeholder="Selecione a turma…"
              className="dashboard-modal-select"
              options={turmas.map((turma) => ({ value: turma.id, label: `${turma.nome} — ${turma.ano_letivo}` }))}
            />
            {createError && <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.95rem', marginBottom: '12px', textAlign: 'left', fontWeight: 700 }}>Erro: {createError}</p>}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="btn-text" style={{ flex: 1 }} onClick={closeCreateModal} disabled={isCreating}>Cancelar</button>
              <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={isCreating || !newProjectName.trim() || !newProjectTurmaId}>{isCreating ? 'Criando...' : 'Criar e Abrir'}</button>
            </div>
          </form>
        </div>
      )}

      {pendingImport && (
        <ProjectImportDialog
          file={pendingImport}
          classrooms={turmas}
          classroomId={importTurmaId}
          importing={isImporting}
          error={importError}
          onClassroomChange={(value) => { setImportTurmaId(value); setImportError(''); }}
          onCancel={() => { if (!isImporting) { setPendingImport(null); setImportTurmaId(''); setImportError(''); } }}
          onConfirm={() => void confirmProjectImport()}
        />
      )}

      {/* MODAL: EXCLUIR PROJETO */}
      {projectToDelete && (
        <div className="modal-overlay">
          <div role="alertdialog" aria-modal="true" aria-labelledby="teacher-delete-title" style={{ backgroundColor: 'var(--white)', padding: '35px', borderRadius: '24px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: 'var(--shadow-xl)' }}>
            <h2 id="teacher-delete-title" style={{ color: 'var(--dark)', marginBottom: '10px', fontWeight: 900 }}>Atenção!</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '25px', fontSize: '1.1rem', fontWeight: 600 }}>Tem certeza que deseja apagar o projeto <b style={{ color: 'var(--dark)' }}>{projectToDelete.projeto.nome}</b>? Isso não pode ser desfeito.</p>
            {deleteError && <p role="alert" className="form-error">{deleteError}</p>}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="btn-text" style={{ flex: 1 }} onClick={() => { setDeleteError(''); setProjectToDelete(null); }} disabled={isDeleting}>Cancelar</button>
              <button type="button" className="btn-danger" style={{ flex: 1 }} onClick={confirmDeleteProject} disabled={isDeleting}>{isDeleting ? 'Apagando...' : 'Sim, Apagar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
