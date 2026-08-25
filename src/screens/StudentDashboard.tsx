// src/screens/StudentDashboard.tsx
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import logoSimples from '../assets/LogoSimples.png';
import { BOARD_UNSET } from '../blockly/boards';
import { ProjectService } from '../services/projectService';
import { importProjectToAccount } from '../services/projectImportService';
import type { BloquinProjectFile } from '../types/project';
import { ProjectImportButton } from '../components/forms/ProjectImportButton';
import { ProjectBoardBadge } from '../components/ProjectBoardBadge';
import ProjectModal from "../components/modals/ProjectModal";
import TutorialModal from '../components/modals/TutorialModal';

interface StudentDashboardProps {
  userId: string;
  onLogout: () => void;
  onOpenIde: (projectId: string) => void;
  onOpenLibrary: () => void;
  onOpenComponents: () => void;
}

export interface Projeto {
  id: string;
  nome: string;
  descricao?: string;
  target_board?: string | null;
  updated_at: string;
}

export function StudentDashboard({ userId, onLogout, onOpenIde, onOpenLibrary, onOpenComponents }: StudentDashboardProps) {
  const [projects, setProjects] = useState<Projeto[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // Modal de criação
  const [showModal, setShowModal]         = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [createError, setCreateError]     = useState('');
  const [isCreating, setIsCreating]       = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  // Modal de exclusão
  const [projectToDelete, setProjectToDelete] = useState<Projeto | null>(null);
  const [isDeleting, setIsDeleting]           = useState(false);

  // Modal de detalhes / edição de meta
  const [selectedProject, setSelectedProject] = useState<Projeto | null>(null);

  // Guia rápido (Tutorial)
  const [showTutorial, setShowTutorial] = useState(false);

  // ─── Carrega projetos ──────────────────────────────────────────────────────
  const fetchProjects = async () => {
    try {
      if (!userId) throw new Error('Usuário não encontrado.');

      const { data, error } = await supabase
        .from('projetos')
        .select('id, nome, descricao, target_board, updated_at')
        .eq('dono_id', userId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setProjects(data ?? []);
    } catch (error) {
      console.error('Erro ao carregar projetos:', error);
      setLoadError('Não consegui carregar seus projetos. Verifique a conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchProjects(); }, [userId]);

  // Mantém o painel atualizado enquanto o professor compartilha um projeto.
  // O carregamento inicial continua sendo a fonte de verdade; o canal apenas
  // evita que o aluno precise atualizar a página para enxergar a nova cópia.
  useEffect(() => {
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribeToProjects = async () => {
      if (!userId || disposed) return;

      channel = supabase
        .channel(`student-projects:${userId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'projetos', filter: `dono_id=eq.${userId}` },
          (payload) => {
            const nextProject = payload.new as Projeto & { dono_id?: string };
            const projectId = (payload.old as { id?: string }).id ?? nextProject.id;

            if (payload.eventType === 'INSERT' && nextProject.dono_id === userId) {
              setProjects((current) => current.some((project) => project.id === nextProject.id)
                ? current
                : [nextProject, ...current]);
            } else if (payload.eventType === 'UPDATE' && nextProject.dono_id === userId) {
              setProjects((current) => current.map((project) => (
                project.id === nextProject.id ? { ...project, ...nextProject } : project
              )));
            } else if (payload.eventType === 'DELETE') {
              setProjects((current) => current.filter((project) => project.id !== projectId));
            }
          },
        )
        .subscribe();
    };

    void subscribeToProjects();
    return () => {
      disposed = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId]);

  // ─── Ações ────────────────────────────────────────────────────────────────
  const handleSaveProjectMeta = async (id: string, nome: string, descricao: string) => {
    await ProjectService.updateProjectMeta(id, nome, descricao);
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, nome, descricao } : p))
    );
  };

  const handleCreateProject = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newProjectName.trim() || isCreating) return;

    setIsCreating(true);
    setCreateError('');

    try {
      if (!userId) throw new Error('Sessão não encontrada.');

      const { data: perfil, error: profileError } = await supabase
        .from('perfis').select('turma_id').eq('id', userId).single();
      if (profileError) throw profileError;
      if (!perfil?.turma_id) throw new Error('Seu perfil não está vinculado a uma turma. Fale com o professor.');

      const { data, error } = await supabase
        .from('projetos')
        .insert([{ dono_id: userId, turma_id: perfil.turma_id, nome: newProjectName.trim(), target_board: BOARD_UNSET }])
        .select('id, nome, descricao, target_board, updated_at')
        .single();
      if (error || !data) throw error ?? new Error('Projeto não foi criado.');
      setProjects((prev) => [data, ...prev]);
      closeCreateModal();
      onOpenIde(data.id);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Não consegui criar o projeto.');
    } finally {
      setIsCreating(false);
    }
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete || isDeleting) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await ProjectService.deleteProject(projectToDelete.id);
      setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id));
      setProjectToDelete(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Não consegui excluir o projeto.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImportProject = async (file: BloquinProjectFile) => {
    if (isImporting) return;
    setIsImporting(true);
    setImportError('');
    setImportSuccess('');
    try {
      const { data: profile, error: profileError } = await supabase
        .from('perfis')
        .select('turma_id')
        .eq('id', userId)
        .single();
      if (profileError) throw profileError;
      if (!profile?.turma_id) throw new Error('Seu perfil não está vinculado a uma turma. Fale com o professor.');

      const imported = await importProjectToAccount({
        file,
        userId,
        classroomId: profile.turma_id,
        existingNames: projects.map((project) => project.nome),
        role: 'student',
      });
      setProjects((current) => current.some((project) => project.id === imported.id)
        ? current
        : [imported, ...current]);
      setImportSuccess(`“${imported.nome}” foi importado para sua conta.`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Não consegui importar o projeto.');
    } finally {
      setIsImporting(false);
    }
  };

  const closeCreateModal = () => {
    setShowModal(false);
    setNewProjectName('');
    setCreateError('');
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100%', backgroundColor: 'var(--background)', padding: '20px' }}>

      {/* TOPBAR */}
      <header className="dashboard-topbar" style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '30px', backgroundColor: 'var(--white)',
        padding: '15px 25px', borderRadius: '16px', boxShadow: 'var(--shadow-sm)',
      }}>
        <div className="dashboard-topbar-brand" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <img src={logoSimples} alt="bloquin" style={{ height: '40px' }} />
          <h1 style={{ color: 'var(--dark)', fontSize: '1.5rem', fontWeight: 900 }}>
            Meus Projetos
          </h1>
        </div>
        <div className="dashboard-topbar-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="btn-secondary dashboard-library-button" onClick={onOpenLibrary}>Biblioteca</button>
          <button className="btn-secondary" onClick={onOpenComponents}>Componentes</button>
          <button className="btn-secondary" onClick={() => setShowTutorial(true)}>Tutorial</button>
          <button className="btn-outline" onClick={onLogout} style={{ padding: '10px 20px' }}>Sair</button>
        </div>
      </header>

      {/* CONTROLES */}
      <div className="dashboard-project-actions">
        <button type="button" className="btn-primary" onClick={() => setShowModal(true)}>
          <Plus aria-hidden="true" /> Novo Projeto
        </button>
        <ProjectImportButton
          onSelected={handleImportProject}
          onError={(message) => { setImportError(message); if (message) setImportSuccess(''); }}
          disabled={isImporting || loading || Boolean(loadError)}
        />
      </div>

      {importError && <div className="dashboard-feedback dashboard-feedback-error" role="alert"><span>{importError}</span><button type="button" aria-label="Fechar mensagem" onClick={() => setImportError('')}>×</button></div>}
      {importSuccess && <div className="dashboard-feedback dashboard-feedback-success" role="status"><span>{importSuccess}</span><button type="button" aria-label="Fechar mensagem" onClick={() => setImportSuccess('')}>×</button></div>}

      {/* LISTA DE PROJETOS */}
      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 700 }}>
          Carregando seus projetos...
        </p>
      ) : loadError ? (
        <div className="empty-state-panel" role="alert">
          <p>{loadError}</p>
          <button type="button" className="btn-secondary" onClick={() => { setLoading(true); setLoadError(''); void fetchProjects(); }}>Tentar novamente</button>
        </div>
      ) : projects.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--white)', padding: '40px', borderRadius: '16px',
          textAlign: 'center', boxShadow: 'var(--shadow-sm)',
        }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', fontWeight: 700 }}>
            Você ainda não tem projetos. Clique em Novo Projeto para começar!
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px',
        }}>
          {projects.map((proj) => (
            <div
              key={proj.id}
              style={{
                backgroundColor: 'var(--white)', padding: '25px',
                borderRadius: '16px', boxShadow: 'var(--shadow-sm)',
                borderTop: '5px solid var(--secondary)',
                display: 'flex', flexDirection: 'column',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ color: 'var(--dark)', marginBottom: '5px', fontSize: '1.4rem', fontWeight: 800 }}>
                  {proj.nome}
                </h3>
                <button
                  className="btn-icon"
                  type="button"
                  onClick={() => setSelectedProject(proj)}
                  title="Editar informações do projeto"
                  aria-label={`Editar informações de ${proj.nome}`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}
                >
                  ✏️
                </button>
              </div>

              {proj.descricao && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '10px', fontStyle: 'italic' }}>
                  {proj.descricao}
                </p>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '7px', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px', fontWeight: 600 }}>
                <span>Salvo em: {new Date(proj.updated_at).toLocaleDateString('pt-BR')}</span>
                <ProjectBoardBadge board={proj.target_board} />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: 'auto' }}>
                <button
                  className="btn-secondary"
                  style={{ flex: 1, padding: '10px' }}
                  onClick={() => onOpenIde(proj.id)}
                >
                  Abrir Código
                </button>
                <button
                  className="btn-outline"
                  style={{ padding: '10px 15px' }}
                  onClick={() => setProjectToDelete(proj)}
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: CRIAR PROJETO */}
      {showModal && (
        <div className="modal-overlay">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-project-title"
            onSubmit={handleCreateProject}
            style={{
              backgroundColor: 'var(--white)', padding: '30px',
              borderRadius: '24px', width: '90%', maxWidth: '400px',
              textAlign: 'center', boxShadow: 'var(--shadow-xl)',
            }}
          >
            <h2 id="new-project-title" style={{ color: 'var(--dark)', marginBottom: '10px', fontWeight: 900 }}>
              Novo Projeto
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontWeight: 600 }}>
              Dê um nome bem legal para a sua invenção:
            </p>

            <input
              type="text"
              placeholder="Ex: Robô Dançarino"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              disabled={isCreating}
              style={{
                width: '100%', padding: '15px', borderRadius: '12px',
                border: '2px solid var(--border)', fontSize: '1.1rem',
                marginBottom: '12px', fontWeight: 700,
              }}
              autoFocus
            />

            {createError && (
              <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.9rem', marginBottom: '12px', fontWeight: 700 }}>
                {createError}
              </p>
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
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-project-title" style={{
            backgroundColor: 'var(--white)', padding: '35px',
            borderRadius: '24px', width: '90%', maxWidth: '400px',
            textAlign: 'center', boxShadow: 'var(--shadow-xl)',
          }}>
            <h2 id="delete-project-title" style={{ color: 'var(--dark)', marginBottom: '10px', fontWeight: 900 }}>
              Atenção!
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '25px', fontSize: '1.1rem', fontWeight: 600 }}>
              Tem certeza que deseja apagar o projeto{' '}
              <b style={{ color: 'var(--dark)' }}>{projectToDelete.nome}</b>?
              {' '}Isso não pode ser desfeito.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              {deleteError && <p role="alert" className="form-error">{deleteError}</p>}
              <button type="button" className="btn-text" style={{ flex: 1 }} onClick={() => { setDeleteError(''); setProjectToDelete(null); }} disabled={isDeleting}>
                Cancelar
              </button>
              <button type="button" className="btn-danger" style={{ flex: 1 }} onClick={confirmDeleteProject} disabled={isDeleting}>
                {isDeleting ? 'Apagando...' : 'Sim, Apagar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DETALHES DO PROJETO */}
      {selectedProject && (
        <ProjectModal
          project={{
            id: selectedProject.id,
            name: selectedProject.nome,
            description: selectedProject.descricao || '',
            board: selectedProject.target_board,
          }}
          onSave={handleSaveProjectMeta}
          onOpen={(proj) => {
            setSelectedProject(null);
            onOpenIde(proj.id);
          }}
          onClose={() => setSelectedProject(null)}
        />
      )}

      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}

    </div>
  );
}
