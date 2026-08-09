import { LogIn, Play } from 'lucide-react';
import logoCompleta from '../assets/LogoCompleta.png';
import './WelcomeScreen.css';

interface WelcomeScreenProps {
  onEnter: () => void;
  onVisitor: () => void;
  version: string;
}

export function WelcomeScreen({ onEnter, onVisitor, version }: WelcomeScreenProps) {
  return (
    <main className="welcome-screen">
      <section className="welcome-content" aria-labelledby="welcome-title">
        <h1 id="welcome-title" className="sr-only">Bloquin IDE</h1>
        <div className="welcome-logo-frame" aria-hidden="true">
          <img className="welcome-logo-image" src={logoCompleta} alt="" draggable="false" />
        </div>

        <div className="welcome-actions" aria-label="Escolha como entrar">
          <button type="button" className="welcome-button welcome-button--enter" onClick={onEnter}>
            <LogIn aria-hidden="true" />
            <span>Entrar</span>
          </button>
          <button type="button" className="welcome-button welcome-button--visitor" onClick={onVisitor}>
            <Play aria-hidden="true" />
            <span>Continuar como visitante</span>
          </button>
        </div>
      </section>

      <span className="welcome-version" aria-label={`Versão instalada ${version}`}>
        Bloquin IDE v{version}
      </span>
    </main>
  );
}
