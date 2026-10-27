// PDF direkt im Browser erstellen (iPhone und Web-Version). Die Mac-App nutzt weiterhin den Druck von macOS.
// Jede Seite wird als Bild gerendert und in ein A4-PDF gelegt. Der Vertrag wird an Absatzgrenzen
// auf mehrere Seiten verteilt, mit 16 mm Rand oben und 18 mm unten wie in der Mac-App.
(function (global) {
  'use strict';
  const MM = 96 / 25.4;              // CSS-Pixel pro Millimeter
  const MAX_PIXEL = 15e6;            // iOS erlaubt Canvas bis ca. 16,7 Mio. Pixel
  let laden = null;

  function skript(src) {
    return new Promise((ok, fehler) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = () => fehler(new Error('Datei ' + src + ' konnte nicht geladen werden'));
      document.head.appendChild(s);
    });
  }
  function bibliotheken() {
    if (global.jspdf) return Promise.resolve();
    return laden || (laden = skript('vendor/jspdf.umd.min.js'));
  }

  async function rahmen(html) {
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;left:-12000px;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(f);
    await new Promise(ok => { f.onload = ok; f.srcdoc = html; });
    const doc = f.contentDocument;
    try { await doc.fonts.ready; } catch (e) { /* ohne Schriften weiter */ }
    await Promise.all([...doc.images].map(i => i.complete ? 0 : new Promise(ok => { i.onload = i.onerror = ok; })));
    f.style.height = Math.ceil(doc.documentElement.scrollHeight) + 'px';
    await new Promise(ok => setTimeout(ok, 50));
    return f;
  }

  function massstab(breite, hoehe, wunsch) {
    return Math.max(1, Math.min(wunsch, Math.sqrt(MAX_PIXEL / (breite * hoehe))));
  }

  // Stellen, an denen nicht getrennt werden darf: Absätze, Listenpunkte, Tabellenzeilen, Unterschriften.
  // Titel (break-after: avoid) bleiben mit dem folgenden Block zusammen.
  function bloecke(wurzel) {
    const oben = wurzel.getBoundingClientRect().top, liste = [];
    const win = wurzel.ownerDocument.defaultView;
    wurzel.querySelectorAll('*').forEach(el => {
      const st = win.getComputedStyle(el);
      const atom = /^(P|LI|TR|H1|H2|H3|IMG|svg|HEADER)$/i.test(el.tagName) || st.breakInside === 'avoid' || st.pageBreakInside === 'avoid';
      if (!atom) return;
      const r = el.getBoundingClientRect();
      if (r.height <= 0) return;
      liste.push({ a: r.top - oben, b: r.bottom - oben, zusammen: st.breakAfter === 'avoid' || st.pageBreakAfter === 'avoid' });
    });
    liste.sort((x, y) => x.a - y.a);
    liste.forEach((x, i) => {
      if (!x.zusammen) return;
      const n = liste.slice(i + 1).find(y => y.a >= x.b - 1);
      if (n) x.b = n.b;
    });
    return liste;
  }
  function seitenumbrueche(liste, hoehe, seite) {
    const grenzen = [...new Set(liste.flatMap(x => [x.a, x.b]))].sort((p, q) => p - q);
    const frei = y => !liste.some(x => x.a < y - 0.5 && x.b > y + 0.5);
    const seiten = []; let start = 0;
    while (start < hoehe - 1) {
      const max = start + seite;
      if (max >= hoehe) { seiten.push([start, hoehe]); break; }
      let ende = 0;
      for (const g of grenzen) if (g > start + seite * 0.3 && g <= max && frei(g)) ende = g;
      if (!ende) ende = max;               // ein Block grösser als eine Seite: hart trennen
      seiten.push([start, ende]); start = ende;
    }
    return seiten;
  }

  // Safari zeichnet Text auf einem Canvas unsichtbar, solange die Schrift im Hauptdokument noch nicht
  // geladen ist. Darum alle Schriften der Dokumente vorher hier laden (nicht nur im Vorschau-Rahmen).
  const SCHRIFTEN = ['300 16px Newsreader', '400 16px Newsreader', '500 16px Newsreader', '600 16px Newsreader', '700 16px Newsreader',
    'italic 400 16px Newsreader', 'italic 600 16px Newsreader', '500 16px Cinzel', '600 16px Cinzel', '700 16px Corinthia'];
  // Gibt zurück, ob die Schriften wirklich bereit sind. Sonst weicht das PDF auf Systemschriften aus,
  // damit der Text auf jeden Fall sichtbar ist (lieber andere Schrift als leere Seite).
  async function schriftenLaden() {
    if (!document.fonts || !document.fonts.load) return false;
    try {
      await Promise.race([Promise.all(SCHRIFTEN.map(f => document.fonts.load(f, 'Aa'))), new Promise(ok => setTimeout(ok, 6000))]);
      await document.fonts.ready;
      return ['400 16px Newsreader', '500 16px Cinzel', '700 16px Corinthia'].every(f => document.fonts.check(f, 'Aa'));
    } catch (e) { return false; }
  }
  const ERSATZ = '*{font-family:Georgia,"Times New Roman",serif!important}.qr-zahlteil,.qr-zahlteil *{font-family:Helvetica,Arial,sans-serif!important}';

  // ---------- PDF direkt zeichnen (Vektor) ----------
  // Das Dokument wird in einem unsichtbaren Rahmen mit denselben Schriften gesetzt, die auch ins PDF
  // kommen. Danach liest die App jede Fläche, Linie, jedes Bild und jedes Wort mit seiner Position aus
  // und zeichnet sie mit jsPDF nach. So stimmen Text und Linien exakt überein, und Safari muss nichts
  // in ein Bild umwandeln.
  const SCHNITTE = {
    N400: 'Newsreader_400Regular', N400i: 'Newsreader_400Regular_Italic', N500: 'Newsreader_500Medium', N500i: 'Newsreader_500Medium_Italic',
    N600: 'Newsreader_600SemiBold', N600i: 'Newsreader_600SemiBold_Italic', C500: 'Cinzel_500Medium', C600: 'Cinzel_600SemiBold', K700: 'Corinthia_700Bold'
  };
  const FACES = [['PDF Newsreader', 400, 'normal', 'N400'], ['PDF Newsreader', 400, 'italic', 'N400i'], ['PDF Newsreader', 500, 'normal', 'N500'], ['PDF Newsreader', 500, 'italic', 'N500i'],
    ['PDF Newsreader', 600, 'normal', 'N600'], ['PDF Newsreader', 600, 'italic', 'N600i'], ['PDF Newsreader', 700, 'normal', 'N600'], ['PDF Newsreader', 300, 'normal', 'N400'],
    ['PDF Cinzel', 500, 'normal', 'C500'], ['PDF Cinzel', 600, 'normal', 'C600'], ['PDF Corinthia', 700, 'normal', 'K700']];
  const fontCss = () => FACES.map(([fam, w, st, k]) => '@font-face{font-family:"' + fam + '";font-weight:' + w + ';font-style:' + st + ';src:url(vendor/fonts/' + SCHNITTE[k] + '.ttf) format("truetype")}').join('') +
    'html{-webkit-text-size-adjust:100%;text-size-adjust:100%}';
  function vorbereiten(html) {
    return html.replace(/<link[^>]*schriften\.css[^>]*>/, '')
      .replace(/"Newsreader"/g, '"PDF Newsreader"').replace(/"Cinzel"/g, '"PDF Cinzel"').replace(/"Corinthia"/g, '"PDF Corinthia"')
      .replace('</head>', '<style>' + fontCss() + '</style></head>');
  }
  function schnittFuer(fam, gewicht, kursiv) {
    if (/Corinthia/.test(fam)) return 'K700';
    if (/Cinzel/.test(fam)) return gewicht >= 550 ? 'C600' : 'C500';
    if (/Newsreader/.test(fam)) return 'N' + (gewicht >= 550 ? 600 : gewicht >= 450 ? 500 : 400) + (kursiv ? 'i' : '');
    return null;   // Systemschrift, z.B. im QR-Zahlteil: Helvetica
  }
  const fontCache = {};
  async function fontLaden(k) {
    if (fontCache[k]) return fontCache[k];
    const r = await fetch('vendor/fonts/' + SCHNITTE[k] + '.ttf'); if (!r.ok) throw new Error('Schrift fehlt: ' + SCHNITTE[k]);
    const b = new Uint8Array(await r.arrayBuffer()); let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return (fontCache[k] = btoa(s));
  }

  function farbeLesen(c) {
    const m = String(c).match(/rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?/);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] } : { r: 0, g: 0, b: 0, a: 0 };
  }

  // Bild (img oder svg) als PNG-Daten
  function bildLaden(src) { return new Promise((ok, f) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => f(new Error('Bild')); i.src = src; }); }
  async function alsPng(quelle, breite, hoehe) {
    const fak = 4, c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(breite * fak)); c.height = Math.max(1, Math.round(hoehe * fak));
    c.getContext('2d').drawImage(quelle, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  // Liest alles Sichtbare aus: Flächen, Linien, Bilder, Wörter. Koordinaten in px relativ zur Wurzel.
  async function auslesen(wurzel) {
    const doc = wurzel.ownerDocument, win = doc.defaultView, r0 = wurzel.getBoundingClientRect();
    const st = (el, p) => win.getComputedStyle(el, p);
    const ops = [];
    const rel = r => ({ x: r.left - r0.left, y: r.top - r0.top, w: r.width, h: r.height });
    const alle = [wurzel, ...wurzel.querySelectorAll('*')];
    for (const el of alle) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      const s = st(el); if (s.display === 'none' || s.visibility === 'hidden') continue;
      const r = rel(el.getBoundingClientRect()); if (!r.w && !r.h) continue;
      const bg = farbeLesen(s.backgroundColor);
      if (bg.a > 0) ops.push({ art: 'flaeche', ...r, farbe: bg });
      for (const [seite, breite, stil, farbe] of [['top', s.borderTopWidth, s.borderTopStyle, s.borderTopColor], ['bottom', s.borderBottomWidth, s.borderBottomStyle, s.borderBottomColor],
        ['left', s.borderLeftWidth, s.borderLeftStyle, s.borderLeftColor], ['right', s.borderRightWidth, s.borderRightStyle, s.borderRightColor]]) {
        const b = parseFloat(breite), fa = farbeLesen(farbe);
        if (!b || stil === 'none' || stil === 'hidden' || fa.a === 0) continue;
        const l = seite === 'top' ? { x1: r.x, y1: r.y + b / 2, x2: r.x + r.w, y2: r.y + b / 2 }
          : seite === 'bottom' ? { x1: r.x, y1: r.y + r.h - b / 2, x2: r.x + r.w, y2: r.y + r.h - b / 2 }
          : seite === 'left' ? { x1: r.x + b / 2, y1: r.y, x2: r.x + b / 2, y2: r.y + r.h }
          : { x1: r.x + r.w - b / 2, y1: r.y, x2: r.x + r.w - b / 2, y2: r.y + r.h };
        ops.push({ art: 'linie', ...l, breite: b, farbe: fa, gestrichelt: stil === 'dashed' || stil === 'dotted' });
      }
      // Pseudo-Element ::after mit Fläche (z.B. angekreuzte Box im Vertrag)
      const a = st(el, '::after');
      if (a && a.content && a.content !== 'none' && a.position === 'absolute') {
        const af = farbeLesen(a.backgroundColor);
        if (af.a > 0) { const ins = parseFloat(a.top) || 0; ops.push({ art: 'flaeche', x: r.x + ins, y: r.y + ins, w: r.w - 2 * ins, h: r.h - 2 * ins, farbe: af }); }
      }
      if (el.tagName === 'IMG' && el.complete && el.naturalWidth) {
        ops.push({ art: 'bild', ...r, daten: await alsPng(el, r.w, r.h) });
      } else if (el.tagName.toLowerCase() === 'svg') {
        const k = el.cloneNode(true); k.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        k.setAttribute('width', r.w); k.setAttribute('height', r.h);
        const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(k));
        try { ops.push({ art: 'bild', ...r, daten: await alsPng(await bildLaden(url), r.w, r.h) }); } catch (e) { /* Bild auslassen */ }
      }
    }
    // Lage der Grundlinie im Textfeld je Schrift messen (statt zu schätzen)
    const gl = {};
    const grundlinie = s => {
      const key = s.fontFamily + '|' + s.fontWeight + '|' + s.fontStyle;
      if (gl[key] != null) return gl[key];
      const p = doc.createElement('div');
      p.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;font-size:100px;line-height:normal;font-family:' + s.fontFamily + ';font-weight:' + s.fontWeight + ';font-style:' + s.fontStyle;
      const t = doc.createTextNode('Hxgü'), mk = doc.createElement('span');
      mk.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      p.appendChild(t); p.appendChild(mk); doc.body.appendChild(p);
      const rg = doc.createRange(); rg.selectNodeContents(p); rg.setEnd(t, t.length);
      const tr = rg.getClientRects()[0], mr = mk.getBoundingClientRect();
      gl[key] = tr && tr.height ? (mr.top - tr.top) / tr.height : 0.78;
      p.remove();
      return gl[key];
    };
    // Wörter
    const gang = doc.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT);
    for (let n = gang.nextNode(); n; n = gang.nextNode()) {
      const t = n.nodeValue; if (!t || !t.trim()) continue;
      const el = n.parentElement; if (!el || el.closest('svg')) continue;
      const s = st(el); if (s.visibility === 'hidden' || s.display === 'none') continue;
      const fa = farbeLesen(s.color); if (fa.a === 0) continue;
      const tf = s.textTransform, gewicht = parseInt(s.fontWeight, 10) || 400, kursiv = s.fontStyle === 'italic';
      const re = /\S+/g; let m;
      while ((m = re.exec(t))) {
        const rg = doc.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
        const rr = rg.getClientRects()[0]; if (!rr || !rr.width) continue;
        let w = m[0]; if (tf === 'uppercase') w = w.toUpperCase(); else if (tf === 'lowercase') w = w.toLowerCase();
        ops.push({ art: 'text', ...rel(rr), text: w, groesse: parseFloat(s.fontSize), farbe: fa, schnitt: schnittFuer(s.fontFamily, gewicht, kursiv), fett: gewicht >= 600, kursiv, abstand: parseFloat(s.letterSpacing) || 0, gl: grundlinie(s) });
      }
    }
    // Nummern von Listen
    wurzel.querySelectorAll('ol').forEach(ol => {
      if (st(ol).listStyleType !== 'decimal') return;
      [...ol.children].filter(li => li.tagName === 'LI').forEach((li, i) => {
        const s = st(li), rg = doc.createRange(); rg.selectNodeContents(li);
        const erste = rg.getClientRects()[0], lr = li.getBoundingClientRect(); if (!erste) return;
        const gewicht = parseInt(s.fontWeight, 10) || 400;
        ops.push({ art: 'text', x: lr.left - r0.left - parseFloat(s.fontSize) * 0.4, y: erste.top - r0.top, w: 1, h: erste.height, text: (i + 1) + '.', rechts: true,
          groesse: parseFloat(s.fontSize), farbe: farbeLesen(s.color), schnitt: schnittFuer(s.fontFamily, gewicht, false), fett: gewicht >= 600, kursiv: false, abstand: 0, gl: grundlinie(s) });
      });
    });
    return ops;
  }

  // Zeichnet die Elemente eines Seitenausschnitts [von, bis] (px) ab obenMm auf die aktuelle PDF-Seite
  function zeichnen(pdf, ops, von, bis, obenMm, fonts, grund) {
    const ym = y => obenMm + (y - von) / MM;
    // Halbtransparente Farben (z.B. feine Linien) mit dem Seitenhintergrund mischen
    const mix = c => c.a >= 1 ? c : { r: Math.round(c.r * c.a + grund[0] * (1 - c.a)), g: Math.round(c.g * c.a + grund[1] * (1 - c.a)), b: Math.round(c.b * c.a + grund[2] * (1 - c.a)) };
    for (const o of ops) {
      if (o.art === 'flaeche') {
        const y1 = Math.max(o.y, von), y2 = Math.min(o.y + o.h, bis); if (y2 <= y1) continue;
        { const c = mix(o.farbe); pdf.setFillColor(c.r, c.g, c.b); } pdf.rect(o.x / MM, ym(y1), o.w / MM, (y2 - y1) / MM, 'F');
      } else if (o.art === 'linie') {
        let y1 = o.y1, y2 = o.y2;
        if (y1 === y2) { if (y1 < von || y1 > bis) continue; } else { y1 = Math.max(y1, von); y2 = Math.min(y2, bis); if (y2 <= y1) continue; }
        { const c = mix(o.farbe); pdf.setDrawColor(c.r, c.g, c.b); } pdf.setLineWidth(o.breite / MM);
        pdf.setLineDashPattern(o.gestrichelt ? [1, 0.8] : [], 0);
        pdf.line(o.x1 / MM, ym(y1), o.x2 / MM, ym(y2));
        pdf.setLineDashPattern([], 0);
      } else if (o.art === 'bild') {
        if (o.y < von - 1 || o.y >= bis) continue;
        pdf.addImage(o.daten, 'PNG', o.x / MM, ym(o.y), o.w / MM, o.h / MM, undefined, 'FAST');
      } else if (o.art === 'text') {
        if (o.y < von - 1 || o.y >= bis - 1) continue;
        if (o.schnitt && fonts[o.schnitt]) pdf.setFont(o.schnitt, 'normal');
        else pdf.setFont('helvetica', o.fett && o.kursiv ? 'bolditalic' : o.fett ? 'bold' : o.kursiv ? 'italic' : 'normal');
        pdf.setFontSize(o.groesse * 0.75);
        { const c = mix(o.farbe); pdf.setTextColor(c.r, c.g, c.b); }
        // Grundlinie: Höhe des Textfelds aus der Schrift (Aufstrich-Anteil), wie sie der Browser gesetzt hat
        const y = ym(o.y) + (o.h * (o.gl || 0.78)) / MM;
        const opt = o.rechts ? { align: 'right' } : o.abstand ? { charSpace: o.abstand / MM } : undefined;
        pdf.text(o.text, o.x / MM, y, opt);
      }
    }
  }

  async function erstellen(html) {
    await bibliotheken();
    const f = await rahmen(vorbereiten(html));
    try {
      const doc = f.contentDocument;
      try { await Promise.all(FACES.map(([fam, w, stl]) => doc.fonts.load(stl + ' ' + w + ' 16px "' + fam + '"', 'Aa'))); await doc.fonts.ready; } catch (e) { /* weiter */ }
      await new Promise(ok => setTimeout(ok, 30));
      const pdf = new global.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
      const fonts = {};
      const fontsEinbinden = async ops => {
        for (const k of new Set(ops.filter(o => o.art === 'text' && o.schnitt).map(o => o.schnitt))) {
          if (fonts[k]) continue;
          const datei = SCHNITTE[k] + '.ttf';
          pdf.addFileToVFS(datei, await fontLaden(k)); pdf.addFont(datei, k, 'normal'); fonts[k] = true;
        }
      };
      let erste = true;
      const neueSeite = () => { if (!erste) pdf.addPage('a4', 'portrait'); erste = false; };

      if (doc.body.classList.contains('vertrag')) {
        const wurzel = doc.querySelector('.seite') || doc.body;
        const hoehe = wurzel.scrollHeight;
        const seiten = seitenumbrueche(bloecke(wurzel), hoehe, (297 - 16 - 18) * MM);
        const ops = await auslesen(wurzel); await fontsEinbinden(ops);
        for (const [a, b] of seiten) { neueSeite(); zeichnen(pdf, ops, a, b, 16, fonts, [255, 255, 255]); }
      } else {
        const blaetter = [...doc.querySelectorAll('.seite')];
        for (const el of (blaetter.length ? blaetter : [doc.body])) {
          const ops = await auslesen(el); await fontsEinbinden(ops);
          neueSeite();
          pdf.setFillColor(251, 248, 242); pdf.rect(0, 0, 210, 297, 'F');
          zeichnen(pdf, ops, 0, el.offsetHeight + 2, 0, fonts, [251, 248, 242]);
        }
      }
      return pdf.output('blob');
    } finally { f.remove(); }
  }

  // Übergibt die Datei: im Vorschau-Link von Claude über dessen Speichern, auf dem iPhone über «Teilen»,
  // sonst als normaler Download. Muss direkt aus einem Tipp aufgerufen werden.
  async function weitergeben(blob, dateiname, teilen) {
    const name = dateiname.replace(/[\\/:*?"<>|]/g, '-') + '.pdf';
    if (global.claude && typeof global.claude.use === 'function') {
      const dl = await Promise.race([global.claude.use('downloads'), new Promise(ok => setTimeout(() => ok(null), 1500))]);
      if (dl) { await dl.save({ filename: name, data: blob }); return 'gespeichert'; }
    }
    const datei = new File([blob], name, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [datei] })) {
      // Nur die Datei teilen. Ein zusätzlicher Titel kommt in Kurzbefehlen als zweites Objekt an,
      // und «Datei sichern» legt dann einen Ordner statt einer Datei an.
      const daten = { files: [datei] };
      if (teilen && teilen.text) { daten.text = teilen.text; daten.title = teilen.titel; }
      await navigator.share(daten);
      return 'geteilt';
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    return 'gespeichert';
  }

  // iPhone: Safari zeichnet den Text beim Umwandeln in ein Bild nicht zuverlässig. Darum dort mit
  // dem Druck von iOS arbeiten: Das Dokument wird ins Hauptfenster gelegt (in einem Shadow Root, damit
  // sich die Stile von App und Dokument nicht mischen) und nur es wird gedruckt. Im Druckfenster
  // erstellt iOS daraus ein echtes PDF mit Text, das man über «Teilen» sichert oder verschickt.
  function drucken(html, titel) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    let stile = [...doc.querySelectorAll('style')].map(x => x.textContent).join('\n');
    const seitenRegeln = (stile.match(/@page[^{]*\{[^}]*\}/g) || []).join('\n');
    stile = stile.replace(/@page[^{]*\{[^}]*\}/g, '')
      .replace(/,\s*html:has\(body\.vertrag\)/g, '')
      .replace(/\bhtml\s*,\s*body\b/g, '.dok-body')
      .replace(/\bhtml\b(?=\s*[{,])/g, '.dok-body')
      .replace(/\bbody\b/g, '.dok-body');
    let host = document.getElementById('druck');
    if (!host) { host = document.createElement('div'); host.id = 'druck'; document.body.appendChild(host); host.attachShadow({ mode: 'open' }); }
    host.shadowRoot.innerHTML = '<style>' + stile + '</style><div class="dok-body ' + (doc.body.className || '') + '">' + doc.body.innerHTML + '</div>';
    let druckStil = document.getElementById('druck-stil');
    if (!druckStil) { druckStil = document.createElement('style'); druckStil.id = 'druck-stil'; document.head.appendChild(druckStil); }
    druckStil.textContent = '#druck{display:none}@media print{body>*:not(#druck){display:none!important}#druck{display:block!important}' +
      'html,body{background:#fff!important;height:auto!important;min-height:0!important;overflow:visible!important;padding:0!important;margin:0!important;display:block!important}}' +
      (seitenRegeln || '@page{size:A4 portrait;margin:0}');
    const alterTitel = document.title;
    document.title = titel;   // iOS benennt das PDF nach dem Seitentitel
    const zurueck = () => { document.title = alterTitel; window.removeEventListener('afterprint', zurueck); };
    window.addEventListener('afterprint', zurueck);
    setTimeout(zurueck, 60000);
    window.print();
  }
  const istIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  global.PdfWeb = { erstellen, weitergeben, drucken, istIOS, _seitenumbrueche: seitenumbrueche };
})(typeof window !== 'undefined' ? window : globalThis);
