(() => {
  "use strict";

  const config = window.OPEN_TENNIS_CONFIG;
  const dataClient = window.OPEN_TENNIS_DATA;
  const playerPreference = window.OPEN_TENNIS_PLAYER;
  const experience = window.OPEN_TENNIS_INDEX_DATA;
  const shareTools = window.OPEN_TENNIS_SHARE;

  if (!config || !dataClient || !playerPreference || !experience || !shareTools) return;

  const elements = {
    picker: document.getElementById("playerPicker"),
    select: document.getElementById("preferredPlayerSelect"),
    save: document.getElementById("savePreferredPlayer"),
    dashboard: document.getElementById("playerDashboard"),
    welcome: document.getElementById("playerWelcomeText"),
    change: document.getElementById("changePreferredPlayer"),
    matchStatus: document.getElementById("nextMatchStatus"),
    opponent: document.getElementById("nextMatchOpponent"),
    matchMeta: document.getElementById("nextMatchMeta"),
    myMatches: document.getElementById("myMatchesLink"),
    share: document.getElementById("shareMatchButton"),
    calendar: document.getElementById("calendarMatchButton"),
    matchCard: document.getElementById("matchCardButton"),
    rankingNumber: document.getElementById("rankingNumber"),
    rankingCategory: document.getElementById("rankingCategory"),
    rankingDetail: document.getElementById("rankingDetail"),
    myRanking: document.getElementById("myRankingLink"),
    myProfile: document.getElementById("myProfileLink"),
    tournamentDay: document.getElementById("tournamentDayBanner"),
    tournamentDayTitle: document.getElementById("tournamentDayTitle"),
    tournamentDaySummary: document.getElementById("tournamentDaySummary"),
    jornadaTitle: document.getElementById("jornadaTitle"),
    jornadaDate: document.getElementById("jornadaDate"),
    jornadaSummary: document.getElementById("jornadaSummary"),
    jornadaPlayed: document.getElementById("jornadaPlayed"),
    jornadaPending: document.getElementById("jornadaPending"),
    recentResults: document.getElementById("recentResultsList"),
    dataStatus: document.getElementById("indexDataStatus")
  };

  let model = { matches: [], registrations: [], rankings: [] };
  let selectedPlayer = playerPreference.get();
  let nextMatch = null;
  let dataLoaded = false;

  function populatePlayerSelect() {
    const grouped = config.CLUB_PLAYERS || {};
    Object.entries(grouped).forEach(([category, players]) => {
      const group = document.createElement("optgroup");
      group.label = `Categoría ${category}`;
      (players || []).forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        group.appendChild(option);
      });
      elements.select?.appendChild(group);
    });
    if (selectedPlayer && elements.select) elements.select.value = selectedPlayer;
  }

  function appendMeta(text) {
    if (!text || !elements.matchMeta) return;
    const item = document.createElement("li");
    item.textContent = text;
    elements.matchMeta.appendChild(item);
  }

  function turnTime(turn) {
    const match = String(turn || "").match(/\(([^)]+)\)/);
    return match ? match[1].replace(/\s*-\s*/g, "–") : String(turn || "");
  }

  function renderJornada() {
    const jornada = experience.getUpcomingWeek(model.matches);
    if (!jornada) {
      elements.jornadaTitle.textContent = "Próxima jornada";
      elements.jornadaDate.textContent = "Programación por confirmar";
      elements.jornadaSummary.textContent = "Revisa Partidos para ver las novedades del torneo.";
      elements.jornadaPlayed.textContent = "—";
      elements.jornadaPending.textContent = "—";
      return;
    }

    const weekText = String(jornada.week || "").trim();
    elements.jornadaTitle.textContent = weekText
      ? (/semana|jornada/i.test(weekText) ? weekText : `Semana ${weekText}`)
      : "Próxima jornada";
    elements.jornadaDate.textContent = experience.formatDate(jornada.date);
    elements.jornadaSummary.textContent = `${jornada.matches.length} ${jornada.matches.length === 1 ? "partido programado" : "partidos programados"}`;
    elements.jornadaPlayed.textContent = String(jornada.played);
    elements.jornadaPending.textContent = String(jornada.pending);
  }

  function renderTournamentDay() {
    const tournamentDay = experience.getTournamentDay(model.matches);
    document.body.classList.toggle("is-tournament-day", Boolean(tournamentDay));
    elements.tournamentDay.hidden = !tournamentDay;
    if (!tournamentDay) return;
    const week = String(tournamentDay.week || "").trim();
    elements.tournamentDayTitle.textContent = week
      ? `${/semana|jornada/i.test(week) ? week : `Semana ${week}`} · Jornada en curso`
      : "Jornada en curso";
    elements.tournamentDaySummary.textContent = `${tournamentDay.matches.length} partidos en ${tournamentDay.courts} ${tournamentDay.courts === 1 ? "cancha" : "canchas"} · ${tournamentDay.pending} por jugar.`;
  }

  function renderMatch(player) {
    nextMatch = experience.getNextMatch(model.matches, player);
    elements.matchMeta.replaceChildren();
    elements.myMatches.href = `partidos.html?jugador=${encodeURIComponent(player)}`;
    elements.myProfile.href = `jugadores.html?jugador=${encodeURIComponent(player)}`;

    if (!dataLoaded) {
      elements.matchStatus.textContent = "Cargando programación…";
      elements.opponent.textContent = "Buscando tu próximo partido";
      appendMeta("Consultando los datos del torneo");
      elements.share.hidden = true;
      elements.calendar.hidden = true;
      elements.matchCard.hidden = true;
      return;
    }

    if (!nextMatch) {
      elements.matchStatus.textContent = "Sin partido pendiente";
      elements.opponent.textContent = "No tienes un próximo partido programado";
      appendMeta("Revisa nuevamente cuando se publique otra jornada");
      elements.share.hidden = true;
      elements.calendar.hidden = true;
      elements.matchCard.hidden = true;
      return;
    }

    elements.matchStatus.textContent = nextMatch.status === "pendiente" ? "Partido pendiente" : "Próximo partido";
    elements.opponent.textContent = nextMatch.opponent || "Rival por confirmar";
    appendMeta(experience.formatDate(nextMatch.date));
    appendMeta(turnTime(nextMatch.turn));
    appendMeta(nextMatch.court
      ? (/cancha/i.test(nextMatch.court) ? nextMatch.court : `Cancha ${nextMatch.court}`)
      : "");
    appendMeta(nextMatch.category
      ? (/categor/i.test(nextMatch.category) ? nextMatch.category : `Categoría ${nextMatch.category}`)
      : "");
    elements.share.hidden = false;
    elements.calendar.hidden = false;
    elements.matchCard.hidden = false;
  }

  function renderRanking(player) {
    elements.myRanking.href = `tablas.html?jugador=${encodeURIComponent(player)}`;
    if (!dataLoaded) {
      elements.rankingNumber.textContent = "—";
      elements.rankingCategory.textContent = "Cargando tabla…";
      elements.rankingDetail.textContent = "Buscando tu posición actual.";
      return;
    }
    const ranking = experience.getPlayerRanking(model.rankings, player);
    if (!ranking) {
      elements.rankingNumber.textContent = "—";
      elements.rankingCategory.textContent = "Posición no disponible";
      elements.rankingDetail.textContent = "Puedes revisar la tabla completa.";
      return;
    }
    elements.rankingNumber.textContent = `#${ranking.position}`;
    elements.rankingCategory.textContent = ranking.category || "Tu categoría";
    const details = [];
    if (ranking.points) details.push(`${ranking.points} puntos`);
    if (ranking.played) details.push(`${ranking.played} PJ`);
    elements.rankingDetail.textContent = details.join(" · ") || "Posición actual";
  }

  function renderPlayer() {
    document.body.classList.toggle("has-preferred-player", Boolean(selectedPlayer));
    if (!selectedPlayer) {
      elements.picker.hidden = false;
      elements.dashboard.hidden = true;
      return;
    }
    elements.picker.hidden = true;
    elements.dashboard.hidden = false;
    elements.welcome.textContent = `Hola, ${selectedPlayer}`;
    renderMatch(selectedPlayer);
    renderRanking(selectedPlayer);
  }

  function renderRecentResults() {
    const results = experience.getRecentResults(model.registrations, 3);
    elements.recentResults.replaceChildren();
    if (!results.length) {
      const item = document.createElement("li");
      item.className = "empty-detail";
      item.textContent = "Aún no hay resultados recientes para mostrar.";
      elements.recentResults.appendChild(item);
      return;
    }

    results.forEach((result) => {
      const item = document.createElement("li");
      item.className = "recent-result";
      const players = document.createElement("div");
      players.className = "recent-result-players";
      players.textContent = `${result.player1} vs ${result.player2}`;
      const date = document.createElement("span");
      date.className = "recent-result-date";
      date.textContent = result.date
        ? experience.formatDate(result.date, { day: "numeric", month: "short" })
        : "Fecha no informada";
      players.appendChild(date);
      const score = document.createElement("div");
      score.className = "recent-result-score";
      score.textContent = result.result || (result.winner ? `Ganó ${result.winner}` : "Finalizado");
      item.append(players, score);
      elements.recentResults.appendChild(item);
    });
  }

  async function shareNextMatch() {
    if (!nextMatch || !selectedPlayer) return;
    await shareTools.shareText("Próximo partido Open Tennis", shareTools.buildMatchText(nextMatch, selectedPlayer));
  }

  function setStatusFromSources(sources) {
    if (!elements.dataStatus) return;
    dataClient.updateStatus(elements.dataStatus, Object.values(sources), loadDashboard);
  }

  async function loadDashboard() {
    try {
      const [fixture, registration, rankings] = await Promise.all([
        dataClient.loadText("fixture", {
          url: config.FIXTURE_URL,
          fallbackUrl: config.LOCAL_DATA.FIXTURE
        }),
        dataClient.loadText("registro", {
          url: config.REGISTRO_URL,
          fallbackUrl: config.LOCAL_DATA.REGISTRO
        }),
        dataClient.loadText("rankings", {
          url: config.RANKINGS_URL,
          fallbackUrl: config.LOCAL_DATA.RANKINGS
        })
      ]);
      const fixtures = experience.parseFixture(fixture.text);
      const registrations = experience.parseRegistration(registration.text);
      model = {
        matches: experience.mergeMatchStatus(fixtures, registrations),
        registrations,
        rankings: experience.parseRankings(rankings.text)
      };
      dataLoaded = true;
      renderJornada();
      renderTournamentDay();
      renderRecentResults();
      renderPlayer();
      setStatusFromSources({ fixture, registration, rankings });
    } catch (error) {
      dataLoaded = true;
      renderJornada();
      renderTournamentDay();
      renderRecentResults();
      renderPlayer();
      dataClient.showError(elements.dataStatus, "No pudimos cargar el resumen. Puedes seguir entrando a Partidos y Tablas.");
      console.error(error);
    }
  }

  elements.save?.addEventListener("click", () => {
    const saved = playerPreference.set(elements.select.value);
    if (!saved) {
      elements.select.focus();
      return;
    }
    selectedPlayer = saved;
    renderPlayer();
  });

  elements.change?.addEventListener("click", () => {
    elements.picker.hidden = false;
    elements.dashboard.hidden = true;
    elements.select.value = selectedPlayer;
    elements.select.focus();
  });

  elements.share?.addEventListener("click", shareNextMatch);
  elements.calendar?.addEventListener("click", () => {
    if (nextMatch && selectedPlayer) shareTools.downloadCalendar(nextMatch, selectedPlayer);
  });
  elements.matchCard?.addEventListener("click", async () => {
    if (!nextMatch || !selectedPlayer) return;
    elements.matchCard.disabled = true;
    elements.matchCard.textContent = "Creando…";
    try {
      await shareTools.shareMatchCard(nextMatch, selectedPlayer);
    } catch (error) {
      console.error(error);
    } finally {
      elements.matchCard.disabled = false;
      elements.matchCard.textContent = "Crear tarjeta";
    }
  });

  populatePlayerSelect();
  renderPlayer();
  loadDashboard();
})();
