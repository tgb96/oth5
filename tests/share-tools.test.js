const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const share = require(path.join(root, "assets", "js", "share-tools.js"));

test("interpreta el horario publicado", () => {
  assert.deepEqual(share.parseTurnRange("Turno 4 (17:15-18:45)"), {
    startHour: 17,
    startMinute: 15,
    endHour: 18,
    endMinute: 45
  });
});

test("crea un calendario compatible sin modificar la planilla", () => {
  const match = {
    opponent: "Beto Soto",
    date: new Date(2026, 6, 25, 12),
    turn: "Turno 4 (17:15-18:45)",
    court: "Cancha 2",
    category: "Categoría A"
  };
  const calendar = share.buildCalendar(match, "Ana Pérez");

  assert.match(calendar, /BEGIN:VCALENDAR/);
  assert.match(calendar, /DTSTART:20260725T171500/);
  assert.match(calendar, /DTEND:20260725T184500/);
  assert.match(calendar, /SUMMARY:Open Tennis: Ana Pérez vs Beto Soto/);
  assert.match(calendar, /LOCATION:Cancha 2/);
});

test("prepara el texto completo para compartir un partido", () => {
  const text = share.buildMatchText({
    opponent: "Beto Soto",
    date: new Date(2026, 6, 25, 12),
    turn: "Turno 4 (17:15-18:45)",
    court: "2",
    category: "A"
  }, "Ana Pérez");

  assert.match(text, /Ana Pérez vs Beto Soto/);
  assert.match(text, /17:15–18:45/);
  assert.match(text, /Cancha 2/);
  assert.match(text, /Categoría A/);
});
