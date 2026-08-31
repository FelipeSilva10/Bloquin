import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const tauriConfig = JSON.parse(source('../src-tauri/tauri.conf.json'));
const releaseWorkflow = source('../.github/workflows/release.yml');
const renameScript = source('./rename-windows-installer.mjs');
const documentation = source('../docs/windows-installer.md');

test('NSIS usa explicitamente o ícone oficial do Bloquin no executável do instalador', () => {
  assert.equal(tauriConfig.bundle.windows.nsis.installerIcon, 'icons/icon.ico');
  const iconPath = new URL('../src-tauri/icons/icon.ico', import.meta.url);
  assert.ok(existsSync(iconPath));

  const icon = readFileSync(iconPath);
  assert.equal(icon.readUInt16LE(0), 0, 'cabeçalho ICO inválido');
  assert.equal(icon.readUInt16LE(2), 1, 'arquivo não é um ICO');
  assert.ok(icon.readUInt16LE(4) >= 6, 'o ICO precisa conter os tamanhos de ícone do instalador');
});

test('o nome do instalador vem da versão oficial sincronizada pela release', () => {
  assert.match(renameScript, /const version = packageJson\.version/u);
  assert.match(renameScript, /BloquinIDE_\$\{version\}\.exe/u);
  assert.match(releaseWorkflow, /node scripts\/sync-version\.mjs "\$VERSION"/u);
  assert.match(releaseWorkflow, /windows_asset=BloquinIDE_\$\{VERSION\}\.exe/u);
  assert.match(releaseWorkflow, /npm run tauri:windows/u);
});

test('a limitação de redistribuição do CP210x fica documentada e nenhum driver é empacotado sem autorização', () => {
  assert.match(documentation, /não é incorporado ao repositório nem ao instalador/u);
  assert.match(documentation, /pnputil\.exe/u);
  assert.match(documentation, /Silicon Labs/u);
});
