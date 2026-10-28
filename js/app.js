'use strict';

// Flyer Maker: arma los flyers de cada teatro a partir de un fondo fijo
// exportado del PSD (base.png) más los elementos variables (fecha, nueva
// función, fecha agotada, brillos), que se dibujan acá en un canvas.

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO',
  'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const FUENTE_FECHA = '"GC Grind"';
const FUENTE_TEXTO = 'Grift';
const TRACKING = 0.01;          // tracking 10 de Photoshop = 10/1000 em
const BLUR_SOMBRA = 0.8;        // "tamaño" de la sombra de PS → shadowBlur del canvas
const CLAVE = 'flyer-maker:v1';

const $ = (s) => document.querySelector(s);

let teatro = null;               // el de la fecha activa, el que se ve
let listaTeatros = [];
let tarjetas = [];
let state = Object.assign(estadoInicial(), leerGuardado());
if (!(state.activa < state.fechas.length)) state.activa = 0;

function estadoInicial() {
  const hoy = new Date().toISOString().slice(0, 10);
  return {
    // cada fecha es una función en un teatro y sale como un juego completo de
    // flyers de ese teatro; "activa" es la que se ve en las vistas previas
    fechas: [{ teatro: 'movie', fecha: hoy, hora: '21:30', texto: null }], activa: 0,
    nueva: { on: false, texto: 'NUEVA FUNCIÓN' },
    agotado: { on: false, fecha: hoy, hora: '21:30', texto: null },
    pie: {},
    web: {},        // fechas de la web tildadas o destildadas a mano
    brillos: {},
    salida: 'png',
  };
}

function leerGuardado() {
  let g = {};
  try { g = JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch {}
  if (g.fecha !== undefined && !g.fechas) {
    // versión anterior: una sola fecha suelta
    g.fechas = [{ fecha: g.fecha, hora: g.hora, texto: g.textoFecha ?? null }];
    delete g.fecha; delete g.hora; delete g.textoFecha;
  }
  if (g.fechas) for (const fn of g.fechas) fn.teatro ||= g.teatro || 'movie';
  delete g.teatro;   // antes había un solo teatro para todo
  return g;
}
function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(state)); } catch {}
}

// ---------- textos ----------

function textoDe(fecha, hora) {
  if (!fecha) return '';
  const [, m, d] = fecha.split('-').map(Number);
  return `${d} DE ${MESES[m - 1]}` + (hora ? ` - ${hora} H` : '');
}
// La función que se dibuja: la activa, o la que se está exportando.
let enCurso = null;
const funcionEnCurso = () => enCurso || state.fechas[state.activa];

const textoFuncion = (fn) => fn.texto ?? textoDe(fn.fecha, fn.hora);
const textoPrincipal = () => textoFuncion(funcionEnCurso());

// Un formato puede armar la fecha a su manera con fecha.plantilla (por ejemplo
// "{dia} DE {mes} - PASEO LA PLAZA" en vez de la hora). Si el texto se
// editó a mano, manda el texto editado.
function textoFechaDe(f) {
  const fn = funcionEnCurso(), plantilla = f.fecha.plantilla;
  if (fn.texto != null || !plantilla || !fn.fecha) return textoFuncion(fn);
  const [, m, d] = fn.fecha.split('-').map(Number);
  return plantilla.replace('{dia}', d).replace('{mes}', MESES[m - 1]).replace('{hora}', fn.hora || '');
}
const textoAgotado = () => state.agotado.texto ?? textoDe(state.agotado.fecha, state.agotado.hora);
const textoPie = () => state.pie[teatro.id] ?? teatro.pie;

// "31 octubre" para nombres de archivo; con la hora si hay dos funciones el
// mismo día en el mismo teatro.
function cuando(fn = funcionEnCurso(), lista = state.fechas) {
  if (!fn.fecha) return `fecha ${lista.indexOf(fn) + 1}`;
  const [, m, d] = fn.fecha.split('-').map(Number);
  const dia = `${d} ${MESES[m - 1].toLowerCase()}`;
  const repetida = lista.some((o) => o !== fn && o.fecha === fn.fecha && o.teatro === fn.teatro);
  return repetida && fn.hora ? `${dia} ${fn.hora.replace(':', '.')}` : dia;
}

