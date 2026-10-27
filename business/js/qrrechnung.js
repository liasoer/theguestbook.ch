// Schweizer QR-Rechnung nach den Swiss Payment Standards (Version 2.3, Adresstyp S).
// Normale IBAN mit Creditor Reference (SCOR, beginnt mit RF).
(function (global) {
  'use strict';
  const qrcode = global.qrcode || (typeof require !== 'undefined' ? require('../vendor/qrcode.js') : null);

  // ---------- Prüfungen ----------

  function nurZeichen(s) { return String(s || '').replace(/\s+/g, '').toUpperCase(); }

  function mod97(zahlText) {
    let rest = 0;
    for (let i = 0; i < zahlText.length; i += 7) rest = parseInt(String(rest) + zahlText.slice(i, i + 7), 10) % 97;
    return rest;
  }
  function buchstabenZuZahl(s) {
    return s.replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  }

  function ibanPruefen(iban) {
    const s = nurZeichen(iban);
    if (!/^(CH|LI)\d{2}[0-9A-Z]{17}$/.test(s)) return { ok: false, grund: 'Eine Schweizer IBAN hat 21 Zeichen und beginnt mit CH oder LI.' };
    if (mod97(buchstabenZuZahl(s.slice(4) + s.slice(0, 4))) !== 1) return { ok: false, grund: 'Die Prüfziffer der IBAN stimmt nicht.' };
    const iid = parseInt(s.slice(4, 9), 10);
    const qrIban = iid >= 30000 && iid <= 31999;
    return { ok: true, iban: s, qrIban };
  }

  // Creditor Reference nach ISO 11649: RF + 2 Prüfziffern + bis 21 Zeichen
  function rfReferenz(basis) {
    const b = nurZeichen(basis).replace(/[^0-9A-Z]/g, '');
    if (!b || b.length > 21) throw new Error('Referenz muss 1 bis 21 Buchstaben oder Ziffern haben');
    const pz = 98 - mod97(buchstabenZuZahl(b + 'RF00'));
    return 'RF' + String(pz).padStart(2, '0') + b;
  }
  function rfPruefen(ref) {
    const s = nurZeichen(ref);
    if (!/^RF\d{2}[0-9A-Z]{1,21}$/.test(s)) return false;
    return mod97(buchstabenZuZahl(s.slice(4) + s.slice(0, 4))) === 1;
  }

  // Referenz aus der Rechnungsnummer, z.B. 2026-001-1 -> RF..20260011
  function referenzAusNummer(nummer) { return rfReferenz(String(nummer).replace(/[^0-9A-Za-z]/g, '')); }

  function inVierern(s) { return nurZeichen(s).replace(/(.{4})/g, '$1 ').trim(); }

  // ---------- Zeichensatz ----------
  // Erlaubt sind Basis-Latein, Latin-1 Ergänzung, Latin Extended-A, Ș ș Ț ț und €.
  function zeichenBereinigen(s) {
    return Array.from(String(s || '').normalize('NFC')).map(c => {
      const n = c.codePointAt(0);
      if ((n >= 0x20 && n <= 0x7E) || (n >= 0xA0 && n <= 0x17F) || [0x218, 0x219, 0x21A, 0x21B, 0x20AC].includes(n)) return c;
      const ohne = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
      return /^[\x20-\x7E]$/.test(ohne) ? ohne : '.';
    }).join('').trim();
  }
  const kurz = (s, n) => zeichenBereinigen(s).slice(0, n);

  // ---------- Inhalt des QR-Codes ----------

  function adresse(a) {
    if (!a || !a.name) return ['', '', '', '', '', '', ''];
    return ['S', kurz(a.name, 70), kurz(a.strasse, 70), kurz(a.hausnummer, 16), kurz(a.plz, 16), kurz(a.ort, 35), kurz(a.land || 'CH', 2).toUpperCase()];
  }

  function betragText(rappen) {
    if (rappen == null) return '';
    if (rappen < 1 || rappen > 99999999999) throw new Error('Betrag ausserhalb des erlaubten Bereichs');
    return (rappen / 100).toFixed(2);
  }

  /**
   * r = { iban, glaeubiger:{name,strasse,hausnummer,plz,ort,land}, rappen, waehrung:'CHF',
   *       schuldner:{...} oder null, referenz:'RF..' oder '', mitteilung:'' }
   */
  function inhalt(r) {
    const ib = ibanPruefen(r.iban);
    if (!ib.ok) throw new Error(ib.grund);
    let refTyp = 'NON', ref = '';
    if (r.referenz) {
      ref = nurZeichen(r.referenz);
      if (!rfPruefen(ref)) throw new Error('Die RF-Referenz ist ungültig.');
      if (ib.qrIban) throw new Error('Mit einer QR-IBAN braucht es eine QR-Referenz, keine RF-Referenz.');
      refTyp = 'SCOR';
    } else if (ib.qrIban) throw new Error('Mit einer QR-IBAN braucht es eine QR-Referenz.');
    if (!r.glaeubiger || !r.glaeubiger.name || !r.glaeubiger.plz || !r.glaeubiger.ort) throw new Error('Name, PLZ und Ort des Empfängers fehlen.');
    const waehrung = r.waehrung || 'CHF';
    if (!['CHF', 'EUR'].includes(waehrung)) throw new Error('Nur CHF oder EUR erlaubt.');

    const zeilen = [
      'SPC', '0200', '1',
      ib.iban,
      ...adresse(r.glaeubiger),
      '', '', '', '', '', '', '',            // endgültiger Zahlungsempfänger (nicht verwendet)
      betragText(r.rappen), waehrung,
      ...adresse(r.schuldner),
      refTyp, ref,
      kurz(r.mitteilung, 140),
      'EPD'
    ];
    return zeilen.join('\r\n');
  }

  // ---------- QR-Code ----------

  function matrix(text) {
    if (!qrcode) throw new Error('QR-Bibliothek fehlt');
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const q = qrcode(0, 'M');
    q.addData(text, 'Byte');
    q.make();
    const n = q.getModuleCount();
    if (n > 117) throw new Error('Inhalt zu lang für die QR-Rechnung (maximal Version 25).');
    const m = [];
    for (let y = 0; y < n; y++) { const z = []; for (let x = 0; x < n; x++) z.push(q.isDark(y, x)); m.push(z); }
    return m;
  }

  // QR-Code als SVG, 46 x 46 mm, mit Schweizerkreuz 7 x 7 mm in der Mitte.
  function svg(text) {
    const m = matrix(text), n = m.length;
    let pfad = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) pfad += 'M' + x + ' ' + y + 'h1v1h-1z';
    const s = 46 / n; // mm pro Modul
    const kreuz = (() => {
      const c = 23, aussen = 7, innen = 6.2, k = innen;
      const breit = k * 6 / 32, lang = k * 20 / 32;
      return '<rect x="' + (c - aussen / 2) + '" y="' + (c - aussen / 2) + '" width="' + aussen + '" height="' + aussen + '" fill="#fff"/>' +
        '<rect x="' + (c - innen / 2) + '" y="' + (c - innen / 2) + '" width="' + innen + '" height="' + innen + '" fill="#000"/>' +
        '<rect x="' + (c - breit / 2) + '" y="' + (c - lang / 2) + '" width="' + breit + '" height="' + lang + '" fill="#fff"/>' +
        '<rect x="' + (c - lang / 2) + '" y="' + (c - breit / 2) + '" width="' + lang + '" height="' + breit + '" fill="#fff"/>';
    })();
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 46" width="46mm" height="46mm" shape-rendering="crispEdges">' +
      '<rect width="46" height="46" fill="#fff"/>' +
      '<path transform="scale(' + s + ')" d="' + pfad + '" fill="#000"/>' + kreuz + '</svg>';
  }

  // ---------- Zahlteil mit Empfangsschein (210 x 105 mm) ----------

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const adrZeilen = a => a ? [a.name, [a.strasse, a.hausnummer].filter(Boolean).join(' '), [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean) : [];
  const betragAnzeige = rappen => (rappen / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  function ecken(b, h) {
    // Leeres Feld mit Eckmarken, wenn kein Betrag oder Schuldner bekannt ist
    const l = 3, w = 0.75;
    return '<svg width="' + b + 'mm" height="' + h + 'mm" viewBox="0 0 ' + b + ' ' + h + '"><path d="M0 ' + l + 'V0H' + l + 'M' + (b - l) + ' 0H' + b + 'V' + l + 'M' + b + ' ' + (h - l) + 'V' + h + 'H' + (b - l) + 'M' + l + ' ' + h + 'H0V' + (h - l) + '" fill="none" stroke="#000" stroke-width="' + w + '"/></svg>';
  }

  function zahlteilHTML(r) {
    const text = inhalt(r);
    const ib = ibanPruefen(r.iban);
    const empf = [inVierern(ib.iban), ...adrZeilen(r.glaeubiger)];
    const ref = r.referenz ? inVierern(r.referenz) : '';
    const schuld = adrZeilen(r.schuldner);
    const betrag = r.rappen != null ? betragAnzeige(r.rappen) : '';
    const w = esc(r.waehrung || 'CHF');
    const block = (titel, zeilen) => '<div class="qr-b"><div class="qr-t">' + titel + '</div>' + zeilen.map(z => '<div>' + esc(z) + '</div>').join('') + '</div>';

    return '<section class="qr-zahlteil">' +
      '<div class="qr-trenn">Vor der Einzahlung abzutrennen</div>' +
      '<div class="qr-empfang">' +
        '<h3>Empfangsschein</h3>' +
        block('Konto / Zahlbar an', empf) +
        (ref ? block('Referenz', [ref]) : '') +
        (schuld.length ? block('Zahlbar durch', schuld) : '<div class="qr-b"><div class="qr-t">Zahlbar durch (Name/Adresse)</div>' + ecken(52, 20) + '</div>') +
        '<div class="qr-betrag"><div><div class="qr-t">Währung</div><div>' + w + '</div></div><div><div class="qr-t">Betrag</div><div>' + (betrag || ecken(30, 10)) + '</div></div></div>' +
        '<div class="qr-annahme">Annahmestelle</div>' +
      '</div>' +
      '<div class="qr-zahl">' +
        '<div class="qr-links"><h3>Zahlteil</h3><div class="qr-code">' + svg(text) + '</div>' +
          '<div class="qr-betrag"><div><div class="qr-t">Währung</div><div>' + w + '</div></div><div><div class="qr-t">Betrag</div><div>' + (betrag || ecken(40, 15)) + '</div></div></div></div>' +
        '<div class="qr-rechts">' +
          block('Konto / Zahlbar an', empf) +
          (ref ? block('Referenz', [ref]) : '') +
          (r.mitteilung ? block('Zusätzliche Informationen', [zeichenBereinigen(r.mitteilung)]) : '') +
          (schuld.length ? block('Zahlbar durch', schuld) : '<div class="qr-b"><div class="qr-t">Zahlbar durch (Name/Adresse)</div>' + ecken(65, 25) + '</div>') +
        '</div>' +
      '</div>' +
    '</section>';
  }

  // Masse und Schriften nach Style Guide: Titel 6 pt / Werte 8 pt im Empfangsschein, 8 pt / 10 pt im Zahlteil.
  const CSS = `
.qr-zahlteil{position:relative;width:210mm;height:105mm;display:flex;font-family:Helvetica,Arial,"Liberation Sans",sans-serif;color:#000;background:#fff;border-top:0.2mm dashed #000;box-sizing:border-box;break-inside:avoid;page-break-inside:avoid}
.qr-trenn{position:absolute;top:-4mm;left:0;right:0;text-align:center;font-size:7pt;color:#000}
.qr-zahlteil h3{margin:0 0 3mm;font-size:11pt;font-weight:700}
.qr-t{font-weight:700}
.qr-empfang{width:62mm;padding:5mm;box-sizing:border-box;border-right:0.2mm dashed #000;font-size:8pt;line-height:9pt;position:relative}
.qr-empfang .qr-t{font-size:6pt;line-height:9pt}
.qr-empfang .qr-b{margin-bottom:3mm}
.qr-empfang .qr-betrag{display:flex;gap:6mm;margin-top:2mm}
.qr-annahme{position:absolute;right:5mm;top:73mm;font-size:6pt;font-weight:700}
.qr-zahl{width:148mm;padding:5mm;box-sizing:border-box;display:flex;gap:5mm;font-size:10pt;line-height:11pt}
.qr-links{width:51mm}
.qr-code{margin:2mm 0 5mm;width:46mm;height:46mm}
.qr-code svg{display:block}
.qr-zahl .qr-t{font-size:8pt;line-height:11pt}
.qr-zahl .qr-betrag{display:flex;gap:6mm}
.qr-rechts{flex:1;min-width:0}
.qr-rechts .qr-b{margin-bottom:3.5mm}
`;

  const QRRechnung = { ibanPruefen, rfReferenz, rfPruefen, referenzAusNummer, inVierern, zeichenBereinigen, inhalt, matrix, svg, zahlteilHTML, CSS };
  global.QRRechnung = QRRechnung;
  if (typeof module !== 'undefined') module.exports = QRRechnung;
})(typeof window !== 'undefined' ? window : globalThis);
