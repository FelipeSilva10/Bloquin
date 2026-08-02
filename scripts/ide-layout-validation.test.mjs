import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8');
const ideSource = readFileSync(new URL('../src/screens/IdeScreen.tsx', import.meta.url), 'utf8');
const tauriConfig = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));

function cssRule(selector, occurrence = 0) {
  const marker = `${selector} {`;
  let start = -1;
  let searchFrom = 0;

  for (let index = 0; index <= occurrence; index += 1) {
    start = cssSource.indexOf(marker, searchFrom);
    assert.notEqual(start, -1, `Regra CSS ausente: ${selector}`);
    searchFrom = start + marker.length;
  }

  const bodyStart = start + marker.length;
  let depth = 1;
  for (let index = bodyStart; index < cssSource.length; index += 1) {
    if (cssSource[index] === '{') depth += 1;
    if (cssSource[index] === '}') depth -= 1;
    if (depth === 0) return cssSource.slice(bodyStart, index);
  }

  assert.fail(`Regra CSS sem fechamento: ${selector}`);
}

test('shell desconta a barra de abas pelo fluxo flexível, sem repetir a altura do viewport', () => {
  const shellStart = appSource.indexOf('<div className="workspace-shell">');
  const tabsPosition = appSource.indexOf('<WorkspaceTabs role={role} />', shellStart);
  const viewportPosition = appSource.indexOf('className={`workspace-viewport', tabsPosition);

  assert.ok(shellStart >= 0 && tabsPosition > shellStart && viewportPosition > tabsPosition);
  assert.match(cssRule('html, body, #root'), /height:\s*100%/);
  assert.doesNotMatch(cssRule('html, body, #root'), /100(?:d?vh|vw)/);
  assert.match(cssRule('.workspace-shell'), /display:\s*flex/);
  assert.match(cssRule('.workspace-shell'), /height:\s*100%/);
  assert.match(cssRule('.workspace-shell'), /flex-direction:\s*column/);
  assert.match(cssRule('.workspace-shell'), /overflow:\s*hidden/);
  assert.match(cssRule('.tab-bar'), /flex:\s*0\s+0\s+var\(--workspace-tab-height\)/);
  assert.match(cssRule('.workspace-viewport'), /flex:\s*1\s+1\s+0/);
  assert.match(cssRule('.workspace-viewport'), /min-height:\s*0/);
  assert.match(cssRule('.workspace-viewport--ide'), /overflow:\s*hidden/);
});