// Algunos teatros piden un nombre y un tipo de archivo fijos por formato.
const tipoSalida = (f) => f.tipo || state.salida;
const nombreArchivo = (f, dia = cuando()) => (f.nombreFijo ? f.archivo : `${teatro.archivo} - ${f.archivo} - ${dia}`)
  + '.' + tipoSalida(f);

// ---------- carga ----------

function cargarImg(src) {
  return new Promise((ok, mal) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => mal(new Error('No pude cargar ' + src));
    im.src = src;
  });
}

// Cada teatro se carga una sola vez (imágenes incluidas) y queda en memoria.
const cacheTeatros = {};
const cargarTeatro = (id) => (cacheTeatros[id] ||= leerTeatro(id).catch((e) => {
  delete cacheTeatros[id];
  throw e;
}));

async function leerTeatro(id) {
  const dir = `teatros/${id}/`;
  const cfg = await (await fetch(dir + 'teatro.json')).json();
  cfg.id = id;
  cfg.img = {};
  if (cfg.productor) cfg.img.productor = await cargarImg(dir + cfg.productor.img);
  await Promise.all(cfg.formatos.map(async (f) => {
    const sub = `${dir}${f.id}/`;
    f.elementos = await (await fetch(sub + 'elementos.json')).json();
    f.img = {};
    const nombres = ['base', ...Object.keys(f.elementos)];
    await Promise.all(nombres.map(async (n) => { f.img[n] = await cargarImg(sub + n + '.png'); }));
  }));
  return cfg;
}

// ---------- dibujo ----------

