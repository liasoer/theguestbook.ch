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
    if (global.html2canvas && global.jspdf) return Promise.resolve();
    return laden || (laden = Promise.all([skript('vendor/html2canvas.min.js'), skript('vendor/jspdf.umd.min.js')]));
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

  async function erstellen(html) {
    const [, schriftenOk] = await Promise.all([bibliotheken(), schriftenLaden()]);
    if (!schriftenOk) html = html.replace('</head>', '<style>' + ERSATZ + '</style></head>');
    const f = await rahmen(html);
    try {
      const doc = f.contentDocument;
      const pdf = new global.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
      let erste = true;
      const neueSeite = () => { if (!erste) pdf.addPage('a4', 'portrait'); erste = false; };
      const bild = (canvas, q) => canvas.toDataURL('image/jpeg', q);

      if (doc.body.classList.contains('vertrag')) {
        const wurzel = doc.querySelector('.seite') || doc.body;
        const breite = wurzel.offsetWidth, hoehe = wurzel.scrollHeight;
        const s = massstab(breite, hoehe, 2.5);
        const canvas = await global.html2canvas(wurzel, { scale: s, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: 794 });
        const seiten = seitenumbrueche(bloecke(wurzel), hoehe, (297 - 16 - 18) * MM);
        for (const [a, b] of seiten) {
          const teil = document.createElement('canvas');
          teil.width = canvas.width; teil.height = Math.max(1, Math.round((b - a) * s));
          const ctx = teil.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, teil.width, teil.height);
          ctx.drawImage(canvas, 0, Math.round(a * s), canvas.width, teil.height, 0, 0, teil.width, teil.height);
          neueSeite();
          pdf.addImage(bild(teil, 0.9), 'JPEG', 0, 16, 210, (b - a) / MM, undefined, 'FAST');
        }
      } else {
        const blaetter = [...doc.querySelectorAll('.seite')];
        for (const el of (blaetter.length ? blaetter : [doc.body])) {
          const s = massstab(el.offsetWidth, el.offsetHeight, 3);
          const canvas = await global.html2canvas(el, { scale: s, backgroundColor: '#FBF8F2', useCORS: true, logging: false, windowWidth: 794 });
          neueSeite();
          pdf.setFillColor(251, 248, 242); pdf.rect(0, 0, 210, 297, 'F');
          pdf.addImage(bild(canvas, 0.92), 'JPEG', 0, 0, 210, Math.min(297, el.offsetHeight / MM), undefined, 'FAST');
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