test('IDE e host do Blockly preenchem somente o espaço restante e podem encolher', () => {
  const appContainer = cssRule('.app-container');
  const workspaceArea = cssRule('.workspace-area');
  const blocklyHost = cssRule('#blocklyDiv');

  assert.match(appContainer, /height:\s*100%/);
  assert.match(appContainer, /min-height:\s*0/);
  assert.match(appContainer, /overflow:\s*hidden/);
  assert.doesNotMatch(appContainer, /100d?vh|calc\(/);

  for (const rule of [workspaceArea, blocklyHost]) {
    assert.match(rule, /min-width:\s*0/);
    assert.match(rule, /min-height:\s*0/);
    assert.match(rule, /flex:\s*1\s+1\s+0/);
    assert.match(rule, /overflow:\s*hidden/);
    assert.doesNotMatch(rule, /100d?vh|calc\(/);
  }

  assert.match(cssRule('.workspace-keepalive'), /height:\s*100%/);
  assert.doesNotMatch(cssRule('.workspace-keepalive'), /100d?vh|calc\(/);
});

test('Blockly é redimensionado quando o container ou o WebView mudam', () => {
  assert.match(ideSource, /new ResizeObserver\(scheduleWorkspaceResize\)/);
  assert.match(ideSource, /resizeObserver\?\.observe\(container\)/);
  assert.match(ideSource, /Blockly\.svgResize\(currentWorkspace\)/);
  assert.match(ideSource, /window\.addEventListener\('resize', scheduleWorkspaceResize\)/);
  assert.match(ideSource, /visualViewport\?\.addEventListener\('resize', scheduleWorkspaceResize\)/);
  assert.match(ideSource, /document\.addEventListener\('fullscreenchange', scheduleWorkspaceResize\)/);
  assert.match(ideSource, /document\.fonts\?\.ready\.then\(scheduleWorkspaceResize\)/);
  assert.match(ideSource, /window\.requestAnimationFrame\(resizeWorkspace\)/);
});

test('lixeira e zoom usam o sprite incluído no bundle de produção', () => {
  assert.match(ideSource, /new URL\(\s*'\.\.\/\.\.\/node_modules\/blockly\/media\/sprites\.png'/);
  assert.match(ideSource, /bindBundledBlocklyControlSprites\(blocklyDiv\.current\)/);
  assert.match(ideSource, /image\.setAttributeNS\(xlinkNamespace, 'href', blocklyControlsSpriteUrl\)/);
});

test('painel de código em tela cheia usa os limites reais do viewport', () => {
  const fullscreenPanel = cssRule('.code-panel.fullscreen');
  assert.match(fullscreenPanel, /position:\s*fixed/);
  assert.match(fullscreenPanel, /inset:\s*0/);
  assert.doesNotMatch(fullscreenPanel, /100d?vh|100vw|calc\(/);
});

test('janela desktop não pode encolher abaixo da área mínima utilizável', () => {
  const mainWindow = tauriConfig.app.windows[0];
  assert.ok(mainWindow.minWidth >= 360);
  assert.ok(mainWindow.minHeight >= 480);
});

test('seletor de porta USB contém textos longos sem invadir a ação de atualizar', () => {
  const triggerLabel = cssRule('.bloquin-select-value');

  assert.match(triggerLabel, /min-width:\s*0/);
  assert.match(triggerLabel, /overflow:\s*hidden/);
  assert.match(triggerLabel, /text-overflow:\s*ellipsis/);
  assert.match(triggerLabel, /white-space:\s*nowrap/);
  assert.match(cssRule('.ide-port-select .bloquin-select-trigger'), /gap:\s*7px/);
  assert.match(ideSource, /placeholder="Sem porta USB"/);
  assert.match(ideSource, /<Usb className="ide-action-icon ide-port-icon"/);
  assert.match(ideSource, /<RefreshCw className="ide-action-icon ide-refresh-icon"/);
  assert.match(ideSource, /isRefreshingPorts \? 'is-refreshing' : ''/);
  assert.doesNotMatch(ideSource, /icon="🔄"/);
});

test('ações da IDE usam uma única família de ícones vetoriais', () => {
  for (const icon of ['Upload', 'Code2', 'Save', 'SaveAll', 'FileJson', 'MessageCircle', 'LogOut', 'Ellipsis']) {
    assert.match(ideSource, new RegExp(`<${icon} className="ide-action-icon"`));
  }

  assert.match(ideSource, /from 'lucide-react'/);
  assert.doesNotMatch(ideSource, /icon_(?:chat|enviar|sair|salvar|salvar_como|ver_codigo)\.png/);
  assert.doesNotMatch(ideSource, /ide-toolbar-icon-image|ide-toolbar-json-icon/);
});

test('Blockly mantém flyout e controles dentro do host ao redimensionar', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="blockly-test-host"></div></body></html>', {
    pretendToBeVisual: true,
  });
  const dimensions = { width: 1000, height: 692, toolboxWidth: 150, dpr: 1 };

  for (const key of [
    'window',
    'document',
    'navigator',
    'Element',
    'HTMLElement',
    'SVGElement',
    'SVGSVGElement',
    'HTMLCanvasElement',
    'Node',
    'DOMParser',
    'XMLSerializer',
    'Event',
    'MouseEvent',
    'KeyboardEvent',
    'PointerEvent',
  ]) {
    if (dom.window[key]) {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        writable: true,
        value: dom.window[key],
      });
    }
  }
  Object.defineProperty(globalThis, 'getComputedStyle', {
    configurable: true,
    writable: true,
    value: dom.window.getComputedStyle.bind(dom.window),
  });
  Object.defineProperty(dom.window, 'devicePixelRatio', {
    configurable: true,
    get: () => dimensions.dpr,
  });

  const makeRect = (width, height, left = 0, top = 0) => ({
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON() { return this; },
  });
  const htmlRect = (element) => {
    const classes = element.classList;
    if (element.id === 'blockly-test-host' || classes?.contains('injectionDiv')) {
      return makeRect(dimensions.width, dimensions.height);
    }
    if (classes?.contains('blocklyToolbox') || classes?.contains('blocklyToolboxCategoryGroup')) {
      return makeRect(dimensions.toolboxWidth, dimensions.height);
    }
    if (classes?.contains('blocklyToolboxCategoryContainer') || classes?.contains('blocklyToolboxCategory')) {
      return makeRect(dimensions.toolboxWidth, 40);
    }
    return makeRect(0, 0);
  };

  for (const property of ['offsetWidth', 'clientWidth']) {
    Object.defineProperty(dom.window.HTMLElement.prototype, property, {
      configurable: true,
      get() { return htmlRect(this).width; },
    });
  }
  for (const property of ['offsetHeight', 'clientHeight']) {
    Object.defineProperty(dom.window.HTMLElement.prototype, property, {
      configurable: true,
      get() { return htmlRect(this).height; },
    });
  }
  dom.window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return htmlRect(this);
  };
  dom.window.SVGElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    const width = Number.parseFloat(this.getAttribute('width') ?? '') || dimensions.width;
    const height = Number.parseFloat(this.getAttribute('height') ?? '') || dimensions.height;
    return makeRect(width, height);
  };
  dom.window.SVGElement.prototype.getBBox = function getBBox() {
    if (this.classList?.contains('blocklyBlockCanvas') && this.closest('.blocklyFlyout')) {
      // Simula uma categoria longa. O teste não depende do tamanho visual de
      // um bloco específico, apenas de haver conteúdo maior do que o flyout.
      return { x: 0, y: 0, width: 120, height: 1800 };
    }
    return { x: 0, y: 0, width: 120, height: 40 };
  };
  dom.window.SVGElement.prototype.getComputedTextLength = () => 60;
  dom.window.HTMLCanvasElement.prototype.getContext = () => ({
    font: '',
    measureText: (value) => ({ width: String(value).length * 7 }),
  });

  const { default: Blockly } = await import('blockly/core');
  await import('blockly/blocks');

  const host = dom.window.document.getElementById('blockly-test-host');
  const workspace = Blockly.inject(host, {
    toolbox: {
      kind: 'categoryToolbox',
      contents: [{
        kind: 'category',
        name: 'Categoria longa',
        contents: Array.from({ length: 30 }, (_, index) => ({
          kind: 'block',
          type: index % 2 === 0 ? 'text' : 'math_number',
        })),
      }],
    },
    move: { scrollbars: true, drag: true, wheel: true },
    zoom: { controls: true, wheel: true },
    trashcan: true,
    sounds: false,
  });

  try {
    const toolbox = workspace.getToolbox();
    assert.ok(toolbox);
    toolbox.setSelectedItem(toolbox.getToolboxItems()[0]);
    const flyout = toolbox.getFlyout();
    assert.ok(flyout);
    assert.equal(flyout.getWorkspace().getAllBlocks(false).length, 30);

    const scenarios = [
      { width: 1920, height: 972, dpr: 1 },
      { width: 1440, height: 792, dpr: 1.25 },
      { width: 1000, height: 692, dpr: 1.5 },
      { width: 768, height: 420, dpr: 2 },
      { width: 520, height: 300, dpr: 2 },
    ];

    for (const scenario of scenarios) {
      Object.assign(dimensions, scenario);
      Blockly.svgResize(workspace);

      const metrics = workspace.getMetrics();
      assert.equal(metrics?.svgWidth, scenario.width);
      assert.equal(metrics?.svgHeight, scenario.height);
      assert.equal(toolbox.getHeight(), scenario.height);
      assert.equal(flyout.getHeight(), scenario.height);
      assert.equal(flyout.isScrollable(), true);

      for (const componentId of ['trashcan', 'zoomControls']) {
        const component = workspace.getComponentManager().getComponent(componentId);
        const bounds = component?.getBoundingRectangle?.();
        assert.ok(bounds, `Componente sem limites: ${componentId}`);
        assert.ok(bounds.top >= 0 && bounds.left >= 0, `${componentId} saiu pelo topo/lado esquerdo`);
        assert.ok(bounds.bottom <= scenario.height, `${componentId} saiu pelo limite inferior`);
        assert.ok(bounds.right <= scenario.width, `${componentId} saiu pelo limite direito`);
      }
    }

    const flyoutWorkspace = flyout.getWorkspace();
    flyoutWorkspace.setMetrics({ y: 1 });
    const endMetrics = flyoutWorkspace.getMetrics();
    assert.ok(endMetrics);
    assert.ok(endMetrics.viewTop > 0);
    assert.ok(endMetrics.viewTop + endMetrics.viewHeight >= endMetrics.contentHeight);
  } finally {
    workspace.dispose();
    dom.window.close();
  }
});
