(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OPEN_TENNIS_INDEX_DATA = Object.freeze(api);
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function parseCSVLine(line) {
    const values = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === "," && !quoted) {
        values.push(current.trim());
        current = "";
      } else {
        current += character;
      }
    }
    values.push(current.trim());
    return values;
  }

  function parseCSV(csv) {
    return String(csv || "")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map(parseCSVLine);
  }

  function headerIndex(headers, candidates, fallback = -1) {
    const normalized = headers.map(normalize);
    for (const candidate of candidates) {
      const exact = normalized.indexOf(normalize(candidate));
      if (exact >= 0) return exact;
    }
    for (const candidate of candidates) {
      const wanted = normalize(candidate);
      const partial = normalized.findIndex((header) => header.includes(wanted));
      if (partial >= 0) return partial;
    }
    return fallback;
  }

  function valueAt(row, index) {
    return index >= 0 ? String(row[index] || "").trim() : "";
  }

  function parseDate(value) {
    const text = String(value || "").trim();
    let match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\D|$)/);
    if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12);
    match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    return null;
  }

  function startOfDay(value) {
    const date = value instanceof Date ? value : new Date(value);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function parseFixture(csv) {
    const table = parseCSV(csv);
    if (table.length < 2) return [];
    const headers = table[0];
    const columns = {
      week: headerIndex(headers, ["semana", "jornada"], 0),
      court: headerIndex(headers, ["cancha"], 1),
      turn: headerIndex(headers, ["turno", "horario", "hora"], 2),
      category: headerIndex(headers, ["categoria"], 3),
      player1: headerIndex(headers, ["jugador 1", "jugador1"], 4),
      player2: headerIndex(headers, ["jugador 2", "jugador2"], 5),
      date: headerIndex(headers, ["fecha programada", "fecha"], -1),
      state: headerIndex(headers, ["estado del partido", "estado"], -1),
      notes: headerIndex(headers, ["observaciones", "observacion"], -1)
    };
    if (columns.state < 0) columns.state = columns.date === 6 ? 7 : 6;
    if (columns.notes < 0) columns.notes = columns.state + 1;

    return table.slice(1).map((row, sourceIndex) => {
      const player1 = valueAt(row, columns.player1);
      const player2 = valueAt(row, columns.player2);
      if (!player1 && !player2) return null;
      const dateText = valueAt(row, columns.date);
      return {
        sourceIndex,
        week: valueAt(row, columns.week),
        court: valueAt(row, columns.court),
        turn: valueAt(row, columns.turn),
        category: valueAt(row, columns.category),
        player1,
        player2,
        dateText,
        date: parseDate(dateText),
        fixtureState: valueAt(row, columns.state),
        notes: valueAt(row, columns.notes),
        isFree: [player1, player2].some((name) => /^(libre|—|-)$/i.test(name))
      };
    }).filter(Boolean);
  }

  function parseRegistration(csv) {
    const table = parseCSV(csv);
    if (table.length < 2) return [];
    const headers = table[0];
    const columns = {
      date: headerIndex(headers, ["fecha", "marca temporal", "timestamp"], 0),
      category: headerIndex(headers, ["categoria"], -1),
      player1: headerIndex(headers, ["jugador 1", "jugador1"], 1),
      player2: headerIndex(headers, ["jugador 2", "jugador2"], 2),
      pending: headerIndex(headers, ["pendiente"], 3),
      notes: headerIndex(headers, ["observaciones", "observacion"], 4),
      winner: headerIndex(headers, ["ganador"], 13),
      result: headerIndex(headers, ["resultado web", "resultado"], 16),
      state: headerIndex(headers, ["estado"], -1)
    };

    return table.slice(1).map((row, sourceIndex) => {
      const player1 = valueAt(row, columns.player1);
      const player2 = valueAt(row, columns.player2);
      if (!player1 || !player2) return null;
      const dateText = valueAt(row, columns.date);
      return {
        sourceIndex,
        category: valueAt(row, columns.category),
        player1,
        player2,
        dateText,
        date: parseDate(dateText),
        pending: valueAt(row, columns.pending),
        notes: valueAt(row, columns.notes),
        winner: valueAt(row, columns.winner),
        result: valueAt(row, columns.result),
        state: valueAt(row, columns.state)
      };
    }).filter(Boolean);
  }

  function isCompleted(record) {
    return Boolean(record && (record.result || record.winner || /jugado|finalizado/i.test(record.state)));
  }

  function isPending(record) {
    return Boolean(record && (
      /^(si|sí|yes|true|1)$/i.test(record.pending) ||
      /pendiente|posterg/i.test(`${record.state} ${record.notes}`)
    ));
  }

  function orderedKey(player1, player2) {
    return `${normalize(player1)}|${normalize(player2)}`;
  }

  function unorderedKey(player1, player2) {
    return [normalize(player1), normalize(player2)].sort().join("|");
  }

  function chooseRecord(records) {
    return records.find(isCompleted) || records.find(isPending) || records[0] || null;
  }

  function mergeMatchStatus(fixtures, registrations) {
    const exact = new Map();
    const unordered = new Map();
    registrations.forEach((record) => {
      const exactKey = orderedKey(record.player1, record.player2);
      const pairKey = unorderedKey(record.player1, record.player2);
      exact.set(exactKey, [...(exact.get(exactKey) || []), record]);
      unordered.set(pairKey, [...(unordered.get(pairKey) || []), record]);
    });

    return fixtures.map((match) => {
      const record = chooseRecord(exact.get(orderedKey(match.player1, match.player2)) || []) ||
        chooseRecord(unordered.get(unorderedKey(match.player1, match.player2)) || []);
      let status = "programado";
      if (isCompleted(record) || /jugado|finalizado/i.test(match.fixtureState)) status = "jugado";
      else if (isPending(record) || /pendiente|posterg/i.test(`${match.fixtureState} ${match.notes}`)) status = "pendiente";
      return { ...match, record, status };
    });
  }

  function displayCategory(value) {
    const text = String(value || "").trim();
    const match = text.match(/categor[ií]a\s*([a-z0-9]+)/i);
    if (match) return `Categoría ${match[1].toUpperCase()}`;
    return text;
  }

  function parseRankings(csv) {
    const table = parseCSV(csv);
    if (!table.length) return [];
    const headers = table[0];
    const playerIndex = headerIndex(headers, ["jugador", "nombre"], -1);
    const positionIndex = headerIndex(headers, ["posicion", "pos", "puesto"], -1);
    const pointsIndex = headerIndex(headers, ["puntos", "pts"], -1);
    const playedIndex = headerIndex(headers, ["pj", "partidos jugados"], -1);
    const winsIndex = headerIndex(headers, ["pg", "partidos ganados", "victorias"], -1);
    const lossesIndex = headerIndex(headers, ["pp", "partidos perdidos", "derrotas"], -1);
    const categoryIndex = headerIndex(headers, ["categoria"], -1);

    if (playerIndex >= 0 && positionIndex >= 0) {
      return table.slice(1).map((row) => {
        const player = valueAt(row, playerIndex);
        const position = Number(valueAt(row, positionIndex));
        if (!player || !Number.isFinite(position)) return null;
        return {
          category: displayCategory(valueAt(row, categoryIndex)),
          position,
          player,
          points: valueAt(row, pointsIndex),
          played: valueAt(row, playedIndex),
          wins: valueAt(row, winsIndex),
          losses: valueAt(row, lossesIndex)
        };
      }).filter(Boolean);
    }

    const rankings = [];
    let currentCategory = "";
    table.forEach((row) => {
      const joined = row.filter(Boolean).join(" ");
      if (/categor[ií]a\s*[a-z0-9]+/i.test(joined) && !/^\s*\d+\s*$/.test(row[0] || "")) {
        currentCategory = displayCategory(joined);
        return;
      }
      const position = Number(valueAt(row, 0));
      const player = valueAt(row, 1);
      if (!currentCategory || !Number.isFinite(position) || !player) return;
      rankings.push({
        category: currentCategory,
        position,
        player,
        points: valueAt(row, 2),
        played: valueAt(row, 3),
        wins: valueAt(row, 4),
        losses: valueAt(row, 5)
      });
    });
    return rankings;
  }

  function turnNumber(value) {
    const match = String(value || "").match(/\d+/);
    return match ? Number(match[0]) : 999;
  }

  function getOpponent(match, player) {
    const key = normalize(player);
    return normalize(match.player1) === key ? match.player2 : match.player1;
  }

  function getNextMatch(matches, player, today = new Date()) {
    const key = normalize(player);
    if (!key) return null;
    const day = startOfDay(today).getTime();
    const candidates = matches.filter((match) =>
      !match.isFree && match.status !== "jugado" &&
      [match.player1, match.player2].some((name) => normalize(name) === key)
    );
    candidates.sort((left, right) => {
      const leftTime = left.date ? startOfDay(left.date).getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.date ? startOfDay(right.date).getTime() : Number.MAX_SAFE_INTEGER;
      const leftPast = leftTime < day ? 1 : 0;
      const rightPast = rightTime < day ? 1 : 0;
      return leftPast - rightPast || leftTime - rightTime || turnNumber(left.turn) - turnNumber(right.turn);
    });
    return candidates[0] ? { ...candidates[0], opponent: getOpponent(candidates[0], player) } : null;
  }

  function getUpcomingWeek(matches, today = new Date()) {
    const day = startOfDay(today).getTime();
    const dated = matches.filter((match) => !match.isFree && match.date);
    if (!dated.length) return null;
    const future = dated.filter((match) => startOfDay(match.date).getTime() >= day);
    const pool = future.length ? future : dated;
    const targetTime = future.length
      ? Math.min(...pool.map((match) => startOfDay(match.date).getTime()))
      : Math.max(...pool.map((match) => startOfDay(match.date).getTime()));
    const weekMatches = dated.filter((match) => startOfDay(match.date).getTime() === targetTime);
    return {
      date: weekMatches[0].date,
      week: weekMatches[0].week,
      matches: weekMatches,
      played: weekMatches.filter((match) => match.status === "jugado").length,
      pending: weekMatches.filter((match) => match.status !== "jugado").length
    };
  }

  function sameDay(left, right) {
    return left instanceof Date && right instanceof Date &&
      left.getFullYear() === right.getFullYear() &&
      left.getMonth() === right.getMonth() &&
      left.getDate() === right.getDate();
  }

  function getTournamentDay(matches, today = new Date()) {
    const dayMatches = (matches || []).filter((match) =>
      !match.isFree && match.date instanceof Date && sameDay(match.date, today)
    );
    if (!dayMatches.length) return null;
    const courts = new Set(dayMatches.map((match) => String(match.court || "").trim()).filter(Boolean));
    return {
      date: dayMatches[0].date,
      week: dayMatches[0].week,
      matches: dayMatches,
      courts: courts.size,
      played: dayMatches.filter((match) => match.status === "jugado").length,
      pending: dayMatches.filter((match) => match.status !== "jugado").length
    };
  }

  function getPlayerRanking(rankings, player) {
    const key = normalize(player);
    return rankings.find((entry) => normalize(entry.player) === key) || null;
  }

  function getRecentResults(registrations, limit = 3) {
    return registrations
      .filter(isCompleted)
      .sort((left, right) => {
        const leftTime = left.date ? left.date.getTime() : 0;
        const rightTime = right.date ? right.date.getTime() : 0;
        return rightTime - leftTime || right.sourceIndex - left.sourceIndex;
      })
      .slice(0, limit);
  }

  function formatDate(date, options) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Fecha por confirmar";
    return new Intl.DateTimeFormat("es-CL", options || {
      weekday: "long",
      day: "numeric",
      month: "long"
    }).format(date);
  }

  return {
    normalize,
    parseCSV,
    parseDate,
    parseFixture,
    parseRegistration,
    mergeMatchStatus,
    parseRankings,
    getOpponent,
    getNextMatch,
    getUpcomingWeek,
    getTournamentDay,
    getPlayerRanking,
    getRecentResults,
    formatDate,
    isCompleted,
    isPending
  };
});
