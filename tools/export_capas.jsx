// Exporta desde Photoshop el fondo fijo (capas variables ocultas) y cada
// elemento variable aislado (con sus capas recortadas) como PNG transparente.
// Se ejecuta con CFG definido antes de este código (ver export_capas.ps1).
// Trabaja sobre un duplicado del documento y lo cierra sin guardar.
app.displayDialogs = DialogModes.NO;

function findDoc(fsName) {
    for (var i = 0; i < app.documents.length; i++) {
        try { if (app.documents[i].fullName.fsName.toLowerCase() == fsName.toLowerCase()) return app.documents[i]; } catch (e) {}
    }
    return null;
}
function byName(layers, name) {
    for (var i = 0; i < layers.length; i++) if (layers[i].name == name) return layers[i];
    return null;
}
function resolve(doc, path) {
    var c = doc, l = null;
    for (var i = 0; i < path.length; i++) {
        l = byName(c.layers, path[i]);
        if (!l) throw new Error('No encuentro la capa ' + path.join(' / '));
        c = l;
    }
    return l;
}
function snapshot(c, arr) {
    for (var i = 0; i < c.layers.length; i++) {
        var l = c.layers[i];
        arr.push([l, l.visible]);
        if (l.typename == 'LayerSet') snapshot(l, arr);
    }
    return arr;
}
function isGrouped(l) { try { return l.typename == 'ArtLayer' && l.grouped; } catch (e) { return false; } }
function isolate(doc, target) {
    // cadena de ancestros desde la raíz hasta target
    var chain = [], n = target;
    while (n && n != doc) { chain.unshift(n); n = n.parent; }
    var c = doc;
    for (var k = 0; k < chain.length; k++) {
        var node = chain[k], ls = c.layers, idx = -1;
        for (var i = 0; i < ls.length; i++) if (ls[i] == node) idx = i;
        for (var i = 0; i < ls.length; i++) ls[i].visible = (i == idx);
        if (node == target) {
            // capas recortadas a target: están arriba (índices menores) con grouped
            for (var j = idx - 1; j >= 0 && isGrouped(ls[j]); j--) ls[j].visible = true;
        }
        node.visible = true;
        c = node;
    }
}
function savePng(doc, path) {
    var o = new PNGSaveOptions();
    o.compression = 6;
    doc.saveAs(new File(path), o, true, Extension.LOWERCASE);
}

// Escala la imagen (con los estilos de capa) sin el diálogo de Tamaño de imagen.
function resizeImage(w, h) {
    var d = new ActionDescriptor();
    d.putUnitDouble(charIDToTypeID('Wdth'), charIDToTypeID('#Pxl'), w);
    d.putUnitDouble(charIDToTypeID('Hght'), charIDToTypeID('#Pxl'), h);
    d.putBoolean(stringIDToTypeID('scaleStyles'), true);
    d.putEnumerated(charIDToTypeID('Intr'), charIDToTypeID('Intp'), stringIDToTypeID('bicubicAutomatic'));
    executeAction(charIDToTypeID('ImgS'), d, DialogModes.NO);
}

// Achica todo el contenido a CFG.escalar.w x h y lo centra en un lienzo de
// lienzoW x lienzoH, con el fondo original (sin escalar) recortado debajo.
function escalar(doc, e) {
    var snap = snapshot(doc, []), fondo = [];
    for (var i = 0; i < e.fondo.length; i++) fondo.push(resolve(doc, e.fondo[i]));
    for (var i = 0; i < doc.layers.length; i++) doc.layers[i].visible = false;
    for (var i = 0; i < fondo.length; i++) fondo[i].visible = true;
    var tmp = Folder.temp + '/flyer-maker-fondo.png';
    savePng(doc, tmp);
    for (var i = 0; i < snap.length; i++) snap[i][0].visible = snap[i][1];
    for (var i = 0; i < fondo.length; i++) fondo[i].visible = false;

    resizeImage(e.w, e.h);
    doc.resizeCanvas(e.lienzoW, e.lienzoH, AnchorPosition.MIDDLECENTER);

    var bg = app.open(new File(tmp));
    bg.resizeCanvas(e.lienzoW, e.lienzoH, AnchorPosition.TOPCENTER);
    var capa = bg.activeLayer;
    if (capa.isBackgroundLayer) capa.isBackgroundLayer = false;
    capa.duplicate(doc, ElementPlacement.PLACEATEND);
    bg.close(SaveOptions.DONOTSAVECHANGES);
    app.activeDocument = doc;
}

var log = [];
var unidades = app.preferences.rulerUnits;
app.preferences.rulerUnits = Units.PIXELS;
var src = new File(CFG.psd);
var orig = findDoc(src.fsName), opened = false;
if (!orig) { orig = app.open(src); opened = true; }
var doc = orig.duplicate('flyer-maker-tmp', false);
app.activeDocument = doc;
try {
    // capas que no van en este teatro (ni en el fondo ni en los elementos)
    if (CFG.quitar) for (var i = 0; i < CFG.quitar.length; i++) resolve(doc, CFG.quitar[i]).visible = false;
    if (CFG.lienzo) doc.resizeCanvas(CFG.lienzo.w, CFG.lienzo.h, AnchorPosition.MIDDLECENTER);
    if (CFG.escalar) escalar(doc, CFG.escalar);
    var snap = snapshot(doc, []);
    var restore = function () { for (var i = 0; i < snap.length; i++) snap[i][0].visible = snap[i][1]; };
    for (var i = 0; i < CFG.hide.length; i++) resolve(doc, CFG.hide[i]).visible = false;
    savePng(doc, CFG.out + '/base.png');
    log.push('base');
    restore();
    for (var k in CFG.elements) {
        isolate(doc, resolve(doc, CFG.elements[k]));
        savePng(doc, CFG.out + '/' + k + '.png');
        log.push(k);
        restore();
    }
} finally {
    doc.close(SaveOptions.DONOTSAVECHANGES);
    if (opened) orig.close(SaveOptions.DONOTSAVECHANGES);
    app.preferences.rulerUnits = unidades;
}
'OK ' + log.join(',');
