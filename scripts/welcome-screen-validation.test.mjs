import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const entryBackButtonSource = readFileSync(new URL('../src/components/EntryBackButton.tsx', import.meta.url), 'utf8');
const entryBackButtonCss = readFileSync(new URL('../src/components/EntryBackButton.css', import.meta.url), 'utf8');
const loginSource = readFileSync(new URL('../src/screens/LoginScreen.tsx', import.meta.url), 'utf8');
const splashSource = readFileSync(new URL('../src/components/SplashScreen.tsx', import.meta.url), 'utf8');
const visitorSource = readFileSync(new URL('../src/screens/VisitorDashboard.tsx', import.meta.url), 'utf8');
const welcomeSource = readFileSync(new URL('../src/screens/WelcomeScreen.tsx', import.meta.url), 'utf8');
const welcomeCss = readFileSync(new URL('../src/screens/WelcomeScreen.css', import.meta.url), 'utf8');
const appCss = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8');
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

  const capabilityLabels = [...welcomeSource.matchAll(/\{ label: '([^']+)', Icon:/g)]
    .map((match) => match[1]);
  assert.deepEqual(capabilityLabels, ['BLOCOS', 'CÓDIGO', 'HARDWARE']);
  assert.match(welcomeSource, /className="welcome-capabilities" aria-label="Blocos, código e hardware"/);
  assert.match(welcomeSource, /className=\{`welcome-connector welcome-connector--\$\{accent\}`\}/);

  assert.match(
    welcomeSource,
    /<button type="button" className="welcome-button welcome-button--enter" onClick=\{onEnter\}>[\s\S]*?<span>ENTRAR<\/span>[\s\S]*?<\/button>/,
  );
  assert.match(
    welcomeSource,
    /<button type="button" className="welcome-button welcome-button--visitor" onClick=\{onVisitor\}>[\s\S]*?<span>VISITANTE<\/span>[\s\S]*?<\/button>/,
  );
  assert.match(welcomeSource, /className="welcome-version" aria-label=\{`Versão instalada \$\{version\}`\}/);

  for (const position of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    assert.match(welcomeSource, new RegExp(`welcome-puzzle welcome-puzzle--${position}`));
  }
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
  const splashLogoRule = balancedBlock(appCss, '.splash-logo {');
  const splashLetterRule = balancedBlock(appCss, '.splash-letter {');
  const splashImageRule = balancedBlock(appCss, '.splash-letter-image {');
  const loginLogoRule = balancedBlock(appCss, '.login-logo {');

  assert.match(splashSource, /import logoCompleta from '\.\.\/assets\/LogoCompleta\.png';/);
  assert.match(splashSource, /src=\{logoCompleta\}[\s\S]*?className="splash-letter-image"/);
  assert.match(splashLogoRule, /aspect-ratio:\s*5\.5\s*\/\s*1/);
  assert.match(splashLogoRule, /background:\s*transparent/);
  assert.doesNotMatch(splashLogoRule, /2172\s*\/\s*392/);
  assert.match(splashLetterRule, /background:\s*transparent/);
  assert.match(splashImageRule, /top:\s*50%/);
  assert.match(splashImageRule, /height:\s*auto/);
  assert.match(splashImageRule, /transform:\s*translateY\(-50%\)/);

  assert.match(loginLogoRule, /aspect-ratio:\s*5\.5\s*\/\s*1/);
  assert.match(loginLogoRule, /height:\s*auto/);
  assert.match(loginLogoRule, /object-fit:\s*cover/);
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
  const decorationRule = balancedBlock(welcomeCss, '.welcome-decoration {');
  const contentRule = balancedBlock(welcomeCss, '.welcome-content {');
  const logoFrameRule = balancedBlock(welcomeCss, '.welcome-logo-frame {');
  const logoImageRule = balancedBlock(welcomeCss, '.welcome-logo-image {');
  const mobileMedia = balancedBlock(welcomeCss, '@media (max-width: 480px) {');
  const shortMedia = balancedBlock(welcomeCss, '@media (max-height: 560px) {');
  const reducedMotion = balancedBlock(welcomeCss, '@media (prefers-reduced-motion: reduce) {');

  assert.match(screenRule, /position:\s*absolute/);
  assert.match(screenRule, /inset:\s*0/);
  assert.match(screenRule, /width:\s*auto/);
  assert.match(screenRule, /height:\s*auto/);
  assert.match(screenRule, /min-width:\s*0/);
  assert.match(screenRule, /min-height:\s*0/);
  assert.match(screenRule, /overflow:\s*hidden/);
  assert.match(screenRule, /overflow:\s*clip/);
  assert.match(screenRule, /contain:\s*layout paint/);
  assert.doesNotMatch(screenRule, /overflow:\s*(?:auto|scroll)/);

  assert.match(decorationRule, /position:\s*absolute/);
  assert.match(decorationRule, /inset:\s*0/);
  assert.match(decorationRule, /overflow:\s*clip/);
  assert.match(decorationRule, /contain:\s*paint/);
  assert.doesNotMatch(decorationRule, /overflow:\s*(?:auto|scroll)/);

  assert.match(contentRule, /width:\s*min\(640px, calc\(100% - 32px\)\)/);
  assert.match(contentRule, /max-height:\s*100%/);
  assert.match(contentRule, /padding:\s*clamp\(/);
  assert.match(contentRule, /row-gap:\s*clamp\(/);

  assert.match(logoFrameRule, /width:\s*clamp\(210px, 38vw, 400px\)/);
  assert.match(logoFrameRule, /max-width:\s*100%/);
  assert.match(logoFrameRule, /aspect-ratio:\s*5\.5\s*\/\s*1/);
  assert.match(logoFrameRule, /background:\s*transparent/);
  assert.match(logoFrameRule, /filter:\s*drop-shadow\(/);
  assert.doesNotMatch(logoFrameRule, /(?:^|;)\s*(?:padding|border|box-shadow):/);
  assert.match(logoImageRule, /width:\s*100%/);
  assert.match(logoImageRule, /height:\s*100%/);
  assert.match(logoImageRule, /object-fit:\s*cover/);
  assert.match(logoImageRule, /object-position:\s*center/);

  assert.doesNotMatch(welcomeCss, /100(?:d?vh|vw)/);

  assert.match(mobileMedia, /\.welcome-content\s*\{[\s\S]*?width:\s*calc\(100% - 24px\)/);
  assert.match(mobileMedia, /\.welcome-button\s*\{\s*padding-inline:\s*10px/);
  assert.match(mobileMedia, /\.welcome-puzzle\s*\{\s*opacity:\s*0\.43/);
  assert.match(shortMedia, /\.welcome-content\s*\{[\s\S]*?padding:\s*16px 0 32px[\s\S]*?row-gap:\s*16px/);
  assert.match(shortMedia, /\.welcome-logo-frame\s*\{\s*width:\s*clamp\(200px, 34vw, 320px\)/);
  assert.match(shortMedia, /\.welcome-button\s*\{\s*min-height:\s*46px/);

  assert.match(reducedMotion, /\.welcome-logo-frame\s*\{\s*animation:\s*none/);
  assert.match(reducedMotion, /\.welcome-button\s*\{[\s\S]*?transition-duration:\s*0\.01ms/);
});
