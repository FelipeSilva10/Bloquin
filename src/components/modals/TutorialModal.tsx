import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Blocks,
  Check,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Plus,
  RefreshCw,
  Save,
  Upload,
  Usb,
  X,
} from 'lucide-react';
import logoSimples from '../../assets/LogoSimples.png';
import imgArduinoNano from '../../assets/arduino_nano.jpg';
import imgEsp32 from '../../assets/esp32_devkit_v1.jpg';
import imgArduinoUno from '../../assets/arduino_uno.jpg';
import { useModalA11y } from '../../hooks/useModalA11y';
import './TutorialModal.css';

interface Props {
  onClose: () => void;
}

interface TutorialStep {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
  icon: ReactNode;
  visual: ReactNode;
}

function ProjectVisual() {
  return (
    <div className="tutorial-demo tutorial-demo--project" aria-label="Exemplo: criar um novo projeto">
      <div className="tutorial-demo-project-brand">
        <img src={logoSimples} alt="" aria-hidden="true" draggable="false" />
        <span>Meus Projetos</span>
      </div>
      <div className="tutorial-demo-project-action">
        <span className="tutorial-demo-primary-control"><Plus aria-hidden="true" /> Novo projeto</span>
        <span>Escolha um nome para a sua ideia.</span>
      </div>
    </div>
  );
}

function BoardVisual() {
  const boards = [
    { image: imgArduinoUno, name: 'Arduino Uno' },
    { image: imgArduinoNano, name: 'Arduino Nano' },
    { image: imgEsp32, name: 'ESP32 DevKit' },
  ];

  return (
    <div className="tutorial-demo tutorial-demo--boards" aria-label="Exemplo de escolha de placa">
      {boards.map((board) => (
        <article key={board.name} className="tutorial-demo-board">
          <img src={board.image} alt={board.name} draggable="false" />
          <strong>{board.name}</strong>
        </article>
      ))}
    </div>
  );
}

function BlocksVisual() {
  return (
    <div className="tutorial-demo tutorial-demo--workspace" aria-label="Exemplo da área de blocos do Bloquin">
      <aside className="tutorial-demo-toolbox" aria-hidden="true">
        <strong>Blocos</strong>
        <span className="is-selected">Entradas e Saídas</span>
        <span>Controle</span>
        <span>Sensor de Distância</span>
      </aside>
      <div className="tutorial-demo-canvas">
        <span className="tutorial-demo-block tutorial-demo-block--setup">PREPARAR <small>Roda 1 vez</small></span>
        <span className="tutorial-demo-block tutorial-demo-block--io">Configurar pino 13 como Saída</span>
        <span className="tutorial-demo-block tutorial-demo-block--loop">AGIR <small>Roda para sempre</small></span>
        <span className="tutorial-demo-block tutorial-demo-block--io is-nested">Colocar pino 13 em estado Ligado</span>
      </div>
    </div>
  );
}

function UploadVisual() {
  return (
    <div className="tutorial-demo tutorial-demo--toolbar" aria-label="Exemplo dos controles para enviar o programa">
      <span className="tutorial-demo-board-badge"><Cpu aria-hidden="true" /> Arduino Uno</span>
      <span className="tutorial-demo-port"><Usb aria-hidden="true" /> Porta USB</span>
      <span className="tutorial-demo-icon-control"><RefreshCw aria-hidden="true" /><span>Atualizar porta</span></span>
      <span className="tutorial-demo-send-control"><Upload aria-hidden="true" /> Enviar</span>
    </div>
  );
}

function SaveVisual() {
  return (
    <div className="tutorial-demo tutorial-demo--save" aria-label="Exemplo de salvar um projeto">
      <div className="tutorial-demo-tabs" aria-hidden="true">
        <span className="is-active">● Meu projeto</span>
        <span>Biblioteca</span>
      </div>
      <div className="tutorial-demo-save-action">
        <span>Fez uma mudança?</span>
        <span className="tutorial-demo-primary-control"><Save aria-hidden="true" /> Salvar</span>
      </div>
    </div>
  );
}

