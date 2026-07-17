(() => {
  "use strict";

  const APP_CONFIG = window.OPEN_TENNIS_CONFIG;
  const DATA_CLIENT = window.OPEN_TENNIS_DATA;
  const DATOS_URL = APP_CONFIG.LOCAL_DATA.RESULTADOS_2025;
  const ORDEN_CATEGORIAS = ["A", "B", "C", "D"];
  const contenedor = document.getElementById("rankingsContenedor");
  const dataStatus = document.getElementById("dataStatus");

  const normalizarCache = new Map();
  const nombreCortoCache = new Map();
  const slugCache = new Map();
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

  function numero(valor) {
    if (valor === null || valor === undefined || valor === "" || valor === "-") return null;
    const n = Number(String(valor).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function claseCategoria(letra) {
    return `categoria-${String(letra || "a").toLowerCase()}`;
  }

  function medalla(posicion) {
    if (posicion === 1) return "🏆";
    if (posicion === 2) return "🥈";
    if (posicion === 3) return "🥉";
    return "";
  }

  function zonaHTML(zona) {
    if (!zona) return "";
    return `<span class="etiqueta-zona ${zona.clase}">${zona.icono ? zona.icono + " " : ""}${escaparHTML(zona.texto)}</span>`;
  }

  function valorPorNombre(mapa, nombre) {
    if (!mapa || typeof mapa !== "object") return null;
    const objetivo = normalizar(nombre);

    for (const [clave, valor] of Object.entries(mapa)) {
      if (normalizar(clave) === objetivo) return valor;
    }

    return null;
  }

  function normalizarNota(nota) {
    if (!nota) return null;

    if (typeof nota === "string") {
      return {
        titulo: "Criterio de desempate",
        icono: "⚖️",
        clase: "detalle-desempate",
        texto: nota
      };
    }

    if (typeof nota !== "object") return null;

    const texto = String(nota.texto || "").trim();
    if (!texto) return null;

    return {
      titulo: String(nota.titulo || "Observación"),
      icono: String(nota.icono || "ℹ️"),
      clase: String(nota.clase || "detalle-observacion"),
      texto
    };
  }

  function setValido(set) {
    return Array.isArray(set) && numero(set[0]) !== null && numero(set[1]) !== null;
  }

  function marcadorSet(set, ladoJugador) {
    if (!setValido(set)) return "";
    const a = numero(set[ladoJugador]);
    const b = numero(set[ladoJugador === 0 ? 1 : 0]);
    return `${a}-${b}`;
  }

  function marcadorDesdeJugador(partido, ladoJugador) {
    const partes = [
      marcadorSet(partido.s1, ladoJugador),
      marcadorSet(partido.s2, ladoJugador),
      marcadorSet(partido.stb, ladoJugador)
    ].filter(Boolean);

    return partes.join(" ") || "Resultado registrado";
  }

  function setsDelPartido(partido) {
    let setsJ1 = 0;
    let setsJ2 = 0;

    [partido.s1, partido.s2, partido.stb].forEach(set => {
      if (!setValido(set)) return;
      const j1 = numero(set[0]);
      const j2 = numero(set[1]);

      if (j1 > j2) setsJ1++;
      if (j2 > j1) setsJ2++;
    });

    return [setsJ1, setsJ2];
  }

  function ganadorDelPartido(partido, sets) {
    const ptsJ1 = numero(partido.pts?.[0]) ?? 0;
    const ptsJ2 = numero(partido.pts?.[1]) ?? 0;

    if (ptsJ1 !== ptsJ2) return ptsJ1 > ptsJ2 ? 0 : 1;
    if (sets[0] !== sets[1]) return sets[0] > sets[1] ? 0 : 1;
    return null;
  }

  function crearStatsBase(nombre, orden) {
    return {
      jugador: nombre,
      _key: normalizar(nombre),
      _orden: orden,
      puntos: 0,
      jugados: 0,
      ganados: 0,
      perdidos: 0,
      setsGanados: 0,
      setsPerdidos: 0,
      gamesGanados: 0,
      gamesPerdidos: 0,
      resultadosRacha: [],
      historial: []
    };
  }

  function obtenerJugador(mapa, nombre) {
    const key = normalizar(nombre);
    if (!mapa.has(key)) {
      mapa.set(key, crearStatsBase(nombre, mapa.size));
    }
    return mapa.get(key);
  }

  function sumarPartido(stats, partido, ladoJugador, sets, ganador) {
    const ladoRival = ladoJugador === 0 ? 1 : 0;
    const rival = ladoJugador === 0 ? partido.jugador2 : partido.jugador1;
    const gano = ganador === ladoJugador;

    stats.puntos += numero(partido.pts?.[ladoJugador]) ?? 0;
    stats.jugados++;
    stats.ganados += gano ? 1 : 0;
    stats.perdidos += gano ? 0 : 1;
    stats.setsGanados += sets[ladoJugador];
    stats.setsPerdidos += sets[ladoRival];

    // El super tie-break define el tercer set, pero no se suma como games.
    [partido.s1, partido.s2].forEach(set => {
      if (!setValido(set)) return;
      stats.gamesGanados += numero(set[ladoJugador]) ?? 0;
      stats.gamesPerdidos += numero(set[ladoRival]) ?? 0;
    });

    const esWO = partido.wo === true;
    const estado = gano
      ? (esWO ? "Ganó por W/O" : "Ganó")
      : (esWO ? "Perdió por W/O" : "Perdió");
    const marcador = esWO ? "" : marcadorDesdeJugador(partido, ladoJugador);
    stats.resultadosRacha.push(gano ? "G" : "P");
    stats.historial.push(`${estado} vs ${nombreCorto(rival)}${marcador ? ` ${marcador}` : ""}`);
  }

  function calcularCategoria(partidos, configuracion = {}) {
    const jugadores = new Map();
    const ordenOficial = Array.isArray(configuracion.ordenFinal)
      ? new Map(configuracion.ordenFinal.map((nombre, index) => [normalizar(nombre), index]))
      : new Map();

    partidos.forEach(partido => {
      if (!partido?.jugador1 || !partido?.jugador2) return;

      const sets = setsDelPartido(partido);
      const ganador = ganadorDelPartido(partido, sets);
      const jugador1 = obtenerJugador(jugadores, partido.jugador1);
      const jugador2 = obtenerJugador(jugadores, partido.jugador2);

      sumarPartido(jugador1, partido, 0, sets, ganador);
      sumarPartido(jugador2, partido, 1, sets, ganador);
    });

    return Array.from(jugadores.values())
      .map(stats => {
        const maximo = stats.jugados * 3;
        const rendimiento = maximo > 0 ? Math.round((stats.puntos / maximo) * 100) : 0;

        return {
          ...stats,
          difSets: stats.setsGanados - stats.setsPerdidos,
          difGames: stats.gamesGanados - stats.gamesPerdidos,
          rendimiento: `${rendimiento}%`,
          racha: stats.resultadosRacha.length
            ? stats.resultadosRacha.slice(-3).join("-")
            : "Sin partidos jugados",
          zona: valorPorNombre(configuracion.zonas, stats.jugador),
          nota: normalizarNota(valorPorNombre(configuracion.notas, stats.jugador))
        };
      })
      .sort((a, b) => {
        const posicionA = ordenOficial.get(a._key);
        const posicionB = ordenOficial.get(b._key);
        const tieneA = Number.isInteger(posicionA);
        const tieneB = Number.isInteger(posicionB);

        if (tieneA && tieneB) return posicionA - posicionB;
        if (tieneA) return -1;
        if (tieneB) return 1;

        return (b.puntos - a.puntos) || (a._orden - b._orden);
      })
      .map((stats, index) => ({
        ...stats,
        posicion: index + 1,
        medalla: medalla(index + 1)
      }));
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

  function diferenciaHTML(valor) {
    const prefijo = valor >= 0 ? "+" : "";
    return `${prefijo}${escaparHTML(valor)}`;
  }

  function detalleHTML(stats) {
    return `
      <div class="detalle-box">
        <div class="detalle-grid">
          <div class="detalle-item">
            <div class="detalle-label">Partidos jugados</div>
            <div class="detalle-valor">${escaparHTML(stats.jugados)}</div>
          </div>

          <div class="detalle-item">
            <div class="detalle-label">Victorias</div>
            <div class="detalle-valor">${escaparHTML(stats.ganados)}</div>
          </div>

          <div class="detalle-item">
            <div class="detalle-label">Derrotas</div>
            <div class="detalle-valor">${escaparHTML(stats.perdidos)}</div>
          </div>

          <div class="detalle-item">
            <div class="detalle-label">Rendimiento</div>
            <div class="detalle-valor">${escaparHTML(stats.rendimiento)}</div>
          </div>

          <div class="detalle-item">
            <div class="detalle-label">Sets</div>
            <div class="detalle-valor">${escaparHTML(`${stats.setsGanados}-${stats.setsPerdidos}`)} (${diferenciaHTML(stats.difSets)})</div>
          </div>

          <div class="detalle-item">
            <div class="detalle-label">Games</div>
            <div class="detalle-valor">${escaparHTML(`${stats.gamesGanados}-${stats.gamesPerdidos}`)} (${diferenciaHTML(stats.difGames)})</div>
          </div>

          <div class="detalle-item">
            <div class="detalle-label">Racha final</div>
            <div class="detalle-valor">${escaparHTML(stats.racha)}</div>
          </div>
        </div>

        ${stats.nota ? `
          <div class="detalle-extra detalle-nota ${escaparHTML(stats.nota.clase)}">
            <strong>${escaparHTML(stats.nota.icono)} ${escaparHTML(stats.nota.titulo)}:</strong>
            <span>${escaparHTML(stats.nota.texto)}</span>
          </div>
        ` : ""}

        <div class="detalle-extra">
          <strong>📋 Historial de partidos:</strong>
          ${historialHTML(stats.historial)}
        </div>
      </div>
    `;
  }

  function detalleMobileHTML(stats) {
    return `
      <div class="mobile-detalle-grid">
        <div class="mobile-detalle-item">
          <div class="mobile-detalle-label">Partidos jugados</div>
          <div class="mobile-detalle-valor">${escaparHTML(stats.jugados)}</div>
        </div>

        <div class="mobile-detalle-item">
          <div class="mobile-detalle-label">Victorias</div>
          <div class="mobile-detalle-valor">${escaparHTML(stats.ganados)}</div>
        </div>

        <div class="mobile-detalle-item">
          <div class="mobile-detalle-label">Derrotas</div>
          <div class="mobile-detalle-valor">${escaparHTML(stats.perdidos)}</div>
        </div>

        <div class="mobile-detalle-item">
          <div class="mobile-detalle-label">Rendimiento</div>
          <div class="mobile-detalle-valor">${escaparHTML(stats.rendimiento)}</div>
        </div>

        <div class="mobile-detalle-item">
          <div class="mobile-detalle-label">Sets</div>
          <div class="mobile-detalle-valor">${escaparHTML(`${stats.setsGanados}-${stats.setsPerdidos}`)} (${diferenciaHTML(stats.difSets)})</div>
        </div>

        <div class="mobile-detalle-item">
          <div class="mobile-detalle-label">Games</div>
          <div class="mobile-detalle-valor">${escaparHTML(`${stats.gamesGanados}-${stats.gamesPerdidos}`)} (${diferenciaHTML(stats.difGames)})</div>
        </div>

        <div class="mobile-detalle-item">
          <div class="mobile-detalle-label">Racha final</div>
          <div class="mobile-detalle-valor">${escaparHTML(stats.racha)}</div>
        </div>
      </div>

      ${stats.nota ? `
        <div class="mobile-detalle-extra detalle-nota ${escaparHTML(stats.nota.clase)}">
          <div class="detalle-icono">${escaparHTML(stats.nota.icono)}</div>
          <div>
            <strong>${escaparHTML(stats.nota.titulo)}:</strong>
            <span class="mobile-detalle-extra-linea">${escaparHTML(stats.nota.texto)}</span>
          </div>
        </div>
      ` : ""}

      <div class="mobile-detalle-extra">
        <div class="detalle-icono">📋</div>
        <div>
          <strong>Historial de partidos:</strong>
          ${historialHTML(stats.historial)}
        </div>
      </div>
    `;
  }

  function crearCategoriaVacia(letra) {
    const categoriaSlug = slug(`categoria-${letra}`);
    return `
      <section class="categoria-ranking ${claseCategoria(letra)}">
        <button class="categoria-titulo" type="button"
          aria-expanded="false"
          aria-controls="contenido-${escaparHTML(categoriaSlug)}">
          <span>CATEGORIA ${escaparHTML(letra)}</span>
          <span class="categoria-icon" aria-hidden="true">+</span>
        </button>

        <div class="categoria-contenido" id="contenido-${escaparHTML(categoriaSlug)}">
          <div class="ranking-vacio">Todavía no se han cargado los resultados 2025 de esta categoría.</div>
        </div>
      </section>
    `;
  }

  function crearTablaCategoria(letra, partidos, configuracion) {
    const jugadores = calcularCategoria(partidos, configuracion);
    if (jugadores.length === 0) return crearCategoriaVacia(letra);

    const categoriaSlug = slug(`categoria-${letra}`);

    const filasDesktop = jugadores.map((j, index) => {
      const detalleId = `detalle-${categoriaSlug}-${index}`;

      return `
        <tr class="fila-jugador">
          <td class="posicion">${escaparHTML(j.posicion)}</td>
          <td>
            <button class="jugador-detalle-btn" type="button"
              data-detalle="${escaparHTML(detalleId)}"
              aria-expanded="false"
              aria-controls="${escaparHTML(detalleId)}">
              ${escaparHTML(j.jugador)}
            </button>
          </td>
          <td class="puntos">${escaparHTML(j.puntos)}</td>
          <td class="jugados">${escaparHTML(j.jugados)}</td>
          <td>${zonaHTML(j.zona)}</td>
          <td class="medalla">${escaparHTML(j.medalla)}</td>
        </tr>
        <tr class="detalle-row" id="${escaparHTML(detalleId)}" hidden>
          <td colspan="6">${detalleHTML(j)}</td>
        </tr>
      `;
    }).join("");

    const cardsMobile = jugadores.map((j, index) => `
      <div class="card-jugador">
        <button class="card-jugador-main" type="button"
          aria-expanded="false"
          aria-controls="card-${escaparHTML(categoriaSlug)}-${index}">
          <span class="card-posicion">${escaparHTML(j.posicion)}</span>

          <span class="card-info">
            <span class="card-nombre">${escaparHTML(j.jugador)}</span>
            ${j.zona ? `<span class="card-zona">${zonaHTML(j.zona)}</span>` : ""}
          </span>

          <span class="card-num">
            ${escaparHTML(j.puntos)}
            ${j.medalla ? `<span class="medalla-mobile">${escaparHTML(j.medalla)}</span>` : ""}
          </span>

          <span class="card-num">${escaparHTML(j.jugados)}</span>
          <span class="card-accion">Detalle</span>
        </button>

        <div class="card-desplegable" id="card-${escaparHTML(categoriaSlug)}-${index}">${detalleMobileHTML(j)}</div>
      </div>
    `).join("");

    return `
      <section class="categoria-ranking ${claseCategoria(letra)}">
        <button class="categoria-titulo" type="button"
          aria-expanded="false"
          aria-controls="contenido-${escaparHTML(categoriaSlug)}">
          <span>CATEGORIA ${escaparHTML(letra)}</span>
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
                  <th>Resultado</th>
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
        contenedor.querySelectorAll(".detalle-row").forEach(item => {
          item.hidden = true;
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

        contenedor.querySelectorAll(".card-jugador").forEach(item => {
          item.classList.remove("abierto");
          const control = item.querySelector(".card-jugador-main");
          if (control) control.setAttribute("aria-expanded", "false");
          const accion = item.querySelector(".card-accion");
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

  async function cargarResultados() {
    contenedor.innerHTML = `<div class="ranking-vacio">Cargando resultados 2025...</div>`;
    instalarEventos();

    try {
      const response = await fetch(DATOS_URL);
      if (!response.ok) throw new Error(`Error HTTP ${response.status}`);

      const datos = await response.json();
      const categorias = datos?.categorias || {};
      const ordenFinal = datos?.ordenFinal || {};
      const zonasFinales = datos?.zonasFinales || {};
      const notasJugadores = datos?.notasJugadores || {};

      contenedor.innerHTML = ORDEN_CATEGORIAS
        .map(letra => crearTablaCategoria(
          letra,
          Array.isArray(categorias[letra]) ? categorias[letra] : [],
          {
            ordenFinal: Array.isArray(ordenFinal[letra]) ? ordenFinal[letra] : [],
            zonas: zonasFinales[letra] || {},
            notas: notasJugadores[letra] || {}
          }
        ))
        .join("");
      dataStatus.textContent = "Resultados oficiales de la temporada 2025.";
    } catch (error) {
      console.error("No se pudieron cargar los resultados 2025:", error);
      DATA_CLIENT.showError(dataStatus, "No se pudieron cargar los resultados 2025.", cargarResultados);
      contenedor.innerHTML = `
        <div class="ranking-vacio">
          No se pudieron cargar los resultados 2025.
        </div>`;
    }
  }

  cargarResultados();
})();
