import { useEffect, useRef } from "react";

interface Props {
  onClose: () => void;
}

export default function GuestInfoModal({ onClose }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    btnRef.current?.focus();
  }, []);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box guest-modal">
        {/* Ícone */}
        <div className="guest-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            <path d="M17 11l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h2 id="guest-title">Modo Visitante</h2>

        <p className="guest-subtitle">
          Você está explorando o Bloquin sem uma conta.
        </p>

        <ul className="guest-list">
          <li>
            <span className="guest-icon-warn" aria-hidden="true">⚠</span>
            <span>
              <strong>Projetos não são salvos.</strong> Tudo que você criar será
              perdido ao fechar ou recarregar o aplicativo.
            </span>
          </li>
          <li>
            <span className="guest-icon-warn" aria-hidden="true">⚠</span>
            <span>
              <strong>Sem histórico.</strong> Não é possível recuperar trabalhos
              anteriores nesse modo.
            </span>
          </li>
          <li>
            <span className="guest-icon-ok" aria-hidden="true">✓</span>
            <span>
              Você pode programar, compilar e enviar código normalmente.
            </span>
          </li>
        </ul>

        <p className="guest-hint">
          Para salvar seus projetos,{" "}
          <button className="link-btn" onClick={onClose}>
            faça login ou crie uma conta
          </button>
          .
        </p>

        <button ref={btnRef} className="btn-primary" onClick={onClose}>
          Entendido, continuar como visitante
        </button>
      </div>
    </div>
  );
}