function fuente(ctx, fs, familia, tracking = TRACKING, peso = 400) {
  ctx.font = `${peso} ${fs}px ${familia}`;
  ctx.letterSpacing = `${fs * tracking}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
}

function medir(ctx, str, fs, familia, tracking) {
  ctx.save();
  fuente(ctx, fs, familia, tracking);
  const m = ctx.measureText(str);
  ctx.restore();
  return m;
}

const ancho = (m) => m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
const caja = (m, cx, base) => ({
  L: cx - m.actualBoundingBoxLeft, R: cx + m.actualBoundingBoxRight,
  T: base - m.actualBoundingBoxAscent, B: base + m.actualBoundingBoxDescent,
});

function escribir(ctx, str, fs, familia, cx, base, conSombra, tracking) {
  ctx.save();
  fuente(ctx, fs, familia, tracking);
  ctx.fillStyle = '#fff';
  if (conSombra) {
    const s = teatro.sombra, a = s.angulo * Math.PI / 180;
    ctx.shadowColor = `rgba(0,0,0,${s.opacidad})`;
    ctx.shadowBlur = s.tamano * BLUR_SOMBRA;
    ctx.shadowOffsetX = -Math.cos(a) * s.distancia;
    ctx.shadowOffsetY = Math.sin(a) * s.distancia;
  }
  ctx.fillText(str, cx, base);
  ctx.restore();
}

// Textos chicos fijos (pie, leyenda del productor): halo oscuro suave en vez
// de la sombra de la fecha, para despegarlos del fondo.
function escribirSuelto(ctx, str, fs, peso, x, base, alinear) {
  ctx.save();
  fuente(ctx, fs, FUENTE_TEXTO, TRACKING, peso);
  ctx.textAlign = alinear;
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,.6)';
  ctx.shadowBlur = fs * 0.8;
  ctx.fillText(str, x, base);
  ctx.restore();
}

function dibujarPie(ctx, f) {
  const str = textoPie().trim();
  if (str) escribirSuelto(ctx, str, f.pie.fs, 600, f.pie.x, f.pie.base, 'left');
}

// Logo del productor abajo a la derecha: la leyenda termina en "der" y el
// logo va centrado debajo de ella.
function dibujarProductor(ctx, f) {
  const p = f.productor, y = p.abajo - p.lado;
  const leyenda = teatro.productor.texto;
  const m = medir(ctx, leyenda, p.fs, FUENTE_TEXTO);
  const centro = p.der - ancho(m) / 2;
  escribirSuelto(ctx, leyenda, p.fs, 400, centro, y - p.separacion, 'center');
  ctx.drawImage(teatro.img.productor, centro - p.lado / 2, y, p.lado, p.lado);
}

// Estira una imagen a lo ancho sin deformar sus puntas.
function tresPartes(ctx, im, x, y, w, izq, der) {
  const h = im.height, medio = im.width - izq - der;
  ctx.drawImage(im, 0, 0, izq, h, x, y, izq, h);
  ctx.drawImage(im, izq, 0, medio, h, x + izq, y, w - izq - der, h);
  ctx.drawImage(im, im.width - der, 0, der, h, x + w - der, y, der, h);
}

function dibujarFecha(ctx, f, hayAgotado) {
  const p = f.fecha, str = textoFechaDe(f);
  if (!str) return { L: p.ref[0], T: p.ref[1], R: p.ref[2], B: p.ref[3] };
  const m = medir(ctx, str, p.fs, FUENTE_FECHA, p.tracking);
  // el tamaño del PSD es el tope: solo se achica si no entra a lo ancho
  const fs = Math.min(p.fs, p.fs * p.maxW / ancho(m));
  let base = p.base;
  if (!hayAgotado && p.techoSinAgotado) {
    // sin la línea de agotado la fecha se centra en el espacio que queda libre
    const subida = m.actualBoundingBoxAscent * fs / p.fs;
    base = (p.techoSinAgotado + p.base + subida) / 2;
  }
  escribir(ctx, str, fs, FUENTE_FECHA, p.cx, base, true, p.tracking);
  return caja(medir(ctx, str, fs, FUENTE_FECHA, p.tracking), p.cx, base);
}

function dibujarAgotado(ctx, f, str) {
  const a = f.agotado, cx = f.fecha.cx + a.dx;
  const fs = Math.min(a.fs, a.fs * a.maxW / ancho(medir(ctx, str, a.fs, FUENTE_FECHA)));
  escribir(ctx, str, fs, FUENTE_FECHA, cx, a.base, true);
  const k = caja(medir(ctx, str, fs, FUENTE_FECHA), cx, a.base);

  const t = a.tachado, im = f.img.tachado;
  const izq = k.L - t.extIzq, der = k.R + t.extDer;
  tresPartes(ctx, im, izq - t.padIzq, (k.T + k.B) / 2 + t.dy,
    der - izq + t.padIzq + t.padDer, t.padIzq + 6, t.padDer + 6);

  ctx.drawImage(f.img.agotado, k.R + a.sello.dx, k.T + a.sello.dy);
}

function dibujarNueva(ctx, f) {
  const n = f.nueva;
  const lineas = state.nueva.texto.split('\n').map((s) => s.trim()).filter(Boolean);
  if (!lineas.length) return;
  // el bloque tiene que entrar entre techo y piso (arriba de las cabezas):
  // si no entra se achica, y si se pasa de un lado se corre
  let fs = n.fs;
  const capDe = (fs) => medir(ctx, 'H', fs, FUENTE_TEXTO).actualBoundingBoxAscent;
  let altoBloque = (lineas.length - 1) * fs * 1.2 + capDe(fs);
  if (altoBloque > n.piso - n.techo) {
    fs *= (n.piso - n.techo) / altoBloque;
    altoBloque = n.piso - n.techo;
  }
  const cy = Math.min(Math.max(n.cy, n.techo + altoBloque / 2), n.piso - altoBloque / 2);
  const alto = fs * 1.2, cap = capDe(fs);
  let L = Infinity, R = -Infinity;
  lineas.forEach((s, i) => {
    const base = cy - (lineas.length - 1) * alto / 2 + cap / 2 + i * alto;
    escribir(ctx, s, fs, FUENTE_TEXTO, n.cx, base, false);
    const k = caja(medir(ctx, s, fs, FUENTE_TEXTO), n.cx, base);
    L = Math.min(L, k.L); R = Math.max(R, k.R);
  });
  const li = f.img.lineaIzq, ld = f.img.lineaDer;
  const finIzq = L - n.separacion, iniDer = R + n.separacion;
  if (finIzq - n.bordeIzq > 20) ctx.drawImage(li, n.bordeIzq, cy - (li.height - 1) / 2, finIzq - n.bordeIzq, li.height);
  if (n.bordeDer - iniDer > 20) ctx.drawImage(ld, iniDer, cy - (ld.height - 1) / 2, n.bordeDer - iniDer, ld.height);
}

function estadoBrillos(f) {
  const clave = `${teatro.id}:${f.id}`;
  return (state.brillos[clave] ||= {});
}

// Cada brillo guarda su lugar relativo a la caja de la fecha del PSD, así
// sigue a la fecha cuando cambia de largo; lo arrastrado se suma encima.
function posicionesBrillos(f, k) {
  const [rL, rT, rR, rB] = f.fecha.ref, est = estadoBrillos(f);
  return f.brillos.map((id) => {
    const e = f.elementos[id], s = est[id] || {};
    const fx = (e.x + e.w / 2 - rL) / (rR - rL), fy = (e.y + e.h / 2 - rT) / (rB - rT);
    const cx = k.L + fx * (k.R - k.L) + (s.dx || 0);
    const cy = k.T + fy * (k.B - k.T) + (s.dy || 0);
    return { id, img: f.img[id], on: s.on !== false, cx, cy, x: cx - e.w / 2, y: cy - e.h / 2, r: Math.max(e.w, e.h) / 3 };
  });
}

function dibujar(f, ctx) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, f.w, f.h);
  ctx.drawImage(f.img.base, 0, 0);
  if (f.pie && teatro.pie) dibujarPie(ctx, f);
  if (f.productor && teatro.productor) dibujarProductor(ctx, f);
  if (state.nueva.on && f.nueva) dibujarNueva(ctx, f);
  const ag = state.agotado.on && f.agotado ? textoAgotado() : '';
  if (ag) dibujarAgotado(ctx, f, ag);
  const k = dibujarFecha(ctx, f, !!ag);
  f.posBrillos = posicionesBrillos(f, k);
  ctx.globalCompositeOperation = 'screen';
  for (const b of f.posBrillos) if (b.on) ctx.drawImage(b.img, b.x, b.y);
  ctx.globalCompositeOperation = 'source-over';
}

let pendiente = 0;
function redibujar() {
  if (pendiente) return;
  pendiente = requestAnimationFrame(() => {
    pendiente = 0;
    if (exportando) return;
    for (const t of tarjetas) dibujar(t.f, t.ctx);
    guardar();
  });
}

// ---------- vistas previas ----------

function armarTarjetas() {
  const cont = $('#previews');
  cont.textContent = '';
  tarjetas = teatro.formatos.map((f) => {
    const nodo = $('#tplCard').content.firstElementChild.cloneNode(true);
    if (f.w / f.h > 1.2) nodo.classList.add('ancho');
    nodo.querySelector('h3').innerHTML = `${f.nombre}<small>${f.w}×${f.h}</small>`;
    const canvas = nodo.querySelector('canvas');
    canvas.width = f.w; canvas.height = f.h;
    const ctx = canvas.getContext('2d');
    nodo.querySelector('.dl').onclick = () => descargar(f, canvas);
    armarControlesBrillos(nodo.querySelector('.brillos'), f);
    activarArrastre(canvas, f);
    cont.appendChild(nodo);
    return { f, canvas, ctx };
  });
  redibujar();
}

function armarControlesBrillos(pie, f) {
  pie.textContent = '';
  const est = estadoBrillos(f);
  f.brillos.forEach((id, i) => {
    const l = document.createElement('label');
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.checked = (est[id] || {}).on !== false;
    c.onchange = () => { (est[id] ||= {}).on = c.checked; redibujar(); };
    l.append(c, `Brillo ${i + 1}`);
    pie.appendChild(l);
  });
  const r = document.createElement('button');
  r.type = 'button'; r.className = 'link'; r.textContent = 'Restablecer posición';
  r.onclick = () => {
    for (const id of f.brillos) if (est[id]) { est[id].dx = 0; est[id].dy = 0; }
    redibujar();
  };
  pie.appendChild(r);
}

function activarArrastre(canvas, f) {
  let agarrado = null, ultimo = null;
  const punto = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * f.w / r.width, y: (e.clientY - r.top) * f.h / r.height };
  };
  const tocado = (p) => (f.posBrillos || []).filter((b) => b.on)
    .find((b) => Math.hypot(p.x - b.cx, p.y - b.cy) < b.r);

  canvas.addEventListener('pointerdown', (e) => {
    const p = punto(e), b = tocado(p);
    if (!b) return;
    agarrado = b.id; ultimo = p;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('arrastrando');
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = punto(e);
    if (!agarrado) { canvas.classList.toggle('sobre', !!tocado(p)); return; }
    const s = (estadoBrillos(f)[agarrado] ||= {});
    s.dx = (s.dx || 0) + p.x - ultimo.x;
    s.dy = (s.dy || 0) + p.y - ultimo.y;
    ultimo = p;
    redibujar();
  });
  const soltar = () => { agarrado = null; canvas.classList.remove('arrastrando'); };
  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', soltar);
}

// ---------- exportar ----------

function aBlob(f, canvas) {
  const tipo = tipoSalida(f) === 'jpg' ? 'image/jpeg' : 'image/png';
  return new Promise((ok) => canvas.toBlob(ok, tipo, 0.95));
}

function bajar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function descargar(f, canvas) {
  dibujar(f, canvas.getContext('2d'));
  bajar(await aBlob(f, canvas), nombreArchivo(f));
}

// Exporta un .zip con un juego de flyers por función ({ teatro, fecha, hora,
// texto }). Cada una se dibuja con su teatro en canvas aparte, no en las
// vistas previas.
let exportando = false;
async function exportar(lista, boton) {
  if (!lista.length) return;
  boton.disabled = true;
  exportando = true;
  const visible = teatro, n = lista.length;
  try {
    const zip = new JSZip();
    for (const fn of lista) {
      enCurso = fn;
      teatro = await cargarTeatro(fn.teatro);
      const dia = cuando(fn, lista);
      // con varias fechas, una carpeta por función (los nombres fijos se repetirían)
      const carpeta = n > 1 ? `${teatro.archivo} - ${dia}/` : '';
      for (const f of teatro.formatos) {
        const canvas = document.createElement('canvas');
        canvas.width = f.w; canvas.height = f.h;
        dibujar(f, canvas.getContext('2d'));
        zip.file(carpeta + nombreArchivo(f, dia), await aBlob(f, canvas));
      }
    }
    const unSoloTeatro = new Set(lista.map((fn) => fn.teatro)).size === 1;
    const nombre = unSoloTeatro ? `${teatro.archivo} - ${n > 1 ? `${n} fechas` : cuando(lista[0], lista)}` : `Flyers - ${n} fechas`;
    bajar(await zip.generateAsync({ type: 'blob' }), `${nombre}.zip`);
  } finally {
    enCurso = null;
    teatro = visible;
    exportando = false;
    boton.disabled = false;
    redibujar();
  }
}

const descargarZip = () => exportar(state.fechas, $('#zip'));

// ---------- fechas de la web de Yipio ----------

// Las fechas salen del mismo JSON que usa yipio.com.uy, incluidas las
// que tienen "visible": false (todavía no anunciadas en la web).
const FECHAS_WEB = 'https://yipio.com.uy/data/fechas.json';
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
let fechasWeb = null;

const normalizar = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// "Teatro Movie" → movie, según los "lugares" de teatros/index.json
function teatroDeLugar(lugar) {
  const l = normalizar(lugar);
  const exacto = listaTeatros.find((t) => (t.lugares || []).some((a) => normalizar(a) === l));
  return exacto || listaTeatros.find((t) => (t.lugares || []).some((a) => l.includes(normalizar(a))));
}

// "2027-1-8" → "2027-01-08"
const isoFecha = (s) => (s || '').split('-').map((p, i) => (i ? p.padStart(2, '0') : p)).join('-');

const claveWeb = (f) => `${f.id}|${f.fecha}|${f.hora}`;

async function cargarFechasWeb() {
  $('#webEstado').textContent = 'Cargando fechas de yipio.com.uy…';
  try {
    const r = await fetch(FECHAS_WEB, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const hoy = new Date().toISOString().slice(0, 10);
    fechasWeb = (await r.json()).map((f) => {
      const fecha = isoFecha(f.fecha), t = teatroDeLugar(f.lugar);
      return { ...f, fecha, hora: f.hora || '', teatro: t && t.id, pasada: fecha < hoy };
    }).sort((a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`));
    $('#webEstado').textContent = `${fechasWeb.length} fechas de yipio.com.uy.`;
  } catch {
    fechasWeb = null;
    $('#webEstado').textContent = 'No pude cargar las fechas de yipio.com.uy (¿sin conexión?).';
  }
  armarFechasWeb();
}

