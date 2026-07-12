# Open Tennis Huechuraba · V5

Versión tipo app para GitHub Pages.

## Cambios V5

- Pantalla de inicio simplificada: solo banner principal + banner para agregar la app al inicio.
- Se eliminó el popup de instalación.
- Menú principal corregido como barra inferior fija en todas las páginas.
- Ajustes de móvil para evitar scroll horizontal y mantener la experiencia tipo app.
- Tema visual elegante inspirado en tenis sobre arcilla: verde profundo, terracota y crema.
- Reglamento en texto HTML, sin imágenes.
- Mejor adaptación de escritorio con ancho máximo, tarjetas y espaciado consistente.
- Cache PWA actualizado a `open-tennis-v12-shell`.

## Archivos principales

- `index.html`: inicio compacto.
- `partidos.html`: programación y resultados desde Google Sheets.
- `tablas.html`: tablas de posiciones desde Google Sheets.
- `reglas.html`: reglamento en texto.
- `marcador.html`: marcador interactivo.
- `assets/css/v5.css`: ajustes principales de la V5.
- `assets/js/pwa-install.js`: instalación sin popup.
- `manifest.webmanifest` y `sw.js`: soporte PWA.

## Recomendación al subir a GitHub

Reemplaza todos los archivos del repositorio por los de este ZIP.
Luego abre la URL con `?v=5` para evitar caché temporal, por ejemplo:

```txt
https://tgb96.github.io/oth4/?v=5
```

Si el celular todavía muestra una versión anterior, borra los datos del sitio o abre en incógnito para limpiar el service worker antiguo.


## Resultados históricos 2025

- Página: `resultados-2025.html`
- Datos locales: `data/resultados-2025.json`
- Contiene las categorías A, B, C y D con sus partidos, posiciones finales, estadísticas, historiales y observaciones de cierre de temporada.
