(function (root, factory) {
  "use strict";
  const core = root?.OPEN_TENNIS_INDEX_DATA ||
    (typeof module === "object" && module.exports ? require("./index-experience.js") : null);
  const api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.OPEN_TENNIS_PLAYER_INSIGHTS = Object.freeze(api);
})(typeof window !== "undefined" ? window : null, function (core) {
  "use strict";

  const normalize = core?.normalize || ((value) => String(value || "").trim().toLowerCase());

  function samePlayer(left, right) {
    return Boolean(normalize(left) && normalize(left) === normalize(right));
  }

  function containsPlayer(record, player) {
    return [record?.player1, record?.player2].some((name) => samePlayer(name, player));
  }

  function opponentOf(record, player) {
    if (samePlayer(record?.player1, player)) return record?.player2 || "";
    if (samePlayer(record?.player2, player)) return record?.player1 || "";
    return "";
  }

  function winnerIs(record, player) {
    return samePlayer(record?.winner, player);
  }

  function parseScore(result) {
    const sets = [];
    const pattern = /(\d+)\s*[-–]\s*(\d+)/g;
    let match;
    while ((match = pattern.exec(String(result || "")))) {
      sets.push({ winnerGames: Number(match[1]), loserGames: Number(match[2]) });
    }
    return sets;
  }

  function scoreForPlayer(record, player) {
    const sets = parseScore(record?.result);
    const hasWinner = Boolean(normalize(record?.winner));
    const won = hasWinner ? winnerIs(record, player) : null;
    const totals = { setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0 };
    if (won === null) return totals;

    sets.forEach((set) => {
      const playerGames = won ? set.winnerGames : set.loserGames;
      const rivalGames = won ? set.loserGames : set.winnerGames;
      const isSuperTieBreak = Math.max(set.winnerGames, set.loserGames) >= 10;
      if (!isSuperTieBreak) {
        totals.gamesWon += playerGames;
        totals.gamesLost += rivalGames;
      }
      if (playerGames > rivalGames) totals.setsWon += 1;
      else if (rivalGames > playerGames) totals.setsLost += 1;
    });
    return totals;
  }

  function completedPlayerMatches(registrations, player) {
    return (registrations || [])
      .filter((record) => containsPlayer(record, player) && core?.isCompleted(record))
      .sort((left, right) => {
        const leftTime = left.date instanceof Date ? left.date.getTime() : 0;
        const rightTime = right.date instanceof Date ? right.date.getTime() : 0;
        return rightTime - leftTime || (right.sourceIndex || 0) - (left.sourceIndex || 0);
      });
  }

  function getPlayerStats(registrations, player) {
    const records = completedPlayerMatches(registrations, player);
    const stats = {
      played: records.length,
      wins: 0,
      losses: 0,
      winRate: 0,
      setsWon: 0,
      setsLost: 0,
      gamesWon: 0,
      gamesLost: 0
    };

    records.forEach((record) => {
      if (normalize(record.winner)) {
        if (winnerIs(record, player)) stats.wins += 1;
        else stats.losses += 1;
      }
      const score = scoreForPlayer(record, player);
      stats.setsWon += score.setsWon;
      stats.setsLost += score.setsLost;
      stats.gamesWon += score.gamesWon;
      stats.gamesLost += score.gamesLost;
    });

    const decided = stats.wins + stats.losses;
    stats.winRate = decided ? Math.round((stats.wins / decided) * 100) : 0;
    return stats;
  }

  function getRecentForm(registrations, player, limit = 5) {
    return completedPlayerMatches(registrations, player)
      .slice(0, limit)
      .map((record) => ({
        outcome: winnerIs(record, player) ? "G" : "P",
        won: winnerIs(record, player),
        opponent: opponentOf(record, player),
        date: record.date,
        result: record.result || "Resultado no informado",
        record
      }));
  }

  function getHeadToHead(registrations, player) {
    const rivals = new Map();
    completedPlayerMatches(registrations, player).forEach((record) => {
      const opponent = opponentOf(record, player);
      const key = normalize(opponent);
      if (!key) return;
      const current = rivals.get(key) || { opponent, played: 0, wins: 0, losses: 0 };
      current.played += 1;
      if (winnerIs(record, player)) current.wins += 1;
      else if (normalize(record.winner)) current.losses += 1;
      rivals.set(key, current);
    });
    return [...rivals.values()].sort((left, right) => right.played - left.played || left.opponent.localeCompare(right.opponent, "es"));
  }

  function getUpcomingMatches(matches, player, today = new Date()) {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return (matches || [])
      .filter((match) => !match.isFree && match.status !== "jugado" && containsPlayer(match, player))
      .filter((match) => !match.date || new Date(match.date.getFullYear(), match.date.getMonth(), match.date.getDate()).getTime() >= start)
      .map((match) => ({ ...match, opponent: opponentOf(match, player) }))
      .sort((left, right) => {
        const leftTime = left.date instanceof Date ? left.date.getTime() : Number.MAX_SAFE_INTEGER;
        const rightTime = right.date instanceof Date ? right.date.getTime() : Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime || String(left.turn || "").localeCompare(String(right.turn || ""), "es", { numeric: true });
      });
  }

  function categoryLetter(category) {
    return String(category || "").match(/([A-D])\s*$/i)?.[1]?.toUpperCase() || "";
  }

  function categoryRankings(rankings, ranking) {
    if (!ranking) return [];
    return (rankings || [])
      .filter((entry) => normalize(entry.category) === normalize(ranking.category))
      .sort((left, right) => Number(left.position) - Number(right.position));
  }

  function getZoneStatus(rankings, ranking) {
    if (!ranking) return { label: "Sin clasificación", detail: "Aún no aparece en la tabla publicada.", tone: "neutral" };
    const group = categoryRankings(rankings, ranking);
    const position = Number(ranking.position);
    const total = group.length;
    const letter = categoryLetter(ranking.category);

    if (position === 1) return { label: "Líder actual", detail: "Encabeza su categoría.", tone: "leader" };
    if (letter !== "A" && position <= 2) return { label: "Zona de ascenso", detail: "Está en posición de ascenso directo.", tone: "promotion" };
    if (letter !== "A" && position === 3) return { label: "Repechaje de ascenso", detail: "Está en posición de disputar el ascenso.", tone: "playoff" };
    if (["A", "B", "C"].includes(letter) && total >= 5) {
      if (position > total - 2) return { label: "Zona de descenso", detail: "Necesita sumar para salir de la zona de descenso.", tone: "danger" };
      if (position === total - 2) return { label: "Repechaje por permanencia", detail: "Está en posición de defender la categoría.", tone: "playoff" };
    }
    return { label: "Zona segura", detail: "Actualmente se mantiene en su categoría.", tone: "safe" };
  }

  function getGapToAbove(rankings, ranking) {
    if (!ranking) return null;
    if (Number(ranking.position) <= 1) {
      return { leader: true, message: "Está en el primer lugar de su categoría." };
    }
    const above = categoryRankings(rankings, ranking).find((entry) => Number(entry.position) === Number(ranking.position) - 1);
    if (!above) return null;
    const currentPoints = Number(ranking.points) || 0;
    const abovePoints = Number(above.points) || 0;
    const gap = Math.max(0, abovePoints - currentPoints);
    return {
      leader: false,
      above,
      points: gap,
      message: gap === 0
        ? `Está empatado en puntos con ${above.player}, que aparece justo arriba.`
        : `Está a ${gap} ${gap === 1 ? "punto" : "puntos"} de ${above.player}.`
    };
  }

  function getPlayerProfile({ matches = [], registrations = [], rankings = [] }, player, today = new Date()) {
    const ranking = core?.getPlayerRanking(rankings, player) || null;
    return {
      player,
      category: ranking?.category || "Categoría por confirmar",
      ranking,
      stats: getPlayerStats(registrations, player),
      form: getRecentForm(registrations, player, 5),
      headToHead: getHeadToHead(registrations, player),
      upcoming: getUpcomingMatches(matches, player, today),
      zone: getZoneStatus(rankings, ranking),
      gap: getGapToAbove(rankings, ranking)
    };
  }

  function compareProfiles(left, right) {
    if (!left || !right) return null;
    const metrics = [
      ["Puntos", Number(left.ranking?.points) || 0, Number(right.ranking?.points) || 0],
      ["Victorias", left.stats.wins, right.stats.wins],
      ["Rendimiento", left.stats.winRate, right.stats.winRate],
      ["Diferencia de sets", left.stats.setsWon - left.stats.setsLost, right.stats.setsWon - right.stats.setsLost]
    ];
    let leftScore = 0;
    let rightScore = 0;
    metrics.forEach(([, leftValue, rightValue]) => {
      if (leftValue > rightValue) leftScore += 1;
      else if (rightValue > leftValue) rightScore += 1;
    });
    return {
      left,
      right,
      leftScore,
      rightScore,
      message: leftScore === rightScore
        ? "La comparación está muy equilibrada."
        : `${leftScore > rightScore ? left.player : right.player} lidera más indicadores actuales.`
    };
  }

  return {
    samePlayer,
    containsPlayer,
    opponentOf,
    parseScore,
    scoreForPlayer,
    completedPlayerMatches,
    getPlayerStats,
    getRecentForm,
    getHeadToHead,
    getUpcomingMatches,
    getZoneStatus,
    getGapToAbove,
    getPlayerProfile,
    compareProfiles
  };
});
