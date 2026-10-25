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

let teatro = null;
let tarjetas = [];
let state = Object.assign(estadoInicial(), leerGuardado());

function estadoInicial() {
  const hoy = new Date().toISOString().slice(0, 10);
  return {
    teatro: 'movie',
    fecha: hoy, hora: '21:30', textoFecha: null,
    nueva: { on: false, texto: 'NUEVA FUNCIÓN' },
    agotado: { on: false, fecha: hoy, hora: '21:30', texto: null },
    brillos: {},
    salida: 'png',
  };
}

function leerGuardado() {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch { return {}; }
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
const textoPrincipal = () => state.textoFecha ?? textoDe(state.fecha, state.hora);
const textoAgotado = () => state.agotado.texto ?? textoDe(state.agotado.fecha, state.agotado.hora);

function nombreArchivo(f) {
  let cuando = 'sin fecha';
  if (state.fecha) {
    const [, m, d] = state.fecha.split('-').map(Number);
    cuando = `${d} ${MESES[m - 1].toLowerCase()}`;
  }
  return `${teatro.archivo} - ${f.archivo} - ${cuando}.${state.salida}`;
}

// ---------- carga ----------

function cargarImg(src) {
  return new Promise((ok, mal) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => mal(new Error('No pude cargar ' + src));
    im.src = src;
  });
}

