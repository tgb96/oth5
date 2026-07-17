(function configureOpenTennis(global) {
  "use strict";

  const SHEET_BASE = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR4Uc2YiXkim8OTwSbwK4AYfC1oWWNTX1TCE4RXFyzaK5azjuaHx4nWT1v6Ubiq2Lm9kpYFTJmY6C1d/pub";

  global.OPEN_TENNIS_CONFIG = Object.freeze({
    APP_VERSION: "23",
    SEASON: 2026,
    TIME_ZONE: "America/Santiago",
    FIXTURE_URL: `${SHEET_BASE}?gid=0&single=true&output=csv`,
    REGISTRO_URL: `${SHEET_BASE}?gid=1046180821&single=true&output=csv`,
    RANKINGS_URL: `${SHEET_BASE}?gid=1249404240&single=true&output=csv`,
    LOCAL_DATA: Object.freeze({
      FIXTURE: "data/fixture.csv",
      REGISTRO: "data/resultados.csv",
      RANKINGS: "data/rankings.csv",
      RESULTADOS_2025: "data/resultados-2025.json"
    }),
    CLUB_PLAYERS: Object.freeze({
      A: Object.freeze([
        "Diego Fossa",
        "Angelo Basualto",
        "Claudio Aedo",
        "Felipe Reyes",
        "Jose Astete",
        "Luis Flores",
        "Marcelo López",
        "Tomás Gómez",
        "Nicolás Collao"
      ]),
      B: Object.freeze([
        "Gonzalo Barros",
        "Hernán Bravo",
        "Cristhian Linares",
        "Genaro Espinoza",
        "Daniel Vega",
        "Javier González",
        "Diego Cervantes",
        "Jaime Valdebenito",
        "Matías Arellano",
        "Oscar Morales"
      ]),
      C: Object.freeze([
        "Aníbal Valenzuela",
        "César Maturana",
        "Constanza Núñez",
        "Hernán Medel",
        "Juan Muñoz",
        "Mauricio Bustamante",
        "Paulo Barrera",
        "Roy Minda"
      ]),
      D: Object.freeze([
        "Catalina Valladares",
        "Kamila Riquelme",
        "Loreto Pezoa",
        "María José Valladares",
        "Sara Salas"
      ])
    })
  });
})(window);
