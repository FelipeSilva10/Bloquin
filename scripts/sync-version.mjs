import { readFile, writeFile } from 'node:fs/promises';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Uso: node scripts/sync-version.mjs <versão-semver>');
  process.exit(1);
}

const replacements = [
  {
    path: 'package.json',
    pattern: /("version"\s*:\s*")[^"]+(")/,
    replacement: `$1${version}$2`,
  },
  {
    path: 'src-tauri/tauri.conf.json',
    pattern: /("version"\s*:\s*")[^"]+(")/,
    replacement: `$1${version}$2`,
  },
  {
    path: 'src-tauri/Cargo.toml',
    pattern: /(^version\s*=\s*")[^"]+(")/m,
    replacement: `$1${version}$2`,
  },
  {
    path: 'package-lock.json',
    pattern: /(^  "version"\s*:\s*")[^"]+(",)/m,
    replacement: `$1${version}$2`,
  },
  {
    path: 'package-lock.json',
    pattern: /("packages"\s*:\s*\{\s*""\s*:\s*\{\s*"name"\s*:\s*"bloquin",\s*"version"\s*:\s*")[^"]+(")/m,
    replacement: `$1${version}$2`,
  },
  {
    path: 'src-tauri/Cargo.lock',
    pattern: /(name = "bloquin"\nversion = ")[^"]+(")/,
    replacement: `$1${version}$2`,
  },
];

const updatedFiles = new Map();
for (const item of replacements) {
  const source = updatedFiles.get(item.path) ?? await readFile(item.path, 'utf8');
  if (!item.pattern.test(source)) {
    throw new Error(`Não encontrei a versão em ${item.path}`);
  }
  updatedFiles.set(item.path, source.replace(item.pattern, item.replacement));
}

for (const [path, source] of updatedFiles) {
  await writeFile(path, source);
}

console.log(`Versão sincronizada: ${version}`);