// Por defecto van tildadas las próximas que no están agotadas y tienen teatro.
const elegidaPorDefecto = (f) => !!f.teatro && !f.pasada && !f.agotado;
const elegida = (f) => !!f.teatro && (state.web[claveWeb(f)] ?? elegidaPorDefecto(f));

function armarFechasWeb() {
  const cont = $('#webLista');
  cont.textContent = '';
  for (const f of fechasWeb || []) {
    const [y, m, d] = f.fecha.split('-').map(Number);
    const fila = document.createElement('label');
    fila.className = 'web-fecha' + (f.pasada ? ' pasada' : '');
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.checked = elegida(f);
    c.disabled = !f.teatro;
    c.onchange = () => { state.web[claveWeb(f)] = c.checked; guardar(); actualizarWeb(); };
    const marcas = [
      f.pasada && 'pasada', f.agotado && 'agotada', f.visible === false && 'oculta en la web',
      !f.teatro && 'sin plantilla para este teatro', !f.hora && 'sin hora',
    ].filter(Boolean).map((t) => `<span class="marca">${t}</span>`).join('');
    const info = document.createElement('span');
    info.innerHTML = `<b>${d} ${MESES_CORTOS[m - 1]} ${y}${f.hora ? ` · ${f.hora}` : ''}</b>`
      + ` ${f.lugar || '?'}${f.ciudad ? `, ${f.ciudad}` : ''} ${marcas}`;
    fila.append(c, info);
    cont.appendChild(fila);
  }
  actualizarWeb();
}

