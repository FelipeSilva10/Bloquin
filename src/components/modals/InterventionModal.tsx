// src/components/modals/InterventionModal.tsx
// Exibido na tela do aluno enquanto o professor está visualizando/editando a conta.
// Bloqueia completamente a interface para evitar edição concorrente.

interface Props {
  teacherName?: string;
}

export default function InterventionModal({ teacherName }: Props) {
  return (
    <div
      className="modal-overlay intervention-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-label="Intervenção do professor"
      // Sem onClick para fechar — só o professor pode desbloquear
    >
      <div className="modal-box intervention-modal">
        <div className="intervention-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path
              d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2>Aguarde</h2>

        <p>
          {teacherName ? (
            <>
              O professor <strong>{teacherName}</strong> está verificando seu
              projeto no momento.
            </>
          ) : (
            <>O professor está verificando seu projeto no momento.</>
          )}
        </p>

        <p className="intervention-sub">
          Sua tela ficará bloqueada até que o professor conclua a revisão.
        </p>

        <div className="intervention-spinner" aria-hidden="true">
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}
