# Flyer Maker

Genera los flyers de cada teatro en todos sus formatos a partir de los datos de la función.
Se publica en https://falsofacu.github.io/flyer-maker.

## Uso

1. Elegí el teatro, la fecha y la hora de la función. El texto ("31 DE OCTUBRE - 21:30 H") se arma solo, pero se puede editar a mano (↺ lo vuelve a armar).
2. Con **+ Agregar fecha** sumás todas las funciones que quieras, cada una con su teatro. Cada función sale como un juego completo de flyers de su teatro, así que en un solo .zip salen todos. La resaltada es la que se ve en las vistas previas.
3. Opcional: **Nueva función** (texto arriba con líneas a los costados; Enter para partirlo en dos renglones).
4. Opcional: **Función agotada** (fecha tachada con sello de agotado). Apagada, la fecha principal se centra en el espacio que queda libre.
5. Los brillos siguen el largo de la fecha. Se pueden arrastrar en cada vista previa o apagar desde abajo de cada una.
6. Descargá cada formato por separado (de la fecha resaltada) o todo junto en un .zip (PNG o JPG). Con varias fechas, el .zip trae una carpeta por función ("Movie - 31 octubre").

Algunos teatros tienen además un **texto de abajo** editable (por ejemplo el nombre del teatro o dónde comprar entradas) y el logo del productor fijo abajo a la derecha.

### Fechas de la web de Yipio

Abajo de todo está la lista de funciones de `data/fechas.json` de soyyipio.github.io (se lee en vivo; **Recargar** la vuelve a pedir). Incluye las que tienen `"visible": false`, que no salen en la web. Cada función se asocia sola a su teatro por el campo `lugar`, con los `lugares` de `teatros/index.json` (sin importar mayúsculas ni tildes). Si un lugar no coincide con ningún teatro, aparece pero no se puede elegir.

Vienen tildadas las próximas que no están agotadas. **Exportar** arma un .zip con todos los formatos de cada función elegida, con las mismas opciones de arriba (nueva función, agotada, brillos, PNG o JPG). La hora sale del JSON: si está vacía, el flyer lleva solo el día.

Lo que cargás queda guardado en el navegador.

Para probarla en local hace falta un servidor, porque abriendo el archivo directo el navegador bloquea la exportación:

```bash
python -m http.server 4610
```

## Cómo está armado

Cada formato de un teatro tiene su carpeta en `teatros/<teatro>/<formato>/`, con:

- `base.png`: el PSD exportado con las capas variables ocultas (fondo, artista, logos, auspiciantes, textos fijos).
- Un PNG por cada elemento variable (`brillo1`, `lineaIzq`, `lineaDer`, `tachado`, `agotado`) y `elementos.json` con su posición en el PSD.

`teatros/<teatro>/teatro.json` define dónde va cada texto en cada formato: centro, línea base, tamaño, ancho máximo, etc. Esos valores salen de las capas de texto del PSD. La fecha, la nueva función y la fecha tachada se dibujan en el navegador con las fuentes del PSD (GC Grind y Grift).

## Agregar un teatro o un formato

1. En `tools/cfg/` creá un `.jsx` por PSD: la ruta del PSD, la carpeta de salida, las capas a ocultar (`hide`) y los elementos a exportar (`elements`). Cada capa se indica como su ruta de nombres dentro de los grupos. Usá los de Movie como modelo.
   Para armar un teatro nuevo a partir de los PSD de otro (como Candilejas 2 desde Movie) hay tres opciones más:
   - `quitar`: capas que no van en este teatro (logo y web del otro teatro).
   - `lienzo: { w, h }`: recorta o agranda el lienzo desde el centro.
   - `escalar: { w, h, lienzoW, lienzoH, fondo }`: achica todo el contenido a `w x h`, lo centra en un lienzo de `lienzoW x lienzoH` y pone debajo el fondo original sin achicar (las capas de `fondo`). Así salió el 1080x1080 de Candilejas desde el Post.
2. Con Photoshop abierto, exportá. El script trabaja sobre un duplicado y no modifica el PSD:
   ```bash
   powershell -ExecutionPolicy Bypass -File tools/export_capas.ps1 tools/cfg/<archivo>.jsx
   ```
3. Recortá los elementos y generá `elementos.json`:
   ```bash
   python tools/recortar.py teatros/<teatro>/<formato>
   ```
   Si el lienzo del PSD quedó un píxel más corto que la medida pedida (pasa con el 1200x629 de Paseo La Plaza), agregá `--alto 629` y completa el fondo repitiendo la última fila.
4. Agregá el formato en `teatro.json` y el teatro en `teatros/index.json`, con los nombres con los que aparece en el `lugar` de las fechas de la web (`"lugares"`).

Opciones de cada formato en `teatro.json`:

- `nombreFijo` + `tipo`: para teatros que piden un nombre y un tipo de archivo exactos (por ejemplo `img-05-PATOTERA.jpg`). El nombre sale de `archivo`.
- `fecha.tracking`: el tracking del texto de la fecha si no es 10 (en em: tracking 50 = `0.05`).
- `nueva` y `agotado`: si un formato no los tiene, esa opción no aparece en ese flyer.
- `pie` (en el teatro, el texto por defecto; en cada formato, `x`, `base` y `fs`): texto editable abajo a la izquierda.
- `productor` (en el teatro, `img` y `texto`; en cada formato, `der`, `abajo`, `lado`, `fs` y `separacion`): logo cuadrado del productor abajo a la derecha, centrado bajo su leyenda (la leyenda termina en `der`).
