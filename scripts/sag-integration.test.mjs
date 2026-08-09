import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('SAG usa um child WebView restrito dentro da aba interna', async () => {
  const [app, teacher, sag, tabs, rust, cargo, capabilitySource, configSource] = await Promise.all([
    source('../src/App.tsx'),
    source('../src/screens/TeacherDashboard.tsx'),
    source('../src/screens/SagScreen.tsx'),
    source('../src/state/tabsStore.tsx'),
    source('../src-tauri/src/lib.rs'),
    source('../src-tauri/Cargo.toml'),
    source('../src-tauri/capabilities/default.json'),
    source('../src-tauri/tauri.conf.json'),
  ]);

  // A rota continua sendo uma única aba do workspace, não uma janela extra.
  assert.match(app, /openInternalPage\('sag'\)/u);
  assert.match(app, /path="\/sag"/u);
  assert.match(teacher, /onOpenSag/u);
  assert.match(tabs, /InternalPageType = 'library' \| 'components' \| 'sag'/u);
  assert.match(tabs, /current\.find\(\(tab\) => tab\.type === type\)/u);

  // O React mede o host DOM e controla todo o ciclo de vida do WebView nativo.
  assert.match(sag, /hostRef\.current\.getBoundingClientRect\(\)/u);
  assert.match(sag, /x: rect\.x, y: rect\.y, width: rect\.width, height: rect\.height/u);
  assert.match(sag, /new ResizeObserver\(\(\) => syncNativeSag\(\)\)/u);
  assert.match(sag, /invoke\('open_sag', \{ bounds: nextBounds \}\)/u);
  assert.match(sag, /invoke\('hide_sag'\)/u);
  assert.match(sag, /invoke\('reload_sag'\)/u);
  assert.match(sag, /invoke\('dispose_sag'\)/u);
  assert.match(sag, /window\.addEventListener\('scroll', syncNativeSag, true\)/u);

  // O child abre uma URL externa e só pode navegar dentro da origem SAG HTTPS.
  assert.match(
    rust,
    /WebviewBuilder::new\(SAG_WEBVIEW_LABEL, WebviewUrl::External\(sag_url\)\)/u,
  );
  assert.match(rust, /\.on_navigation\(is_allowed_sag_navigation\)/u);
  assert.match(rust, /url\.scheme\(\) == "https"/u);
  assert.match(rust, /url\.host_str\(\), Some\("sagsite\.vercel\.app"\)/u);
  assert.match(rust, /url\.port_or_known_default\(\) == Some\(443\)/u);
  assert.match(rust, /\.on_new_window\(\|_, _\| NewWindowResponse::Deny\)/u);
  assert.match(rust, /\.on_download\(\|_, _\| false\)/u);
  assert.match(rust, /page_events\.emit_to\(\s*"main",\s*"sag-page-load",/su);

  // Eventos de carregamento não levam URL, cookie ou credencial para o React.
  const pageLoadHandler = rust.match(/\.on_page_load\(move \|_, payload\| \{(?<body>[\s\S]*?)\n\s*\}\);/u)
    ?.groups?.body;
  assert.ok(pageLoadHandler, 'o child WebView deve informar o estado de carregamento');
  assert.match(pageLoadHandler, /SagPageLoad \{\s*state: state\.to_string\(\),\s*\}/su);
  assert.doesNotMatch(pageLoadHandler, /\b(url|token|cookie|credential|authorization)\b/iu);

  // Há uma trava para criação concorrente e comandos explícitos para ocultar,
  // recarregar e descartar o child quando a aba deixa de existir.
  assert.match(rust, /struct SagWebviewGate\(Mutex<\(\)>\);/u);
  assert.match(rust, /\.manage\(SagWebviewGate\(Mutex::new\(\(\)\)\)\)/u);
  assert.match(rust, /async fn open_sag\([\s\S]*?gate: tauri::State<'_, SagWebviewGate>/u);
  assert.match(rust, /fn hide_sag\([\s\S]*?webview\s*\.hide\(\)/u);
  assert.match(rust, /fn reload_sag\([\s\S]*?webview\s*\.reload\(\)/u);
  assert.match(rust, /fn dispose_sag\([\s\S]*?webview\s*\.close\(\)/u);
  assert.match(rust, /ensure_main_webview\(&caller\)/u);

  // `add_child` e `get_webview` são APIs Tauri instáveis e foram habilitadas
  // de modo explícito, sem dar as permissões do app ao child remoto.
  assert.match(
    cargo,
    /tauri\s*=\s*\{[^}]*features\s*=\s*\[[^\]]*"unstable"[^\]]*\]/su,
  );
  const capability = JSON.parse(capabilitySource);
  assert.deepEqual(capability.webviews, ['main']);
  assert.equal(Object.hasOwn(capability, 'windows'), false);
  assert.equal(Object.hasOwn(capability, 'remote'), false);

  // O CSP do app local não precisa permitir o SAG: ele não é um iframe.
  const config = JSON.parse(configSource);
  const csp = config.app?.security?.csp ?? '';
  assert.doesNotMatch(csp, /sagsite\.vercel\.app/iu);

  // Não pode sobrar o caminho antigo de iframe, browser externo, handoff ou
  // credenciais do Bloquin para autenticar no SAG.
  const integrationSource = `${app}\n${sag}\n${rust}`;
  assert.doesNotMatch(integrationSource, /<iframe\b/iu);
  assert.doesNotMatch(integrationSource, /\bWebviewWindowBuilder\b/u);
  assert.doesNotMatch(integrationSource, /\bopenUrl\s*\(/u);
  assert.doesNotMatch(integrationSource, /\bwindow\.open\s*\(/u);
  assert.doesNotMatch(integrationSource, /\b(handoff|auto-?login|credentials)\b/iu);
  assert.doesNotMatch(integrationSource, /\b(access_token|refresh_token|admin-panel)\b/iu);
});
