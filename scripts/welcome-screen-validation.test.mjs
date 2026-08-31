import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const htmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const entryBackButtonSource = readFileSync(new URL('../src/components/EntryBackButton.tsx', import.meta.url), 'utf8');
const entryBackButtonCss = readFileSync(new URL('../src/components/EntryBackButton.css', import.meta.url), 'utf8');
const loginSource = readFileSync(new URL('../src/screens/LoginScreen.tsx', import.meta.url), 'utf8');
const loginCss = readFileSync(new URL('../src/screens/LoginScreen.css', import.meta.url), 'utf8');
const splashSource = readFileSync(new URL('../src/components/SplashScreen.tsx', import.meta.url), 'utf8');
const splashCss = readFileSync(new URL('../src/components/SplashScreen.css', import.meta.url), 'utf8');
const tutorialSource = readFileSync(new URL('../src/components/modals/TutorialModal.tsx', import.meta.url), 'utf8');
const tutorialCss = readFileSync(new URL('../src/components/modals/TutorialModal.css', import.meta.url), 'utf8');
const studentDashboardSource = readFileSync(new URL('../src/screens/StudentDashboard.tsx', import.meta.url), 'utf8');
const welcomeSource = readFileSync(new URL('../src/screens/WelcomeScreen.tsx', import.meta.url), 'utf8');
const welcomeCss = readFileSync(new URL('../src/screens/WelcomeScreen.css', import.meta.url), 'utf8');
const creatorPortfolioSource = readFileSync(new URL('../src/services/creatorPortfolioService.ts', import.meta.url), 'utf8');
const logoAsset = readFileSync(new URL('../src/assets/LogoCompleta.png', import.meta.url));

function balancedBlock(source, marker) {
  const markerStart = source.indexOf(marker);
  assert.notEqual(markerStart, -1, `Trecho ausente: ${marker}`);

  const bodyStart = source.indexOf('{', markerStart + marker.length - 1);
  assert.notEqual(bodyStart, -1, `Bloco sem abertura: ${marker}`);

  let depth = 1;
  for (let index = bodyStart + 1; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(bodyStart + 1, index);
  }

  assert.fail(`Bloco sem fechamento: ${marker}`);
}

function routeSource(path, nextPath) {
  const startMarker = `path="${path}"`;
  const start = appSource.indexOf(startMarker);
  assert.notEqual(start, -1, `Rota ausente: ${path}`);

  if (!nextPath) return appSource.slice(start);

  const end = appSource.indexOf(`path="${nextPath}"`, start + startMarker.length);
  assert.notEqual(end, -1, `Rota seguinte ausente: ${nextPath}`);
  return appSource.slice(start, end);
}

