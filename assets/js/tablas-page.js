(() => {
  "use strict";

  const APP_CONFIG = window.OPEN_TENNIS_CONFIG;
  const DATA_CLIENT = window.OPEN_TENNIS_DATA;
  const PLAYER_PREFERENCE = window.OPEN_TENNIS_PLAYER;
  const RANKINGS_URL = APP_CONFIG.RANKINGS_URL;
  const REGISTRO_URL = APP_CONFIG.REGISTRO_URL;
  const FIXTURE_URL = APP_CONFIG.FIXTURE_URL;

  const contenedor = document.getElementById("rankingsContenedor");
  const dataStatus = document.getElementById("dataStatus");
  const requestedPlayer = new URLSearchParams(window.location.search).get("jugador") || "";
  const highlightedPlayer = PLAYER_PREFERENCE?.canonicalName(requestedPlayer) || requestedPlayer || PLAYER_PREFERENCE?.get() || "";

  const normalizarCache = new Map();
  const nombreCortoCache = new Map();
  const slugCache = new Map();

  let registrosPorJugador = new Map();
  let fixturePorJugador = new Map();
  let partidosRegistradosClave = new Set();
  let statsCache = new Map();
  let eventosInstalados = false;

  function escaparHTML(valor) {
    return String(valor ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizar(texto) {
    const key = String(texto || "");
    const cached = normalizarCache.get(key);
    if (cached !== undefined) return cached;

    const value = key
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    normalizarCache.set(key, value);
    return value;
  }

  function slug(texto) {
    const key = String(texto || "");
    const cached = slugCache.get(key);
    if (cached !== undefined) return cached;

    const value = normalizar(key).replace(/\s+/g, "-");
    slugCache.set(key, value);
    return value;
  }

  function parseCSVLine(line) {
    const result = [];
    let current = "";
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === "," && !insideQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  function parseCSV(csv) {
    const texto = String(csv || "").trim();
    return texto ? texto.split(/\r?\n/).map(parseCSVLine) : [];
  }

  function claseCategoria(nombre) {
    const n = normalizar(nombre);

    if (n.includes("categoria a")) return "categoria-a";
    if (n.includes("categoria b")) return "categoria-b";
    if (n.includes("categoria c")) return "categoria-c";
    if (n.includes("categoria d")) return "categoria-d";

    return "categoria-a";
  }

  function letraCategoria(nombre) {
    const n = normalizar(nombre);

    if (n.includes("categoria a")) return "A";
    if (n.includes("categoria b")) return "B";
    if (n.includes("categoria c")) return "C";
    if (n.includes("categoria d")) return "D";

    return "";
  }

  function medalla(pos) {
    const p = Number(pos);

    if (p === 1) return "🏆";
    if (p === 2) return "🥈";
    if (p === 3) return "🥉";

    return "";
  }

  function zonaJugador(categoria, posicion, total) {
    const cat = letraCategoria(categoria);
    const p = Number(posicion);

    if (cat === "A") {
      if (p === 1) return { texto: "Líder actual", clase: "zona-campeon", icono: "👑" };
      if (p === total - 2) return { texto: "Repechaje descenso", clase: "zona-repechaje", icono: "🔁" };
      if (p === total - 1 || p === total) return { texto: "Descenso directo", clase: "zona-descenso", icono: "⬇️" };
      return null;
    }

    if (cat === "B") {
      if (p === 1 || p === 2) return { texto: "Ascenso directo", clase: "zona-ascenso", icono: "⬆️" };
      if (p === 3) return { texto: "Repechaje a A", clase: "zona-repechaje", icono: "🔁" };
      if (p === total - 2) return { texto: "Repechaje descenso", clase: "zona-repechaje", icono: "🔁" };
      if (p === total - 1 || p === total) return { texto: "Descenso directo", clase: "zona-descenso", icono: "⬇️" };
      return null;
    }

    if (cat === "C") {
      if (p === 1 || p === 2) return { texto: "Ascenso directo", clase: "zona-ascenso", icono: "⬆️" };
      if (p === 3) return { texto: "Repechaje a B", clase: "zona-repechaje", icono: "🔁" };
      return null;
    }

    if (cat === "D") {
      if (p === 1) return { texto: "Líder actual", clase: "zona-campeon", icono: "👑" };
      return null;
    }

    return null;
  }

  function limpiarCategoria(texto) {
    const t = String(texto || "").trim();
    return normalizar(t).startsWith("categoria") ? t : "Categoría";
  }

  function detectarRankings(filas) {
    const categorias = [];
    let categoriaActual = null;
    let esperandoEncabezado = false;

    for (const cols of filas) {
      const textoFila = cols.join(" ").trim();
      if (!textoFila) continue;

      const textoNormal = normalizar(textoFila);

      if (textoNormal.includes("categoria")) {
        categoriaActual = {
          nombre: limpiarCategoria(textoFila),
          jugadores: []
        };
        categorias.push(categoriaActual);
        esperandoEncabezado = true;
        continue;
      }

      if (!categoriaActual) continue;

      const primera = String(cols[0] || "").trim();
      const segunda = String(cols[1] || "").trim();
      const tercera = String(cols[2] || "").trim();
      const cuarta = String(cols[3] || "").trim();

      if (esperandoEncabezado) {
        if (textoNormal.includes("jugador") || textoNormal.includes("puntos") || textoNormal.includes("pts")) {
          esperandoEncabezado = false;
          continue;
        }
      }

      if (/^\d+$/.test(primera) && segunda && normalizar(segunda) !== "jugador" && (tercera !== "" || cuarta !== "")) {
        categoriaActual.jugadores.push({
          posicion: primera,
          jugador: segunda,
          puntos: tercera || "0",
          jugados: cuarta || "0",
          _jugadorKey: normalizar(segunda)
        });
      }
    }

    return categorias.filter(cat => cat.jugadores.length > 0);
  }

  function numero(v) {
    const n = Number(String(v || "").replace(",", "."));
    return Number.isNaN(n) ? 0 : n;
  }

  function valorLimpio(v) {
    const t = String(v || "").trim();
    return t === "-" || t === "" ? "" : t;
  }

  function leerRegistro(csv) {
    return parseCSV(csv)
      .slice(1)
      .map(cols => {
        const jugador1 = String(cols[1] || "").trim();
        const jugador2 = String(cols[2] || "").trim();
        const ganador = String(cols[13] || "").trim();
        const pendiente = String(cols[3] || "").trim();

        return {
          fecha: String(cols[0] || "").trim(),
          jugador1,
          jugador2,
          pendiente,
          observaciones: String(cols[4] || "").trim(),
          s1j1: valorLimpio(cols[5]),
          s1j2: valorLimpio(cols[6]),
          s2j1: valorLimpio(cols[7]),
          s2j2: valorLimpio(cols[8]),
          stbj1: valorLimpio(cols[9]),
          stbj2: valorLimpio(cols[10]),
          setsJ1: numero(cols[11]),
          setsJ2: numero(cols[12]),
          ganador,
          perdedor: String(cols[14] || "").trim(),
          tipo: String(cols[15] || "").trim(),
          resultadoWeb: String(cols[16] || "").trim(),
          ptsJ1: numero(cols[17]),
          ptsJ2: numero(cols[18]),
          _j1: normalizar(jugador1),
          _j2: normalizar(jugador2),
          _ganador: normalizar(ganador),
          _pendiente: normalizar(pendiente)
        };
      })
      .filter(r => r.jugador1 && r.jugador2);
  }

  function leerFixture(csv) {
    return parseCSV(csv)
      .slice(1)
      .map(cols => {
        const jugador1 = String(cols[4] || "").trim();
        const jugador2 = String(cols[5] || "").trim();

        return {
          semana: String(cols[0] || "").trim(),
          cancha: String(cols[1] || "").trim(),
          turno: String(cols[2] || "").trim(),
          categoria: String(cols[3] || "").trim(),
          jugador1,
          jugador2,
          _j1: normalizar(jugador1),
          _j2: normalizar(jugador2)
        };
      })
      .filter(f =>
        f.semana &&
        f.turno &&
        f.jugador1 &&
        f.jugador2 &&
        f.jugador1 !== "-" &&
        f.jugador2 !== "-"
      );
  }

  function agregarAMapaLista(mapa, clave, valor) {
    if (!clave) return;
    let lista = mapa.get(clave);
    if (!lista) {
      lista = [];
      mapa.set(clave, lista);
    }
    lista.push(valor);
  }

  function prepararIndices(registros, fixture) {
    registrosPorJugador = new Map();
    fixturePorJugador = new Map();
    partidosRegistradosClave = new Set();
    statsCache = new Map();

    for (const r of registros) {
      agregarAMapaLista(registrosPorJugador, r._j1, r);
      agregarAMapaLista(registrosPorJugador, r._j2, r);
      partidosRegistradosClave.add(`${r._j1}|${r._j2}`);
      partidosRegistradosClave.add(`${r._j2}|${r._j1}`);
    }

    for (const f of fixture) {
      agregarAMapaLista(fixturePorJugador, f._j1, f);
      agregarAMapaLista(fixturePorJugador, f._j2, f);
    }
  }

  function jugadorEnRegistro(jugador, r) {
    const j = normalizar(jugador);
    return r._j1 === j || r._j2 === j;
  }

  function jugadorEnFixture(jugador, f) {
    const j = normalizar(jugador);
    return f._j1 === j || f._j2 === j;
  }

  function rivalDe(jugador, partido) {
    const j = normalizar(jugador);
    return partido._j1 === j ? partido.jugador2 : partido.jugador1;
  }

  function nombreCorto(nombre) {
    const key = String(nombre || "");
    const cached = nombreCortoCache.get(key);
    if (cached !== undefined) return cached;

    const limpio = key.replace(/\s+/g, " ").trim();
    const partes = limpio.split(" ").filter(Boolean);
    let value = "";

    if (partes.length === 1) {
      value = partes[0];
    } else if (partes.length > 1) {
      const dosPrimeros = normalizar(`${partes[0]} ${partes[1]}`);
      value = dosPrimeros === "maria jose" && partes.length >= 3
        ? `María José ${partes[2].charAt(0).toUpperCase()}.`
        : `${partes[0]} ${partes[1].charAt(0).toUpperCase()}.`;
    }

    nombreCortoCache.set(key, value);
    return value;
  }

  function dividirProximoPartido(texto) {
    if (!texto || texto === "Sin próximos partidos programados") {
      return {
        linea1: texto || "Sin próximos partidos programados",
        linea2: ""
      };
    }

    const partes = texto.split("·").map(p => p.trim());

    return {
      linea1: partes[0] || texto,
      linea2: partes.slice(1).join(" · ")
    };
  }

  function marcadorSet(a, b) {
    const va = valorLimpio(a);
    const vb = valorLimpio(b);

    if (va === "" || vb === "") return "";

    return `${va}-${vb}`;
  }

  function marcadorDesdeJugador(jugador, partido) {
    const esJ1 = partido._j1 === normalizar(jugador);

    const set1 = esJ1
      ? marcadorSet(partido.s1j1, partido.s1j2)
      : marcadorSet(partido.s1j2, partido.s1j1);

    const set2 = esJ1
      ? marcadorSet(partido.s2j1, partido.s2j2)
      : marcadorSet(partido.s2j2, partido.s2j1);

    const stb = esJ1
      ? marcadorSet(partido.stbj1, partido.stbj2)
      : marcadorSet(partido.stbj2, partido.stbj1);

    const partes = [set1, set2].filter(Boolean);

    if (stb) partes.push(stb);

    if (partes.length) return partes.join(" ");

    return partido.resultadoWeb || "Resultado registrado";
  }

  function historialPartidoTexto(jugador, partido) {
    const jugadorKey = normalizar(jugador);
    const gano = partido._ganador === jugadorKey;
    const estado = gano ? "Ganó" : "Perdió";
    const marcador = marcadorDesdeJugador(jugador, partido);

    return `${estado} vs ${nombreCorto(rivalDe(jugador, partido))} ${marcador}`;
  }

  function historialHTML(historial) {
    if (!historial || historial.length === 0) {
      return `<span class="historial-vacio">Sin partidos jugados</span>`;
    }

    return `
      <div class="historial-lista">
        ${historial.map(item => `<span class="historial-item">${escaparHTML(item)}</span>`).join("")}
      </div>
    `;
  }

  function calcularStatsJugador(jugador, registros, fixture) {
    const jugadorKey = normalizar(jugador);
    const cached = statsCache.get(jugadorKey);
    if (cached) return cached;

    const registrosJugador = registrosPorJugador.get(jugadorKey) || registros.filter(r => jugadorEnRegistro(jugador, r));
    const fixtureJugador = fixturePorJugador.get(jugadorKey) || fixture.filter(f => jugadorEnFixture(jugador, f));
    const jugados = [];
    let pendientes = 0;
    let setsGanados = 0;
    let setsPerdidos = 0;
    let gamesGanados = 0;
    let gamesPerdidos = 0;
    let puntos = 0;

    for (const r of registrosJugador) {
      if (r._pendiente === "si") pendientes++;
      if (!r.resultadoWeb || !r.ganador) continue;

      jugados.push(r);

      const esJ1 = r._j1 === jugadorKey;

      if (esJ1) {
        setsGanados += r.setsJ1;
        setsPerdidos += r.setsJ2;
        puntos += r.ptsJ1;
        gamesGanados += numero(r.s1j1) + numero(r.s2j1);
        gamesPerdidos += numero(r.s1j2) + numero(r.s2j2);
      } else {
        setsGanados += r.setsJ2;
        setsPerdidos += r.setsJ1;
        puntos += r.ptsJ2;
        gamesGanados += numero(r.s1j2) + numero(r.s2j2);
        gamesPerdidos += numero(r.s1j1) + numero(r.s2j1);
      }
    }

    const maxPuntos = jugados.length * 3;
    const rendimiento = maxPuntos > 0 ? Math.round((puntos / maxPuntos) * 100) : 0;
    const ultimos = jugados.slice(-3);
    const racha = ultimos.length
      ? ultimos.map(r => r._ganador === jugadorKey ? "G" : "P").join("-")
      : "Sin partidos jugados";

    const ultimo = jugados.length ? jugados[jugados.length - 1] : null;
    const ultimoTexto = ultimo
      ? `${ultimo._ganador === jugadorKey ? "Ganó" : "Perdió"} vs ${rivalDe(jugador, ultimo)} · ${ultimo.resultadoWeb}`
      : "Sin resultados registrados";

    const proximo = fixtureJugador.find(f => !partidosRegistradosClave.has(`${f._j1}|${f._j2}`));
    const proximoTexto = proximo
      ? `vs ${nombreCorto(rivalDe(jugador, proximo))} · Semana ${proximo.semana} · Cancha ${proximo.cancha} · Turno ${proximo.turno}`
      : "Sin próximos partidos programados";

    const historial = jugados.map(r => historialPartidoTexto(jugador, r));

    const stats = {
      sets: `${setsGanados}-${setsPerdidos}`,
      difSets: setsGanados - setsPerdidos,
      games: `${gamesGanados}-${gamesPerdidos}`,
      difGames: gamesGanados - gamesPerdidos,
      rendimiento: rendimiento + "%",
      racha,
      ultimo: ultimoTexto,
      pendientes,
      proximo: proximoTexto,
      historial,
      jugados: jugados.length
    };

    statsCache.set(jugadorKey, stats);
    return stats;
  }

  function zonaHTML(zona) {
    if (!zona) return "";
    return `<span class="etiqueta-zona ${zona.clase}">${zona.icono ? zona.icono + " " : ""}${escaparHTML(zona.texto)}</span>`;
  }

  function detalleHTML(jugador, stats, zona) {
    return `
      <div class="detalle-box">
        <div class="detalle-grid">
          <div class="detalle-item">
            <div class="detalle-label">Partidos jugados</div>
            <div class="detalle-valor">${escaparHTML(stats.jugados)}</div>
          </div>

          <div class="detalle-item">
            <div class="detalle-label">Rendimiento</div>
            <div class="detalle-valor">${escaparHTML(stats.rendimiento)}</div>
          </div>

          <div class="detalle-item">
            <div class="detalle-label">Sets</div>
            <div class="detalle-valor">${escaparHTML(stats.sets)} (${stats.difSets >= 0 ? "+" : ""}${escaparHTML(stats.difSets)})</div>
          </div>

          <div class="detalle-item">
            <div class="detalle-label">Games</div>
            <div class="detalle-valor">${escaparHTML(stats.games)} (${stats.difGames >= 0 ? "+" : ""}${escaparHTML(stats.difGames)})</div>
          </div>

          <div class="detalle-item">
            <div class="detalle-label">Pendientes</div>
            <div class="detalle-valor">${escaparHTML(stats.pendientes)}</div>
          </div>

          <div class="detalle-item">
            <div class="detalle-label">Racha</div>
            <div class="detalle-valor">${escaparHTML(stats.racha)}</div>
          </div>
        </div>

        <div class="detalle-extra">
          <strong>📋 Historial de partidos:</strong>
          ${historialHTML(stats.historial)}
        </div>

        <div class="detalle-extra">
          <strong>📅 Próximo partido:</strong> ${escaparHTML(stats.proximo)}
        </div>
      </div>
    `;
  }

  function detalleMobileHTML(stats, zona) {
    const proximo = dividirProximoPartido(stats.proximo);

    return `
      <div class="mobile-detalle-grid">
        <div class="mobile-detalle-item">
          <div class="mobile-detalle-label">Partidos jugados</div>
          <div class="mobile-detalle-valor">${escaparHTML(stats.jugados)}</div>
        </div>

        <div class="mobile-detalle-item">
          <div class="mobile-detalle-label">Rendimiento</div>
          <div class="mobile-detalle-valor">${escaparHTML(stats.rendimiento)}</div>
        </div>

        <div class="mobile-detalle-item">
          <div class="mobile-detalle-label">Sets</div>
          <div class="mobile-detalle-valor">${escaparHTML(stats.sets)} (${stats.difSets >= 0 ? "+" : ""}${escaparHTML(stats.difSets)})</div>
        </div>

        <div class="mobile-detalle-item">
          <div class="mobile-detalle-label">Games</div>
          <div class="mobile-detalle-valor">${escaparHTML(stats.games)} (${stats.difGames >= 0 ? "+" : ""}${escaparHTML(stats.difGames)})</div>
        </div>

        <div class="mobile-detalle-item">
          <div class="mobile-detalle-label">Pendientes</div>
          <div class="mobile-detalle-valor">${escaparHTML(stats.pendientes)}</div>
        </div>

        <div class="mobile-detalle-item">
          <div class="mobile-detalle-label">Racha</div>
          <div class="mobile-detalle-valor">${escaparHTML(stats.racha)}</div>
        </div>
      </div>

      <div class="mobile-detalle-extra">
        <div class="detalle-icono">📋</div>
        <div>
          <strong>Historial de partidos:</strong>
          ${historialHTML(stats.historial)}
        </div>
      </div>

      <div class="mobile-detalle-extra">
        <div class="detalle-icono">📅</div>
        <div>
          <strong>Próximo partido:</strong>
          <span class="mobile-detalle-extra-linea">${escaparHTML(proximo.linea1)}</span>
          ${proximo.linea2 ? `<span class="mobile-detalle-extra-linea">${escaparHTML(proximo.linea2)}</span>` : ""}
        </div>
      </div>
    `;
  }

  function crearTablaCategoria(categoria, registros, fixture) {
    const total = categoria.jugadores.length;
    const claseCat = claseCategoria(categoria.nombre);
    const categoriaSlug = slug(categoria.nombre);

    const jugadores = categoria.jugadores.map((j, index) => {
      const stats = calcularStatsJugador(j.jugador, registros, fixture);
      const zona = zonaJugador(categoria.nombre, j.posicion, total);
      const medallaJugador = medalla(j.posicion);
      const detalleId = `detalle-${categoriaSlug}-${index}`;

      return {
        ...j,
        index,
        stats,
        zona,
        medallaJugador,
        detalleId,
        playerKey: normalizar(j.jugador),
        isPreferred: Boolean(highlightedPlayer && normalizar(j.jugador) === normalizar(highlightedPlayer))
      };
    });

    const filasDesktop = jugadores.map(j => `
      <tr class="fila-jugador${j.isPreferred ? " is-preferred-player" : ""}" data-player-key="${escaparHTML(j.playerKey)}">
        <td class="posicion">${escaparHTML(j.posicion)}</td>
        <td>
          <button class="jugador-detalle-btn" type="button"
            data-detalle="${escaparHTML(j.detalleId)}"
            aria-expanded="false"
            aria-controls="${escaparHTML(j.detalleId)}">
            ${escaparHTML(j.jugador)}${j.isPreferred ? '<span class="preferred-player-badge">Tu perfil</span>' : ""}
          </button>
        </td>
        <td class="puntos">${escaparHTML(j.puntos)}</td>
        <td class="jugados">${escaparHTML(j.stats.jugados)}</td>
        <td>${zonaHTML(j.zona)}</td>
        <td class="medalla">${escaparHTML(j.medallaJugador)}</td>
      </tr>
      <tr class="detalle-row" id="${escaparHTML(j.detalleId)}" hidden>
        <td colspan="6">
          ${detalleHTML(j.jugador, j.stats, j.zona)}
        </td>
      </tr>
    `).join("");

    const cardsMobile = jugadores.map(j => `
      <div class="card-jugador${j.isPreferred ? " is-preferred-player" : ""}" data-player-key="${escaparHTML(j.playerKey)}">
        <button class="card-jugador-main" type="button"
          aria-expanded="false"
          aria-controls="card-${escaparHTML(j.detalleId)}">
          <span class="card-posicion">${escaparHTML(j.posicion)}</span>

          <span class="card-info">
            <span class="card-nombre">${escaparHTML(j.jugador)}${j.isPreferred ? '<span class="preferred-player-badge">Tu perfil</span>' : ""}</span>
            ${j.zona ? `<span class="card-zona">${zonaHTML(j.zona)}</span>` : ""}
          </span>

          <span class="card-num">
            ${escaparHTML(j.puntos)}
            ${j.medallaJugador ? `<span class="medalla-mobile">${escaparHTML(j.medallaJugador)}</span>` : ""}
          </span>

          <span class="card-num">
            ${escaparHTML(j.stats.jugados)}
          </span>

          <span class="card-accion">Detalle</span>
        </button>

        <div class="card-desplegable" id="card-${escaparHTML(j.detalleId)}">
          ${detalleMobileHTML(j.stats, j.zona)}
        </div>
      </div>
    `).join("");

    return `
      <section class="categoria-ranking ${claseCat}">
        <button class="categoria-titulo" type="button"
          aria-expanded="false"
          aria-controls="contenido-${escaparHTML(categoriaSlug)}">
          <span>${escaparHTML(categoria.nombre)}</span>
          <span class="categoria-icon" aria-hidden="true">+</span>
        </button>

        <div class="categoria-contenido" id="contenido-${escaparHTML(categoriaSlug)}">
          <div class="desktop-ranking">
            <table class="tabla-ranking">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Jugador</th>
                  <th>PTS</th>
                  <th>PJ</th>
                  <th>Zona</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${filasDesktop}</tbody>
            </table>
          </div>

          <div class="cards-ranking">
            <div class="mobile-ranking-header">
              <div>#</div>
              <div class="header-jugador">Jugador</div>
              <div>PTS</div>
              <div>PJ</div>
              <div></div>
            </div>

            ${cardsMobile}
          </div>
        </div>
      </section>
    `;
  }

  function mostrarJugadorSolicitado() {
    if (!requestedPlayer) return;
    const key = normalizar(requestedPlayer);
    const selector = window.matchMedia("(max-width: 700px)").matches
      ? ".card-jugador[data-player-key]"
      : ".fila-jugador[data-player-key]";
    const target = Array.from(contenedor.querySelectorAll(selector))
      .find(element => element.dataset.playerKey === key);
    if (!target) return;

    const category = target.closest(".categoria-ranking");
    const title = category?.querySelector(".categoria-titulo");
    category?.classList.add("abierta");
    title?.setAttribute("aria-expanded", "true");
    const icon = title?.querySelector(".categoria-icon");
    if (icon) icon.textContent = "–";
    requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function instalarEventos() {
    if (eventosInstalados) return;
    eventosInstalados = true;

    contenedor.addEventListener("click", event => {
      const titulo = event.target.closest(".categoria-titulo");
      if (titulo && contenedor.contains(titulo)) {
        const categoriaBox = titulo.closest(".categoria-ranking");
        const icono = titulo.querySelector(".categoria-icon");
        const estabaAbierta = categoriaBox.classList.contains("abierta");

        contenedor.querySelectorAll(".categoria-ranking").forEach(box => {
          box.classList.remove("abierta");
          const control = box.querySelector(".categoria-titulo");
          if (control) control.setAttribute("aria-expanded", "false");
          const span = control?.querySelector(".categoria-icon");
          if (span) span.textContent = "+";
        });

        contenedor.querySelectorAll(".detalle-row").forEach(detalle => {
          detalle.hidden = true;
        });
        contenedor.querySelectorAll(".jugador-detalle-btn").forEach(button => {
          button.setAttribute("aria-expanded", "false");
        });
        contenedor.querySelectorAll(".card-jugador").forEach(card => {
          card.classList.remove("abierto");
          const control = card.querySelector(".card-jugador-main");
          if (control) control.setAttribute("aria-expanded", "false");
          const accion = card.querySelector(".card-accion");
          if (accion) accion.textContent = "Detalle";
        });

        if (!estabaAbierta) {
          categoriaBox.classList.add("abierta");
          titulo.setAttribute("aria-expanded", "true");
          if (icono) icono.textContent = "–";

          requestAnimationFrame(() => {
            const margenSuperior = 8;
            const posicionCategoria = titulo.getBoundingClientRect().top + window.pageYOffset - margenSuperior;
            window.scrollTo({ top: posicionCategoria, behavior: "smooth" });
          });
        }
        return;
      }

      const jugadorControl = event.target.closest(".jugador-detalle-btn");
      if (jugadorControl && contenedor.contains(jugadorControl)) {
        const id = jugadorControl.getAttribute("data-detalle");
        const detalle = id ? document.getElementById(id) : null;
        if (!detalle) return;

        const visible = !detalle.hidden;
        contenedor.querySelectorAll(".detalle-row").forEach(d => {
          d.hidden = true;
        });
        contenedor.querySelectorAll(".jugador-detalle-btn").forEach(button => {
          button.setAttribute("aria-expanded", "false");
        });
        detalle.hidden = visible;
        jugadorControl.setAttribute("aria-expanded", String(!visible));
        return;
      }

      const card = event.target.closest(".card-jugador-main");
      if (card && contenedor.contains(card)) {
        const contenedorCard = card.closest(".card-jugador");
        const estabaAbierto = contenedorCard.classList.contains("abierto");

        contenedor.querySelectorAll(".card-jugador").forEach(c => {
          c.classList.remove("abierto");
          const control = c.querySelector(".card-jugador-main");
          if (control) control.setAttribute("aria-expanded", "false");
          const accion = c.querySelector(".card-accion");
          if (accion) accion.textContent = "Detalle";
        });

        if (!estabaAbierto) {
          contenedorCard.classList.add("abierto");
          card.setAttribute("aria-expanded", "true");
          const accion = contenedorCard.querySelector(".card-accion");
          if (accion) accion.textContent = "Cerrar";
        }
      }
    });
  }

  async function cargarRankings() {
    contenedor.innerHTML = `<div class="ranking-vacio">Cargando tablas de posiciones...</div>`;
    instalarEventos();

    try {
      const [rankingData, registroData, fixtureData] = await Promise.all([
        DATA_CLIENT.loadText("rankings", {
          url: RANKINGS_URL
        }),
        DATA_CLIENT.loadText("registro", {
          url: REGISTRO_URL
        }),
        DATA_CLIENT.loadText("fixture", {
          url: FIXTURE_URL
        })
      ]);

      const rankingCSV = rankingData.text;
      const registroCSV = registroData.text;
      const fixtureCSV = fixtureData.text;

      const filasRanking = parseCSV(rankingCSV);
      const categorias = detectarRankings(filasRanking);
      const registros = leerRegistro(registroCSV);
      const fixture = leerFixture(fixtureCSV);

      prepararIndices(registros, fixture);

      if (categorias.length === 0) {
        contenedor.innerHTML = `
          <div class="ranking-vacio">
            No se encontraron tablas de posiciones para mostrar.
          </div>`;
        return;
      }

      contenedor.innerHTML = categorias
        .map(categoria => crearTablaCategoria(categoria, registros, fixture))
        .join("");
      mostrarJugadorSolicitado();
      DATA_CLIENT.updateStatus(
        dataStatus,
        [rankingData, registroData, fixtureData],
        cargarRankings
      );

    } catch (error) {
      console.error("No se pudieron cargar las tablas:", error);
      DATA_CLIENT.showError(dataStatus, "No se pudieron actualizar los datos.", cargarRankings);
      contenedor.innerHTML = `
        <div class="ranking-vacio">
          No se pudieron cargar las tablas de posiciones.
        </div>`;
    }
  }

  cargarRankings();
})();
