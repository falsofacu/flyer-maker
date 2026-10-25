"""Recorta los PNG de elementos exportados por export_capas.jsx a su caja
visible y escribe elementos.json con la posición original de cada uno.

Con --alto N, si base.png es más bajo que N lo completa repitiendo la última
fila (para PSD con el lienzo un píxel más corto que la medida pedida)."""
import json, sys
from pathlib import Path
from PIL import Image

carpeta = Path(sys.argv[1])
if '--alto' in sys.argv:
    alto = int(sys.argv[sys.argv.index('--alto') + 1])
    base = Image.open(carpeta / 'base.png')
    if base.height < alto:
        nueva = Image.new(base.mode, (base.width, alto))
        nueva.paste(base, (0, 0))
        fila = base.crop((0, base.height - 1, base.width, base.height))
        for y in range(base.height, alto):
            nueva.paste(fila, (0, y))
        nueva.save(carpeta / 'base.png', optimize=True)
        print('base completada a', base.width, 'x', alto)
info = {}
for png in sorted(carpeta.glob('*.png')):
    if png.stem == 'base':
        continue
    im = Image.open(png).convert('RGBA')
    caja = im.getchannel('A').getbbox()
    if caja is None:
        print('vacío:', png); continue
    im.crop(caja).save(png, optimize=True)
    info[png.stem] = {'x': caja[0], 'y': caja[1], 'w': caja[2] - caja[0], 'h': caja[3] - caja[1]}
(carpeta / 'elementos.json').write_text(json.dumps(info, indent=2), encoding='utf-8')
print(carpeta.name, info)
