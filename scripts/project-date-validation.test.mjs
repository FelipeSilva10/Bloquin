import assert from 'node:assert/strict';
import test from 'node:test';

// Fixado explicitamente: os testes abaixo comparam strings de horário
// literal (ex. "14:32") formatadas a partir de timestamps com offset fixo
// (-03:00) — sem isso, o resultado depende do fuso horário da máquina que
// roda `npm test` e falha em qualquer ambiente que não seja
// America/Sao_Paulo (por exemplo, o runner do GitHub Actions, que roda em
// UTC). Precisa vir antes do import de projectDate.ts, que constrói os
// Intl.DateTimeFormat na carga do módulo — por isso o import dinâmico: um
// import estático seria içado (hoisted) e rodaria antes desta linha.
process.env.TZ = 'America/Sao_Paulo';
const { formatProjectUpdatedAt } = await import('../src/lib/projectDate.ts');

const REFERENCE = new Date('2026-08-31T18:00:00-03:00').getTime();
const days = (n) => n * 24 * 60 * 60 * 1000;

test('datas ausentes ou inválidas caem no fallback', () => {
  assert.equal(formatProjectUpdatedAt(null, REFERENCE), 'Data desconhecida');
  assert.equal(formatProjectUpdatedAt(undefined, REFERENCE), 'Data desconhecida');
  assert.equal(formatProjectUpdatedAt('não é uma data', REFERENCE), 'Data desconhecida');
});

test('hoje e ontem mostram o horário exato', () => {
  const today = new Date('2026-08-31T14:32:00-03:00').toISOString();
  assert.equal(formatProjectUpdatedAt(today, REFERENCE), 'Editado hoje às 14:32');

  const yesterday = new Date('2026-08-30T18:45:00-03:00').toISOString();
  assert.equal(formatProjectUpdatedAt(yesterday, REFERENCE), 'Editado ontem às 18:45');
});

test('entre 2 e 6 dias usa data relativa em dias, sem horário', () => {
  const threeDaysAgo = new Date('2026-08-28T09:00:00-03:00').toISOString();
  assert.equal(formatProjectUpdatedAt(threeDaysAgo, REFERENCE), 'Editado há 3 dias');

  const sixDaysAgo = new Date('2026-08-25T09:00:00-03:00').toISOString();
  assert.equal(formatProjectUpdatedAt(sixDaysAgo, REFERENCE), 'Editado há 6 dias');
});

test('a partir de uma semana usa data absoluta dd/mm/aaaa', () => {
  const oneWeekAgo = new Date(REFERENCE - days(7)).toISOString();
  assert.match(formatProjectUpdatedAt(oneWeekAgo, REFERENCE), /^Editado em \d{2}\/\d{2}\/\d{4}$/u);

  const longAgo = new Date('2026-01-05T10:00:00Z').toISOString();
  assert.equal(formatProjectUpdatedAt(longAgo, REFERENCE), 'Editado em 05/01/2026');
});

test('relógio adiantado (data no futuro) não gera texto sem sentido — cai em "hoje", nunca "amanhã" ou dia negativo', () => {
  const future = new Date(REFERENCE + 60_000).toISOString();
  assert.match(formatProjectUpdatedAt(future, REFERENCE), /^Editado hoje às \d{2}:\d{2}$/u);
});
