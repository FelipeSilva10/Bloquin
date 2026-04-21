// src/components/modals/ProjectModal.tsx
// Modal de detalhes de projeto: nome, descrição, metadados.
// Usado no StudentDashboard e TeacherDashboard.

import { useState, useEffect } from "react";

export interface Project {
  id: string;
  name: string;
  description?: string;
  board?: string;
  created_at?: string;
  updated_at?: string;
  owner_name?: string; // preenchido pelo professor ao ver projetos de alunos
}

interface Props {
  project: Project;
  readOnly?: boolean;           // professor visualizando projeto de aluno sem permissão de edição
  onSave: (id: string, name: string, description: string) => Promise<void>;
  onOpen: (project: Project) => void;
  onDelete?: (project: Project) => void;
  onClose: () => void;
}

export default function ProjectModal({
  project,
  readOnly = false,
  onSave,
  onOpen,
  onDelete,
  onClose,
}: Props) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset ao trocar de projeto
  useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? "");
    setError("");
    setConfirmDelete(false);
  }, [project.id]);

  const isDirty = name !== project.name || description !== (project.description ?? "");

  async function handleSave() {
    if (!name.trim()) {
      setError("O nome do projeto não pode ser vazio.");
      return;
    }
    setSaving(true);
    try {
      await onSave(project.id, name.trim(), description.trim());
      onClose();
    } catch {
      setError("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  function formatDate(iso?: string) {
    if (!iso) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  }

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proj-modal-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box project-modal">
        <button className="modal-close-btn" aria-label="Fechar" onClick={onClose}>
          ✕
        </button>

        <h2 id="proj-modal-title" className="project-modal-title">
          {readOnly ? "Detalhes do Projeto" : "Editar Projeto"}
        </h2>

        {project.owner_name && (
          <p className="project-owner-badge">
            👤 {project.owner_name}
          </p>
        )}

        {/* Nome */}
        <label className="form-label" htmlFor="proj-name">
          Nome
        </label>
        <input
          id="proj-name"
          className="form-input"
          value={name}
          disabled={readOnly}
          maxLength={80}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => e.key === "Enter" && !readOnly && handleSave()}
        />

        {/* Descrição */}
        <label className="form-label" htmlFor="proj-desc">
          Descrição <span className="optional">(opcional)</span>
        </label>
        <textarea
          id="proj-desc"
          className="form-textarea"
          value={description}
          disabled={readOnly}
          placeholder="Do que se trata esse projeto? Ex: Acende LED ao pressionar botão."
          maxLength={300}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
        />
        <p className="char-count">{description.length}/300</p>

        {/* Metadados */}
        <div className="project-meta">
          {project.board && (
            <span className="meta-chip">🔌 {project.board}</span>
          )}
          {project.created_at && (
            <span className="meta-chip">
              Criado em {formatDate(project.created_at)}
            </span>
          )}
          {project.updated_at && (
            <span className="meta-chip">
              Editado em {formatDate(project.updated_at)}
            </span>
          )}
        </div>

        {error && <p className="form-error">{error}</p>}

        {/* Ações */}
        <div className="modal-actions">
          {/* Deletar */}
          {onDelete && !readOnly && (
            <div className="delete-zone">
              {confirmDelete ? (
                <>
                  <span className="delete-confirm-text">Confirmar exclusão?</span>
                  <button
                    className="btn-danger"
                    onClick={() => {
                      onDelete(project);
                      onClose();
                    }}
                  >
                    Sim, excluir
                  </button>
                  <button className="btn-ghost" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  className="btn-ghost danger-ghost"
                  onClick={() => setConfirmDelete(true)}
                >
                  🗑 Excluir projeto
                </button>
              )}
            </div>
          )}

          <div className="main-actions">
            <button className="btn-ghost" onClick={onClose}>
              {readOnly ? "Fechar" : "Cancelar"}
            </button>
            {!readOnly && (
              <button
                className="btn-secondary"
                onClick={handleSave}
                disabled={saving || !isDirty}
              >
                {saving ? "Salvando…" : "Salvar"}
              </button>
            )}
            <button className="btn-primary" onClick={() => onOpen(project)}>
              Abrir na IDE →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
