import { useEffect, useRef } from 'react';

export interface SerialMessage {
  text: string;
  ts: number;
}

interface SerialMonitorProps {
  isOpen: boolean;
  messages: SerialMessage[];
  onClose: () => void;
  onClear: () => void;
  isCodeOpen: boolean; // 1. NOVA PROPRIEDADE AQUI
}

export function SerialMonitor({ isOpen, messages, onClose, onClear, isCodeOpen }: SerialMonitorProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  return (
    <section className={`serial-monitor ${isCodeOpen ? 'shifted' : ''}`} aria-label="Monitor serial">
      <div className="serial-monitor-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="serial-status-dot" />
          <span>Robô conectado</span>
        </div>
        <button type="button" className="serial-close-btn" aria-label="Fechar monitor serial" onClick={onClose}>✕</button>
      </div>
      <div className="serial-monitor-body">
        {messages.length === 0 ? (
          <div className="serial-empty">
            <span>📡</span>
            <p>Aguardando o robô falar…</p>
            <small>As mensagens do robô aparecerão aqui!</small>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className="serial-message">
              <span className="serial-timestamp">
                {new Date(msg.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="serial-text">{msg.text}</span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="serial-monitor-footer">
        <button type="button" className="serial-clear-btn" onClick={onClear}>Limpar</button>
        <span>{messages.length} mensagens</span>
      </div>
    </section>
  );
}
