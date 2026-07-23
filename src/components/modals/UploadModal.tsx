export type UploadStage = 'validating' | 'compiling' | 'sending' | 'success';

export const UPLOAD_STAGES: { id: UploadStage; label: string; emoji: string; tip: string }[] = [
  { id: 'validating', label: 'Verificando as peças…',  emoji: '🔍', tip: 'Checando se tudo está no lugar certo!' },
  { id: 'compiling',  label: 'Compilando o código…',   emoji: '⚙️', tip: 'Transformando os blocos em linguagem de robô!' },
  { id: 'sending',    label: 'Enviando para o robô…',  emoji: '📡', tip: 'O código está viajando pelo cabo USB agora!' },
  { id: 'success',    label: 'Robô pronto para agir!', emoji: '🤖', tip: 'Seu robô já está executando as instruções!' },
];

interface UploadModalProps {
  stage: UploadStage;
  onClose: () => void;
}

export function UploadModal({ stage, onClose }: UploadModalProps) {
  const stageIndex = UPLOAD_STAGES.findIndex(s => s.id === stage);
  const currentStageData = UPLOAD_STAGES.find(s => s.id === stage);
  const modalRef = useModalA11y<HTMLDivElement>(stage === 'success' ? onClose : () => undefined);
  const progressStageIndex = Math.min(stageIndex, UPLOAD_STAGES.length - 2);

  return (
    <div className="modal-overlay">
      <div ref={modalRef} className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-modal-title" aria-live="polite">
        {stage === 'success' ? (
          <div className="upload-success-content">
            <div className="success-robot">🤖</div>
            <h2 id="upload-modal-title">Robô pronto!</h2>
            <p>O seu robô já está executando as novas instruções. Ele aprendeu tudo que você ensinou!</p>
            <button className="btn-primary upload-close-btn" onClick={onClose}>🎉 Continuar programando!</button>
          </div>
        ) : (
          <>
            <div className="upload-rocket-wrap"><span>{currentStageData?.emoji}</span></div>
            <h2 id="upload-modal-title" className="upload-stage-label">{currentStageData?.label}</h2>
            <p className="upload-stage-tip">{currentStageData?.tip}</p>
            <div className="upload-progress-bar-track">
              <div className="upload-progress-bar-fill" style={{ width: `${((progressStageIndex + 1) / (UPLOAD_STAGES.length - 1)) * 100}%` }} />
            </div>
            <div className="upload-steps">
              {UPLOAD_STAGES.filter(s => s.id !== 'success').map((s, i) => (
                <div key={s.id} className={`upload-step ${i <= progressStageIndex ? 'active' : ''} ${i === progressStageIndex ? 'current' : ''}`}>
                  <div className="upload-step-dot" />
                  <span className="upload-step-label">{s.label.replace('…', '').replace(' o código', '').replace(' as peças', '').replace(' para o robô', '')}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
import { useModalA11y } from '../../hooks/useModalA11y';