async function cargarTeatro(id) {
  const dir = `teatros/${id}/`;
  const cfg = await (await fetch(dir + 'teatro.json')).json();
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

function fuente(ctx, fs, familia) {
  ctx.font = `${fs}px ${familia}`;
  ctx.letterSpacing = `${fs * TRACKING}px`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
}

function medir(ctx, str, fs, familia) {
  ctx.save();
  fuente(ctx, fs, familia);
  const m = ctx.measureText(str);
  ctx.restore();
  return m;
}

const ancho = (m) => m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
const caja = (m, cx, base) => ({
  L: cx - m.actualBoundingBoxLeft, R: cx + m.actualBoundingBoxRight,
  T: base - m.actualBoundingBoxAscent, B: base + m.actualBoundingBoxDescent,
});

function escribir(ctx, str, fs, familia, cx, base, conSombra) {
  ctx.save();
  fuente(ctx, fs, familia);
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

// Estira una imagen a lo ancho sin deformar sus puntas.
function tresPartes(ctx, im, x, y, w, izq, der) {
  const h = im.height, medio = im.width - izq - der;
  ctx.drawImage(im, 0, 0, izq, h, x, y, izq, h);
  ctx.drawImage(im, izq, 0, medio, h, x + izq, y, w - izq - der, h);
  ctx.drawImage(im, im.width - der, 0, der, h, x + w - der, y, der, h);
}

function dibujarFecha(ctx, f, hayAgotado) {
  const p = f.fecha, str = textoPrincipal();
  if (!str) return { L: p.ref[0], T: p.ref[1], R: p.ref[2], B: p.ref[3] };
  const m = medir(ctx, str, p.fs, FUENTE_FECHA);
  let fs = Math.min(p.fs, p.fs * p.maxW / ancho(m));
  if (!hayAgotado && p.techoSinAgotado) {
    // sin la línea de agotado, la fecha crece hacia arriba hasta ese techo
    const subida = m.actualBoundingBoxAscent / p.fs;
    fs = Math.min((p.base - p.techoSinAgotado) / subida, p.fs * p.maxW / ancho(m));
  }
  escribir(ctx, str, fs, FUENTE_FECHA, p.cx, p.base, true);
  return caja(medir(ctx, str, fs, FUENTE_FECHA), p.cx, p.base);
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
  const alto = n.fs * 1.2;
  const cap = medir(ctx, 'H', n.fs, FUENTE_TEXTO).actualBoundingBoxAscent;
  let L = Infinity, R = -Infinity;
  lineas.forEach((s, i) => {
    const base = n.cy - (lineas.length - 1) * alto / 2 + cap / 2 + i * alto;
    escribir(ctx, s, n.fs, FUENTE_TEXTO, n.cx, base, false);
    const k = caja(medir(ctx, s, n.fs, FUENTE_TEXTO), n.cx, base);
    L = Math.min(L, k.L); R = Math.max(R, k.R);
  });
  const li = f.img.lineaIzq, ld = f.img.lineaDer;
  const finIzq = L - n.separacion, iniDer = R + n.separacion;
  if (finIzq - n.bordeIzq > 20) ctx.drawImage(li, n.bordeIzq, n.cy - (li.height - 1) / 2, finIzq - n.bordeIzq, li.height);
  if (n.bordeDer - iniDer > 20) ctx.drawImage(ld, iniDer, n.cy - (ld.height - 1) / 2, n.bordeDer - iniDer, ld.height);
}

function estadoBrillos(f) {
  const clave = `${state.teatro}:${f.id}`;
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

function aBlob(canvas) {
  const tipo = state.salida === 'jpg' ? 'image/jpeg' : 'image/png';
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
  bajar(await aBlob(canvas), nombreArchivo(f));
}

async function descargarZip() {
  const boton = $('#zip');
  boton.disabled = true;
  try {
    const zip = new JSZip();
    for (const t of tarjetas) {
      dibujar(t.f, t.ctx);
      zip.file(nombreArchivo(t.f), await aBlob(t.canvas));
    }
    const nombre = nombreArchivo(tarjetas[0].f).replace(/ - [^-]+ - /, ' - ').replace(/\.\w+$/, '.zip');
    bajar(await zip.generateAsync({ type: 'blob' }), nombre);
  } finally {
    boton.disabled = false;
  }
}

// ---------- formulario ----------

function reflejarEstado() {
  $('#fecha').value = state.fecha;
  $('#hora').value = state.hora;
  $('#textoFecha').value = textoPrincipal();
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
  al('#fecha', 'input', (el) => { state.fecha = el.value; });
  al('#hora', 'input', (el) => { state.hora = el.value; });
  al('#textoFecha', 'input', (el) => { state.textoFecha = el.value; });
  al('#nuevaOn', 'change', (el) => { state.nueva.on = el.checked; });
  al('#nuevaTexto', 'input', (el) => { state.nueva.texto = el.value; });
  al('#agotadoOn', 'change', (el) => { state.agotado.on = el.checked; });
  al('#agFecha', 'input', (el) => { state.agotado.fecha = el.value; });
  al('#agHora', 'input', (el) => { state.agotado.hora = el.value; });
  al('#agTexto', 'input', (el) => { state.agotado.texto = el.value; });
  document.querySelectorAll('input[name=salida]').forEach((r) =>
    r.addEventListener('change', () => { state.salida = r.value; guardar(); }));
  document.querySelectorAll('[data-regen]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.regen === 'principal') state.textoFecha = null;
    else state.agotado.texto = null;
    reflejarEstado(); redibujar();
  }));
  $('#zip').addEventListener('click', descargarZip);
  $('#teatro').addEventListener('change', async (e) => {
    state.teatro = e.target.value;
    teatro = await cargarTeatro(state.teatro);
    armarTarjetas();
  });
}

async function iniciar() {
  const lista = await (await fetch('teatros/index.json')).json();
  if (!lista.some((t) => t.id === state.teatro)) state.teatro = lista[0].id;
  $('#teatro').innerHTML = lista.map((t) => `<option value="${t.id}">${t.nombre}</option>`).join('');
  $('#teatro').value = state.teatro;
  await Promise.all([
    document.fonts.load(`40px ${FUENTE_FECHA}`, 'ÁÉÍÓÚÑ0123456789'),
    document.fonts.load(`40px ${FUENTE_TEXTO}`, 'ÁÉÍÓÚÑ'),
  ]);
  teatro = await cargarTeatro(state.teatro);
  reflejarEstado();
  conectarFormulario();
  armarTarjetas();
}

iniciar().catch((e) => {
  $('#previews').textContent = 'Error: ' + e.message;
  console.error(e);
});
