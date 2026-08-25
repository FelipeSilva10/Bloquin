import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeExternalLink, normalizeYoutubeUrl } from '../src/services/libraryValidation.ts';

const libraryScreenSource = readFileSync(new URL('../src/screens/LibraryScreen.tsx', import.meta.url), 'utf8');

test('normaliza links externos HTTP e HTTPS', () => {
  assert.equal(normalizeExternalLink(' https://example.com/material '), 'https://example.com/material');
  assert.equal(normalizeExternalLink('http://example.com/a?q=1'), 'http://example.com/a?q=1');
});

test('rejeita protocolos perigosos e URLs inválidas', () => {
  assert.equal(normalizeExternalLink('javascript:alert(1)'), null);
  assert.equal(normalizeExternalLink('data:text/html,<h1>unsafe</h1>'), null);
  assert.equal(normalizeExternalLink('https://usuario:senha@example.com/material'), null);
  assert.equal(normalizeExternalLink('não é uma URL'), null);
});

test('aceita formatos comuns de YouTube e normaliza o ID', () => {
  const expected = { id: 'dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' };
  assert.deepEqual(normalizeYoutubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), expected);
  assert.deepEqual(normalizeYoutubeUrl('https://youtu.be/dQw4w9WgXcQ'), expected);
  assert.deepEqual(normalizeYoutubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'), expected);
  assert.deepEqual(normalizeYoutubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ'), expected);
});

test('rejeita hosts e IDs que não pertencem ao formato do YouTube', () => {
  assert.equal(normalizeYoutubeUrl('https://vimeo.com/dQw4w9WgXcQ'), null);
  assert.equal(normalizeYoutubeUrl('https://www.youtube.com/watch?v=short'), null);
  assert.equal(normalizeYoutubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXc!'), null);
});

test('mantém a falha de exclusão visível dentro do diálogo aberto', () => {
  assert.match(libraryScreenSource, /const \[deletionError, setDeletionError\] = useState\(''\);/);
  assert.match(libraryScreenSource, /<LibraryDeleteDialog[\s\S]*?error=\{deletionError\}/);
  assert.match(libraryScreenSource, /function LibraryDeleteDialog\(\{ intent, busy, error, onCancel, onConfirm \}/);
  assert.match(libraryScreenSource, /id="library-delete-error" className="form-error" role="alert">\{error\}/);
});

test('mural sempre abre a publicação completa a partir do card, nunca direto num anexo', () => {
  assert.match(libraryScreenSource, /className="library-card-surface"[\s\S]*?onClick=\{onOpen\}/);
  assert.match(libraryScreenSource, /aria-label=\{`Abrir publicação \$\{post\.titulo\}`\}/);
  assert.match(libraryScreenSource, /const mainMaterial = post\.anexos\.find\(/);
  assert.match(libraryScreenSource, /attachment\.tipo === 'image' \|\| attachment\.tipo === 'pdf'/);
  assert.match(libraryScreenSource, /\{mode === 'teacher' && \(/);
  assert.match(libraryScreenSource, /\{post\.status === 'archived' \? \(/);
});
