const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const pages = [
  "index.html",
  "partidos.html",
  "tablas.html",
  "resultados-2025.html",
  "reglas.html",
  "marcador.html",
  "404.html",
  "offline.html"
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function localReferences(html) {
  return [...html.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)]
    .map(match => match[1])
    .filter(reference => !/^(?:https?:|mailto:|tel:|#|data:)/i.test(reference))
    .map(reference => reference.split(/[?#]/)[0])
    .filter(Boolean);
}

test("todas las páginas y sus recursos locales existen", () => {
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /<!doctype html>/i, `${page} debe declarar HTML5`);

    for (const reference of localReferences(html)) {
      const target = path.resolve(root, path.dirname(page), reference);
      assert.ok(target.startsWith(root), `${page} contiene una ruta insegura: ${reference}`);
      assert.ok(fs.existsSync(target), `${page} referencia un archivo inexistente: ${reference}`);
    }
  }
});

test("el precaché del service worker solo contiene archivos existentes", () => {
  const serviceWorker = read("sw.js");
  const block = serviceWorker.match(/const CORE_ASSETS = \[([\s\S]*?)\];/);
  assert.ok(block, "No se encontró CORE_ASSETS");

  const assets = [...block[1].matchAll(/["'](\.\/[^"']*)["']/g)]
    .map(match => match[1]);

  assert.ok(assets.includes("./offline.html"), "Debe existir una pantalla offline real");
  assert.ok(assets.includes("./404.html"), "Debe precargar la página 404 personalizada");

  for (const asset of assets) {
    if (asset === "./") continue;
    assert.ok(fs.existsSync(path.resolve(root, asset)), `Falta el recurso precargado ${asset}`);
  }
});

test("las URLs de Google Sheets están centralizadas", () => {
  const allowed = path.join(root, "assets", "js", "config.js");
  const candidates = [
    ...pages.map(page => path.join(root, page)),
    ...fs.readdirSync(path.join(root, "assets", "js"))
      .filter(file => file.endsWith(".js"))
      .map(file => path.join(root, "assets", "js", file))
  ];

  for (const file of candidates) {
    if (file === allowed) continue;
    assert.doesNotMatch(
      fs.readFileSync(file, "utf8"),
      /https:\/\/docs\.google\.com\/spreadsheets/,
      `La URL de Sheets está duplicada en ${path.relative(root, file)}`
    );
  }
});

test("los controles críticos tienen nombres accesibles", () => {
  const partidos = read("partidos.html");
  const tablas = read("tablas.html");
  const historico = read("resultados-2025.html");
  const marcador = read("marcador.html");
  const tablasRuntime = read("assets/js/tablas-page.js");
  const historicoRuntime = read("assets/js/resultados-2025-page.js");
  const marcadorRuntime = read("assets/js/marcador-page.js");

  assert.match(partidos, /<label[^>]+for="buscador"/);
  assert.match(tablasRuntime, /<button class="categoria-titulo"/);
  assert.match(tablasRuntime, /class="jugador-detalle-btn"/);
  assert.match(historicoRuntime, /<button class="categoria-titulo"/);
  assert.match(historicoRuntime, /class="jugador-detalle-btn"/);
  assert.match(marcador, /<label class="label" for="categorySelect"/);
  assert.match(marcador, /aria-labelledby="corrS1Label corrNameAHead"/);
  assert.match(marcadorRuntime, /Punto para \$\{labelA\}/);
});

test("el estado de datos aparece al final del contenido", () => {
  const locations = [
    ["partidos.html", "accordionSemanas"],
    ["tablas.html", "criterios-box"],
    ["resultados-2025.html", "criterios-box"]
  ];

  for (const [page, previousContent] of locations) {
    const html = read(page);
    const statusMatches = html.match(/id="dataStatus"/g) || [];
    assert.equal(statusMatches.length, 1, `${page} debe tener un solo estado de datos`);
    assert.ok(
      html.indexOf('id="dataStatus"') > html.indexOf(previousContent),
      `${page} debe mostrar el estado después del contenido principal`
    );
    assert.match(html, /id="dataStatus" class="data-status data-status-footer"/);
  }
});

test("el control para volver a cargar siempre dice Actualizar", () => {
  const dataClient = read("assets/js/data-client.js");
  const labels = [...dataClient.matchAll(/addRefreshControl\(element, retry, "([^"]+)"\)/g)]
    .map(match => match[1]);

  assert.deepEqual(labels, ["Actualizar", "Actualizar"]);
});

test("la interfaz usa el logo optimizado", () => {
  const optimized = path.join(root, "assets", "img", "logo-open-tennis-256.svg");
  assert.ok(fs.statSync(optimized).size < 50_000, "El logo optimizado debe pesar menos de 50 KB");

  for (const page of pages) {
    assert.doesNotMatch(read(page), /assets\/img\/logo-open-tennis\.png/);
  }
});

test("las páginas públicas tienen metadatos para buscadores y WhatsApp", () => {
  const publicPages = {
    "index.html": "https://opentennis.cl/",
    "partidos.html": "https://opentennis.cl/partidos.html",
    "tablas.html": "https://opentennis.cl/tablas.html",
    "resultados-2025.html": "https://opentennis.cl/resultados-2025.html",
    "reglas.html": "https://opentennis.cl/reglas.html",
    "marcador.html": "https://opentennis.cl/marcador.html"
  };

  for (const [page, canonical] of Object.entries(publicPages)) {
    const html = read(page);
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`), `${page} debe tener canonical`);
    assert.ok(html.includes(`<meta property="og:url" content="${canonical}">`), `${page} debe declarar og:url`);
    assert.match(html, /<meta property="og:title" content="[^"]+">/);
    assert.match(html, /<meta property="og:description" content="[^"]+">/);
    assert.ok(
      html.includes('<meta property="og:image" content="https://opentennis.cl/assets/icons/icon-512.png">'),
      `${page} debe usar una imagen absoluta para compartir`
    );
    assert.ok(html.includes('<meta name="twitter:card" content="summary">'));
  }
});

test("el reglamento tiene un índice accesible con destinos válidos", () => {
  const reglas = read("reglas.html");
  const anchors = ["definiciones", "organizacion", "normas-juego", "reprogramacion", "lesiones", "conducta"];

  assert.match(reglas, /<nav class="rules-index" aria-labelledby="rules-index-title">/);
  for (const anchor of anchors) {
    assert.ok(reglas.includes(`href="#${anchor}"`), `Falta el enlace a ${anchor}`);
    assert.ok(reglas.includes(`id="${anchor}"`), `Falta el destino ${anchor}`);
  }
});

test("la página 404 ayuda a volver al sitio", () => {
  const notFound = read("404.html");
  assert.match(notFound, /<meta name="robots" content="noindex,follow">/);
  assert.match(notFound, /<h1 id="error-title">Página no encontrada<\/h1>/);
  assert.match(notFound, /href="index.html">Volver al inicio<\/a>/);
  assert.match(notFound, /href="partidos.html">Ver partidos<\/a>/);
});

test("Resultados 2025 mantiene activa la navegación de Tablas", () => {
  const app = read("assets/js/app.js");
  assert.match(app, /current === 'resultados-2025\.html' \? 'tablas\.html' : current/);
  assert.match(app, /href === activeNavigationPage/);
});

test("las páginas grandes mantienen su código separado", () => {
  const separatedPages = [
    "partidos",
    "tablas",
    "resultados-2025",
    "marcador"
  ];

  for (const page of separatedPages) {
    const html = read(`${page}.html`);
    assert.doesNotMatch(html, /<style[\s>]/i, `${page}.html no debe contener CSS incrustado`);
    assert.doesNotMatch(
      html,
      /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i,
      `${page}.html no debe contener JavaScript incrustado`
    );
    assert.match(html, new RegExp(`assets/css/${page}\\.css\\?v=\\d+`));
    assert.match(html, new RegExp(`assets/js/${page}-page\\.js\\?v=\\d+`));
  }
});

test("todo el JavaScript local tiene sintaxis válida", () => {
  const javascriptFiles = [
    "sw.js",
    ...fs.readdirSync(path.join(root, "assets", "js"))
      .filter(file => file.endsWith(".js"))
      .map(file => path.join("assets", "js", file)),
  ];

  for (const file of javascriptFiles) {
    assert.doesNotThrow(
      () => new vm.Script(read(file), { filename: file }),
      `${file} debe tener sintaxis JavaScript válida`
    );
  }
});

test("la versión de la aplicación es consistente", () => {
  const configVersion = read("assets/js/config.js").match(/APP_VERSION:\s*"(\d+)"/)?.[1];
  const workerVersion = read("sw.js").match(/const APP_VERSION = '(\d+)'/)?.[1];
  const appFallbackVersion = read("assets/js/app.js").match(/APP_VERSION \|\| '(\d+)'/)?.[1];

  assert.ok(configVersion, "config.js debe declarar una versión");
  assert.equal(workerVersion, configVersion, "service worker y configuración deben coincidir");
  assert.equal(appFallbackVersion, configVersion, "app.js y configuración deben coincidir");

  for (const page of pages.filter(page => page !== "offline.html")) {
    const html = read(page);
    for (const match of html.matchAll(/assets\/(?:css\/(?:p2|partidos|tablas|resultados-2025|marcador)|js\/(?:config|app|data-client|pwa-install|marcador-rules|partidos-page|tablas-page|resultados-2025-page|marcador-page))\.[a-z]+\?v=(\d+)/g)) {
      assert.equal(match[1], configVersion, `${page} carga una versión antigua: ${match[0]}`);
    }
  }
});
