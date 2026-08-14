import { ExternalLink, LogIn, Play } from 'lucide-react';
import logoCompleta from '../assets/LogoCompleta.png';
import { CREATOR_PORTFOLIO_URL, openCreatorPortfolio } from '../services/creatorPortfolioService';
import './WelcomeScreen.css';

interface WelcomeScreenProps {
  onEnter: () => void;
  onVisitor: () => void;
  version: string;
}

export function WelcomeScreen({ onEnter, onVisitor, version }: WelcomeScreenProps) {
  const handlePortfolioOpen = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    void openCreatorPortfolio();
  };

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

      <footer className="welcome-creator">
        <span>Criado por Felipe Silva</span>
        <span aria-hidden="true">·</span>
        <a
          href={CREATOR_PORTFOLIO_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handlePortfolioOpen}
          aria-label="Abrir o portfólio de Felipe Silva em uma nova aba"
        >
          Portfólio <ExternalLink aria-hidden="true" />
        </a>
      </footer>
    </main>
  );
}
