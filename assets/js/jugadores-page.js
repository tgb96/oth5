(() => {
  "use strict";

  const config = window.OPEN_TENNIS_CONFIG;
  const dataClient = window.OPEN_TENNIS_DATA;
  const playerPreference = window.OPEN_TENNIS_PLAYER;
  const core = window.OPEN_TENNIS_INDEX_DATA;
  const insights = window.OPEN_TENNIS_PLAYER_INSIGHTS;
  const shareTools = window.OPEN_TENNIS_SHARE;
  if (!config || !dataClient || !playerPreference || !core || !insights || !shareTools) return;

  const elements = {
    search: document.getElementById("playerSearch"),
    list: document.getElementById("playersList"),
    show: document.getElementById("showPlayerProfile"),
    showSaved: document.getElementById("showSavedPlayer"),
    searchError: document.getElementById("playerSearchError"),
    empty: document.getElementById("profileEmpty"),
    profile: document.getElementById("playerProfile"),
    category: document.getElementById("profileCategory"),
    name: document.getElementById("profileName"),
    position: document.getElementById("profilePosition"),
    zone: document.getElementById("profileZone"),
    played: document.getElementById("statPlayed"),
    wins: document.getElementById("statWins"),
    losses: document.getElementById("statLosses"),
    rate: document.getElementById("statRate"),
    setsWon: document.getElementById("statSetsWon"),
    setsLost: document.getElementById("statSetsLost"),
    gamesWon: document.getElementById("statGamesWon"),
    gamesLost: document.getElementById("statGamesLost"),
    form: document.getElementById("recentForm"),
    progress: document.getElementById("rankingProgress"),
    upcoming: document.getElementById("upcomingMatches"),
    results: document.getElementById("profileResults"),
    rivalry: document.getElementById("headToHead"),
    addNextCalendar: document.getElementById("addNextCalendar"),
    shareProfile: document.getElementById("shareProfile"),
    createCard: document.getElementById("createMatchCard"),
    matchesLink: document.getElementById("profileMatchesLink"),
    report: document.getElementById("reportProblem"),
    compareOne: document.getElementById("comparePlayerOne"),
    compareTwo: document.getElementById("comparePlayerTwo"),
    compare: document.getElementById("comparePlayers"),
    compareError: document.getElementById("compareError"),
    compareResult: document.getElementById("compareResult"),
    compareLeft: document.getElementById("compareLeft"),
    compareRight: document.getElementById("compareRight"),
    compareSummary: document.getElementById("compareSummary"),
    notice: document.getElementById("playersNotice"),
    dataStatus: document.getElementById("playersDataStatus")
  };

  let model = { matches: [], registrations: [], rankings: [] };
  let currentProfile = null;
  let dataLoaded = false;
  let noticeTimer = 0;

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function allPlayers() {
    return playerPreference.entries();
  }

  function populatePlayers() {
    allPlayers().forEach(({ category, name }) => {
      const option = document.createElement("option");
      option.value = name;
      option.label = `${name} · Categoría ${category}`;
      elements.list.appendChild(option);
    });

    Object.entries(config.CLUB_PLAYERS || {}).forEach(([category, players]) => {
      [elements.compareOne, elements.compareTwo].forEach((select) => {
        const group = document.createElement("optgroup");
        group.label = `Categoría ${category}`;
        players.forEach((name) => {
          const option = document.createElement("option");
          option.value = name;
          option.textContent = name;
          group.appendChild(option);
        });
        select.appendChild(group);
      });
    });

    const saved = playerPreference.get();
    if (saved) {
      elements.showSaved.hidden = false;
      elements.showSaved.textContent = `Ver mi ficha: ${saved}`;
    }
  }

  function showNotice(message) {
    window.clearTimeout(noticeTimer);
    elements.notice.textContent = message;
    noticeTimer = window.setTimeout(() => {
      if (elements.notice.textContent === message) elements.notice.textContent = "";
    }, 5000);
  }

  function detailDate(date) {
    return core.formatDate(date, { weekday: "short", day: "numeric", month: "short" });
  }

  function matchMeta(match) {
    return [
      detailDate(match.date),
      shareTools.readableTime(match.turn),
      match.court ? (/cancha/i.test(match.court) ? match.court : `Cancha ${match.court}`) : "Cancha por confirmar"
    ].filter(Boolean).join(" · ");
  }

  function appendEmpty(list, message) {
    list.replaceChildren(createElement("li", "empty-profile-list", message));
  }

  function renderForm(profile) {
    elements.form.replaceChildren();
    if (!profile.form.length) {
      elements.form.appendChild(createElement("span", "", "Sin resultados"));
      return;
    }
    profile.form.forEach((result) => {
      const chip = createElement("span", `form-chip ${result.won ? "is-win" : "is-loss"}`, result.outcome);
      chip.title = `${result.won ? "Victoria" : "Derrota"} vs ${result.opponent}`;
      elements.form.appendChild(chip);
    });
  }

  function renderProgress(profile) {
    elements.progress.replaceChildren();
    const title = createElement("strong", "", profile.zone.label);
    const detail = createElement("span", "", profile.gap?.message || profile.zone.detail);
    elements.progress.append(title, detail);
  }

  function calendarButton(match, player) {
    const button = createElement("button", "calendar-match-button", "＋");
    button.type = "button";
    button.setAttribute("aria-label", `Agregar partido contra ${match.opponent} al calendario`);
    button.title = "Agregar al calendario";
    button.addEventListener("click", () => {
      shareTools.downloadCalendar(match, player);
      showNotice("Partido preparado para agregarlo al calendario.");
    });
    return button;
  }

  function renderUpcoming(profile) {
    elements.upcoming.replaceChildren();
    if (!profile.upcoming.length) {
      appendEmpty(elements.upcoming, "No hay próximos partidos programados.");
      elements.addNextCalendar.hidden = true;
      elements.createCard.hidden = true;
      return;
    }
    profile.upcoming.forEach((match) => {
      const item = document.createElement("li");
      const copy = document.createElement("div");
      copy.append(
        createElement("strong", "", `vs ${match.opponent || "Rival por confirmar"}`),
        createElement("small", "", matchMeta(match))
      );
      item.append(copy, calendarButton(match, profile.player));
      elements.upcoming.appendChild(item);
    });
    elements.addNextCalendar.hidden = false;
    elements.createCard.hidden = false;
  }

  function renderResults(profile) {
    elements.results.replaceChildren();
    if (!profile.form.length) {
      appendEmpty(elements.results, "Todavía no hay resultados publicados para este jugador.");
      return;
    }
    profile.form.forEach((result) => {
      const item = document.createElement("li");
      const copy = document.createElement("div");
      copy.append(
        createElement("strong", "", `vs ${result.opponent}`),
        createElement("small", "", `${detailDate(result.date)} · ${result.result}`)
      );
      item.append(copy, createElement("span", `list-outcome ${result.won ? "is-win" : "is-loss"}`, result.outcome));
      elements.results.appendChild(item);
    });
  }

  function renderRivalry(profile) {
    elements.rivalry.replaceChildren();
    if (!profile.headToHead.length) {
      appendEmpty(elements.rivalry, "El historial aparecerá cuando tenga partidos finalizados.");
      return;
    }
    profile.headToHead.forEach((rival) => {
      const item = document.createElement("li");
      const copy = document.createElement("div");
      copy.append(
        createElement("strong", "", rival.opponent),
        createElement("small", "", `${rival.played} ${rival.played === 1 ? "partido" : "partidos"}`)
      );
      item.append(copy, createElement("strong", "", `${rival.wins} G · ${rival.losses} P`));
      elements.rivalry.appendChild(item);
    });
  }

  function renderProfile(profile, shouldScroll = false) {
    currentProfile = profile;
    elements.empty.hidden = true;
    elements.profile.hidden = false;
    elements.category.textContent = profile.category;
    elements.name.textContent = profile.player;
    elements.zone.textContent = profile.zone.label;
    elements.zone.dataset.tone = profile.zone.tone;

    if (profile.ranking) {
      const details = [`#${profile.ranking.position}`];
      if (profile.ranking.points !== "") details.push(`${profile.ranking.points} puntos`);
      if (profile.ranking.played !== "") details.push(`${profile.ranking.played} PJ`);
      elements.position.textContent = details.join(" · ");
    } else {
      elements.position.textContent = "Posición por confirmar";
    }

    elements.played.textContent = profile.stats.played;
    elements.wins.textContent = profile.stats.wins;
    elements.losses.textContent = profile.stats.losses;
    elements.rate.textContent = `${profile.stats.winRate}%`;
    elements.setsWon.textContent = profile.stats.setsWon;
    elements.setsLost.textContent = profile.stats.setsLost;
    elements.gamesWon.textContent = profile.stats.gamesWon;
    elements.gamesLost.textContent = profile.stats.gamesLost;
    elements.matchesLink.href = `partidos.html?jugador=${encodeURIComponent(profile.player)}`;

    renderForm(profile);
    renderProgress(profile);
    renderUpcoming(profile);
    renderResults(profile);
    renderRivalry(profile);

    if (!elements.compareOne.value) elements.compareOne.value = profile.player;
    const url = new URL(window.location.href);
    url.searchParams.set("jugador", profile.player);
    history.replaceState({}, "", url);
    if (shouldScroll) elements.profile.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function requestedPlayer(value) {
    const exact = playerPreference.canonicalName(value);
    if (exact) return exact;
    const wanted = playerPreference.normalize(value);
    if (!wanted) return "";
    const matches = allPlayers().filter(({ name }) => playerPreference.normalize(name).includes(wanted));
    return matches.length === 1 ? matches[0].name : "";
  }

  function showProfile(value, shouldScroll = false) {
    const player = requestedPlayer(value);
    elements.searchError.hidden = Boolean(player);
    if (!player) {
      elements.search.focus();
      return;
    }
    elements.search.value = player;
    if (!dataLoaded) {
      showNotice("Estamos terminando de cargar los datos del torneo.");
      return;
    }
    renderProfile(insights.getPlayerProfile(model, player), shouldScroll);
  }

  function profileShareText(profile) {
    const ranking = profile.ranking
      ? `#${profile.ranking.position} en ${profile.category}, ${profile.ranking.points || 0} puntos.`
      : `${profile.category}.`;
    return [
      `🎾 Ficha Open Tennis de ${profile.player}`,
      ranking,
      `${profile.stats.wins} victorias · ${profile.stats.losses} derrotas · ${profile.stats.winRate}% de rendimiento.`,
      profile.gap?.message || profile.zone.detail,
      `https://opentennis.cl/jugadores.html?jugador=${encodeURIComponent(profile.player)}`
    ].join("\n");
  }

  function renderCompareCard(container, profile) {
    container.replaceChildren();
    container.append(
      createElement("h3", "", profile.player),
      createElement("p", "", `${profile.category} · ${profile.zone.label}`)
    );
    const list = document.createElement("dl");
    [
      ["Posición", profile.ranking ? `#${profile.ranking.position}` : "—"],
      ["Puntos", profile.ranking?.points || "0"],
      ["Partidos", profile.stats.played],
      ["Victorias", profile.stats.wins],
      ["Rendimiento", `${profile.stats.winRate}%`],
      ["Sets", `${profile.stats.setsWon}-${profile.stats.setsLost}`]
    ].forEach(([label, value]) => {
      const row = document.createElement("div");
      row.append(createElement("dt", "", label), createElement("dd", "", value));
      list.appendChild(row);
    });
    container.appendChild(list);
  }

  function comparePlayers() {
    const leftName = requestedPlayer(elements.compareOne.value);
    const rightName = requestedPlayer(elements.compareTwo.value);
    const valid = Boolean(leftName && rightName && !insights.samePlayer(leftName, rightName));
    elements.compareError.hidden = valid;
    if (!valid || !dataLoaded) return;
    const comparison = insights.compareProfiles(
      insights.getPlayerProfile(model, leftName),
      insights.getPlayerProfile(model, rightName)
    );
    renderCompareCard(elements.compareLeft, comparison.left);
    renderCompareCard(elements.compareRight, comparison.right);
    elements.compareSummary.replaceChildren(
      createElement("div", "", "")
    );
    const summary = elements.compareSummary.firstElementChild;
    summary.append(
      createElement("strong", "", `${comparison.leftScore} · ${comparison.rightScore}`),
      createElement("span", "", comparison.message)
    );
    elements.compareResult.hidden = false;
    elements.compareResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function loadData() {
    try {
      const [fixture, registration, rankings] = await Promise.all([
        dataClient.loadText("fixture", { url: config.FIXTURE_URL, fallbackUrl: config.LOCAL_DATA.FIXTURE }),
        dataClient.loadText("registro", { url: config.REGISTRO_URL, fallbackUrl: config.LOCAL_DATA.REGISTRO }),
        dataClient.loadText("rankings", { url: config.RANKINGS_URL, fallbackUrl: config.LOCAL_DATA.RANKINGS })
      ]);
      const fixtures = core.parseFixture(fixture.text);
      const registrations = core.parseRegistration(registration.text);
      model = {
        matches: core.mergeMatchStatus(fixtures, registrations),
        registrations,
        rankings: core.parseRankings(rankings.text)
      };
      dataLoaded = true;
      dataClient.updateStatus(elements.dataStatus, [fixture, registration, rankings], loadData);
      const queryPlayer = requestedPlayer(new URLSearchParams(window.location.search).get("jugador"));
      const initial = queryPlayer || playerPreference.get();
      if (initial) showProfile(initial);
    } catch (error) {
      dataLoaded = true;
      dataClient.showError(elements.dataStatus, "No pudimos cargar las fichas. Intenta nuevamente.", loadData);
      console.error(error);
    }
  }

  elements.show.addEventListener("click", () => showProfile(elements.search.value, true));
  elements.search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") showProfile(elements.search.value, true);
  });
  elements.showSaved.addEventListener("click", () => showProfile(playerPreference.get(), true));
  elements.compare.addEventListener("click", comparePlayers);
  elements.addNextCalendar.addEventListener("click", () => {
    if (!currentProfile?.upcoming[0]) return;
    shareTools.downloadCalendar(currentProfile.upcoming[0], currentProfile.player);
    showNotice("Partido preparado para agregarlo al calendario.");
  });
  elements.shareProfile.addEventListener("click", async () => {
    if (!currentProfile) return;
    await shareTools.shareText(`Ficha de ${currentProfile.player}`, profileShareText(currentProfile));
  });
  elements.createCard.addEventListener("click", async () => {
    if (!currentProfile?.upcoming[0]) return;
    elements.createCard.disabled = true;
    elements.createCard.textContent = "Creando tarjeta…";
    try {
      const result = await shareTools.shareMatchCard(currentProfile.upcoming[0], currentProfile.player);
      if (result === "downloaded") showNotice("La tarjeta se descargó como imagen.");
    } catch (error) {
      showNotice("No pudimos crear la tarjeta en este navegador.");
      console.error(error);
    } finally {
      elements.createCard.disabled = false;
      elements.createCard.textContent = "Crear tarjeta del partido";
    }
  });
  elements.report.addEventListener("click", async () => {
    const player = currentProfile?.player || "sin jugador seleccionado";
    const text = `Hola, quiero informar un problema en Open Tennis. Página: Ficha de jugadores. Jugador consultado: ${player}. Detalle: `;
    await shareTools.shareText("Informar problema Open Tennis", text);
  });

  populatePlayers();
  loadData();
})();
