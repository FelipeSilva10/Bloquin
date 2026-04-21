import { useState } from "react";
import logoSimples from '../../icons/LogoSimples.png';
import imgArduinoNano from '../../assets/arduino_nano.jpg';
import imgEsp32       from '../../assets/esp32_devkit_v1.jpg';
import imgArduinoUno  from '../../assets/arduino_uno.jpg';

interface Props {
  onClose: () => void;
}

interface Step {
  id: number;
  title: string;
  emoji: string;
  accentColor: string;
  accentShadow: string;
  content: React.ReactNode;
}

const STEPS: Step[] = [
  {
    id: 1,
    title: "Bem-vindo ao Bloquin!",
    emoji: "🎉",
    accentColor: "#00a8ff",
    accentShadow: "#0087cc",
    content: (
      <>
        <div className="t-hero">
          <div className="t-hero-logo-wrap">
            <img src={logoSimples} alt="Bloquin" draggable={false} className="t-hero-logo" />
          </div>
          <div className="t-hero-copy">
            <p>
              O <strong>Bloquin</strong> é onde você vira um
              programador de verdade, sem precisar digitar nenhum código difícil!
            </p>
            <p>
              Você programa <strong>robôs, circuitos, sensores e muito mais</strong> usando
              blocos coloridos, como peças de LEGO.
            </p>
          </div>
        </div>

        <div className="t-checklist">
          <div className="t-check-item">
            <span className="t-check-icon">🤖</span>
            <span>Controle robôs e componentes eletrônicos</span>
          </div>
          <div className="t-check-item">
            <span className="t-check-icon">💾</span>
            <span>Projetos salvos automaticamente na nuvem</span>
          </div>
          <div className="t-check-item">
            <span className="t-check-icon">🚀</span>
            <span>Envie o código para a placa com 1 clique</span>
          </div>
          <div className="t-check-item">
            <span className="t-check-icon">👁️</span>
            <span>Veja o código C++ real gerado pelos seus blocos</span>
          </div>
        </div>

        <div className="t-fact t-fact-blue">
          <span className="t-fact-icon">💡</span>
          <span>
            Os blocos que você montar aqui viram <strong>código C++ de verdade</strong>,
            igual ao que engenheiros e programadores profissionais usam!
          </span>
        </div>
      </>
    ),
  },
  {
    id: 2,
    title: "Blocos = Peças de LEGO",
    emoji: "🧩",
    accentColor: "#4cd137",
    accentShadow: "#3aac29",
    content: (
      <>
        <p className="t-intro-text">
          Programar aqui é como montar um <strong>LEGO</strong>: cada bloco faz uma coisa,
          e você encaixa eles na ordem certa para criar seu projeto.
        </p>

        <div className="t-block-demo">
          <div className="t-block-demo-label">Seu programa 👇</div>
          <div className="t-block t-block-orange">🔁 Repetir <strong>10</strong> vezes</div>
          <div className="t-block t-block-blue t-block-indent">💡 Acender o LED</div>
          <div className="t-block t-block-purple t-block-indent">⏱ Esperar <strong>1</strong> segundo</div>
          <div className="t-block t-block-blue t-block-indent">💡 Apagar o LED</div>
          <div className="t-block t-block-purple t-block-indent">⏱ Esperar <strong>1</strong> segundo</div>
        </div>

        <div className="t-transform-arrow">⬇️ o Bloquin transforma em...</div>

        <div className="t-code-preview">
          <pre>{`for (int i = 0; i < 10; i++) {
  digitalWrite(LED_PIN, HIGH);
  delay(1000);
  digitalWrite(LED_PIN, LOW);
  delay(1000);
}`}</pre>
        </div>

        <div className="t-fact t-fact-green">
          <span className="t-fact-icon">✨</span>
          <span>Você <strong>não precisa entender o código</strong>, o Bloquin faz a tradução por você!</span>
        </div>
      </>
    ),
  },
  {
    id: 3,
    title: "Entrando na sua conta",
    emoji: "🔑",
    accentColor: "#ef9f4b",
    accentShadow: "#cf8235",
    content: (
      <>
        <p className="t-intro-text">
          Para usar o Bloquin, você entra com o <strong>nome de usuário</strong> e a
          <strong> senha</strong> que seu professor te deu. Existem dois tipos de conta:
        </p>

        <div className="t-roles">
          <div className="t-role-card t-role-student">
            <div className="t-role-emoji">🎒</div>
            <strong className="t-role-title">Aluno</strong>
            <ul className="t-role-list">
              <li><span className="t-ok">✅</span> Cria e salva projetos</li>
              <li><span className="t-ok">✅</span> Projetos salvos na nuvem</li>
              <li><span className="t-ok">✅</span> Recebe projetos do professor</li>
              <li><span className="t-ok">✅</span> Acesso completo à IDE</li>
            </ul>
          </div>
          <div className="t-role-card t-role-visitor">
            <div className="t-role-emoji">👀</div>
            <strong className="t-role-title">Visitante</strong>
            <ul className="t-role-list">
              <li><span className="t-ok">✅</span> Usa a IDE normalmente</li>
              <li><span className="t-no">❌</span> Não salva projetos</li>
              <li><span className="t-no">❌</span> Não recebe projetos</li>
              <li><span className="t-no">❌</span> Projetos somem ao fechar</li>
            </ul>
          </div>
        </div>

        <div className="t-warn">
          <span>⚠️</span>
          <div>
            <strong>Conta única por vez:</strong> Se você entrar em outro computador,
            o anterior é <strong>desconectado automaticamente</strong>.
          </div>
        </div>

        <div className="t-fact t-fact-orange">
          <span className="t-fact-icon">🔒</span>
          <span>Nunca compartilhe sua senha com ninguém, nem com seus amigos! Mude sua senha para uma que somente você saiba.</span>
        </div>
      </>
    ),
  },
  {
    id: 4,
    title: "Escolhendo sua placa",
    emoji: "🔌",
    accentColor: "#764ba2",
    accentShadow: "#5a3880",
    content: (
      <>
        <p className="t-intro-text">
          Antes de abrir a IDE, você escolhe qual <strong>placa eletrônica</strong> vai
          usar. É muito importante escolher certo, pois cada placa tem pinos e
          recursos diferentes!
        </p>

      <div className="t-board-grid">
        <div className="t-board-card">
          <img src={imgEsp32} alt="ESP32 DevKit V1" className="t-board-img" draggable={false} />
          <strong>ESP32</strong>
          <div className="t-board-tags">
            <span className="t-tag t-tag-blue">Wi-Fi</span>
            <span className="t-tag t-tag-blue">Bluetooth</span>
          </div>
          <small>Ideal para robótica avançada e projetos sem fio</small>
        </div>
        <div className="t-board-card">
          <img src={imgArduinoUno} alt="Arduino Uno" className="t-board-img" draggable={false} />
          <strong>Arduino Uno</strong>
          <div className="t-board-tags">
            <span className="t-tag t-tag-green">Iniciante</span>
          </div>
          <small>Perfeito para os primeiros projetos e aprender os conceitos</small>
        </div>
        <div className="t-board-card">
          <img src={imgArduinoNano} alt="Arduino Nano" className="t-board-img" draggable={false} />
          <strong>Arduino Nano</strong>
          <div className="t-board-tags">
            <span className="t-tag t-tag-gray">Compacto</span>
          </div>
          <small>Versão menor do Arduino Uno, mesmas funcionalidades</small>
        </div>
      </div>

        <div className="t-warn">
          <span>⚠️</span>
          <div>
            Você <strong>não pode trocar a placa</strong> depois de começar o projeto.
            Se errar, precisa criar um projeto novo. Quando tiver dúvida, <strong>pergunte pro professor!</strong>
          </div>
        </div>
      </>
    ),
  },
  {
    id: 5,
    title: "A tela de programação",
    emoji: "🖥️",
    accentColor: "#e73561",
    accentShadow: "#bf254c",
    content: (
      <>
        <p className="t-intro-text">
          A tela principal tem <strong>4 áreas</strong> importantes que você vai usar o tempo todo:
        </p>

        <div className="t-zones">
          <div className="t-zone">
            <div className="t-zone-badge" style={{ background: "#00a8ff" }}>1</div>
            <div className="t-zone-text">
              <strong>Caixa de Blocos</strong> <span className="t-zone-where">(esquerda)</span>
              <p>Todos os blocos disponíveis, organizados por categoria: Controle, Lógica, Sensores, Motores, ESP-NOW...</p>
            </div>
          </div>
          <div className="t-zone">
            <div className="t-zone-badge" style={{ background: "#4cd137" }}>2</div>
            <div className="t-zone-text">
              <strong>Área de Trabalho</strong> <span className="t-zone-where">(centro)</span>
              <p>Arraste os blocos aqui e monte seu programa. Use a roda do mouse para dar zoom e arraste o fundo para se mover.</p>
            </div>
          </div>
          <div className="t-zone">
            <div className="t-zone-badge" style={{ background: "#ef9f4b" }}>3</div>
            <div className="t-zone-text">
              <strong>Barra Superior</strong> <span className="t-zone-where">(topo)</span>
              <p>Botões para compilar ⚙️, enviar para a placa 🚀 e abrir o monitor serial 📡 para ver mensagens.</p>
            </div>
          </div>
          <div className="t-zone">
            <div className="t-zone-badge" style={{ background: "#764ba2" }}>4</div>
            <div className="t-zone-text">
              <strong>Aba "Ver Código"</strong> <span className="t-zone-where">(direita)</span>
              <p>Mostra o código C++ gerado pelos seus blocos em tempo real. Você pode copiar e colar em outros lugares!</p>
            </div>
          </div>
        </div>

        <div className="t-fact t-fact-red">
          <span className="t-fact-icon">🖱️</span>
          <span>Use <strong>Ctrl+Z</strong> para desfazer e <strong>Ctrl+Y</strong> para refazer qualquer mudança!</span>
        </div>
      </>
    ),
  },
  {
    id: 6,
    title: "Trabalhando com blocos",
    emoji: "✋",
    accentColor: "#00a8ff",
    accentShadow: "#0087cc",
    content: (
      <>
        <p className="t-intro-text">
          Tudo no Bloquin funciona com <strong>arrastar e soltar</strong>. Veja como é simples:
        </p>

        <div className="t-how-list">
          <div className="t-how-item">
            <div className="t-how-num" style={{ background: "#00a8ff" }}>1</div>
            <div>
              <strong>Arraste</strong> um bloco da caixa para a área de trabalho
            </div>
          </div>
          <div className="t-how-item">
            <div className="t-how-num" style={{ background: "#4cd137" }}>2</div>
            <div>
              <strong>Encaixe</strong> os blocos — quando estão no lugar certo, eles se conectam com um clique!
            </div>
          </div>
          <div className="t-how-item">
            <div className="t-how-num" style={{ background: "#ef9f4b" }}>3</div>
            <div>
              <strong>Configure</strong> os valores clicando nos campos dentro do bloco (números, textos, pinos)
            </div>
          </div>
          <div className="t-how-item">
            <div className="t-how-num" style={{ background: "#e73561" }}>4</div>
            <div>
              <strong>Botão direito</strong> num bloco para duplicar, comentar ou deletar rapidinho
            </div>
          </div>
        </div>

        <div className="t-warn">
          <span>⚠️</span>
          <div>
            Blocos <strong>soltos</strong> (não conectados ao bloco principal) <strong>não executam!</strong>{" "}
            Todo o seu programa precisa estar ligado ao bloco <em>"No início"</em> ou <em>"Repetir sempre"</em>.
          </div>
        </div>

        <div className="t-fact t-fact-blue">
          <span className="t-fact-icon">🗑️</span>
          <span>Arraste um bloco para a <strong>lixeira</strong> no canto inferior direito para deletar. Ou clique com botão direito → "Excluir bloco".</span>
        </div>
      </>
    ),
  },
  {
    id: 7,
    title: "Projetos e envio para a placa",
    emoji: "🚀",
    accentColor: "#4cd137",
    accentShadow: "#3aac29",
    content: (
      <>
        <p className="t-intro-text">
          Quando seu programa estiver pronto, é hora de mandar para a placa!
          O processo tem três etapas:
        </p>

        <div className="t-pipeline">
          <div className="t-pipe-step">
            <div className="t-pipe-icon">⚙️</div>
            <strong>Compilar</strong>
            <small>O Bloquin verifica os blocos e transforma em código de máquina</small>
          </div>
          <div className="t-pipe-arrow">›</div>
          <div className="t-pipe-step">
            <div className="t-pipe-icon">🔌</div>
            <strong>Porta USB</strong>
            <small>Escolha a porta onde a placa está conectada no computador</small>
          </div>
          <div className="t-pipe-arrow">›</div>
          <div className="t-pipe-step">
            <div className="t-pipe-icon">🚀</div>
            <strong>Enviar!</strong>
            <small>O programa é gravado na placa e começa a rodar na hora</small>
          </div>
        </div>

        <div className="t-extras">
          <div className="t-extra-item">
            <span>📁</span>
            <div>
              <strong>Seus projetos</strong> ficam no painel inicial.
              Clique em <em>+ Novo Projeto</em> para criar um. Seu professor pode te enviar projetos prontos como ponto de partida.
            </div>
          </div>
          <div className="t-extra-item">
            <span>💾</span>
            <div>
              <strong>Salvamento automático:</strong> cada alteração é salva na nuvem na hora.
              Você nunca vai perder seu trabalho!
            </div>
          </div>
          <div className="t-extra-item">
            <span>📡</span>
            <div>
              <strong>Monitor Serial:</strong> veja mensagens que a placa envia de volta,
              ótimo para depurar e entender o que está acontecendo.
            </div>
          </div>
        </div>

        <div className="t-finish-banner">
          🎉 Você está pronto para programar! Se travar em alguma parte,
          <strong> chame o professor</strong>, é para isso que ele está aqui!
        </div>
      </>
    ),
  },
];

