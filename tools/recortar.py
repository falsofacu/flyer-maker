"""Recorta los PNG de elementos exportados por export_capas.jsx a su caja
visible y escribe elementos.json con la posición original de cada uno."""
import json, sys
from pathlib import Path
from PIL import Image

carpeta = Path(sys.argv[1])
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
