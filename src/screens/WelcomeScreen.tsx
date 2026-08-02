import { Fragment } from 'react';
import { Blocks, CodeXml, Cpu, Play, Puzzle, UserRound } from 'lucide-react';
import logoCompleta from '../assets/LogoCompleta.png';
import './WelcomeScreen.css';

interface WelcomeScreenProps {
  onEnter: () => void;
  onVisitor: () => void;
  version: string;
}

const capabilities = [
  { label: 'BLOCOS', Icon: Blocks, accent: 'cyan' },
  { label: 'CÓDIGO', Icon: CodeXml, accent: 'cyan' },
  { label: 'HARDWARE', Icon: Cpu, accent: 'orange' },
] as const;

export function WelcomeScreen({ onEnter, onVisitor, version }: WelcomeScreenProps) {
  return (
    <main className="welcome-screen">
      <div className="welcome-decoration" aria-hidden="true">
        <div className="welcome-puzzle welcome-puzzle--top-left"><Puzzle /></div>
        <div className="welcome-puzzle welcome-puzzle--top-right"><Puzzle /></div>
        <div className="welcome-puzzle welcome-puzzle--bottom-left"><Puzzle /></div>
        <div className="welcome-puzzle welcome-puzzle--bottom-right"><Puzzle /></div>
      </div>

      <section className="welcome-content" aria-labelledby="welcome-title">
        <h1 id="welcome-title" className="sr-only">Bloquin IDE</h1>
        <div className="welcome-logo-frame" aria-hidden="true">
          <img className="welcome-logo-image" src={logoCompleta} alt="" draggable="false" />
        </div>

        <div className="welcome-capabilities" aria-label="Blocos, código e hardware">
          {capabilities.map(({ label, Icon, accent }, index) => (
            <Fragment key={label}>
              {index > 0 && (
                <span className={`welcome-connector welcome-connector--${accent}`} aria-hidden="true">
                  <i />
                </span>
              )}
              <div className="welcome-capability">
                <Icon aria-hidden="true" />
                <span>{label}</span>
              </div>
            </Fragment>
          ))}
        </div>

        <div className="welcome-actions" aria-label="Escolha como entrar">
          <button type="button" className="welcome-button welcome-button--enter" onClick={onEnter}>
            <UserRound aria-hidden="true" />
            <span>ENTRAR</span>
          </button>
          <button type="button" className="welcome-button welcome-button--visitor" onClick={onVisitor}>
            <Play aria-hidden="true" />
            <span>VISITANTE</span>
          </button>
        </div>
      </section>

      <span className="welcome-version" aria-label={`Versão instalada ${version}`}>
        Bloquin IDE v{version}
      </span>
    </main>
  );
}
