import { openUrl } from '@tauri-apps/plugin-opener';
import { isTauriRuntime } from './localProjectService';

export const CREATOR_PORTFOLIO_URL = 'https://felipesilva10.github.io/Portifolio/';

/** Abre o portfólio do criador fora da área de trabalho do Bloquin. */
export async function openCreatorPortfolio(): Promise<void> {
  if (isTauriRuntime()) {
    try {
      await openUrl(CREATOR_PORTFOLIO_URL);
      return;
    } catch {
      // O fallback do navegador abaixo mantém o link útil em builds de
      // desenvolvimento ou se o sistema operacional recusar a abertura.
    }
  }

  const portfolioWindow = window.open(CREATOR_PORTFOLIO_URL, '_blank', 'noopener,noreferrer');
  if (!portfolioWindow) window.location.assign(CREATOR_PORTFOLIO_URL);
}
