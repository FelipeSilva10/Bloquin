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
const visitorSource = readFileSync(new URL('../src/screens/VisitorDashboard.tsx', import.meta.url), 'utf8');
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

test('tela inicial usa o logo oficial e mantém as duas escolhas explícitas', () => {
  assert.match(welcomeSource, /<main className="welcome-screen">/);
  assert.match(welcomeSource, /<section className="welcome-content" aria-labelledby="welcome-title">/);
  assert.match(welcomeSource, /import logoCompleta from '\.\.\/assets\/LogoCompleta\.png';/);
  assert.match(welcomeSource, /<h1 id="welcome-title" className="sr-only">Bloquin IDE<\/h1>/);
  assert.match(
    welcomeSource,
    /<div className="welcome-logo-frame" aria-hidden="true">\s*<img className="welcome-logo-image" src=\{logoCompleta\} alt="" draggable="false" \/>\s*<\/div>/,
  );
  assert.doesNotMatch(welcomeSource, /logoLetters|welcome-logo-letter|LogoLetterStyle/);
  assert.doesNotMatch(welcomeCss, /welcome-logo-letter|--welcome-letter-/);

  const entryButtons = welcomeSource.match(/className="welcome-button welcome-button--(?:enter|visitor)"/g) ?? [];
  assert.equal(entryButtons.length, 2, 'A entrada deve oferecer apenas as escolhas Entrar e Continuar como visitante.');

  assert.match(
    welcomeSource,
    /<button type="button" className="welcome-button welcome-button--enter" onClick=\{onEnter\}>[\s\S]*?<span>Entrar<\/span>[\s\S]*?<\/button>/,
  );
  assert.match(
    welcomeSource,
    /<button type="button" className="welcome-button welcome-button--visitor" onClick=\{onVisitor\}>[\s\S]*?<span>Continuar como visitante<\/span>[\s\S]*?<\/button>/,
  );
  assert.match(welcomeSource, /className="welcome-version" aria-label=\{`Versão instalada \$\{version\}`\}/);

  for (const promotionalText of [
    /PROGRAMAR,\s*DESCOBRIR,\s*CRIAR/i,
    /Um espaço visual para transformar ideias em projetos com eletrônica\./i,
    /\bBLOCOS\b/,
    /\bCÓDIGO\b/,
    /\bHARDWARE\b/,
  ]) {
    assert.doesNotMatch(welcomeSource, promotionalText);
  }

  assert.doesNotMatch(welcomeSource, /welcome-(?:kicker|subtitle|capabilities|connector|puzzle|decoration)/);
  assert.doesNotMatch(welcomeCss, /welcome-(?:kicker|subtitle|capabilities|connector|puzzle|decoration)/);
});

