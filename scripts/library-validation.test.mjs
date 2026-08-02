import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeExternalLink, normalizeYoutubeUrl } from '../src/services/libraryValidation.ts';

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