export default function TutorialModal({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const [slideDir, setSlideDir] = useState<"forward" | "back">("forward");
  const [contentKey, setContentKey] = useState(0);

  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;
  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  const navigate = (target: number) => {
    if (target === step || target < 0 || target >= STEPS.length) return;
    setSlideDir(target > step ? "forward" : "back");
    setContentKey((k) => k + 1);
    setStep(target);
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box tutorial-modal">

        {/* Accent bar — fora do scroll, fixo no topo */}
        <div
          className="t-accent-bar"
          style={{ background: current.accentColor }}
        />

        {/* Progress bar — fora do scroll, fixo no topo */}
        <div className="t-progress-track">
          <div
            className="t-progress-fill"
            style={{ width: `${progress}%`, background: current.accentColor }}
          />
        </div>

        {/* Área scrollável: dots + header + conteúdo */}
        <div className="t-scrollable-body">
          {/* Dots */}
          <div
            className="tutorial-progress"
            role="tablist"
            aria-label="Etapas do tutorial"
          >
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={i === step}
                aria-label={`Etapa ${i + 1}: ${s.title}`}
                className={`progress-dot ${i === step ? "active" : ""} ${
                  i < step ? "done" : ""
                }`}
                style={
                  i === step
                    ? ({ "--dot-color": current.accentColor } as React.CSSProperties)
                    : undefined
                }
                onClick={() => navigate(i)}
              />
            ))}
          </div>

          {/* Header */}
          <div className="tutorial-header">
            <span
              className="t-step-emoji"
              aria-hidden="true"
              key={`emoji-${step}`}
            >
              {current.emoji}
            </span>
            <div>
              <p className="tutorial-step-label">
                Etapa {step + 1} de {STEPS.length}
              </p>
              <h2 id="tutorial-title">{current.title}</h2>
            </div>
          </div>

          {/* Conteúdo com slide direcional */}
          <div
            key={contentKey}
            className={`tutorial-content t-slide-${slideDir}`}
          >
            {current.content}
          </div>
        </div>

        {/* Nav — fora do scroll, sempre visível no rodapé */}
        <div className="tutorial-nav">
          <button
            className="btn-ghost"
            onClick={isFirst ? onClose : () => navigate(step - 1)}
          >
            {isFirst ? "Pular tutorial" : "← Anterior"}
          </button>
          <button
            className="btn-primary t-btn-accent"
            style={{
              background: current.accentColor,
              boxShadow: `0 6px 0 ${current.accentShadow}`,
            }}
            onClick={isLast ? onClose : () => navigate(step + 1)}
          >
            {isLast ? "Concluir ✓" : "Próximo →"}
          </button>
        </div>

      </div>
    </div>
  );
}