import assert from "node:assert/strict";
import test from "node:test";

import {
  getSessionCutoffIso,
  isSessionHeartbeatFresh,
  SESSION_TTL_MS,
} from "../src/services/sessionPolicy.ts";

const NOW = Date.parse("2026-07-30T15:00:00.000Z");

test("calcula o limite do TTL sem depender do relógio durante o teste", () => {
  assert.equal(
    getSessionCutoffIso(NOW),
    new Date(NOW - SESSION_TTL_MS).toISOString(),
  );
});

test("aceita heartbeat dentro da janela de 12 minutos", () => {
  assert.equal(
    isSessionHeartbeatFresh(
      new Date(NOW - SESSION_TTL_MS + 1).toISOString(),
      NOW,
    ),
    true,
  );
});

test("rejeita heartbeat no limite ou mais antigo", () => {
  assert.equal(
    isSessionHeartbeatFresh(
      new Date(NOW - SESSION_TTL_MS).toISOString(),
      NOW,
    ),
    false,
  );
  assert.equal(
    isSessionHeartbeatFresh(
      new Date(NOW - SESSION_TTL_MS - 1).toISOString(),
      NOW,
    ),
    false,
  );
});

test("rejeita timestamp ausente, inválido ou muito no futuro", () => {
  assert.equal(isSessionHeartbeatFresh(null, NOW), false);
  assert.equal(isSessionHeartbeatFresh("não-é-data", NOW), false);
  assert.equal(
    isSessionHeartbeatFresh(new Date(NOW + 30_001).toISOString(), NOW),
    false,
  );
});

test("tolera até 30 segundos de diferença entre relógios", () => {
  assert.equal(
    isSessionHeartbeatFresh(new Date(NOW + 30_000).toISOString(), NOW),
    true,
  );
});
