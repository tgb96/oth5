    const CLUB_PLAYERS = window.OPEN_TENNIS_CONFIG.CLUB_PLAYERS;

    const STORAGE_KEY = "openTennisMarcadorStateV2";
    const MATCH_INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
    const POINT_LABELS = ["0", "15", "30", "40"];
    const MARKER_RULES = window.OPEN_TENNIS_MARKER_RULES;

    let history = [];
    let matchActive = false;
    let ignoreSetupEvents = false;
    let toastTimer = null;
    let inactivityTimer = null;
    let pendingRecovery = null;
    let wakeLock = null;
    let wakeLockWanted = false;
    let correctionReturnFocus = null;
    let recoveryReturnFocus = null;

    function clone(obj) {
      return JSON.parse(JSON.stringify(obj));
    }

    function createInitialState() {
      return {
        category: "A",
        players: [CLUB_PLAYERS.A[0], CLUB_PLAYERS.A[1]],
        sets: [
          { games: [0, 0], tiebreakPoints: null, winner: null, tiebreakStartServer: null },
          { games: [0, 0], tiebreakPoints: null, winner: null, tiebreakStartServer: null },
          { superTiebreakPoints: [0, 0], winner: null, startServer: 0 }
        ],
        currentSet: 0,
        matchWinner: null,
        points: [0, 0],
        server: 0,
        inTiebreak: false,
        log: [{ text: "Partido iniciado", type: "info" }]
      };
    }

    function getState() {
      return history[history.length - 1];
    }

    function setMatchActive(active) {
      matchActive = Boolean(active);
      document.body.classList.toggle("match-active", matchActive);
      document.body.classList.toggle("setup-active", !matchActive);

      requestAnimationFrame(() => {
        relocateResultForMobilePortrait();
      });
    }

    function showToast(message) {
      const toast = document.getElementById("toast");
      toast.textContent = message;
      toast.classList.add("visible");

      if (toastTimer) clearTimeout(toastTimer);

      toastTimer = setTimeout(() => {
        toast.classList.remove("visible");
      }, 2300);
    }

    function getModalFocusables(modal) {
      return Array.from(modal.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )).filter(element => !element.hidden && element.offsetParent !== null);
    }

    function handleModalKeyboard(event) {
      const visibleModal = document.querySelector(".modal-backdrop.visible");
      if (!visibleModal) return;

      if (event.key === "Escape" && visibleModal.id === "correctionModal") {
        event.preventDefault();
        closeCorrectionModal();
        return;
      }

      if (event.key !== "Tab") return;

      const focusables = getModalFocusables(visibleModal);
      if (!focusables.length) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function vibrate(pattern = 35) {
      if (navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    }

    function clearInactivityTimer() {
      if (inactivityTimer !== null) {
        clearTimeout(inactivityTimer);
        inactivityTimer = null;
      }
    }

    function getSavedAtTimestamp(data) {
      const timestamp = Date.parse(data && data.savedAt ? data.savedAt : "");
      return Number.isFinite(timestamp) ? timestamp : null;
    }

    function isSavedMatchExpired(data, now = Date.now()) {
      const savedAt = getSavedAtTimestamp(data);
      return savedAt === null || now - savedAt >= MATCH_INACTIVITY_LIMIT_MS;
    }

    function scheduleInactivityExpiration(savedAt = Date.now()) {
      clearInactivityTimer();

      const elapsed = Math.max(0, Date.now() - savedAt);
      const remaining = MATCH_INACTIVITY_LIMIT_MS - elapsed;

      if (remaining <= 0) {
        inactivityTimer = window.setTimeout(checkInactivityExpiration, 0);
        return;
      }

      inactivityTimer = window.setTimeout(checkInactivityExpiration, remaining);
    }

    function saveMatch() {
      try {
        const savedAt = new Date();

        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            version: 2,
            savedAt: savedAt.toISOString(),
            history
          })
        );

        scheduleInactivityExpiration(savedAt.getTime());
      } catch (error) {
        console.warn("No se pudo guardar el marcador", error);
      }
    }

    function clearSavedMatch() {
      clearInactivityTimer();

      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (error) {}
    }

    function getSavedMatchData() {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.history) || !data.history.length) return null;

      const savedState = data.history[data.history.length - 1];
      if (!savedState || !savedState.category || !Array.isArray(savedState.players)) return null;
      if (!CLUB_PLAYERS[savedState.category]) return null;

      return {
        history: data.history,
        savedAt: getSavedAtTimestamp(data),
        savedState,
        expired: isSavedMatchExpired(data)
      };
    }

    function openRecoveryModal(savedMatch) {
      if (!savedMatch) return;

      pendingRecovery = savedMatch;
      recoveryReturnFocus = document.activeElement;
      releaseWakeLock();
      closeCorrectionModal({ restoreFocus: false });

      const labelA = getPlayerLabel(savedMatch.savedState, 0);
      const labelB = getPlayerLabel(savedMatch.savedState, 1);
      const elapsed = MARKER_RULES.formatElapsedMinutes(savedMatch.savedAt);
      const recoveryModal = document.getElementById("recoveryModal");

      document.getElementById("recoveryMessage").textContent =
        `Puedes recuperar el partido entre ${labelA} y ${labelB}, guardado hace ${elapsed}.`;
      recoveryModal.classList.add("visible");
      recoveryModal.setAttribute("aria-hidden", "false");

      requestAnimationFrame(() => document.getElementById("recoveryRestore").focus());
    }

    function closeRecoveryModal(options = {}) {
      const { restoreFocus = true } = options;
      const recoveryModal = document.getElementById("recoveryModal");
      recoveryModal.classList.remove("visible");
      recoveryModal.setAttribute("aria-hidden", "true");

      if (restoreFocus && recoveryReturnFocus?.isConnected) {
        recoveryReturnFocus.focus();
      }
      recoveryReturnFocus = null;
    }

    function recoverSavedMatch() {
      if (!pendingRecovery) return;

      const savedMatch = pendingRecovery;
      pendingRecovery = null;
      closeRecoveryModal({ restoreFocus: false });

      history = savedMatch.history;
      populatePlayers(
        savedMatch.savedState.category,
        savedMatch.savedState.players[0],
        savedMatch.savedState.players[1]
      );
      setMatchActive(true);
      saveMatch();
      render();
      requestWakeLock();
      showToast("Partido recuperado");
      vibrate([30, 40, 30]);
    }

    function discardSavedMatch() {
      if (!pendingRecovery) return;

      const savedState = pendingRecovery.savedState;
      pendingRecovery = null;
      closeRecoveryModal({ restoreFocus: false });
      clearSavedMatch();
      releaseWakeLock();

      populatePlayers(savedState.category, savedState.players[0], savedState.players[1]);

      ensureDistinctPlayerSelects();
      history = [createMatchFromSetup()];
      setMatchActive(false);
      render();

      requestAnimationFrame(() => {
        const setupCard = document.querySelector(".setup-card");
        if (setupCard) setupCard.scrollIntoView({ block: "start", behavior: "smooth" });
      });

      showToast("Partido guardado descartado");
      vibrate(20);
    }

    function checkInactivityExpiration() {
      clearInactivityTimer();

      if (pendingRecovery && document.getElementById("recoveryModal").classList.contains("visible")) {
        return;
      }

      try {
        const savedMatch = getSavedMatchData();
        if (!savedMatch) return;

        if (!savedMatch.expired) {
          scheduleInactivityExpiration(savedMatch.savedAt);
          return;
        }

        openRecoveryModal(savedMatch);
      } catch (error) {
        clearSavedMatch();
        showToast("No se pudo leer el partido guardado");
      }
    }

    function loadSavedMatch() {
      try {
        const savedMatch = getSavedMatchData();
        if (!savedMatch) return null;

        if (!savedMatch.expired) scheduleInactivityExpiration(savedMatch.savedAt);
        return savedMatch;
      } catch (error) {
        clearSavedMatch();
        return null;
      }
    }

    function pushState(state, options = {}) {
      history.push(state);
      saveMatch();
      render();

      if (options.vibrate !== false) {
        vibrate(options.pattern || 28);
      }
    }

    function getPlayerLabel(state, index) {
      return state.players[index] || `Jugador ${index === 0 ? "A" : "B"}`;
    }

    function addLog(state, text, type = "info") {
      state.log = [{ text, type }, ...state.log].slice(0, 40);
    }

    function getSetsWon(state) {
      const won = [0, 0];

      state.sets.forEach(set => {
        if (set.winner === 0 || set.winner === 1) {
          won[set.winner]++;
        }
      });

      return won;
    }

    function formatRegularPoints(points) {
      const [a, b] = points;

      if (a >= 3 && b >= 3) {
        if (a === b) return ["40", "40"];
        if (a === b + 1) return ["AD", "40"];
        if (b === a + 1) return ["40", "AD"];
      }

      return [POINT_LABELS[a] || "40", POINT_LABELS[b] || "40"];
    }

    function getTiebreakServer(startServer, totalPointsPlayed) {
      if (totalPointsPlayed === 0) return startServer;

      const other = startServer === 0 ? 1 : 0;

      if (totalPointsPlayed === 1) return other;

      const block = Math.floor((totalPointsPlayed - 1) / 2);
      return block % 2 === 0 ? other : startServer;
    }

    function getCurrentServer(state) {
      if (state.currentSet === 2 && state.matchWinner === null) {
        const set = state.sets[2];
        const total = set.superTiebreakPoints[0] + set.superTiebreakPoints[1];
        return getTiebreakServer(set.startServer, total);
      }

      if (state.inTiebreak) {
        const set = state.sets[state.currentSet];
        const total = set.tiebreakPoints[0] + set.tiebreakPoints[1];
        return getTiebreakServer(set.tiebreakStartServer, total);
      }

      return state.server;
    }

    function nextServerForNewGame(state) {
      state.server = state.server === 0 ? 1 : 0;
    }

    function getSideChangeMessage(state) {
      if (state.matchWinner !== null) return "";

      if (state.currentSet === 2) {
        const pts = state.sets[2].superTiebreakPoints[0] + state.sets[2].superTiebreakPoints[1];
        if (pts > 0 && pts % 6 === 0) return "Cambio de lado ahora";
        return "";
      }

      if (state.inTiebreak) {
        const tb = state.sets[state.currentSet].tiebreakPoints;
        const pts = tb[0] + tb[1];
        if (pts > 0 && pts % 6 === 0) return "Cambio de lado ahora";
        return "";
      }

      const games = state.sets[state.currentSet].games;
      const totalGames = games[0] + games[1];

      if (totalGames > 0 && totalGames % 2 === 1) {
        return "Cambio de lado ahora";
      }

      return "";
    }

    function wouldWinRegularGame(points, player) {
      const p = [...points];
      p[player]++;

      return p[player] >= 4 && p[player] - p[player === 0 ? 1 : 0] >= 2;
    }

    function wouldWinSet(state, player) {
      if (state.currentSet === 2) {
        const pts = [...state.sets[2].superTiebreakPoints];
        pts[player]++;

        return pts[player] >= 10 && pts[player] - pts[player === 0 ? 1 : 0] >= 2;
      }

      if (state.inTiebreak) {
        const pts = [...state.sets[state.currentSet].tiebreakPoints];
        pts[player]++;

        return pts[player] >= 7 && pts[player] - pts[player === 0 ? 1 : 0] >= 2;
      }

      if (!wouldWinRegularGame(state.points, player)) return false;

      const games = [...state.sets[state.currentSet].games];
      games[player]++;

      return games[player] >= 6 && games[player] - games[player === 0 ? 1 : 0] >= 2;
    }

    function wouldWinMatch(state, player) {
      const won = getSetsWon(state);
      return won[player] + (wouldWinSet(state, player) ? 1 : 0) >= 2;
    }

    function getLiveMoments(state) {
      const moments = [];

      if (state.matchWinner !== null) {
        moments.push({
          text: `${getPlayerLabel(state, state.matchWinner)} ganó el partido`,
          type: "green"
        });
        return moments;
      }

      if (state.currentSet < 2 && !state.inTiebreak) {
        const [a, b] = state.points;

        if (a >= 3 && b >= 3 && a === b) {
          moments.push({ text: "Deuce", type: "orange" });
        }

        if (a >= 3 && b >= 3 && Math.abs(a - b) === 1) {
          const adv = a > b ? 0 : 1;
          moments.push({
            text: `Ventaja ${getPlayerLabel(state, adv)}`,
            type: "orange"
          });
        }

        [0, 1].forEach(player => {
          if (wouldWinRegularGame(state.points, player)) {
            const isReceiver = getCurrentServer(state) !== player;
            moments.push({
              text: `${isReceiver ? "Break point" : "Game point"} para ${getPlayerLabel(state, player)}`,
              type: isReceiver ? "red" : "blue"
            });

            if (wouldWinSet(state, player)) {
              moments.push({
                text: `Set point para ${getPlayerLabel(state, player)}`,
                type: "orange"
              });
            }

            if (wouldWinMatch(state, player)) {
              moments.push({
                text: `Match point para ${getPlayerLabel(state, player)}`,
                type: "red"
              });
            }
          }
        });
      } else {
        [0, 1].forEach(player => {
          if (wouldWinSet(state, player)) {
            moments.push({
              text: `Set point para ${getPlayerLabel(state, player)}`,
              type: "orange"
            });
          }

          if (wouldWinMatch(state, player)) {
            moments.push({
              text: `Match point para ${getPlayerLabel(state, player)}`,
              type: "red"
            });
          }
        });
      }

      return moments;
    }

    function winSet(state, winner) {
      const label = getPlayerLabel(state, winner);
      const set = state.sets[state.currentSet];

      set.winner = winner;
      state.points = [0, 0];
      state.inTiebreak = false;

      addLog(state, `${label} gana el Set ${state.currentSet + 1}`, "success");
      vibrate([40, 40, 40]);

      const won = getSetsWon(state);

      if (won[winner] === 2) {
        state.matchWinner = winner;
        addLog(state, `${label} gana el partido`, "success");
        return;
      }

      state.currentSet++;

      if (state.currentSet === 2) {
        state.sets[2].startServer = state.server;
        addLog(
          state,
          `Comienza super tie-break a 10 puntos. Saca ${getPlayerLabel(state, state.server)}`,
          "info"
        );
      }
    }

    function winGame(state, winner) {
      const label = getPlayerLabel(state, winner);
      const serverBefore = state.server;
      const set = state.sets[state.currentSet];

      set.games[winner]++;
      state.points = [0, 0];

      addLog(state, `${label} gana un game (${set.games[0]}-${set.games[1]})`, "success");

      if (winner !== serverBefore) {
        addLog(state, `Break de ${label}`, "danger");
      }

      nextServerForNewGame(state);

      const [a, b] = set.games;

      if ((a >= 6 || b >= 6) && Math.abs(a - b) >= 2) {
        winSet(state, winner);
        return;
      }

      if (a === 6 && b === 6) {
        set.tiebreakPoints = [0, 0];
        set.tiebreakStartServer = state.server;
        state.inTiebreak = true;

        addLog(
          state,
          `Tie-break del Set ${state.currentSet + 1}. Saca ${getPlayerLabel(state, state.server)}`,
          "info"
        );
      }
    }

    function pointToPlayer(rawState, winner) {
      const state = clone(rawState);

      if (state.matchWinner !== null) return state;

      const set = state.sets[state.currentSet];
      const label = getPlayerLabel(state, winner);

      if (state.currentSet === 2) {
        set.superTiebreakPoints[winner]++;
        addLog(state, `Punto STB para ${label} (${set.superTiebreakPoints[0]}-${set.superTiebreakPoints[1]})`, "info");

        const [a, b] = set.superTiebreakPoints;

        if ((a >= 10 || b >= 10) && Math.abs(a - b) >= 2) {
          winSet(state, winner);
        }

        return state;
      }

      if (state.inTiebreak) {
        set.tiebreakPoints[winner]++;
        addLog(state, `Punto tie-break para ${label} (${set.tiebreakPoints[0]}-${set.tiebreakPoints[1]})`, "info");

        const [a, b] = set.tiebreakPoints;

        if ((a >= 7 || b >= 7) && Math.abs(a - b) >= 2) {
          winSet(state, winner);
        }

        return state;
      }

      state.points[winner]++;

      const [a, b] = state.points;

      if (a >= 4 || b >= 4) {
        if (Math.abs(a - b) >= 2) {
          winGame(state, winner);
          return state;
        }
      }

      if (state.points[winner] === 4 && state.points[winner === 0 ? 1 : 0] <= 2) {
        winGame(state, winner);
        return state;
      }

      addLog(state, `Punto para ${label}`, "info");
      return state;
    }

    function getSetWinnerFromGames(a, b) {
      return MARKER_RULES.getSetWinnerFromGames(a, b);
    }

    function getSTBWinner(a, b) {
      return MARKER_RULES.getSuperTiebreakWinner(a, b);
    }

    function recalculateMatchFromScore(state) {
      state.points = [0, 0];
      state.inTiebreak = false;
      state.matchWinner = null;

      for (let i = 0; i < 2; i++) {
        const set = state.sets[i];
        const [a, b] = set.games;
        set.winner = getSetWinnerFromGames(a, b);

        if (a === 6 && b === 6 && set.winner === null) {
          set.tiebreakPoints = set.tiebreakPoints || [0, 0];
          set.tiebreakStartServer = state.server;
        } else if (!(a === 7 && b === 6) && !(b === 7 && a === 6)) {
          set.tiebreakPoints = null;
        }
      }

      const regularSetsSplit =
        state.sets[0].winner !== null &&
        state.sets[1].winner !== null &&
        state.sets[0].winner !== state.sets[1].winner;
      const stb = state.sets[2].superTiebreakPoints;
      state.sets[2].winner = regularSetsSplit ? getSTBWinner(stb[0], stb[1]) : null;

      const won = getSetsWon(state);
      if (won[0] >= 2) state.matchWinner = 0;
      if (won[1] >= 2) state.matchWinner = 1;

      if (state.matchWinner !== null) {
        state.currentSet = state.sets[2].winner !== null ? 2 : (state.sets[1].winner !== null ? 1 : 0);
        return;
      }

      if (state.sets[0].winner === null) {
        state.currentSet = 0;
        state.inTiebreak = state.sets[0].games[0] === 6 && state.sets[0].games[1] === 6;
        return;
      }

      if (state.sets[1].winner === null) {
        state.currentSet = 1;
        state.inTiebreak = state.sets[1].games[0] === 6 && state.sets[1].games[1] === 6;
        return;
      }

      state.currentSet = 2;
      state.sets[2].startServer = state.sets[2].startServer ?? state.server;
    }

    function getScoreParts(state) {
      if (state.matchWinner === null) return [];

      const winner = state.matchWinner;
      const parts = [];

      for (let i = 0; i < 2; i++) {
        const g = state.sets[i].games;

        if (g[0] || g[1] || state.sets[i].winner !== null) {
          parts.push(winner === 0 ? `${g[0]}-${g[1]}` : `${g[1]}-${g[0]}`);
        }
      }

      const stb = state.sets[2].superTiebreakPoints;

      if (stb[0] || stb[1]) {
        parts.push(winner === 0 ? `${stb[0]}-${stb[1]}` : `${stb[1]}-${stb[0]}`);
      }

      return parts;
    }

    function generateResultText(state) {
      if (state.matchWinner === null) return "";

      const winner = state.matchWinner;
      const loser = winner === 0 ? 1 : 0;
      const winnerName = getPlayerLabel(state, winner);
      const loserName = getPlayerLabel(state, loser);
      const parts = getScoreParts(state);

      return `${winnerName} ganó a ${loserName} ${parts.join(" ")}`.trim();
    }

    function generateShareText(state) {
      if (state.matchWinner === null) return "";
      return `🎾 Open Tennis Huechuraba ${window.OPEN_TENNIS_CONFIG.SEASON}\nCategoría ${state.category}\n${generateResultText(state)}`;
    }

    function escapeHtml(text) {
      return String(text).replace(/[&<>"]/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;"
      }[char]));
    }

    function populatePlayers(category, selectedA, selectedB) {
      const playerA = document.getElementById("playerASelect");
      const playerB = document.getElementById("playerBSelect");
      const players = CLUB_PLAYERS[category];

      playerA.innerHTML = players.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
      playerB.innerHTML = players.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");

      playerA.value = selectedA && players.includes(selectedA) ? selectedA : players[0];
      playerB.value = selectedB && players.includes(selectedB) ? selectedB : players[Math.min(1, players.length - 1)];

      ensureDistinctPlayerSelects();
    }

    function ensureDistinctPlayerSelects(changed = null) {
      const playerA = document.getElementById("playerASelect");
      const playerB = document.getElementById("playerBSelect");
      const category = document.getElementById("categorySelect").value;
      const players = CLUB_PLAYERS[category];

      if (playerA.value === playerB.value) {
        const replacement = players.find(p => p !== playerA.value) || players[0];

        if (changed === "A") {
          playerB.value = replacement;
        } else {
          playerA.value = replacement;
        }

        showToast("No se puede elegir el mismo jugador dos veces. Se corrigió automáticamente.");
      }

      [...playerA.options].forEach(option => {
        option.disabled = option.value === playerB.value;
      });

      [...playerB.options].forEach(option => {
        option.disabled = option.value === playerA.value;
      });
    }

    function isMatchDirty() {
      const state = getState();
      if (!state) return false;
      if (history.length > 1) return true;
      if (state.matchWinner !== null) return true;
      return state.sets.some((set, index) => {
        if (index < 2) {
          return set.games[0] || set.games[1] || set.winner !== null || set.tiebreakPoints !== null;
        }
        return set.superTiebreakPoints[0] || set.superTiebreakPoints[1] || set.winner !== null;
      }) || state.points[0] || state.points[1];
    }

    function createMatchFromSetup() {
      const category = document.getElementById("categorySelect").value;
      const pA = document.getElementById("playerASelect").value;
      const pB = document.getElementById("playerBSelect").value;

      const state = createInitialState();
      state.category = category;
      state.players = [pA, pB];
      state.log = [{ text: `Partido iniciado: ${pA} vs ${pB}`, type: "info" }];

      return state;
    }

    function resetMatchWithSetup(options = {}) {
      ensureDistinctPlayerSelects();
      history = [createMatchFromSetup()];
      saveMatch();
      render();

      if (options.toast) showToast(options.toast);
      if (options.vibrate !== false) vibrate(35);
    }

    function startNewMatch() {
      if (matchActive && isMatchDirty()) {
        const ok = confirm("¿Seguro que quieres crear un nuevo partido? Se borrará el marcador actual guardado en este celular.");
        if (!ok) return;
      }

      ensureDistinctPlayerSelects();
      clearSavedMatch();
      history = [createMatchFromSetup()];
      saveMatch();
      setMatchActive(true);
      render();
      requestAnimationFrame(() => {
        const banner = document.querySelector(".match-banner");
        if (banner) banner.scrollIntoView({ block: "start" });
      });
      requestWakeLock();
      showToast("Partido iniciado");
      vibrate(35);
    }

    function showSetupForNewMatch() {
      if (matchActive && isMatchDirty()) {
        const ok = confirm("¿Seguro que quieres configurar un nuevo partido? Se borrará el marcador actual guardado en este celular.");
        if (!ok) return;
      }

      clearSavedMatch();
      releaseWakeLock();
      history = [createMatchFromSetup()];
      setMatchActive(false);
      render();
      showToast("Selecciona categoría y jugadores para el nuevo partido");
      vibrate(20);
    }

    function handleSetupChange(type) {
      if (ignoreSetupEvents) return;

      if (!matchActive) {
        if (type === "category") {
          const selectedCategory = document.getElementById("categorySelect").value;
          populatePlayers(selectedCategory);
        }

        ensureDistinctPlayerSelects(type === "playerA" ? "A" : type === "playerB" ? "B" : null);
        history = [createMatchFromSetup()];
        return;
      }

      if (type === "category") {
        const selectedCategory = document.getElementById("categorySelect").value;

        if (isMatchDirty()) {
          const ok = confirm("Cambiar la categoría reiniciará el partido actual. ¿Continuar?");
          if (!ok) {
            render();
            return;
          }
        }

        populatePlayers(selectedCategory);
        resetMatchWithSetup({ toast: "Categoría actualizada" });
        return;
      }

      ensureDistinctPlayerSelects(type === "playerA" ? "A" : "B");

      if (isMatchDirty()) {
        const ok = confirm("Cambiar jugadores reiniciará el partido actual. ¿Continuar?");
        if (!ok) {
          render();
          return;
        }
      }

      resetMatchWithSetup({ toast: "Jugadores actualizados" });
    }

    function switchServerManual() {
      const state = clone(getState());

      if (state.matchWinner !== null) return;

      state.server = state.server === 0 ? 1 : 0;

      if (state.currentSet === 2) {
        state.sets[2].startServer = state.server;
      }

      if (state.inTiebreak) {
        state.sets[state.currentSet].tiebreakStartServer = state.server;
      }

      addLog(state, `Sacador corregido manualmente: ${getPlayerLabel(state, state.server)}`, "warning");
      pushState(state, { pattern: 25 });
    }

    async function requestWakeLock() {
      wakeLockWanted = true;

      if (!("wakeLock" in navigator)) {
        updateWakeUI("unsupported");
        return;
      }

      try {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => {
          wakeLock = null;
          updateWakeUI();
        });
        updateWakeUI();
      } catch (error) {
        updateWakeUI("blocked");
      }
    }

    async function releaseWakeLock() {
      wakeLockWanted = false;

      if (wakeLock) {
        try {
          await wakeLock.release();
        } catch (error) {}
      }

      wakeLock = null;
      updateWakeUI();
    }

    function updateWakeUI(status) {
      const indicator = document.getElementById("wakeIndicator");
      const btn = document.getElementById("wakeToggleBtn");

      if (!indicator || !btn) return;

      indicator.classList.toggle("on", Boolean(wakeLock));

      if (wakeLock) {
        indicator.textContent = "💡 Pantalla activa";
        btn.textContent = "Desactivar";
        return;
      }

      if (status === "unsupported") {
        indicator.textContent = "⚠️ Wake Lock no disponible";
        btn.textContent = "Reintentar";
        return;
      }

      if (status === "blocked") {
        indicator.textContent = "⚠️ Toca para activar pantalla";
        btn.textContent = "Activar pantalla";
        return;
      }

      indicator.textContent = wakeLockWanted ? "⚠️ Pantalla pendiente" : "🔒 Pantalla normal";
      btn.textContent = wakeLockWanted ? "Reactivar" : "Mantener pantalla activa";
    }

    function setupWakeLock() {
      document.getElementById("wakeToggleBtn").addEventListener("click", () => {
        if (wakeLock) {
          releaseWakeLock();
        } else {
          requestWakeLock();
        }
      });

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && wakeLockWanted && !wakeLock) {
          requestWakeLock();
        }
      });

      document.addEventListener("pointerdown", () => {
        if (matchActive && !wakeLock) {
          requestWakeLock();
        }
      }, { passive: true });
    }

    function drawRoundedRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
      const words = String(text).split(" ");
      let line = "";
      let currentY = y;

      for (let n = 0; n < words.length; n++) {
        const testLine = line ? `${line} ${words[n]}` : words[n];
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && n > 0) {
          ctx.fillText(line, x, currentY);
          line = words[n];
          currentY += lineHeight;
        } else {
          line = testLine;
        }
      }

      ctx.fillText(line, x, currentY);
      return currentY;
    }

    function createResultCanvas(state) {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1080;

      const ctx = canvas.getContext("2d");
      const winner = state.matchWinner;
      const loser = winner === 0 ? 1 : 0;
      const winnerName = getPlayerLabel(state, winner);
      const loserName = getPlayerLabel(state, loser);
      const score = getScoreParts(state).join("  ");

      const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
      gradient.addColorStop(0, "#eaf4e4");
      gradient.addColorStop(0.5, "#ffffff");
      gradient.addColorStop(1, "#fff3df");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1080, 1080);

      ctx.fillStyle = "rgba(106, 168, 79, 0.16)";
      ctx.beginPath();
      ctx.arc(930, 120, 230, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255, 153, 0, 0.16)";
      ctx.beginPath();
      ctx.arc(130, 950, 250, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      drawRoundedRect(ctx, 70, 70, 940, 940, 54);
      ctx.fill();

      ctx.strokeStyle = "#b6d7a8";
      ctx.lineWidth = 6;
      drawRoundedRect(ctx, 70, 70, 940, 940, 54);
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.fillStyle = "#4f8738";
      ctx.font = "900 48px Arial";
      ctx.fillText("OPEN TENNIS HUECHURABA", 540, 170);

      ctx.fillStyle = "#6b7280";
      ctx.font = "800 30px Arial";
      ctx.fillText(`Categoría ${state.category} · Resultado final`, 540, 220);

      ctx.fillStyle = "#ff9900";
      ctx.font = "900 88px Arial";
      ctx.fillText("🏆", 540, 330);

      ctx.fillStyle = "#1f2933";
      ctx.font = "900 64px Arial";
      wrapCanvasText(ctx, winnerName, 540, 430, 820, 70);

      ctx.fillStyle = "#4f8738";
      ctx.font = "900 44px Arial";
      ctx.fillText("ganó el partido", 540, 545);

      ctx.fillStyle = "#6b7280";
      ctx.font = "800 34px Arial";
      ctx.fillText("vs", 540, 615);

      ctx.fillStyle = "#1f2933";
      ctx.font = "900 48px Arial";
      wrapCanvasText(ctx, loserName, 540, 680, 820, 56);

      ctx.fillStyle = "#4f8738";
      drawRoundedRect(ctx, 170, 765, 740, 120, 60);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "900 58px Arial";
      ctx.fillText(score, 540, 840);

      ctx.fillStyle = "#6b7280";
      ctx.font = "700 24px Arial";
      ctx.fillText("Resultado generado desde el marcador oficial", 540, 945);

      return canvas;
    }

    function canvasToBlob(canvas) {
      return new Promise(resolve => {
        canvas.toBlob(blob => resolve(blob), "image/png", 0.95);
      });
    }

    async function copyResult() {
      const text = generateShareText(getState());

      if (!text) return;

      try {
        await navigator.clipboard.writeText(text);
        showToast("Resultado copiado");
      } catch (error) {
        showToast("No se pudo copiar automáticamente. Mantén presionado el resultado para copiarlo.");
      }
    }

    async function shareResultImage() {
      const state = getState();
      if (state.matchWinner === null) return;

      const text = generateShareText(state);
      const canvas = createResultCanvas(state);
      const blob = await canvasToBlob(canvas);
      const file = new File([blob], "resultado-open-tennis.png", { type: "image/png" });

      if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        try {
          await navigator.share({
            title: "Resultado Open Tennis",
            text,
            files: [file]
          });
          return;
        } catch (error) {
          if (error && error.name === "AbortError") return;
        }
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "resultado-open-tennis.png";
      link.click();
      URL.revokeObjectURL(url);

      showToast("Se descargó la imagen. Envíala por WhatsApp desde tu galería.");
    }

    function shareWhatsAppText() {
      const text = generateShareText(getState());
      if (!text) return;

      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    }

    function openCorrectionModal() {
      const state = getState();
      const labelA = getPlayerLabel(state, 0);
      const labelB = getPlayerLabel(state, 1);
      const correctionError = document.getElementById("correctionError");
      correctionReturnFocus = document.activeElement;

      correctionError.textContent = "";
      correctionError.hidden = true;

      document.getElementById("corrNameAHead").textContent = labelA;
      document.getElementById("corrNameBHead").textContent = labelB;

      document.getElementById("corrS1A").value = state.sets[0].games[0];
      document.getElementById("corrS1B").value = state.sets[0].games[1];
      document.getElementById("corrS2A").value = state.sets[1].games[0];
      document.getElementById("corrS2B").value = state.sets[1].games[1];
      document.getElementById("corrSTBA").value = state.sets[2].superTiebreakPoints[0];
      document.getElementById("corrSTBB").value = state.sets[2].superTiebreakPoints[1];

      const corrServer = document.getElementById("corrServer");
      corrServer.innerHTML = `
        <option value="0">${escapeHtml(labelA)}</option>
        <option value="1">${escapeHtml(labelB)}</option>
      `;
      corrServer.value = String(getCurrentServer(state));

      document.getElementById("correctionModal").classList.add("visible");
      document.getElementById("correctionModal").setAttribute("aria-hidden", "false");
      requestAnimationFrame(() => document.getElementById("corrS1A").focus());
    }

    function closeCorrectionModal(options = {}) {
      const { restoreFocus = true } = options;
      const modal = document.getElementById("correctionModal");
      const wasVisible = modal.classList.contains("visible");
      modal.classList.remove("visible");
      modal.setAttribute("aria-hidden", "true");

      if (wasVisible && restoreFocus && correctionReturnFocus?.isConnected) {
        correctionReturnFocus.focus();
      }
      correctionReturnFocus = null;
    }

    function readNumberInput(id) {
      return Number(document.getElementById(id).value);
    }

    function showCorrectionError(message) {
      const correctionError = document.getElementById("correctionError");
      correctionError.textContent = message;
      correctionError.hidden = false;
      correctionError.focus();
    }

    function applyCorrection() {
      const state = clone(getState());
      const regularSets = [
        [readNumberInput("corrS1A"), readNumberInput("corrS1B")],
        [readNumberInput("corrS2A"), readNumberInput("corrS2B")]
      ];
      const superTiebreakPoints = [
        readNumberInput("corrSTBA"),
        readNumberInput("corrSTBB")
      ];
      const validation = MARKER_RULES.validateCorrection(regularSets, superTiebreakPoints);

      if (!validation.valid) {
        showCorrectionError(validation.message);
        vibrate([50, 50, 50]);
        return;
      }

      state.sets[0].games = regularSets[0];
      state.sets[1].games = regularSets[1];
      state.sets[2].superTiebreakPoints = superTiebreakPoints;

      state.server = Number(document.getElementById("corrServer").value) || 0;
      state.sets[2].startServer = state.server;
      recalculateMatchFromScore(state);
      addLog(state, "Marcador corregido manualmente", "warning");

      closeCorrectionModal();
      pushState(state, { pattern: [30, 40, 30] });
      showToast("Corrección aplicada");
    }

    function getCompactPlayerName(label) {
      const clean = String(label || "").trim().replace(/\s+/g, " ");
      if (!clean) return "Jugador";

      const parts = clean.split(" ").filter(Boolean);
      if (parts.length <= 1) return clean;

      const normalized = clean
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

      if (normalized.startsWith("maria jose ")) {
        const last = parts[parts.length - 1];
        return `María José ${last ? last[0] + "." : ""}`.trim();
      }

      const first = parts[0];
      const last = parts[parts.length - 1];
      const lastInitial = last && last !== first ? `${last[0]}.` : "";
      return `${first} ${lastInitial}`.trim();
    }

    function getCompactStatusText(text, state) {
      let result = String(text || "");
      if (!state || !Array.isArray(state.players)) return result;

      state.players.forEach(player => {
        const full = String(player || "").trim();
        if (!full) return;
        result = result.split(full).join(getCompactPlayerName(full));
      });

      return result;
    }

    function shouldUseCompactPointLabels() {
      return window.matchMedia("(max-width: 820px) and (orientation: portrait)").matches;
    }

    function render() {
      const state = getState();

      const labelA = getPlayerLabel(state, 0);
      const labelB = getPlayerLabel(state, 1);
      const compactLabelA = getCompactPlayerName(labelA);
      const compactLabelB = getCompactPlayerName(labelB);
      const currentServer = getCurrentServer(state);
      const regularPoints = formatRegularPoints(state.points);
      const sideMessage = getSideChangeMessage(state);
      const liveMoments = getLiveMoments(state);
      const setsWon = getSetsWon(state);

      ignoreSetupEvents = true;
      document.getElementById("categorySelect").value = state.category;
      populatePlayers(state.category, labelA, labelB);
      document.getElementById("playerASelect").value = labelA;
      document.getElementById("playerBSelect").value = labelB;
      ensureDistinctPlayerSelects();
      ignoreSetupEvents = false;

      document.getElementById("categoryLabel").textContent = `Categoría ${state.category}`;

      document.getElementById("bannerNameA").textContent = labelA;
      document.getElementById("bannerNameB").textContent = labelB;
      document.getElementById("serveStrip").textContent = state.matchWinner === null
        ? `🎾 Saca ${getPlayerLabel(state, currentServer)}`
        : "✅ Partido terminado";

      document.getElementById("playerNameA").textContent = compactLabelA;
      document.getElementById("playerNameB").textContent = compactLabelB;

      document.getElementById("playerBoxA").classList.toggle("serving", currentServer === 0 && state.matchWinner === null);
      document.getElementById("playerBoxB").classList.toggle("serving", currentServer === 1 && state.matchWinner === null);

      let scoreA = "0";
      let scoreB = "0";

      if (state.currentSet === 2) {
        scoreA = String(state.sets[2].superTiebreakPoints[0]);
        scoreB = String(state.sets[2].superTiebreakPoints[1]);
      } else if (state.inTiebreak) {
        scoreA = String(state.sets[state.currentSet].tiebreakPoints[0]);
        scoreB = String(state.sets[state.currentSet].tiebreakPoints[1]);
      } else {
        scoreA = regularPoints[0];
        scoreB = regularPoints[1];
      }

      document.getElementById("gamePointsA").textContent = scoreA;
      document.getElementById("gamePointsB").textContent = scoreB;

      document.getElementById("pointA").textContent = "Punto";
      document.getElementById("pointB").textContent = "Punto";
      document.getElementById("pointA").setAttribute("aria-label", `Punto para ${labelA}`);
      document.getElementById("pointB").setAttribute("aria-label", `Punto para ${labelB}`);

      for (let i = 0; i < 3; i++) {
        const box = document.getElementById(`setBox${i + 1}`);
        const status = document.getElementById(`set${i + 1}Status`);

        box.classList.toggle("active", state.currentSet === i && state.matchWinner === null);
        box.classList.toggle("done", state.sets[i].winner !== null);

        if (state.sets[i].winner !== null) {
          status.textContent = `Ganó ${getCompactPlayerName(getPlayerLabel(state, state.sets[i].winner))}`;
          status.className = "badge green";
        } else if (state.currentSet === i && state.matchWinner === null) {
          status.textContent = "En juego";
          status.className = "badge orange";
        } else {
          status.textContent = "En espera";
          status.className = "badge";
        }

        document.getElementById(`set${i + 1}NameA`).textContent = compactLabelA;
        document.getElementById(`set${i + 1}NameB`).textContent = compactLabelB;
      }

      document.getElementById("set1A").textContent = state.sets[0].games[0];
      document.getElementById("set1B").textContent = state.sets[0].games[1];
      document.getElementById("set2A").textContent = state.sets[1].games[0];
      document.getElementById("set2B").textContent = state.sets[1].games[1];
      document.getElementById("set3A").textContent = state.sets[2].superTiebreakPoints[0];
      document.getElementById("set3B").textContent = state.sets[2].superTiebreakPoints[1];

      const tb1 = document.getElementById("tb1Box");
      const tb2 = document.getElementById("tb2Box");

      if (state.sets[0].tiebreakPoints) {
        tb1.style.display = "inline-block";
        tb1.textContent = `Tie-break: ${state.sets[0].tiebreakPoints[0]}-${state.sets[0].tiebreakPoints[1]}`;
      } else {
        tb1.style.display = "none";
      }

      if (state.sets[1].tiebreakPoints) {
        tb2.style.display = "inline-block";
        tb2.textContent = `Tie-break: ${state.sets[1].tiebreakPoints[0]}-${state.sets[1].tiebreakPoints[1]}`;
      } else {
        tb2.style.display = "none";
      }

      const statusParts = [
        `<span class="badge green">Set actual: ${state.currentSet + 1}</span>`,
        `<span class="badge orange">Saca: ${getCompactPlayerName(getPlayerLabel(state, currentServer))}</span>`
      ];

      if (state.inTiebreak) {
        statusParts.push(`<span class="badge blue">Tie-break activo</span>`);
      }

      if (state.currentSet === 2 && state.matchWinner === null) {
        statusParts.push(`<span class="badge blue">Super tie-break activo</span>`);
      }

      if (sideMessage === "Cambio de lado ahora") {
        statusParts.push(`<span class="badge orange">Cambio de lado</span>`);
      }

      liveMoments.forEach(m => {
        statusParts.push(`<span class="badge ${m.type}">${escapeHtml(getCompactStatusText(m.text, state))}</span>`);
      });

      document.getElementById("statusLine").innerHTML = statusParts.join("");
      document.getElementById("changeAlert").classList.remove("visible");

      const finalCard = document.getElementById("finalCard");

      if (state.matchWinner !== null) {
        finalCard.classList.add("visible");
        document.getElementById("finalWinner").textContent = getPlayerLabel(state, state.matchWinner);
        document.getElementById("finalResult").textContent = generateResultText(state);
        document.getElementById("finalPreview").textContent = "Puedes copiar el resultado o compartir una imagen por WhatsApp usando el menú de compartir del celular.";
      } else {
        finalCard.classList.remove("visible");
      }

      const logHtml = state.log.map(item => `
        <div class="log-item ${item.type || "info"}">${escapeHtml(item.text)}</div>
      `).join("");

      document.getElementById("logList").innerHTML = logHtml;

      document.getElementById("pointA").disabled = state.matchWinner !== null;
      document.getElementById("pointB").disabled = state.matchWinner !== null;
      document.getElementById("undoBtn").disabled = history.length <= 1;
      document.getElementById("switchServer").disabled = state.matchWinner !== null;
      updateWakeUI();
    }

    function setupEvents() {
      document.addEventListener("keydown", handleModalKeyboard);
      document.getElementById("categorySelect").addEventListener("change", () => handleSetupChange("category"));
      document.getElementById("playerASelect").addEventListener("change", () => handleSetupChange("playerA"));
      document.getElementById("playerBSelect").addEventListener("change", () => handleSetupChange("playerB"));

      document.getElementById("pointA").addEventListener("click", () => {
        requestWakeLock();
        pushState(pointToPlayer(getState(), 0));
      });

      document.getElementById("pointB").addEventListener("click", () => {
        requestWakeLock();
        pushState(pointToPlayer(getState(), 1));
      });

      document.getElementById("undoBtn").addEventListener("click", () => {
        if (history.length > 1) {
          history = history.slice(0, -1);
          saveMatch();
          render();
          vibrate(20);
          showToast("Última acción deshecha");
        }
      });

      document.getElementById("switchServer").addEventListener("click", switchServerManual);

      document.getElementById("resetBtn").addEventListener("click", () => {
        const ok = confirm("¿Seguro que quieres reiniciar este partido? Se conservarán los mismos jugadores, pero se borrará el marcador actual.");
        if (!ok) return;

        resetMatchWithSetup({ toast: "Partido reiniciado" });
      });

      document.getElementById("newMatchBtn").addEventListener("click", startNewMatch);
      document.getElementById("configureNewMatchBtn").addEventListener("click", showSetupForNewMatch);

      document.getElementById("clearSavedBtn").addEventListener("click", () => {
        const ok = confirm("¿Seguro que quieres borrar el marcador guardado en este celular?");
        if (!ok) return;

        clearSavedMatch();
        showToast("Marcador guardado eliminado");
      });

      document.getElementById("correctionBtn").addEventListener("click", openCorrectionModal);
      document.getElementById("correctionBtnSide").addEventListener("click", openCorrectionModal);
      document.getElementById("correctionClose").addEventListener("click", closeCorrectionModal);
      document.getElementById("correctionCancel").addEventListener("click", closeCorrectionModal);
      document.getElementById("correctionApply").addEventListener("click", applyCorrection);

      document.getElementById("recoveryRestore").addEventListener("click", recoverSavedMatch);
      document.getElementById("recoveryDiscard").addEventListener("click", discardSavedMatch);

      document.getElementById("correctionModal").addEventListener("click", event => {
        if (event.target.id === "correctionModal") closeCorrectionModal();
      });

      document.getElementById("copyResultBtn").addEventListener("click", copyResult);
      document.getElementById("shareImageBtn").addEventListener("click", shareResultImage);
      document.getElementById("shareWhatsAppBtn").addEventListener("click", shareWhatsAppText);

      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) checkInactivityExpiration();
      });
      window.addEventListener("focus", checkInactivityExpiration);
      window.addEventListener("pageshow", checkInactivityExpiration);

      document.getElementById("historyToggle").addEventListener("click", () => {
        const card = document.getElementById("historyCard");
        const icon = document.getElementById("historyIcon");

        card.classList.toggle("open");
        document.getElementById("historyToggle").setAttribute(
          "aria-expanded",
          String(card.classList.contains("open"))
        );
        icon.textContent = card.classList.contains("open") ? "–" : "+";
      });
    }


    function relocateResultForMobilePortrait() {
      const resultCard = document.getElementById("setsResultCard");
      const statusCard = document.getElementById("statusCard");
      const side = document.querySelector(".side");

      if (!resultCard || !statusCard || !side) return;

      const isPortraitMobile = window.matchMedia("(max-width: 820px) and (orientation: portrait)").matches;

      if (matchActive && isPortraitMobile) {
        if (resultCard.previousElementSibling !== statusCard) {
          statusCard.insertAdjacentElement("afterend", resultCard);
        }
      } else if (resultCard.parentElement !== side || resultCard !== side.firstElementChild) {
        side.insertBefore(resultCard, side.firstElementChild);
      }
    }

    function setupMobilePortraitResultMode() {
      const update = () => {
        relocateResultForMobilePortrait();
        render();
      };

      window.addEventListener("resize", update, { passive: true });
      window.addEventListener("orientationchange", () => setTimeout(update, 160), { passive: true });

      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", update, { passive: true });
      }

      relocateResultForMobilePortrait();
    }

    function setupLandscapeMenuMode() {
      const update = () => {
        const isTouchLike =
          "ontouchstart" in window ||
          navigator.maxTouchPoints > 0 ||
          navigator.msMaxTouchPoints > 0;

        const isLandscape = window.innerWidth > window.innerHeight;
        const isCompactHeight = window.innerHeight <= 760;

        document.body.classList.toggle(
          "is-landscape-mobile",
          isTouchLike && isLandscape && isCompactHeight
        );
      };

      update();
      window.addEventListener("resize", update, { passive: true });
      window.addEventListener("orientationchange", () => setTimeout(update, 120), { passive: true });

      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", update, { passive: true });
      }
    }

    function boot() {
      populatePlayers("A");

      const savedMatch = loadSavedMatch();

      if (savedMatch && !savedMatch.expired) {
        history = savedMatch.history;
        populatePlayers(
          savedMatch.savedState.category,
          savedMatch.savedState.players[0],
          savedMatch.savedState.players[1]
        );
        setMatchActive(true);
        showToast("Marcador anterior restaurado");
      } else {
        if (savedMatch) {
          populatePlayers(
            savedMatch.savedState.category,
            savedMatch.savedState.players[0],
            savedMatch.savedState.players[1]
          );
          pendingRecovery = savedMatch;
        }

        history = [createMatchFromSetup()];
        setMatchActive(false);
      }

      setupEvents();
      setupWakeLock();
      setupLandscapeMenuMode();
      setupMobilePortraitResultMode();
      render();

      if (pendingRecovery) openRecoveryModal(pendingRecovery);
    }

    boot();
