import { ArrowLeft } from 'lucide-react';
import './EntryBackButton.css';

interface EntryBackButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}

export function EntryBackButton({ onClick, disabled = false, className = '' }: EntryBackButtonProps) {
  return (
    <button
      type="button"
      className={`entry-back-button${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label="Voltar para a tela inicial"
      title="Voltar para a tela inicial"
    >
      <ArrowLeft aria-hidden="true" />
      <span>Voltar</span>
    </button>
  );
}
