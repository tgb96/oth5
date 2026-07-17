const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const insights = require(path.join(root, "assets", "js", "player-insights.js"));

const results = [
  { player1: "Ana Pérez", player2: "Beto Soto", winner: "Ana Pérez", result: "6-3 6-4", date: new Date(2026, 5, 1), sourceIndex: 0 },
  { player1: "Caro Díaz", player2: "Ana Pérez", winner: "Ana Pérez", result: "7-5 6-2", date: new Date(2026, 5, 8), sourceIndex: 1 },
  { player1: "Ana Pérez", player2: "Dani Vera", winner: "Dani Vera", result: "6-4 3-6 10-8", date: new Date(2026, 5, 15), sourceIndex: 2 }
];

test("calcula victorias, derrotas, sets y games aunque el ganador sea el jugador 2", () => {
  const stats = insights.getPlayerStats(results, "Ana Pérez");

  assert.equal(stats.played, 3);
  assert.equal(stats.wins, 2);
  assert.equal(stats.losses, 1);
  assert.equal(stats.winRate, 67);
  assert.equal(stats.setsWon, 5);
  assert.equal(stats.setsLost, 2);
  assert.equal(stats.gamesWon, 35);
  assert.equal(stats.gamesLost, 23);
});

test("resume la forma reciente y el historial por rival", () => {
  const form = insights.getRecentForm(results, "Ana Pérez", 5);
  const rivalry = insights.getHeadToHead(results, "Ana Pérez");

  assert.deepEqual(form.map((entry) => entry.outcome), ["P", "G", "G"]);
  assert.equal(form[0].opponent, "Dani Vera");
  assert.equal(rivalry.length, 3);
  assert.equal(rivalry.find((entry) => entry.opponent === "Beto Soto").wins, 1);
});

test("identifica zonas de ascenso, repechaje y descenso", () => {
  const rankings = Array.from({ length: 8 }, (_, index) => ({
    category: "Categoría B",
    position: index + 1,
    player: `Jugador ${index + 1}`,
    points: String(12 - index)
  }));

  assert.equal(insights.getZoneStatus(rankings, rankings[1]).label, "Zona de ascenso");
  assert.equal(insights.getZoneStatus(rankings, rankings[2]).label, "Repechaje de ascenso");
  assert.equal(insights.getZoneStatus(rankings, rankings[5]).label, "Repechaje por permanencia");
  assert.equal(insights.getZoneStatus(rankings, rankings[7]).label, "Zona de descenso");
});

test("calcula la distancia al jugador inmediatamente superior", () => {
  const rankings = [
    { category: "Categoría A", position: 1, player: "Beto Soto", points: "9" },
    { category: "Categoría A", position: 2, player: "Ana Pérez", points: "6" }
  ];
  const gap = insights.getGapToAbove(rankings, rankings[1]);

  assert.equal(gap.points, 3);
  assert.match(gap.message, /3 puntos de Beto Soto/);
});

test("ordena los próximos partidos y compara perfiles", () => {
  const matches = [
    { player1: "Ana Pérez", player2: "Dani Vera", date: new Date(2026, 6, 30), status: "programado", turn: "Turno 2", isFree: false },
    { player1: "Beto Soto", player2: "Ana Pérez", date: new Date(2026, 6, 25), status: "programado", turn: "Turno 1", isFree: false }
  ];
  const upcoming = insights.getUpcomingMatches(matches, "Ana Pérez", new Date(2026, 6, 17));
  assert.equal(upcoming[0].opponent, "Beto Soto");

  const left = { player: "Ana", ranking: { points: "9" }, stats: { wins: 3, winRate: 75, setsWon: 6, setsLost: 2 } };
  const right = { player: "Beto", ranking: { points: "6" }, stats: { wins: 2, winRate: 50, setsWon: 4, setsLost: 3 } };
  const comparison = insights.compareProfiles(left, right);
  assert.equal(comparison.leftScore, 4);
  assert.equal(comparison.rightScore, 0);
});
