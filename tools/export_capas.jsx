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

var log = [];
var src = new File(CFG.psd);
var orig = findDoc(src.fsName), opened = false;
if (!orig) { orig = app.open(src); opened = true; }
var doc = orig.duplicate('flyer-maker-tmp', false);
app.activeDocument = doc;
try {
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
}
'OK ' + log.join(',');
