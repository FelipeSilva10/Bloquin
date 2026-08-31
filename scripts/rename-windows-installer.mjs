import { readdir, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const version = packageJson.version;

if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error('package.json não contém uma versão SemVer válida para nomear o instalador Windows.');
}

const outputDirectory = resolve('src-tauri/target/release/bundle/nsis');
const expectedName = `BloquinIDE_${version}.exe`;
const entries = await readdir(outputDirectory, { withFileTypes: true });
const installers = entries
  .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))
  .map((entry) => entry.name);

if (installers.includes(expectedName)) {
  console.log(`Instalador Windows já está nomeado corretamente: ${expectedName}`);
} else {
  if (installers.length !== 1) {
    throw new Error(`Esperava exatamente um instalador NSIS em ${outputDirectory}; encontrei: ${installers.join(', ') || 'nenhum'}.`);
  }

  await rename(resolve(outputDirectory, installers[0]), resolve(outputDirectory, expectedName));
  console.log(`Instalador Windows renomeado: ${installers[0]} → ${expectedName}`);
}
