(function (root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.OPEN_TENNIS_MARKER_RULES = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function isIntegerBetween(value, min, max) {
    return Number.isInteger(value) && value >= min && value <= max;
  }

  function getSetWinnerFromGames(a, b) {
    if (!isIntegerBetween(a, 0, 7) || !isIntegerBetween(b, 0, 7)) return null;
    if (a === 6 && b <= 4) return 0;
    if (b === 6 && a <= 4) return 1;
    if (a === 7 && (b === 5 || b === 6)) return 0;
    if (b === 7 && (a === 5 || a === 6)) return 1;
    return null;
  }

  function getSuperTiebreakWinner(a, b) {
    if (!isIntegerBetween(a, 0, 99) || !isIntegerBetween(b, 0, 99)) return null;
    if ((a >= 10 || b >= 10) && Math.abs(a - b) >= 2) {
      return a > b ? 0 : 1;
    }
    return null;
  }

  function isPossibleRegularSetScore(a, b) {
    if (!isIntegerBetween(a, 0, 7) || !isIntegerBetween(b, 0, 7)) return false;
    if (getSetWinnerFromGames(a, b) !== null) return true;
    return a <= 6 && b <= 6;
  }

  function validateCorrection(regularSets, superTiebreakPoints) {
    if (!Array.isArray(regularSets) || regularSets.length !== 2) {
      return { valid: false, message: "No se pudieron leer los dos sets." };
    }

    if (!Array.isArray(superTiebreakPoints) || superTiebreakPoints.length !== 2) {
      return { valid: false, message: "No se pudo leer el super tie-break." };
    }

    for (let i = 0; i < regularSets.length; i++) {
      const score = regularSets[i];
      const a = Array.isArray(score) ? score[0] : null;
      const b = Array.isArray(score) ? score[1] : null;

      if (!isIntegerBetween(a, 0, 7) || !isIntegerBetween(b, 0, 7)) {
        return { valid: false, message: `El set ${i + 1} debe usar números enteros entre 0 y 7.` };
      }

      if (!isPossibleRegularSetScore(a, b)) {
        return {
          valid: false,
          message: `El resultado ${a}-${b} no es posible en el set ${i + 1}. Usa 6-0 a 6-4, 7-5 o 7-6 para cerrar un set.`
        };
      }
    }

    const stbA = superTiebreakPoints[0];
    const stbB = superTiebreakPoints[1];

    if (!isIntegerBetween(stbA, 0, 99) || !isIntegerBetween(stbB, 0, 99)) {
      return { valid: false, message: "El super tie-break debe usar números enteros entre 0 y 99." };
    }

    const set1Winner = getSetWinnerFromGames(regularSets[0][0], regularSets[0][1]);
    const set2Winner = getSetWinnerFromGames(regularSets[1][0], regularSets[1][1]);
    const set2Started = regularSets[1][0] !== 0 || regularSets[1][1] !== 0;
    const superTiebreakStarted = stbA !== 0 || stbB !== 0;

    if (set1Winner === null && set2Started) {
      return { valid: false, message: "Primero debes terminar el set 1 antes de anotar el set 2." };
    }

    if ((set1Winner === null || set2Winner === null) && superTiebreakStarted) {
      return { valid: false, message: "El super tie-break solo se puede anotar después de terminar ambos sets." };
    }

    if (set1Winner !== null && set2Winner !== null) {
      if (set1Winner === set2Winner && superTiebreakStarted) {
        return { valid: false, message: "El partido terminó en dos sets; borra el resultado del super tie-break." };
      }

      if (set1Winner !== set2Winner) {
        return { valid: true, message: "" };
      }
    }

    return { valid: true, message: "" };
  }

  function formatElapsedMinutes(savedAt, now = Date.now()) {
    const timestamp = typeof savedAt === "number" ? savedAt : Date.parse(savedAt || "");
    const elapsed = Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : 0;
    const minutes = Math.max(1, Math.floor(elapsed / 60000));
    return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
  }

  return {
    getSetWinnerFromGames,
    getSuperTiebreakWinner,
    validateCorrection,
    formatElapsedMinutes
  };
});
