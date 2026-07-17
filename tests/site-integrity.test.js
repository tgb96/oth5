const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pages = [
  "index.html",
  "partidos.html",
  "tablas.html",
  "resultados-2025.html",
  "reglas.html",
  "marcador.html",
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

  assert.match(partidos, /<label[^>]+for="buscador"/);
  assert.match(tablas, /<button class="categoria-titulo"/);
  assert.match(tablas, /class="jugador-detalle-btn"/);
  assert.match(historico, /<button class="categoria-titulo"/);
  assert.match(historico, /class="jugador-detalle-btn"/);
  assert.match(marcador, /<label class="label" for="categorySelect"/);
  assert.match(marcador, /aria-labelledby="corrS1Label corrNameAHead"/);
  assert.match(marcador, /Punto para \$\{labelA\}/);
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

test("la interfaz usa el logo optimizado", () => {
  const optimized = path.join(root, "assets", "img", "logo-open-tennis-256.svg");
  assert.ok(fs.statSync(optimized).size < 50_000, "El logo optimizado debe pesar menos de 50 KB");

  for (const page of pages) {
    assert.doesNotMatch(read(page), /assets\/img\/logo-open-tennis\.png/);
  }
});
