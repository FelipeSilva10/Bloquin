import assert from 'node:assert/strict';
import test from 'node:test';
import { compareVersions } from '../src/lib/semver.ts';

test('compara releases estáveis e pré-releases conforme SemVer', () => {
  assert.equal(compareVersions('2.1.0', '2.0.9'), 1);
  assert.equal(compareVersions('v2.0.0-rc.1', '2.0.0'), -1);
  assert.equal(compareVersions('2.0.0-beta.11', '2.0.0-beta.2'), 1);
  assert.equal(compareVersions('2.0.0-beta', '2.0.0-beta.1'), -1);
  assert.equal(compareVersions('2.0.0+build.7', '2.0.0+build.8'), 0);
  assert.equal(compareVersions('invalid', '2.0.0'), 0);
});
