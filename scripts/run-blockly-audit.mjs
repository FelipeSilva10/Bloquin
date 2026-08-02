import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const runFile = promisify(execFile);

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
  const shouldCompile = process.argv.includes('--compile');
  if (fixturesFlagIndex >= 0 || shouldCompile) {
    const requestedOutputDirectory = fixturesFlagIndex >= 0
      ? process.argv[fixturesFlagIndex + 1]
      : null;
    if (fixturesFlagIndex >= 0 && !requestedOutputDirectory) {
      throw new Error('Informe a pasta após --emit-fixtures.');
    }
    const outputDirectory = requestedOutputDirectory ?? join(tempDirectory, 'sketches');
    const fixtures = createCompilationFixtures();
    const matrix = {};
    for (const [name, fixture] of Object.entries(fixtures)) {
      const sketchName = name.replace(/[^A-Za-z0-9_]/g, '_');
      const sketchDirectory = join(outputDirectory, sketchName);
      await mkdir(sketchDirectory, { recursive: true });
      await writeFile(join(sketchDirectory, `${sketchName}.ino`), fixture.code, 'utf8');
      matrix[name] = {
        board: fixture.board,
        fqbn: fixture.fqbn,
        sketch: sketchName,
      };
    }
    await writeFile(
      join(outputDirectory, 'compilation-matrix.json'),
      `${JSON.stringify(matrix, null, 2)}\n`,
      'utf8',
    );

    if (shouldCompile) {
      const arduinoCli = process.env.BLOQUIN_ARDUINO_CLI || 'arduino-cli';
      for (const [name, fixture] of Object.entries(fixtures)) {
        const sketchName = name.replace(/[^A-Za-z0-9_]/g, '_');
        const sketchDirectory = join(outputDirectory, sketchName);
        process.stdout.write(`Compilando ${name} (${fixture.fqbn})... `);
        try {
          const { stdout, stderr } = await runFile(
            arduinoCli,
            ['compile', '--fqbn', fixture.fqbn, sketchDirectory],
            { maxBuffer: 20 * 1024 * 1024 },
          );
          process.stdout.write('OK\n');
          const summary = `${stdout}\n${stderr}`
            .split(/\r?\n/)
            .filter((line) => /Sketch uses|Global variables use/i.test(line));
          for (const line of summary) process.stdout.write(`  ${line}\n`);
        } catch (error) {
          process.stdout.write('FALHOU\n');
          const details = [error?.stdout, error?.stderr, error?.message]
            .filter(Boolean)
            .join('\n');
          throw new Error(`Falha ao compilar ${name}:\n${details}`);
        }
      }
    }
  }
} finally {
  await rm(tempDirectory, { force: true, recursive: true });
}
