import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { compareVersions } from '../src/lib/semver.ts';

const execFile = promisify(execFileCallback);

test('compara releases estáveis e pré-releases conforme SemVer', () => {
  assert.equal(compareVersions('2.1.0', '2.0.9'), 1);
  assert.equal(compareVersions('v2.0.0-rc.1', '2.0.0'), -1);
  assert.equal(compareVersions('2.0.0-beta.11', '2.0.0-beta.2'), 1);
  assert.equal(compareVersions('2.0.0-beta', '2.0.0-beta.1'), -1);
  assert.equal(compareVersions('2.0.0+build.7', '2.0.0+build.8'), 0);
  assert.equal(compareVersions('invalid', '2.0.0'), 0);
});

test('sincroniza versões quando os arquivos da release usam CRLF', async () => {
  const fixtureDirectory = await mkdtemp(join(tmpdir(), 'bloquin-sync-version-'));
  const crlf = '\r\n';

  try {
    await mkdir(join(fixtureDirectory, 'src-tauri'));

    await Promise.all([
      writeFile(
        join(fixtureDirectory, 'package.json'),
        ['{', '  "name": "bloquin",', '  "version": "0.0.0"', '}'].join(crlf),
      ),
      writeFile(
        join(fixtureDirectory, 'package-lock.json'),
        [
          '{',
          '  "name": "bloquin",',
          '  "version": "0.0.0",',
          '  "lockfileVersion": 3,',
          '  "packages": {',
          '    "": {',
          '      "name": "bloquin",',
          '      "version": "0.0.0"',
          '    }',
          '  }',
          '}',
        ].join(crlf),
      ),
      writeFile(
        join(fixtureDirectory, 'src-tauri/tauri.conf.json'),
        ['{', '  "version": "0.0.0"', '}'].join(crlf),
      ),
      writeFile(
        join(fixtureDirectory, 'src-tauri/Cargo.toml'),
        ['[package]', 'name = "bloquin"', 'version = "0.0.0"'].join(crlf),
      ),
      writeFile(
        join(fixtureDirectory, 'src-tauri/Cargo.lock'),
        ['version = 4', '', '[[package]]', 'name = "bloquin"', 'version = "0.0.0"'].join(crlf),
      ),
    ]);

    await execFile(process.execPath, [join(process.cwd(), 'scripts/sync-version.mjs'), '3.2.1'], {
      cwd: fixtureDirectory,
    });

    const cargoLock = await readFile(join(fixtureDirectory, 'src-tauri/Cargo.lock'), 'utf8');
    assert.match(cargoLock, /name = "bloquin"\r\nversion = "3\.2\.1"/);
  } finally {
    await rm(fixtureDirectory, { recursive: true, force: true });
  }
});
