import { useState } from 'react';
import { useModalA11y } from '../../hooks/useModalA11y';

export type FriendlyError = { emoji: string; title: string; message: string; tip: string; rawError: string };

export function getFriendlyError(raw: string): FriendlyError {
  const e = raw.toLowerCase();
  const base = { rawError: raw };
  if (e.includes('falha ao baixar') || e.includes('curl') || e.includes('plano b')) return { ...base, emoji: '🌐', title: 'Problema na Internet!', message: 'Não consegui baixar as ferramentas necessárias.', tip: 'Dica: Verifique a conexão com a internet e tente novamente.' };
  if (e.includes('update-index') || e.includes('erro ao instalar core')) return { ...base, emoji: '📦', title: 'Faltam os pacotes da placa!', message: 'O computador precisa baixar informações da placa, mas a internet falhou.', tip: 'Dica: Verifique a conexão. Essa etapa só acontece uma vez!' };
  if (e.includes('esp32') || e.includes('espressif')) return { ...base, emoji: '🛠️', title: 'Erro ao configurar a placa ESP32!', message: 'Ocorreu um problema ao adicionar as configurações da placa ESP32.', tip: 'Dica: Chame o professor!' };
  if (e.includes('busy') || e.includes('acesso negado') || e.includes('permission denied')) return { ...base, emoji: '🚧', title: 'A porta USB está ocupada!', message: 'Outro programa está usando esta porta.', tip: 'Dica: Feche o Monitor clicando em "🛑 Parar" ou reconecte o cabo USB!' };
  if (e.includes('nenhuma porta') || e.includes('selecione uma porta')) return { ...base, emoji: '🔌', title: 'Escolha uma porta USB', message: 'Preciso saber em qual porta o robô está conectado.', tip: 'Dica: selecione uma porta na barra da IDE e tente novamente.' };
  if (e.includes('envio em andamento')) return { ...base, emoji: '⏳', title: 'Envio já em andamento', message: 'O código anterior ainda está sendo enviado para a placa.', tip: 'Dica: aguarde alguns segundos antes de tentar novamente.' };
  if (e.includes('could not open port') || e.includes('não foi possível abrir') || e.includes('no such file')) return { ...base, emoji: '🔌', title: 'Cabo USB não encontrado!', message: 'O computador não conseguiu encontrar o Arduino.', tip: 'Dica: Verifique o cabo USB e clique em 🔄 para atualizar as portas!' };
  if (e.includes('erro no código') || e.includes('error:') || e.includes('syntax error')) return { ...base, emoji: '🧩', title: 'Hmm… algo está errado nas peças!', message: 'O código gerado pelos blocos tem um probleminha.', tip: 'Dica: Tente remover a última peça que você colocou e montar de novo.' };
  if (e.includes('avrdude') || e.includes('not in sync')) return { ...base, emoji: '😵', title: 'Não consegui falar com o Arduino!', message: 'A placa não respondeu.', tip: 'Dica: Verifique se você escolheu a placa certa!' };
  if (e.includes('timeout') || e.includes('timed out')) return { ...base, emoji: '⏰', title: 'Demorou demais…', message: 'O Arduino não respondeu a tempo.', tip: 'Dica: Desconecte e reconecte o cabo USB e tente novamente!' };
  return { ...base, emoji: '😕', title: 'Algo deu errado por aqui...', message: 'Ocorreu um erro inesperado.', tip: 'Dica: Tente de novo. Se continuar, chame o professor!' };
}

interface ErrorModalProps {
  error: FriendlyError;
  onClose: () => void;
}

export function ErrorModal({ error, onClose }: ErrorModalProps) {
  const [showTechDetails, setShowTechDetails] = useState(false);
  const modalRef = useModalA11y<HTMLDivElement>(onClose);

  return (
    <div className="modal-overlay error-overlay">
      <div ref={modalRef} className="friendly-error-modal" role="alertdialog" aria-modal="true" aria-labelledby="friendly-error-title" aria-describedby="friendly-error-message">
        <div className="friendly-error-icon">{error.emoji}</div>
        <h2 id="friendly-error-title">{error.title}</h2>
        <p id="friendly-error-message" className="friendly-error-message" role="alert">{error.message}</p>
        <div className="friendly-error-tip"><span>💡</span><span>{error.tip}</span></div>
        <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '10px' }}>
          <button type="button" className="btn-primary" style={{ flex: 1 }} onClick={onClose}>Entendi, vou tentar!</button>
        </div>
        <div className="tech-details-wrap">
          <button type="button" className="tech-details-btn" aria-expanded={showTechDetails} onClick={() => setShowTechDetails(!showTechDetails)}>
            {showTechDetails ? 'Ocultar detalhes técnicos' : '🛠️ Ver detalhes técnicos (Professor)'}
          </button>
          {showTechDetails && <pre className="tech-details-pre">{error.rawError}</pre>}
        </div>
      </div>
    </div>
  );
}