function actualizarWeb() {
  const n = (fechasWeb || []).filter(elegida).length;
  const b = $('#webExportar');
  b.disabled = !n;
  b.textContent = n ? `Exportar ${n} ${n === 1 ? 'fecha' : 'fechas'} (.zip)` : 'Elegí al menos una fecha';
}

function elegirWeb(criterio) {
  for (const f of fechasWeb || []) if (f.teatro) state.web[claveWeb(f)] = criterio(f);
  guardar();
  armarFechasWeb();
}

const exportarWeb = () => exportar(
  fechasWeb.filter(elegida).map((f) => ({ teatro: f.teatro, fecha: f.fecha, hora: f.hora, texto: null })),
  $('#webExportar'));

// ---------- formulario ----------

function sumarDia(fecha) {
  if (!fecha) return '';
  const d = new Date(fecha + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Una fila por fecha. Se rearma al agregar o quitar; al escribir solo se
// actualiza el estado, para no perder el foco.
function armarFechas() {
  const cont = $('#fechas');
  cont.textContent = '';
  state.fechas.forEach((fn, i) => {
    const fila = $('#tplFecha').content.firstElementChild.cloneNode(true);
    const [sel, f, h, t] = ['.teatro', '.f', '.h', '.t'].map((s) => fila.querySelector(s));
    fila.classList.toggle('activa', i === state.activa);
    fila.querySelector('.n').textContent = state.fechas.length > 1 ? `Fecha ${i + 1}` : 'Fecha';
    sel.innerHTML = listaTeatros.map((o) => `<option value="${o.id}">${o.nombre}</option>`).join('');
    sel.value = fn.teatro;
    sel.addEventListener('change', () => {
      fn.teatro = sel.value;
      if (i === state.activa) mostrarActiva();
      guardar();
    });
    f.value = fn.fecha; h.value = fn.hora; t.value = textoFuncion(fn);
    const cambio = () => { t.value = textoFuncion(fn); redibujar(); actualizarZip(); };
    f.addEventListener('input', () => { fn.fecha = f.value; cambio(); });
    h.addEventListener('input', () => { fn.hora = h.value; cambio(); });
    t.addEventListener('input', () => { fn.texto = t.value; redibujar(); });
    fila.querySelector('.regen').onclick = () => { fn.texto = null; cambio(); };
    const quitar = fila.querySelector('.quitar');
    quitar.hidden = state.fechas.length < 2;
    quitar.onclick = (e) => {
      e.stopPropagation();
      state.fechas.splice(i, 1);
      if (state.activa >= i && state.activa > 0) state.activa--;
      armarFechas(); mostrarActiva();
    };
    // tocar una fila la muestra en las vistas previas
    fila.addEventListener('focusin', () => verFecha(i));
    fila.addEventListener('pointerdown', () => verFecha(i));
    cont.appendChild(fila);
  });
  actualizarZip();
}

function verFecha(i) {
  if (state.activa === i) return;
  state.activa = i;
  document.querySelectorAll('#fechas .fecha').forEach((el, j) => el.classList.toggle('activa', j === i));
  mostrarActiva();
}

// Si la fecha activa es de otro teatro, cambia las vistas previas a ese teatro.
async function mostrarActiva() {
  const id = state.fechas[state.activa].teatro;
  if (teatro && teatro.id === id) { redibujar(); return; }
  const t = await cargarTeatro(id);
  if (state.fechas[state.activa].teatro !== id) return;   // cambió mientras cargaba
  teatro = t;
  reflejarEstado();
  armarTarjetas();
}

function actualizarZip() {
  const n = state.fechas.length;
  $('#zip').textContent = n > 1 ? `Descargar las ${n} fechas (.zip)` : 'Descargar todos (.zip)';
}

function reflejarEstado() {
  $('#seccionPie').hidden = !teatro.pie;
  if (teatro.pie) $('#pieTexto').value = textoPie();
  $('#nuevaOn').checked = state.nueva.on;
  $('#nuevaTexto').value = state.nueva.texto;
  $('#agotadoOn').checked = state.agotado.on;
  $('#agFecha').value = state.agotado.fecha;
  $('#agHora').value = state.agotado.hora;
  $('#agTexto').value = textoAgotado();
  document.querySelectorAll('input[name=salida]').forEach((r) => { r.checked = r.value === state.salida; });
  document.querySelectorAll('[data-si]').forEach((d) => d.classList.toggle('off', !$('#' + d.dataset.si).checked));
}

function conectarFormulario() {
  const al = (sel, ev, fn) => $(sel).addEventListener(ev, () => { fn($(sel)); reflejarEstado(); redibujar(); });
  $('#agregarFecha').addEventListener('click', () => {
    const ultima = state.fechas[state.fechas.length - 1];
    state.fechas.push({ teatro: ultima.teatro, fecha: sumarDia(ultima.fecha), hora: ultima.hora, texto: null });
    state.activa = state.fechas.length - 1;
    armarFechas(); mostrarActiva();
    $('#fechas .fecha:last-child .f').focus();
  });
  al('#pieTexto', 'input', (el) => { state.pie[teatro.id] = el.value; });
  $('#pieRegen').addEventListener('click', () => { delete state.pie[teatro.id]; reflejarEstado(); redibujar(); });
  al('#nuevaOn', 'change', (el) => { state.nueva.on = el.checked; });
  al('#nuevaTexto', 'input', (el) => { state.nueva.texto = el.value; });
  al('#agotadoOn', 'change', (el) => { state.agotado.on = el.checked; });
  al('#agFecha', 'input', (el) => { state.agotado.fecha = el.value; });
  al('#agHora', 'input', (el) => { state.agotado.hora = el.value; });
  al('#agTexto', 'input', (el) => { state.agotado.texto = el.value; });
  document.querySelectorAll('input[name=salida]').forEach((r) =>
    r.addEventListener('change', () => { state.salida = r.value; guardar(); }));
  $('#agRegen').addEventListener('click', () => { state.agotado.texto = null; reflejarEstado(); redibujar(); });
  $('#zip').addEventListener('click', descargarZip);
  $('#webExportar').addEventListener('click', exportarWeb);
  $('#webRecargar').addEventListener('click', cargarFechasWeb);
  $('#webTodas').addEventListener('click', () => elegirWeb(() => true));
  $('#webNinguna').addEventListener('click', () => elegirWeb(() => false));
  $('#webProximas').addEventListener('click', () => elegirWeb(elegidaPorDefecto));
}

async function iniciar() {
  listaTeatros = await (await fetch('teatros/index.json')).json();
  for (const fn of state.fechas) {
    if (!listaTeatros.some((t) => t.id === fn.teatro)) fn.teatro = listaTeatros[0].id;
  }
  await Promise.all([
    document.fonts.load(`40px ${FUENTE_FECHA}`, 'ÁÉÍÓÚÑ0123456789'),
    document.fonts.load(`40px ${FUENTE_TEXTO}`, 'ÁÉÍÓÚÑ'),
    document.fonts.load(`600 40px ${FUENTE_TEXTO}`, 'ÁÉÍÓÚÑ–'),
  ]);
  teatro = await cargarTeatro(state.fechas[state.activa].teatro);
  reflejarEstado();
  armarFechas();
  conectarFormulario();
  armarTarjetas();
  cargarFechasWeb();
}

iniciar().catch((e) => {
  $('#previews').textContent = 'Error: ' + e.message;
  console.error(e);
});
