# Open Tennis Huechuraba

Sitio oficial de la escalerilla del Club Open Tennis Huechuraba, publicado con GitHub Pages en [opentennis.cl](https://opentennis.cl/).

## Páginas

- `index.html`: inicio e instalación de la PWA.
- `partidos.html`: programación, pendientes y resultados.
- `jugadores.html`: fichas, estadísticas, próximos partidos y comparación de jugadores.
- `tablas.html`: posiciones y estadísticas 2026.
- `resultados-2025.html`: cierre histórico de 2025.
- `reglas.html`: reglamento.
- `marcador.html`: marcador de partidos con recuperación local.
- `offline.html`: aviso cuando una página no está disponible sin conexión.

## Datos y configuración

Las URLs públicas de Google Sheets, la temporada, la zona horaria, la versión y la lista de jugadores están centralizadas en `assets/js/config.js`.

El diseño y el comportamiento propios de Partidos, Tablas, Resultados 2025 y Marcador están separados en archivos con el nombre de cada página dentro de `assets/css` y `assets/js`. Los HTML conservan solamente la estructura, lo que facilita hacer cambios sin mezclar todo el código.

Los últimos CSV obtenidos correctamente se guardan en el dispositivo. Si se pierde la conexión, `partidos.html` y `tablas.html` intentan usar esa copia y muestran su fecha. Los resultados 2025 se leen desde `data/resultados-2025.json`.

Antes de publicar columnas nuevas desde Google Sheets, confirma que sean datos destinados al público. No publiques claves internas, notas médicas ni comentarios administrativos.

## Publicación segura

1. Crear una rama desde `main`.
2. Hacer los cambios en esa rama, sin reemplazar el repositorio completo.
3. Ejecutar `node --test` y comprobar que todas las pruebas pasan.
4. Revisar la rama y crear un pull request.
5. Combinarla con `main` solamente después de probarla.

GitHub Actions ejecuta las mismas pruebas automáticamente en ramas `codex/**`, pull requests y cambios de `main`.

Si una publicación falla, vuelve a seleccionar el commit estable anterior o revierte el pull request; no borres el historial del repositorio.

## PWA y caché

La versión actual de la aplicación es la definida en `assets/js/config.js`. El service worker usa esa misma versión, guarda solo respuestas válidas y presenta una pantalla offline real para navegaciones que no estén disponibles.

El logo visible usa un SVG optimizado; los PNG se conservan para los iconos instalables de la PWA.
