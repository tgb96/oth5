const test = require("node:test");
const assert = require("node:assert/strict");

const rules = require("../assets/js/marcador-rules.js");

test("reconoce solo finales válidos de un set", () => {
  assert.equal(rules.getSetWinnerFromGames(6, 4), 0);
  assert.equal(rules.getSetWinnerFromGames(5, 7), 1);
  assert.equal(rules.getSetWinnerFromGames(7, 6), 0);
  assert.equal(rules.getSetWinnerFromGames(7, 0), null);
  assert.equal(rules.getSetWinnerFromGames(7, 4), null);
  assert.equal(rules.getSetWinnerFromGames(7, 7), null);
});

test("bloquea un super tie-break antes de terminar los sets", () => {
  const result = rules.validateCorrection([[6, 4], [0, 0]], [10, 0]);
  assert.equal(result.valid, false);
  assert.match(result.message, /después de terminar ambos sets/i);
});

test("bloquea un super tie-break si el partido terminó en dos sets", () => {
  const result = rules.validateCorrection([[6, 4], [6, 2]], [10, 8]);
  assert.equal(result.valid, false);
  assert.match(result.message, /terminó en dos sets/i);
});

test("acepta un partido dividido y su super tie-break", () => {
  assert.deepEqual(rules.validateCorrection([[6, 4], [3, 6]], [10, 8]), { valid: true, message: "" });
  assert.deepEqual(rules.validateCorrection([[6, 4], [3, 6]], [5, 4]), { valid: true, message: "" });
});

test("bloquea el segundo set si el primero sigue abierto", () => {
  const result = rules.validateCorrection([[5, 4], [1, 0]], [0, 0]);
  assert.equal(result.valid, false);
  assert.match(result.message, /terminar el set 1/i);
});

test("bloquea resultados regulares imposibles", () => {
  for (const score of [[7, 0], [7, 4], [7, 7]]) {
    const result = rules.validateCorrection([score, [0, 0]], [0, 0]);
    assert.equal(result.valid, false, `debía rechazar ${score.join("-")}`);
  }
});

test("formatea el tiempo guardado en minutos", () => {
  const now = Date.parse("2026-07-16T12:00:00.000Z");
  assert.equal(rules.formatElapsedMinutes(now - 60000, now), "1 minuto");
  assert.equal(rules.formatElapsedMinutes(now - 30 * 60000, now), "30 minutos");
  assert.equal(rules.formatElapsedMinutes(now - 125 * 60000, now), "125 minutos");
});