test('asset oficial do logo é um PNG com canal alfa', () => {
  assert.deepEqual(
    [...logoAsset.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    'LogoCompleta.png deve preservar a assinatura PNG completa.',
  );
  assert.equal(logoAsset.subarray(12, 16).toString('ascii'), 'IHDR');
  assert.ok(logoAsset.readUInt32BE(16) > 0, 'A largura do PNG deve ser válida.');
  assert.ok(logoAsset.readUInt32BE(20) > 0, 'A altura do PNG deve ser válida.');
  assert.ok(
    logoAsset[25] === 4 || logoAsset[25] === 6,
    'LogoCompleta.png deve preservar um canal alfa.',
  );
});

test('favicon também usa a marca simples atual, sem uma cópia pública obsoleta', () => {
  assert.match(htmlSource, /href="\/src\/assets\/LogoSimples\.png"/);
  assert.doesNotMatch(htmlSource, /href="\/LogoSimples\.png"/);
});

test('tela inicial é o painel de projetos locais, sem escolha de entrada nem modo visitante', () => {
  assert.doesNotMatch(welcomeSource, /logoCompleta|welcome-screen|welcome-content|welcome-logo-frame/);
  assert.doesNotMatch(welcomeSource, /Continuar como visitante|onVisitor|handleVisitorEntry/);

  assert.match(welcomeSource, /<div className="welcome-page">/);
  assert.match(welcomeSource, /<header className="welcome-hero">/);
  // Marca compacta: ícone + nome do produto, sem repetir "Meus projetos" (a
  // seção abaixo já diz isso) nem legendas explicativas no herói.
  assert.match(welcomeSource, /<h1>Bloquin<\/h1>/);
  assert.doesNotMatch(welcomeSource, /Meus projetos<\/h1>|ficam salvos neste dispositivo/);

  assert.match(
    welcomeSource,
    /interface WelcomeScreenProps \{\s*onLoginEscolar: \(\) => void;\s*onOpenProject: \(tabId: string\) => void;\s*onOpenComponents: \(\) => void;\s*onOpenLibrary: \(\) => void;\s*version: string;\s*\}/,
  );

  // Criar e Login escolar ficam lado a lado, numa única linha compacta —
  // sem depender de um herói alto pra caber os dois.
  assert.match(
    welcomeSource,
    /<button type="button" className="welcome-hero-create" onClick=\{\(\) => void createProject\(\)\} disabled=\{isBusy\}>[\s\S]*?<span>\{isBusy \? 'Um instante…' : 'Criar novo projeto'\}<\/span>/,
  );
  assert.match(
    welcomeSource,
    /<button type="button" className="welcome-hero-login" onClick=\{onLoginEscolar\}>[\s\S]*?<span>Login escolar<\/span>[\s\S]*?<\/button>/,
  );

  // "Seus projetos" e "Explorar" são seções nomeadas e distintas, não uma
  // grade única sem hierarquia.
  assert.match(welcomeSource, /<span className="welcome-section-label">Seus projetos<\/span>/);
  assert.match(welcomeSource, /<span className="welcome-section-label">Explorar<\/span>/);

  // Abrir/Biblioteca/Componentes formam o segundo nível — mesma hierarquia
  // entre si, mas cada um com sua própria cor de identidade.
  const secondaryCardCount = (welcomeSource.match(/className="welcome-secondary-card welcome-secondary-card--/g) ?? []).length;
  assert.equal(secondaryCardCount, 3, 'A tela inicial deve ter 3 ações secundárias: abrir, biblioteca, componentes.');
  assert.match(welcomeSource, /welcome-secondary-card welcome-secondary-card--neutral[\s\S]*?Abrir arquivo JSON/);
  assert.match(welcomeSource, /welcome-secondary-card welcome-secondary-card--library[\s\S]*?Biblioteca/);
  assert.match(welcomeSource, /welcome-secondary-card welcome-secondary-card--components[\s\S]*?Componentes/);

  // Tutorial vira um botão flutuante num canto, fora do fluxo principal —
  // não compete mais com Biblioteca/Componentes nem fica solto entre seções.
  assert.match(welcomeSource, /className="welcome-tutorial-fab" onClick=\{\(\) => setShowTutorial\(true\)\} aria-label="Ver tutorial"/);
  assert.doesNotMatch(welcomeSource, /welcome-tutorial-link|className="project-card new-project-card"/);

  // Cada projeto tem sua própria superfície clicável (abre) separada do menu
  // de mais ações (renomear/excluir) — nunca um botão aninhado dentro de
  // outro botão.
  assert.match(welcomeSource, /function LocalProjectCard\(/);
  assert.match(welcomeSource, /renameLocalProject|onRename/);
  assert.match(welcomeSource, /deleteLocalProject|onDelete/);
  assert.match(welcomeSource, /<article className="project-card-wrap">/);
  assert.match(welcomeSource, /className="project-card-menu-trigger"/);

  assert.match(welcomeSource, /projects\.map\(\(project\) => \(/);
  assert.match(welcomeSource, /import \{ ProjectBoardBadge \} from '\.\.\/components\/ProjectBoardBadge';/);
  assert.match(welcomeSource, /<ProjectBoardBadge board=\{project\.targetBoard\} \/>/);
});

test('tela inicial mantém um acesso discreto ao portfólio do criador', () => {
  assert.match(welcomeSource, /import \{ CREATOR_PORTFOLIO_URL, openCreatorPortfolio \} from '\.\.\/services\/creatorPortfolioService';/);
  assert.match(welcomeSource, /<footer className="welcome-footer-line">/);
  assert.match(welcomeSource, /Criado por Felipe Silva/);
  assert.match(welcomeSource, /href=\{CREATOR_PORTFOLIO_URL\}/);
  assert.match(welcomeSource, /onClick=\{handlePortfolioOpen\}/);
  assert.match(welcomeSource, /target="_blank"/);
  assert.match(welcomeSource, /rel="noopener noreferrer"/);
  assert.match(creatorPortfolioSource, /CREATOR_PORTFOLIO_URL = 'https:\/\/felipesilva10\.github\.io\/Portifolio\/'/);
  assert.match(creatorPortfolioSource, /await openUrl\(CREATOR_PORTFOLIO_URL\)/);
  assert.match(creatorPortfolioSource, /window\.open\(CREATOR_PORTFOLIO_URL, '_blank', 'noopener,noreferrer'\)/);
  assert.match(welcomeCss, /\.welcome-footer-line \{/);
  assert.match(welcomeCss, /\.welcome-footer-line a \{/);
});

test('entrada e login permanecem em rotas separadas', () => {
  const welcomeRoute = routeSource('/', '/login');
  const loginRoute = routeSource('/login', '/dashboard');

  assert.match(welcomeRoute, /role === 'guest'/);
  assert.match(welcomeRoute, /<WelcomeScreen/);
  assert.match(welcomeRoute, /onLoginEscolar=\{\(\) => navigate\('\/login'\)\}/);
  assert.match(welcomeRoute, /onOpenComponents=\{handleOpenComponents\}/);
  assert.match(welcomeRoute, /:\s*<Navigate to="\/dashboard" replace \/>/);
  assert.doesNotMatch(welcomeRoute, /<LoginScreen/);

  assert.match(loginRoute, /role === 'guest'/);
  assert.match(loginRoute, /<LoginScreen/);
  assert.match(loginRoute, /onLogin=\{handleLogin\}/);
  assert.match(loginRoute, /onBack=\{\(\) => navigate\('\/', \{ replace: true \}\)\}/);
  assert.match(loginRoute, /beforeLogin=\{\(\) => logoutCleanupRef\.current\}/);
  assert.doesNotMatch(loginRoute, /<WelcomeScreen|handleVisitorEntry/);
});

test('login reutiliza o botão discreto de retorno', () => {
  assert.match(loginSource, /import \{ EntryBackButton \} from '\.\.\/components\/EntryBackButton';/);
  assert.match(
    loginSource,
    /<EntryBackButton\s+className="entry-back-button--overlay login-entry-back"\s+onClick=\{onBack\}\s+disabled=\{loading\}\s*\/>/,
  );

  assert.match(entryBackButtonSource, /import \{ ArrowLeft \} from 'lucide-react';/);
  assert.match(entryBackButtonSource, /type="button"/);
  assert.match(entryBackButtonSource, /aria-label="Voltar para a tela inicial"/);
  assert.match(entryBackButtonSource, /<ArrowLeft aria-hidden="true" \/>/);

  const baseButtonRule = balancedBlock(entryBackButtonCss, '.entry-back-button {');
  const overlayButtonRule = balancedBlock(entryBackButtonCss, '.entry-back-button--overlay {');
  assert.match(baseButtonRule, /min-height:\s*36px/);
  assert.match(baseButtonRule, /background:\s*rgba\(255, 255, 255, 0\.78\)/);
  assert.match(baseButtonRule, /backdrop-filter:\s*blur\(8px\)/);
  assert.match(overlayButtonRule, /background:\s*rgba\(255, 255, 255, 0\.13\)/);
});

test('splash e login enquadram a margem transparente sem cortar a marca', () => {
  const splashLogoRule = balancedBlock(splashCss, '.bloquin-splash-logo {');
  const splashImageRule = balancedBlock(splashCss, '.bloquin-splash-logo-image {');
  const loginLogoRule = balancedBlock(loginCss, '.login-container .login-logo {');

  assert.match(splashSource, /import logoCompleta from '\.\.\/assets\/LogoCompleta\.png';/);
  assert.match(splashSource, /className="bloquin-splash-logo-image"/);
  assert.doesNotMatch(splashSource, /LOGO_WIDTH|LETTER_CUTS|LETTER_ROTATIONS|splash-letter/);
  assert.match(splashLogoRule, /width:\s*min\(86vw, 980px\)/);
  assert.match(splashImageRule, /height:\s*auto/);
  assert.match(splashImageRule, /object-fit:\s*contain/);
  assert.doesNotMatch(splashImageRule, /object-fit:\s*cover|aspect-ratio/);

  assert.match(loginSource, /import '\.\/LoginScreen\.css';/);
  assert.match(loginLogoRule, /aspect-ratio:\s*auto/);
  assert.match(loginLogoRule, /height:\s*auto/);
  assert.match(loginLogoRule, /object-fit:\s*contain/);
  assert.match(loginLogoRule, /object-position:\s*center/);
});

test('login autenticado e demais etapas de entrada não exibem o anúncio visitante', () => {
  assert.match(loginSource, /onLogin: \(role: 'student' \| 'teacher', userId\?: string\) => void/);
  assert.match(loginSource, /onBack: \(\) => void/);
  assert.match(loginSource, /<form className="login-form" onSubmit=\{handleLogin\}>/);
  assert.match(loginSource, /\{loading \? 'Entrando\.\.\.' : 'Entrar'\}/);

  const entrySources = [appSource, welcomeSource, loginSource].join('\n');
  assert.doesNotMatch(entrySources, /import\s+GuestInfoModal|<GuestInfoModal/);
  assert.doesNotMatch(loginSource, /Entrar como Visitante/i);
  assert.doesNotMatch(entrySources, /showGuestInfo|handleEnterAsGuest|handleGuestConfirmed/);
  assert.doesNotMatch(loginSource, /onLogin\('visitor'\)/);
});

test('estado local (guest) é permanente: sem modo visitante, sessão antiga limpa uma vez no boot', () => {
  assert.doesNotMatch(appSource, /'visitor'/);
  assert.doesNotMatch(appSource, /handleVisitorEntry|onVisitor|VisitorDashboard/);

  assert.match(
    appSource,
    /useEffect\(\(\) => \{\s*logoutCleanupRef\.current = signOutLocalSafely\(\);\s*\}, \[\]\);/,
  );

  const welcomeRoute = routeSource('/', '/login');
  assert.match(welcomeRoute, /role === 'guest'[\s\S]*?:\s*<Navigate to="\/dashboard" replace \/>/);

  const dashboardRoute = routeSource('/dashboard', '/biblioteca');
  assert.doesNotMatch(dashboardRoute, /VisitorDashboard|role === 'visitor'/);
});

test('tela inicial só cria ou importa projeto local antes de abrir a IDE', () => {
  const createProject = balancedBlock(welcomeSource, 'const createProject = async () => {');
  const openParsedProject = balancedBlock(welcomeSource, 'const openParsedProject = (contents: string, filePath: string) => {');

  assert.match(createProject, /createLocalProject\('Meu projeto', null\)/);
  assert.match(createProject, /source: 'local-file'/);
  assert.match(createProject, /source: 'memory'/);

  const importParsePosition = openParsedProject.indexOf('const parsed = parseProjectFileContents(contents, filePath);');
  const importOpenPosition = openParsedProject.indexOf('openTab(openProject({');
  assert.ok(importParsePosition >= 0, 'Projeto importado deve ser interpretado antes de virar aba.');
  assert.ok(importOpenPosition > importParsePosition, 'A aba só deve abrir depois de interpretar o arquivo.');

  const welcomeRoute = routeSource('/', '/login');
  assert.match(
    welcomeRoute,
    /onOpenProject=\{\(tabId\) => \{[\s\S]*?activateTab\(tabId\);[\s\S]*?navigate\('\/ide', \{ state: \{ readOnly: false, workspaceTabId: tabId \} \}\);[\s\S]*?\}\}/,
  );
});

test('tela inicial reaproveita o gradiente e a textura de pontos da tela de login', () => {
  assert.doesNotMatch(welcomeCss, /welcome-screen\s*\{|welcome-content|welcome-logo-frame|welcome-button\b/);

  const heroRule = balancedBlock(welcomeCss, '.welcome-hero {');
  assert.match(heroRule, /background:\s*linear-gradient\(105deg, #667eea 12%, #764ba2 40%, var\(--primary\) 100%\)/);

  assert.match(welcomeCss, /\.welcome-hero::before \{/);
  assert.match(welcomeCss, /data:image\/svg\+xml/);

  const loginPillRule = balancedBlock(welcomeCss, '.welcome-hero-login {');
  assert.match(loginPillRule, /border:\s*2px solid rgba\(255, 255, 255, 0\.55\)/);
  assert.match(loginPillRule, /backdrop-filter:\s*blur\(6px\)/);

  assert.match(welcomeCss, /\.welcome-hero-block-train-rail \{/);

  assert.match(welcomeCss, /\.welcome-empty-state \{/);
  assert.match(welcomeCss, /\.welcome-corrupted-notice \{/);
});

test('tela inicial diferencia hierarquia por cor e tamanho, ecoando o botão branco do herói antigo e as cores de botão já existentes', () => {
  const heroCreateRule = balancedBlock(welcomeCss, '.welcome-hero-create {');
  assert.match(heroCreateRule, /background:\s*#fff/);
  assert.match(heroCreateRule, /color:\s*#4056e7/);

  // A costura entre herói e painel é uma faixa cromática única com os
  // contornos Blockly, sem relevo/preenchimento e com loop horizontal suave.
  assert.match(welcomeSource, /className="welcome-hero-block-train-rail"/);
  assert.doesNotMatch(welcomeSource, /BLOCK_TRAIN_SEGMENTS|BLOCK_TRAIN_COLORS|welcome-hero-block-train-segment|welcome-hero-rainbow/);

  const railRule = balancedBlock(welcomeCss, '.welcome-hero-block-train-rail {');
  assert.match(railRule, /overflow:\s*hidden/);
  const carvingRule = balancedBlock(welcomeCss, '.welcome-hero-block-train-rail::before {');
  assert.match(carvingRule, /background-image:\s*url\('\.\.\/assets\/block-rail\.png'\)/);
  assert.match(carvingRule, /background-repeat:\s*repeat-x/);
  assert.match(carvingRule, /animation:\s*welcome-block-carving 128s linear infinite/);
  assert.match(welcomeCss, /@keyframes welcome-block-carving/);

  // Cada ação secundária tem um selo de ícone sólido e colorido — mesma
  // linguagem dos badges de placa da IDE — em vez de só um ícone colorido
  // sobre um gradiente sutil demais pra ler como identidade própria.
  const libraryRule = balancedBlock(welcomeCss, '.welcome-secondary-card--library {');
  assert.match(libraryRule, /background:\s*linear-gradient\(155deg, #fff 40%, #fbe1e9 165%\)/);
  const libraryIconRule = balancedBlock(welcomeCss, '.welcome-secondary-card--library .welcome-secondary-card-icon {');
  assert.match(libraryIconRule, /background:\s*var\(--btn-outline-bg\)/);

  const componentsRule = balancedBlock(welcomeCss, '.welcome-secondary-card--components {');
  assert.match(componentsRule, /background:\s*linear-gradient\(155deg, #fff 40%, #dfebf5 165%\)/);
  const componentsIconRule = balancedBlock(welcomeCss, '.welcome-secondary-card--components .welcome-secondary-card-icon {');
  assert.match(componentsIconRule, /background:\s*var\(--btn-secondary-bg\)/);

  const neutralIconRule = balancedBlock(welcomeCss, '.welcome-secondary-card--neutral .welcome-secondary-card-icon {');
  assert.match(neutralIconRule, /background:\s*var\(--primary\)/);

  assert.match(welcomeSource, /welcome-secondary-card-icon/);
  assert.doesNotMatch(welcomeSource, /welcome-secondary-card-copy/);

  assert.doesNotMatch(welcomeCss, /welcome-header-actions|welcome-home-version|welcome-creator|welcome-school-login|welcome-create-hero\b/);
});

test('rodapé fica dentro do mesmo container com padding que o resto do conteúdo', () => {
  const bodyStart = welcomeSource.indexOf('<div className="welcome-body">');
  const footerPosition = welcomeSource.indexOf('<footer className="welcome-footer-line">');
  const showTutorialPosition = welcomeSource.indexOf('{showTutorial &&');

  assert.ok(bodyStart >= 0, 'A tela inicial precisa do container welcome-body.');
  assert.ok(
    footerPosition > bodyStart && footerPosition < showTutorialPosition,
    'O rodapé precisa estar dentro de welcome-body, não como irmão solto sem o padding do conteúdo.',
  );
});

test('blocos decorativos do herói somem em janelas estreitas, pra nunca sobrepor o botão de login escolar', () => {
  assert.match(welcomeSource, /<div className="welcome-hero-decor" aria-hidden="true">/);
  const decorMediaRule = welcomeCss.match(/@media \(max-width: (\d+)px\) \{\s*\.welcome-hero-decor \{ display: none; \}/);
  assert.ok(decorMediaRule, 'Deve existir um breakpoint escondendo .welcome-hero-decor em janelas estreitas.');
  assert.ok(Number(decorMediaRule[1]) >= 1200, 'O breakpoint precisa ser largo o bastante pra não sobrepor o Login escolar.');

  assert.match(welcomeCss, /@media \(prefers-reduced-motion: reduce\) \{\s*\.welcome-hero-block \{ animation: none; \}/);
});

test('tutorial fullscreen tem doze etapas curtas com os controles reais da IDE e a11y', () => {
  const overlayRule = balancedBlock(tutorialCss, '.bloquin-tutorial-overlay {');
  const tutorialRule = balancedBlock(tutorialCss, '.bloquin-tutorial {');
  const contentRule = balancedBlock(tutorialCss, '.bloquin-tutorial-content {');
  const stepperRule = balancedBlock(tutorialCss, '.bloquin-tutorial-stepper {');
  const focusRule = balancedBlock(tutorialCss, '.bloquin-tutorial button:focus-visible {');
  const stepMatches = [...tutorialSource.matchAll(
    /\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*eyebrow:\s*'([^']+)',\s*title:\s*'([^']+)',\s*description:\s*'([^']+)',/g,
  )];
  const steps = stepMatches.map(([, id, label, eyebrow, title, description], index) => {
    // Isola só o trecho deste passo (até o início do próximo, ou o fim do
    // arquivo) para checar seu próprio campo `audience` sem vazar para o
    // objeto seguinte do array STEPS.
    const bodyStart = stepMatches[index].index;
    const bodyEnd = stepMatches[index + 1]?.index ?? tutorialSource.length;
    const body = tutorialSource.slice(bodyStart, bodyEnd);
    const audience = /audience:\s*'student'/.test(body) ? 'student' : undefined;
    return { id, label, eyebrow, title, description, audience };
  });

  assert.match(tutorialSource, /import logoSimples from '\.\.\/\.\.\/assets\/LogoSimples\.png';/);
  assert.match(tutorialSource, /useModalA11y<HTMLDivElement>\(onClose\)/);
  assert.match(tutorialSource, /className="bloquin-tutorial-overlay"/);
  assert.match(tutorialSource, /role="dialog"/);
  assert.match(tutorialSource, /aria-modal="true"/);
  assert.match(tutorialSource, /aria-labelledby=\{titleId\}/);
  assert.match(tutorialSource, /data-autofocus/);
  assert.match(tutorialSource, /aria-label="Fechar guia rápido"/);
  assert.match(tutorialSource, /role="progressbar" aria-label="Progresso do guia" aria-valuemin=\{0\} aria-valuemax=\{100\} aria-valuenow=\{progress\}/);
  assert.match(tutorialSource, /<nav className="bloquin-tutorial-stepper" aria-label="Etapas do guia">/);
  assert.match(tutorialSource, /aria-current=\{index === stepIndex \? 'step' : undefined\}/);
  assert.match(tutorialSource, /<main className="bloquin-tutorial-content" aria-live="polite">/);

  assert.equal(steps.length, 12, 'O guia deve manter doze etapas (9 anteriores + chat serial, projetos locais e componentes).');
  assert.deepEqual(
    steps.map(({ id, label }) => ({ id, label })),
    [
      { id: 'projeto', label: 'Projeto' },
      { id: 'placa', label: 'Placa' },
      { id: 'blocos', label: 'Blocos' },
      { id: 'enviar', label: 'Enviar' },
      { id: 'monitor', label: 'Chat' },
      { id: 'salvar', label: 'Salvar' },
      { id: 'projetos-locais', label: 'Salvos' },
      { id: 'importar', label: 'Importar' },
      { id: 'meus-projetos', label: 'Projetos' },
      { id: 'documentacao', label: 'Ajuda' },
      { id: 'componentes', label: 'Peças' },
      { id: 'biblioteca', label: 'Biblioteca' },
    ],
  );
  assert.ok(
    steps.every(({ description }) => description.length <= 90),
    'Cada etapa deve explicar uma única ideia em uma frase curta.',
  );
  for (const controlLabel of [
    'Novo projeto', 'PREPARAR', 'AGIR', 'Porta USB', 'Enviar', 'Salvar', 'Importar projeto', 'Documentação', 'Biblioteca',
    'Robô conectado', 'Exportar JSON', 'Componentes',
  ]) {
    assert.match(tutorialSource, new RegExp(controlLabel));
  }
  assert.match(tutorialSource, /Etapa \{stepIndex \+ 1\} de \{visibleSteps\.length\}/);

  // Passos exclusivos de quem tem conta (importar/meus-projetos/biblioteca) ficam
  // de fora quando o Tutorial é aberto pela tela inicial — ver WelcomeScreen.tsx.
  // monitor/projetos-locais/componentes são universais (visíveis sem conta também).
  const studentOnlyIds = new Set(['importar', 'meus-projetos', 'biblioteca']);
  for (const step of steps) {
    assert.equal(
      step.audience === 'student',
      studentOnlyIds.has(step.id),
      `audience da etapa "${step.id}" não corresponde ao esperado (deve ser 'student' só para ${[...studentOnlyIds].join(', ')}).`,
    );
  }

  assert.match(overlayRule, /position:\s*fixed/);
  assert.match(overlayRule, /inset:\s*0/);
  assert.match(overlayRule, /overflow:\s*hidden/);
  assert.match(tutorialRule, /width:\s*100%/);
  assert.match(tutorialRule, /height:\s*100%/);
  assert.match(tutorialRule, /min-width:\s*0/);
  assert.match(tutorialRule, /min-height:\s*0/);
  assert.match(tutorialRule, /grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto/);
  assert.match(contentRule, /overflow:\s*auto/);
  assert.match(stepperRule, /grid-template-columns:\s*repeat\(var\(--tutorial-step-count, 5\), minmax\(0, 1fr\)\)/);
  assert.match(focusRule, /outline:\s*3px solid var\(--primary\)/);
  assert.doesNotMatch(tutorialCss, /max-width:\s*580px|\.tutorial-modal/);
});

test('tela inicial e aluno reabrem o mesmo Tutorial, sem uma segunda implementação', () => {
  assert.match(loginSource, /import TutorialModal from "\.\.\/components\/modals\/TutorialModal";/);
  assert.match(welcomeSource, /import TutorialModal from '\.\.\/components\/modals\/TutorialModal';/);
  assert.match(studentDashboardSource, /import TutorialModal from '\.\.\/components\/modals\/TutorialModal';/);

  assert.match(welcomeSource, /<TutorialModal onClose=\{\(\) => setShowTutorial\(false\)\} audience="visitor" \/>/);
  assert.match(studentDashboardSource, /<TutorialModal onClose=\{\(\) => setShowTutorial\(false\)\} \/>/);

  for (const source of [welcomeSource, studentDashboardSource]) {
    assert.match(source, /const \[showTutorial, setShowTutorial\] = useState\(false\);/);
  }
});
