const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dashboard = require(path.join(root, "assets", "js", "index-experience.js"));

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("la portada entiende los formatos publicados y de respaldo", () => {
  const fixture = dashboard.parseFixture([
    "Semana,Cancha,Turno,Categoría,Jugador 1,Jugador 2,Fecha,Estado del partido,Observaciones",
    "Semana 8,Cancha 1,Turno 2 (10:00 - 11:30),A,Ana Pérez,Beto Soto,20/07/2026,Programado,",
    "Semana 8,Cancha 2,Turno 3,A,Caro Díaz,Dani Vera,20/07/2026,Programado,"
  ].join("\n"));
  const results = dashboard.parseRegistration([
    "Fecha,Jugador 1,Jugador 2,Pendiente,Observaciones,,,,,,,,,Ganador,,,Resultado Web",
    "17/07/2026 09:30,Ana Pérez,Beto Soto,No,,,,,,,,,,Ana Pérez,,,6-3 6-4"
  ].join("\n"));
  const merged = dashboard.mergeMatchStatus(fixture, results);

  assert.equal(fixture.length, 2);
  assert.equal(merged[0].status, "jugado");
  assert.equal(merged[1].status, "programado");
  assert.equal(results[0].date.getFullYear(), 2026);
});

test("elige el próximo partido del jugador y no uno ya finalizado", () => {
  const matches = [
    { player1: "Ana Pérez", player2: "Beto Soto", date: new Date(2026, 6, 18), status: "jugado", isFree: false, turn: "Turno 1" },
    { player1: "Caro Díaz", player2: "Ana Pérez", date: new Date(2026, 6, 25), status: "programado", isFree: false, turn: "Turno 2" },
    { player1: "Ana Pérez", player2: "Dani Vera", date: new Date(2026, 7, 1), status: "programado", isFree: false, turn: "Turno 1" }
  ];
  const next = dashboard.getNextMatch(matches, "ana perez", new Date(2026, 6, 17));

  assert.equal(next.opponent, "Caro Díaz");
  assert.equal(next.date.getDate(), 25);
});

test("reconoce rankings en tabla simple y por bloques", () => {
  const flat = dashboard.parseRankings([
    "Categoría,Posición,Jugador,Puntos,PJ",
    "A,1,Ana Pérez,12,4"
  ].join("\n"));
  const blocks = dashboard.parseRankings([
    "Categoría A,,,,",
    "Pos,Jugador,PTS,PJ,",
    "1,Ana Pérez,12,4,"
  ].join("\n"));

  assert.equal(flat[0].player, "Ana Pérez");
  assert.equal(flat[0].position, 1);
  assert.equal(blocks[0].category, "Categoría A");
  assert.equal(blocks[0].points, "12");
});

test("la nueva portada es personalizable, adaptable y no duplica la instalación", () => {
  const html = read("index.html");
  const css = read("assets/css/index.css");
  const install = read("assets/js/pwa-install.js");

  assert.match(html, /id="preferredPlayerSelect"/);
  assert.match(html, /id="nextMatchOpponent"/);
  assert.match(html, /id="rankingNumber"/);
  assert.match(html, /id="recentResultsList"/);
  assert.match(html, /Compartir por WhatsApp/);
  assert.doesNotMatch(html, /<style[\s>]/i);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
  assert.match(css, /orientation:\s*landscape/);
  assert.match(css, /overflow-y:\s*auto\s*!important/);
  assert.equal((install.match(/beforeinstallprompt/g) || []).length, 1);
  assert.doesNotMatch(html, /beforeinstallprompt|setTimeout\(/);
});

test("Partidos y Tablas reutilizan el jugador guardado", () => {
  const partidosHtml = read("partidos.html");
  const partidosJs = read("assets/js/partidos-page.js");
  const tablasHtml = read("tablas.html");
  const tablasJs = read("assets/js/tablas-page.js");

  assert.match(partidosHtml, /id="preferredPlayerShortcut"/);
  assert.match(partidosHtml, /player-preference\.js\?v=27/);
  assert.match(partidosJs, /new URLSearchParams\(window\.location\.search\)\.get\("jugador"\)/);
  assert.match(partidosJs, /aplicarFiltroJugador/);
  assert.match(tablasHtml, /player-preference\.js\?v=27/);
  assert.match(tablasJs, /is-preferred-player/);
  assert.match(tablasJs, /mostrarJugadorSolicitado/);
});