test('tela inicial mantém um acesso discreto ao portfólio do criador', () => {
  assert.match(welcomeSource, /import \{ CREATOR_PORTFOLIO_URL, openCreatorPortfolio \} from '\.\.\/services\/creatorPortfolioService';/);
  assert.match(welcomeSource, /<footer className="welcome-creator">/);
  assert.match(welcomeSource, /Criado por Felipe Silva/);
  assert.match(welcomeSource, /href=\{CREATOR_PORTFOLIO_URL\}/);
  assert.match(welcomeSource, /onClick=\{handlePortfolioOpen\}/);
  assert.match(welcomeSource, /target="_blank"/);
  assert.match(welcomeSource, /rel="noopener noreferrer"/);
  assert.match(creatorPortfolioSource, /CREATOR_PORTFOLIO_URL = 'https:\/\/felipesilva10\.github\.io\/Portifolio\/'/);
  assert.match(creatorPortfolioSource, /await openUrl\(CREATOR_PORTFOLIO_URL\)/);
  assert.match(creatorPortfolioSource, /window\.open\(CREATOR_PORTFOLIO_URL, '_blank', 'noopener,noreferrer'\)/);
  assert.match(welcomeCss, /\.welcome-creator \{/);
  assert.match(welcomeCss, /\.welcome-creator a \{/);
});

test('entrada e login permanecem em rotas separadas', () => {
  const welcomeRoute = routeSource('/', '/login');
  const loginRoute = routeSource('/login', '/dashboard');

  assert.match(welcomeRoute, /role === 'guest'/);
  assert.match(welcomeRoute, /<WelcomeScreen/);
  assert.match(welcomeRoute, /onEnter=\{\(\) => navigate\('\/login'\)\}/);
  assert.match(welcomeRoute, /onVisitor=\{handleVisitorEntry\}/);
  assert.match(welcomeRoute, /:\s*<Navigate to="\/dashboard" replace \/>/);
  assert.doesNotMatch(welcomeRoute, /activeTab\.type|to="\/ide"/);
  assert.doesNotMatch(welcomeRoute, /<LoginScreen/);

  assert.match(loginRoute, /role === 'guest'/);
  assert.match(loginRoute, /<LoginScreen/);
  assert.match(loginRoute, /onLogin=\{handleLogin\}/);
  assert.match(loginRoute, /onBack=\{\(\) => navigate\('\/', \{ replace: true \}\)\}/);
  assert.match(loginRoute, /beforeLogin=\{\(\) => logoutCleanupRef\.current\}/);
  assert.doesNotMatch(loginRoute, /<WelcomeScreen|handleVisitorEntry/);
});

test('login e dashboard visitante reutilizam o mesmo botão discreto de retorno', () => {
  for (const source of [loginSource, visitorSource]) {
    assert.match(source, /import \{ EntryBackButton \} from '\.\.\/components\/EntryBackButton';/);
  }

  assert.match(
    loginSource,
    /<EntryBackButton\s+className="entry-back-button--overlay login-entry-back"\s+onClick=\{onBack\}\s+disabled=\{loading\}\s*\/>/,
  );
  assert.match(visitorSource, /<EntryBackButton onClick=\{onExitVisitor\} disabled=\{isOpening\} \/>/);
  assert.doesNotMatch(visitorSource, /className="btn-secondary"[^>]*>Voltar/);

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

  const entrySources = [appSource, welcomeSource, loginSource, visitorSource].join('\n');
  assert.doesNotMatch(entrySources, /import\s+GuestInfoModal|<GuestInfoModal/);
  assert.doesNotMatch(loginSource, /Entrar como Visitante/i);
  assert.doesNotMatch(entrySources, /showGuestInfo|handleEnterAsGuest|handleGuestConfirmed/);
  assert.doesNotMatch(loginSource, /onLogin\('visitor'\)/);
});

test('entrada visitante limpa abas e chega à dashboard sem criar projeto', () => {
  const visitorEntry = balancedBlock(appSource, 'const handleVisitorEntry = () => {');
  const resetPosition = visitorEntry.indexOf('resetTabs();');
  const rolePosition = visitorEntry.indexOf("setRole('visitor');");

  assert.ok(resetPosition >= 0, 'Entrada visitante deve limpar as abas anteriores.');
  assert.ok(rolePosition > resetPosition, 'O papel visitante deve ser definido depois da limpeza das abas.');
  assert.match(visitorEntry, /setUserId\(null\)/);
  assert.match(visitorEntry, /logoutCleanupRef\.current = signOutLocalSafely\(\)/);
  assert.doesNotMatch(visitorEntry, /openProject|workspaceTabId|navigate\('\/ide'/);

  const welcomeRoute = routeSource('/', '/login');
  assert.match(welcomeRoute, /role === 'guest'[\s\S]*?:\s*<Navigate to="\/dashboard" replace \/>/);
  assert.doesNotMatch(welcomeRoute, /role === 'visitor' && activeTab\.type === 'project'|to="\/ide"/);
});

test('dashboard visitante só cria ou importa projeto antes de abrir a IDE', () => {
  const createProject = balancedBlock(visitorSource, 'const createProject = () => {');
  const openParsedProject = balancedBlock(visitorSource, 'const openParsedProject = (contents: string, filePath: string) => {');
  const dashboardRoute = routeSource('/dashboard', '/biblioteca');

  const createPosition = createProject.indexOf("openProject({ title: 'Projeto visitante', source: 'memory', board: null });");
  const createNavigationPosition = createProject.indexOf('onOpenProject(id);');
  assert.ok(createPosition >= 0, 'Novo projeto deve ser criado na dashboard visitante.');
  assert.ok(createNavigationPosition > createPosition, 'A IDE só deve abrir depois da criação da aba.');

  const importPosition = openParsedProject.indexOf('const id = openProject({');
  const importNavigationPosition = openParsedProject.indexOf('onOpenProject(id);');
  assert.ok(importPosition >= 0, 'Projeto importado deve virar uma aba na dashboard visitante.');
  assert.ok(importNavigationPosition > importPosition, 'A IDE só deve abrir depois da importação da aba.');

  assert.match(dashboardRoute, /role === 'visitor'[\s\S]*?<VisitorDashboard/);
  assert.match(dashboardRoute, /onExitVisitor=\{handleLogout\}/);
  assert.match(
    dashboardRoute,
    /onOpenProject=\{\(tabId\) => \{[\s\S]*?activateTab\(tabId\);[\s\S]*?navigate\('\/ide', \{ state: \{ readOnly: false, workspaceTabId: tabId \} \}\);[\s\S]*?\}\}/,
  );
  assert.doesNotMatch(visitorSource, /navigate\('\/ide'/);
});

test('layout inicial fica preso à área útil sem scroll e reduz a escala responsivamente', () => {
  const screenRule = balancedBlock(welcomeCss, '.welcome-screen {');
  const contentRule = balancedBlock(welcomeCss, '.welcome-content {');
  const logoFrameRule = balancedBlock(welcomeCss, '.welcome-logo-frame {');
  const logoImageRule = balancedBlock(welcomeCss, '.welcome-logo-image {');
  const mobileMedia = balancedBlock(welcomeCss, '@media (max-width: 480px) {');
  const shortMedia = balancedBlock(welcomeCss, '@media (max-height: 560px) {');
  const reducedMotion = balancedBlock(welcomeCss, '@media (prefers-reduced-motion: reduce) {');

  assert.match(screenRule, /position:\s*absolute/);
  assert.match(screenRule, /inset:\s*0/);
  assert.match(screenRule, /display:\s*grid/);
  assert.match(screenRule, /place-items:\s*center/);
  assert.match(screenRule, /min-width:\s*0/);
  assert.match(screenRule, /min-height:\s*0/);
  assert.match(screenRule, /overflow:\s*hidden/);
  assert.doesNotMatch(screenRule, /overflow:\s*(?:auto|scroll)/);

  assert.match(contentRule, /width:\s*min\(540px, calc\(100% - 32px\)\)/);
  assert.match(contentRule, /max-height:\s*100%/);
  assert.match(contentRule, /padding:\s*clamp\(/);
  assert.match(contentRule, /row-gap:\s*clamp\(/);

  assert.match(logoFrameRule, /width:\s*min\(100%, clamp\(260px, 50vw, 500px\)\)/);
  assert.match(logoFrameRule, /display:\s*flex/);
  assert.match(logoFrameRule, /filter:\s*drop-shadow\(/);
  assert.doesNotMatch(logoFrameRule, /aspect-ratio|overflow/);
  assert.match(logoImageRule, /width:\s*100%/);
  assert.match(logoImageRule, /height:\s*auto/);
  assert.match(logoImageRule, /object-fit:\s*contain/);

  assert.doesNotMatch(welcomeCss, /100(?:d?vh|vw)/);

  assert.match(mobileMedia, /\.welcome-content\s*\{[\s\S]*?width:\s*calc\(100% - 24px\)/);
  assert.match(mobileMedia, /\.welcome-actions\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(mobileMedia, /\.welcome-button\s*\{\s*padding-inline:\s*16px/);
  assert.match(shortMedia, /\.welcome-content\s*\{[\s\S]*?padding:\s*14px 0 28px[\s\S]*?row-gap:\s*18px/);
  assert.match(shortMedia, /\.welcome-logo-frame\s*\{\s*width:\s*clamp\(220px, 42vw, 380px\)/);
  assert.match(shortMedia, /\.welcome-button\s*\{\s*min-height:\s*44px/);

  assert.match(reducedMotion, /\.welcome-logo-frame\s*\{\s*animation:\s*none/);
  assert.match(reducedMotion, /\.welcome-button\s*\{[\s\S]*?transition-duration:\s*0\.01ms/);
});

test('tutorial fullscreen tem cinco etapas curtas com os controles reais da IDE e a11y', () => {
  const overlayRule = balancedBlock(tutorialCss, '.bloquin-tutorial-overlay {');
  const tutorialRule = balancedBlock(tutorialCss, '.bloquin-tutorial {');
  const contentRule = balancedBlock(tutorialCss, '.bloquin-tutorial-content {');
  const stepperRule = balancedBlock(tutorialCss, '.bloquin-tutorial-stepper {');
  const focusRule = balancedBlock(tutorialCss, '.bloquin-tutorial button:focus-visible {');
  const steps = [...tutorialSource.matchAll(
    /\{\s*id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*eyebrow:\s*'([^']+)',\s*title:\s*'([^']+)',\s*description:\s*'([^']+)',/g,
  )].map(([, id, label, eyebrow, title, description]) => ({ id, label, eyebrow, title, description }));

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

  assert.equal(steps.length, 5, 'O guia deve manter somente cinco etapas.');
  assert.deepEqual(
    steps.map(({ id, label }) => ({ id, label })),
    [
      { id: 'projeto', label: 'Projeto' },
      { id: 'placa', label: 'Placa' },
      { id: 'blocos', label: 'Blocos' },
      { id: 'enviar', label: 'Enviar' },
      { id: 'salvar', label: 'Salvar' },
    ],
  );
  assert.ok(
    steps.every(({ description }) => description.length <= 90),
    'Cada etapa deve explicar uma única ideia em uma frase curta.',
  );
  for (const controlLabel of ['Novo projeto', 'PREPARAR', 'AGIR', 'Porta USB', 'Enviar', 'Salvar']) {
    assert.match(tutorialSource, new RegExp(controlLabel));
  }
  assert.match(tutorialSource, /Etapa \{stepIndex \+ 1\} de \{STEPS\.length\}/);

  assert.match(overlayRule, /position:\s*fixed/);
  assert.match(overlayRule, /inset:\s*0/);
  assert.match(overlayRule, /overflow:\s*hidden/);
  assert.match(tutorialRule, /width:\s*100%/);
  assert.match(tutorialRule, /height:\s*100%/);
  assert.match(tutorialRule, /min-width:\s*0/);
  assert.match(tutorialRule, /min-height:\s*0/);
  assert.match(tutorialRule, /grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto/);
  assert.match(contentRule, /overflow:\s*auto/);
  assert.match(stepperRule, /grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(focusRule, /outline:\s*3px solid var\(--primary\)/);
  assert.doesNotMatch(tutorialCss, /max-width:\s*580px|\.tutorial-modal/);
});
