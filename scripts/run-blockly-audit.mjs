import { build } from 'esbuild';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const tempDirectory = await mkdtemp(join(process.cwd(), '.bloquin-block-audit-'));
const bundlePath = join(tempDirectory, 'audit.cjs');

try {
  await build({
    entryPoints: ['scripts/blockly-audit.ts'],
    bundle: true,
    format: 'cjs',
    logLevel: 'silent',
    outfile: bundlePath,
    packages: 'external',
    platform: 'node',
  });
  const { createCompilationFixtures, runBlockAudit } = await import(pathToFileURL(bundlePath).href);
  await runBlockAudit();

  const fixturesFlagIndex = process.argv.indexOf('--emit-fixtures');
  if (fixturesFlagIndex >= 0) {
    const outputDirectory = process.argv[fixturesFlagIndex + 1];
    if (!outputDirectory) throw new Error('Informe a pasta após --emit-fixtures.');
    const fixtures = createCompilationFixtures();
    for (const [board, code] of Object.entries(fixtures)) {
      const sketchDirectory = join(outputDirectory, board);
      await mkdir(sketchDirectory, { recursive: true });
      await writeFile(join(sketchDirectory, `${board}.ino`), code, 'utf8');
    }
  }
} finally {
  await rm(tempDirectory, { force: true, recursive: true });
}