const STEPS: readonly TutorialStep[] = [
  {
    id: 'projeto',
    label: 'Projeto',
    eyebrow: 'COMEÇAR',
    title: 'Crie seu projeto',
    description: 'Comece pelo botão Novo projeto. Dê um nome para a sua ideia.',
    accent: 'var(--primary)',
    icon: <Plus />,
    visual: <ProjectVisual />,
  },
  {
    id: 'placa',
    label: 'Placa',
    eyebrow: 'OLHE A PEÇA',
    title: 'Escolha a placa certa',
    description: 'Escolha a mesma placa que está na sua mesa.',
    accent: '#8f5ce6',
    icon: <Cpu />,
    visual: <BoardVisual />,
  },
  {
    id: 'blocos',
    label: 'Blocos',
    eyebrow: 'MONTE A IDEIA',
    title: 'Arraste e encaixe blocos',
    description: 'Abra uma categoria à esquerda e monte a sequência no centro.',
    accent: 'var(--secondary)',
    icon: <Blocks />,
    visual: <BlocksVisual />,
  },
  {
    id: 'enviar',
    label: 'Enviar',
    eyebrow: 'TESTE NA PLACA',
    title: 'Confira e envie',
    description: 'Confira a placa e a porta USB. Depois toque em Enviar.',
    accent: 'var(--btn-primary-bg)',
    icon: <Upload />,
    visual: <UploadVisual />,
  },
  {
    id: 'salvar',
    label: 'Salvar',
    eyebrow: 'GUARDE SEU TRABALHO',
    title: 'Salve antes de sair',
    description: 'Mudou algo? Toque em Salvar para não perder sua ideia.',
    accent: '#2daa53',
    icon: <Save />,
    visual: <SaveVisual />,
  },
];

export default function TutorialModal({ onClose }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const titleId = useId();
  const modalRef = useModalA11y<HTMLDivElement>(onClose);
  const current = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === STEPS.length - 1;
  const progress = Math.round(((stepIndex + 1) / STEPS.length) * 100);

  const navigate = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= STEPS.length || nextIndex === stepIndex) return;
    setDirection(nextIndex > stepIndex ? 'forward' : 'back');
    setStepIndex(nextIndex);
  };

  return (
    <div className="bloquin-tutorial-overlay">
      <div
        ref={modalRef}
        className="bloquin-tutorial"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ '--tutorial-accent': current.accent } as CSSProperties}
      >
        <header className="bloquin-tutorial-header">
          <div className="bloquin-tutorial-brand">
            <img src={logoSimples} alt="" aria-hidden="true" draggable="false" />
            <span>Guia rápido</span>
          </div>
          <button type="button" className="bloquin-tutorial-close" data-autofocus onClick={onClose} aria-label="Fechar guia rápido">
            <X aria-hidden="true" />
            <span>Fechar</span>
          </button>
        </header>

        <div className="bloquin-tutorial-progress-area">
          <div className="bloquin-tutorial-progress" role="progressbar" aria-label="Progresso do guia" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <nav className="bloquin-tutorial-stepper" aria-label="Etapas do guia">
            {STEPS.map((step, index) => (
              <button
                type="button"
                key={step.id}
                className={index === stepIndex ? 'is-active' : index < stepIndex ? 'is-complete' : ''}
                aria-current={index === stepIndex ? 'step' : undefined}
                aria-label={`Ir para a etapa ${index + 1}: ${step.title}`}
                onClick={() => navigate(index)}
              >
                <span>{index + 1}</span>
                <small>{step.label}</small>
              </button>
            ))}
          </nav>
        </div>

        <main className="bloquin-tutorial-content" aria-live="polite">
          <section key={current.id} className={`bloquin-tutorial-slide bloquin-tutorial-slide--${direction}`}>
            <div className="bloquin-tutorial-title-row">
              <span className="bloquin-tutorial-title-icon" aria-hidden="true">{current.icon}</span>
              <div>
                <p>{current.eyebrow}</p>
                <h2 id={titleId}>{current.title}</h2>
                <span>{current.description}</span>
              </div>
            </div>
            {current.visual}
          </section>
        </main>

        <footer className="bloquin-tutorial-footer">
          <button type="button" className="bloquin-tutorial-back" onClick={isFirst ? onClose : () => navigate(stepIndex - 1)}>
            {isFirst ? <><X aria-hidden="true" /> Pular guia</> : <><ChevronLeft aria-hidden="true" /> Anterior</>}
          </button>
          <span>Etapa {stepIndex + 1} de {STEPS.length}</span>
          <button type="button" className="bloquin-tutorial-next" onClick={isLast ? onClose : () => navigate(stepIndex + 1)}>
            {isLast ? <>Concluir <Check aria-hidden="true" /></> : <>Próximo <ChevronRight aria-hidden="true" /></>}
          </button>
        </footer>
      </div>
    </div>
  );
}
