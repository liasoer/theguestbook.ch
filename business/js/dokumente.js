// Offerte, Vertrag und Rechnung als A4-Dokumente im Erscheinungsbild von theguestbook.ch.
// Jede Funktion liefert ein vollständiges HTML-Dokument für Vorschau und PDF.
(function (global) {
  'use strict';
  const M = global.Modell, Q = global.QRRechnung;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const istEvent = a => a.art === 'privat' || a.art === 'firma';
  // Eigene Anrede aus der Kundenkarte hat Vorrang, sonst ein neutraler Vorschlag
  const anrede = (a, k) => (k.anrede && k.anrede.trim()) ? k.anrede.trim()
    : a.art === 'firma' ? 'Guten Tag ' + (k.ansprechperson || k.vorname || '').trim()
    : 'Hallo ' + (k.vorname || k.name || '').trim();
  const ihr = a => istEvent(a) ? 'euren Anlass' : 'eure Hochzeit';

  function css(a) {
    const akzent = istEvent(a) ? '#5E6E5C' : '#7A1F28';
    const tief = istEvent(a) ? '#3E4A3C' : '#4A0F14';
    return `
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box}
html,body{margin:0;background:#FBF8F2}
body{font-family:"Newsreader",Georgia,serif;color:#26140F;font-size:9.8pt;line-height:1.45;-webkit-font-smoothing:antialiased;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.seite{position:relative;width:210mm;min-height:296mm;margin:0 auto;padding:13mm 18mm 19mm;background:#FBF8F2;overflow:hidden}
.seite + .seite{break-before:page;page-break-before:always}
.kopf{display:flex;justify-content:space-between;align-items:flex-start;gap:12mm;margin-bottom:6mm}
.kopf img{width:42mm;display:block}
.absender{font-size:8.5pt;line-height:1.5;text-align:right;color:#6B5A50}
.titel{margin:0}
.titelzeile{display:flex;justify-content:space-between;align-items:flex-end;gap:10mm;margin:0 0 6mm}
.titel .caps{display:block;font-family:"Cinzel",Georgia,serif;font-weight:500;font-size:22pt;letter-spacing:.02em;line-height:1;color:${tief};text-transform:uppercase}
.titel .skript{display:block;font-family:"Corinthia",cursive;font-weight:700;font-size:27pt;line-height:1;color:${akzent};margin:1mm 0 0 14mm}
.empf{margin:0;font-size:9.5pt;line-height:1.45;text-align:right;padding-bottom:1mm}
.meta{display:grid;grid-template-columns:repeat(4,1fr);border-top:.3mm solid ${tief};border-bottom:.2mm solid rgba(38,20,15,.22);margin:0 0 5mm}
.meta div{padding:1.8mm 3mm 1.8mm 0}
.meta div + div{padding-left:3mm;border-left:.2mm solid rgba(38,20,15,.22)}
.meta span{display:block;font-size:7.5pt;font-style:italic;color:#6B5A50}
.meta b{font-weight:500}
p{margin:0 0 3mm}
h2{font-family:"Cinzel",Georgia,serif;font-weight:600;font-size:9pt;letter-spacing:.06em;text-transform:uppercase;color:${tief};margin:5mm 0 2mm}
table.posten{width:100%;border-collapse:collapse;margin:3mm 0 2mm}
table.posten th{font-family:"Cinzel",Georgia,serif;font-weight:600;font-size:8pt;letter-spacing:.08em;text-transform:uppercase;text-align:left;color:${tief};border-bottom:.3mm solid ${tief};padding:0 0 2mm}
table.posten td{padding:1.5mm 4mm 1.5mm 0;border-bottom:.2mm solid rgba(38,20,15,.18);vertical-align:top}
table.posten td.betrag,table.posten th.betrag{text-align:right;padding-right:0;white-space:nowrap;font-variant-numeric:tabular-nums}
table.posten td small{display:block;font-size:8.5pt;font-style:italic;color:#6B5A50}
table.posten tr.total td{border-bottom:0;border-top:.4mm solid ${tief};font-weight:600;font-size:11.5pt;padding-top:3mm}
.hinweis{font-size:8pt;font-style:italic;color:#6B5A50;margin:0 0 3mm}
dl.kond{display:grid;grid-template-columns:28mm 1fr;gap:.8mm 5mm;margin:0;font-size:9pt}
dl.kond dt{font-style:italic;color:#6B5A50}
dl.kond dd{margin:0}
ol{margin:0;padding-left:5mm}ol li{margin-bottom:.8mm}
.gruss{margin-top:5mm}
.gruss .name{font-family:"Corinthia",cursive;font-weight:700;font-size:22pt;line-height:1;color:${akzent};margin:2mm 0 0}
.fuss{position:absolute;left:18mm;right:18mm;bottom:9mm;display:flex;justify-content:space-between;font-size:7.5pt;color:#6B5A50;border-top:.2mm solid rgba(38,20,15,.22);padding-top:2mm}
.wahl{list-style:none;padding:0;margin:1.5mm 0 0}
.wahl li{display:flex;gap:2.5mm;align-items:baseline;margin-bottom:1mm}
.box{display:inline-block;width:3mm;height:3mm;border:.3mm solid #26140F;flex:none;position:relative;top:.4mm}
.box.an::after{content:"";position:absolute;inset:.5mm;background:${tief}}
.unterschrift{display:grid;grid-template-columns:1fr 1fr;gap:14mm;margin-top:10mm;break-inside:avoid}
.unterschrift span{display:block;font-size:8pt;font-style:italic;color:#6B5A50}
.unterschrift .linie{border-bottom:.3mm solid #26140F;height:16mm;margin:2mm 0 1.5mm}
h2{break-after:avoid;page-break-after:avoid}
li{break-inside:avoid}
table.posten tr{break-inside:avoid}
/* Vertrag: fliesst über mehrere Seiten, Ränder kommen vom Druck (oben 16 mm, unten 18 mm auf jeder Seite) */
body.vertrag{background:#fff}
.vertrag .seite{min-height:0;padding:0 18mm;background:#fff}
body.vertrag,html:has(body.vertrag){background:#fff}
.vertrag .fuss{position:static;margin-top:8mm}
.vertrag section{break-inside:auto}
.vertrag h2{break-after:avoid;page-break-after:avoid;margin-top:6mm}
.vertrag ol li,.vertrag .wahl,.vertrag table.posten tr{break-inside:avoid;page-break-inside:avoid}
.vertrag .schluss{break-inside:avoid;page-break-inside:avoid}
@media screen{.vertrag .seite{padding:16mm 18mm 18mm}}
.rechnung .seite{height:296mm;min-height:0;padding-top:12mm;padding-bottom:0}
.rechnung .kopf{margin-bottom:7mm}
.rechnung .kopf img{width:40mm}
.rechnung .titelzeile{margin-bottom:5mm}
.rechnung .titel .caps{font-size:20pt}
.rechnung .titel .skript{font-size:24pt}
.rechnung .meta{margin-bottom:5mm}
.rechnung table.posten{margin:2mm 0 1mm}
.rechnung .hinweis{margin-bottom:3mm}
.rechnung .qr-zahlteil{position:absolute;left:0;bottom:0}
` + Q.CSS;
  }

  function kopf(e) {
    return '<header class="kopf"><img src="img/logo.svg" alt="The Guestbook">' +
      '<div class="absender">' + esc(e.firma) + ', ' + esc(e.inhaber) + '<br>' + esc(e.strasse + ' ' + e.hausnummer + ', ' + e.plz + ' ' + e.ort) + '<br>' +
      esc(e.email) + ', ' + esc(e.telefon) + '<br>' + esc(e.web) + '</div></header>';
  }
  function fuss(e) {
    return '<footer class="fuss"><span>' + esc(e.firma) + '</span><span>' + esc(e.web) + '</span><span>' + esc(e.email) + '</span><span>' + esc(e.telefon) + '</span></footer>';
  }
  function dokument(titel, a, inhalt, klasse) {
    return '<!doctype html><html lang="de-CH"><head><meta charset="utf-8"><title>' + esc(titel) + '</title>' +
      '<link rel="stylesheet" href="fonts/schriften.css"><style>' + css(a) + (klasse === 'vertrag' ? '@page{size:A4 portrait;margin:16mm 0 18mm}' : '') + '</style></head><body class="' + (klasse || '') + '">' + inhalt + '</body></html>';
  }
  function empfaenger(k) {
    const z = [k.name, k.name !== k.ansprechperson ? k.ansprechperson : '', [k.strasse, k.hausnummer].filter(Boolean).join(' '),
      [k.plz, k.ort].filter(Boolean).join(' '), k.email].filter(Boolean);
    return '<div class="empf">' + z.map(esc).join('<br>') + '</div>';
  }
  function anlassText(a) {
    const art = (M.ARTEN.find(x => x.id === a.art) || M.ARTEN[0]).name;
    return art + (a.bezeichnung ? ', ' + a.bezeichnung : '');
  }
  function postenTabelle(dok, e) {
    let zeilen = '';
    (dok.posten || []).forEach(p => {
      zeilen += '<tr><td>' + esc(p.name) + (p.beschreibung ? '<small>' + esc(p.beschreibung) + '</small>' : '') + '</td><td class="betrag">' + M.chf(p.rappen) + '</td></tr>';
    });
    const km = M.kmBetrag(dok.km || 0, e);
    if (km > 0) {
      zeilen += '<tr><td>Anfahrt<small>' + esc(dok.km) + ' km ab ' + esc(e.ort) + ', davon ' + e.kmInklusive + ' km inklusive, à CHF ' + M.chf(e.kmRappen) + '</small></td><td class="betrag">' + M.chf(km) + '</td></tr>';
    }
    return '<table class="posten"><thead><tr><th>Leistung</th><th class="betrag">CHF</th></tr></thead><tbody>' + zeilen +
      '<tr class="total"><td>Total CHF</td><td class="betrag">' + M.chf(M.postenTotal(dok.posten, dok.km, e)) + '</td></tr></tbody></table>';
  }

  // ---------- Offerte ----------

  function offerteHTML(daten, a) {
    const e = daten.einstellungen, k = daten.kunden.find(x => x.id === a.kundeId) || {};
    const o = a.offerte;
    const total = M.postenTotal(o.posten, o.km, e);
    const anz = M.anzahlung(total, e);
    const inhalt = '<div class="seite">' + kopf(e) +
      '<div class="titelzeile"><h1 class="titel"><span class="caps">Offerte</span><span class="skript">für ' + ihr(a) + '</span></h1>' + empfaenger(k) + '</div>' +
      '<div class="meta"><div><span>Offerte Nr.</span><b>' + esc(a.nummer) + '</b></div><div><span>Datum</span><b>' + M.datumCH(o.datum) + '</b></div>' +
      '<div><span>Gültig bis</span><b>' + M.datumCH(M.plusTage(o.datum, e.offerteGueltigTage)) + '</b></div><div><span>Anlass</span><b>' + (a.datum ? M.datumCH(a.datum) : 'offen') + '</b></div></div>' +
      '<p>' + esc(anrede(a, k)) + '</p>' +
      '<p>' + esc(o.einleitung || ('Herzlichen Dank für eure Anfrage. Wir freuen uns sehr, dass ihr an eurem Tag die Stimmen eurer Liebsten festhalten möchtet. Gerne offerieren wir euch für ' + ihr(a) +
        (a.datum ? ' am ' + M.datumCH(a.datum) : '') + (a.location ? ' in ' + a.location : '') + ' folgende Leistungen.')) + '</p>' +
      postenTabelle(o, e) +
      '<p class="hinweis">' + esc(e.mwstHinweis) + '</p>' +
      '<h2>Konditionen</h2><dl class="kond">' +
        '<dt>Gültigkeit</dt><dd>Diese Offerte gilt ' + e.offerteGueltigTage + ' Tage ab Offertdatum.</dd>' +
        '<dt>Reservation</dt><dd>Das Datum ist fix reserviert, sobald der unterschriebene Vertrag und die Anzahlung bei uns sind.</dd>' +
        '<dt>Anzahlung</dt><dd>' + e.anzahlungProzent + ' % des Totals (CHF ' + M.chf(anz) + '), zahlbar innert ' + e.anzahlungFaelligTage + ' Tagen nach Vertragsabschluss.</dd>' +
        '<dt>Restzahlung</dt><dd>CHF ' + M.chf(total - anz) + ', zahlbar innert ' + e.restFaelligTage + ' Tagen nach dem Anlass.</dd>' +
        '<dt>Zahlung</dt><dd>Per QR-Rechnung, die ihr mit eurer Banking-App bezahlen könnt.</dd></dl>' +
      '<h2>So geht es weiter</h2><ol><li>Ihr gebt uns kurz Bescheid, ob die Offerte für euch passt.</li><li>Wir senden euch den Vertrag zur Unterschrift.</li>' +
        '<li>Mit Vertrag und Anzahlung ist euer Datum fix reserviert.</li><li>Kurz vor dem Anlass besprechen wir den Ablauf im Detail.</li></ol>' +
      '<div class="gruss"><p>Wir freuen uns darauf, an ' + (istEvent(a) ? 'eurem Anlass' : 'eurem Tag') + ' dabei zu sein. Bei Fragen erreicht ihr uns jederzeit unter ' + esc(e.email) + '.</p>' +
        '<p style="margin:0">Herzliche Grüsse</p><p class="name">Lias</p><p style="margin:0">' + esc(e.inhaber) + ', ' + esc(e.firma) + '</p></div>' +
      fuss(e) + '</div>';
    return dokument('Offerte ' + a.nummer + ' ' + (k.name || ''), a, inhalt);
  }

  // ---------- Vertrag ----------

  function vertragHTML(daten, a) {
    const e = daten.einstellungen, k = daten.kunden.find(x => x.id === a.kundeId) || {};
    const v = a.vertrag;
    const total = M.postenTotal(v.posten, v.km, e);
    const anz = M.anzahlung(total, e);
    const wahl = v.veroeffentlichung || '';
    const box = w => '<span class="box' + (wahl === w ? ' an' : '') + '"></span>';
    const zeile = (l, w) => '<tr><td style="width:44mm;font-style:italic;color:#6B5A50">' + l + '</td><td>' + (w ? esc(w) : '&nbsp;') + '</td></tr>';
    const inhalt = '<div class="seite">' + kopf(e) +
      '<div class="titelzeile"><h1 class="titel"><span class="caps">Vertrag</span><span class="skript">über Gästeinterviews an ' + (istEvent(a) ? 'eurem Anlass' : 'eurer Hochzeit') + '</span></h1></div>' +
      '<section><h2>1. Vertragsparteien und Anlass</h2><table class="posten" style="margin-top:0"><tbody>' +
        zeile('Auftragnehmer', e.firma + ', ' + e.inhaber + ', ' + e.strasse + ' ' + e.hausnummer + ', ' + e.plz + ' ' + e.ort) +
        zeile('Auftraggeber', [k.name, k.name !== k.ansprechperson ? k.ansprechperson : ''].filter(Boolean).join(', ')) +
        zeile('E-Mail, Telefon', [k.email, k.telefon].filter(Boolean).join(', ')) +
        zeile('Anlass', anlassText(a)) +
        zeile('Datum', a.datum ? M.datumCH(a.datum) : '') +
        zeile('Ort, Location', [a.location, a.gaeste ? 'ca. ' + a.gaeste + ' Gäste' : ''].filter(Boolean).join(', ')) +
        zeile('Zeitfenster vor Ort', a.zeitfenster || '') +
        zeile('Ansprechperson am Tag', a.ansprechpersonTag || '') +
      '</tbody></table></section>' +
      '<section><h2>2. Leistungen und Vergütung</h2><p>' + esc(e.firma) + ' führt am Anlass Interviews mit den Gästen durch und erstellt daraus einen geschnittenen Film. Grundlage ist die Offerte Nr. ' + esc(a.nummer) + '.</p>' +
        postenTabelle(v, e) + '<p class="hinweis">' + esc(e.mwstHinweis) + '</p>' +
        '<p>' + esc(e.firma) + ' ist kein Ersatz für eine klassische Videografie oder Fotografie. Zeremonie, Reden und Tanz werden nur gefilmt, wenn dies ausdrücklich gebucht ist.</p></section>' +
      '<section><h2>3. Zahlung und Reservation</h2><ol>' +
        '<li>Mit der Unterschrift beider Parteien und dem Eingang der Anzahlung von ' + e.anzahlungProzent + ' % (CHF ' + M.chf(anz) + ') ist das Datum verbindlich reserviert. Die Anzahlung ist innert ' + e.anzahlungFaelligTage + ' Tagen nach Unterschrift fällig.</li>' +
        '<li>Der Restbetrag von CHF ' + M.chf(total - anz) + ' ist innert ' + e.restFaelligTage + ' Tagen nach dem Anlass fällig.</li>' +
        '<li>Die Zahlungen erfolgen per QR-Rechnung, die ' + esc(e.firma) + ' per E-Mail zustellt.</li>' +
        '<li>Die ersten ' + e.kmInklusive + ' km ab ' + esc(e.ort) + ' sind inbegriffen, danach gelten CHF ' + M.chf(e.kmRappen) + ' pro km. Übernachtungen bei weit entfernten Anlässen werden separat vereinbart.</li></ol></section>' +
      '<section><h2>4. Mitwirkung der Auftraggeber</h2><ol>' +
        '<li>Die Auftraggeber stellen spätestens ' + e.ablaufVorherTage + ' Tage vor dem Anlass den Ablauf, die Ansprechperson und wünschenswerte Interviewpartner zur Verfügung.</li>' +
        '<li>Sie klären mit der Location, dass das Team filmen darf, und sorgen für Zugang, einen ruhigen Platz für die Interviews und wenn möglich einen Stromanschluss.</li>' +
        '<li>Sie informieren ihre Gäste vorgängig, zum Beispiel in der Einladung, dass Interviews gefilmt werden.</li>' +
        '<li>Die Teilnahme an Interviews ist für alle Gäste freiwillig. Wer nicht gefilmt werden möchte, wird nicht gefilmt.</li>' +
        '<li>Bei Einsätzen über 4 Stunden ist eine Mahlzeit für das Team vorgesehen.</li></ol></section>' +
      '<section><h2>5. Durchführung, Lieferung und Archivierung</h2><ol>' +
        '<li>' + esc(e.firma) + ' arbeitet mit einem Zweierteam und professioneller Technik. Auswahl der Interviewpartner und Schnitt liegen im gestalterischen Ermessen von ' + esc(e.firma) + '. Wie viele Gäste interviewt werden, hängt von Ablauf, Zeit und Bereitschaft der Gäste ab und kann nicht garantiert werden.</li>' +
        '<li>Der fertige Film wird als digitaler Download geliefert, erfahrungsgemäss innert ' + e.lieferungWochen + ' Wochen nach dem Anlass.</li>' +
        '<li>Wünsche zum fertigen Film können innert ' + e.korrekturTage + ' Tagen nach Lieferung gemeldet werden. Eine Korrekturrunde ist inbegriffen, weitere werden nach Aufwand verrechnet.</li>' +
        '<li>' + esc(e.firma) + ' bewahrt Film und Rohmaterial während ' + e.archivMonate + ' Monaten nach Lieferung auf und löscht sie danach. Die Auftraggeber sind für die eigene Sicherung verantwortlich.</li></ol></section>' +
      '<section><h2>6. Nutzungsrechte, Veröffentlichung und Datenschutz</h2><ol>' +
        '<li>Die Urheberrechte am Film bleiben bei ' + esc(e.firma) + '. Die Auftraggeber dürfen den Film zeitlich unbeschränkt privat nutzen und mit Familie und Freunden teilen.</li>' +
        (a.art === 'firma' ? '<li>Bei Firmen Events dürfen die Auftraggeber Film und Clips zusätzlich auf eigenen Kanälen veröffentlichen, mit Nennung von ' + esc(e.firma) + '.</li>' : '') +
        '<li>' + esc(e.firma) + ' darf Ausschnitte für Website und Social Media nur verwenden, wenn die Auftraggeber zustimmen:<ul class="wahl">' +
          '<li>' + box('ja') + 'Ja, Ausschnitte dürfen veröffentlicht werden.</li><li>' + box('ruecksprache') + 'Ja, aber nur nach Rücksprache.</li><li>' + box('nein') + 'Nein, keine Veröffentlichung.</li></ul></li>' +
        '<li>Personendaten und Aufnahmen werden nur für diesen Auftrag bearbeitet und nicht an Dritte weitergegeben, ausser an Dienstleister für Speicherung und Lieferung. Es gilt die Datenschutzerklärung auf ' + esc(e.web) + '.</li></ol></section>' +
      '<section><h2>7. Absage, Verschiebung, Ausfall und Haftung</h2><ol>' +
        '<li>Bei einer Absage bis ' + e.stornoGrenzeTage + ' Tage vor dem Anlass werden ' + e.stornoFruehProzent + ' % des Totals geschuldet, bei einer späteren Absage ' + e.stornoSpaetProzent + ' %. Eine Absage muss schriftlich erfolgen, E-Mail genügt.</li>' +
        '<li>Wird der Anlass verschoben, überträgt ' + esc(e.firma) + ' die Buchung kostenlos auf das neue Datum, sofern es frei ist. Sonst gilt die Regelung für Absagen.</li>' +
        '<li>Kann ' + esc(e.firma) + ' wegen Krankheit, Unfall oder höherer Gewalt nicht teilnehmen, bemüht es sich um gleichwertigen Ersatz. Ist das nicht möglich, werden alle Zahlungen vollständig zurückerstattet. Weitere Ansprüche sind ausgeschlossen.</li>' +
        '<li>Die Haftung ist auf die Höhe der vereinbarten Vergütung beschränkt, ausser bei Vorsatz oder grober Fahrlässigkeit. Für Aufnahmen, die wegen Verhalten von Gästen, Vorgaben der Location oder äusseren Umständen nicht möglich sind, wird nicht gehaftet.</li></ol></section>' +
      '<section class="schluss"><h2>8. Schlussbestimmungen und Unterschriften</h2><ol><li>Änderungen und Ergänzungen bedürfen der Schriftform, E-Mail genügt.</li>' +
        '<li>Sollte eine Bestimmung unwirksam sein, bleibt der Rest des Vertrags gültig.</li><li>Es gilt Schweizer Recht. Gerichtsstand ist ' + esc(e.ort) + '.</li></ol>' +
        '<div class="unterschrift"><div><span>Für ' + esc(e.firma) + '</span><div class="linie"></div>' + esc(e.ort) + ', ' + M.datumCH(v.datum) + '<br>' + esc(e.inhaber) + '</div>' +
        '<div><span>Für die Auftraggeber</span><div class="linie"></div>Ort, Datum<br>' + esc(k.ansprechperson || k.name || '') + '</div></div></section>' +
      fuss(e) + '</div>';
    return dokument('Vertrag ' + a.nummer + ' ' + (k.name || ''), a, inhalt, 'vertrag');
  }

  // ---------- Rechnung mit QR-Zahlteil ----------

  function qrDaten(daten, a, r) {
    const e = daten.einstellungen, k = daten.kunden.find(x => x.id === a.kundeId) || {};
    const schuldner = k.strasse && k.plz && k.ort ? { name: k.name, strasse: k.strasse, hausnummer: k.hausnummer, plz: k.plz, ort: k.ort, land: 'CH' } : null;
    return {
      iban: e.iban,
      glaeubiger: { name: e.inhaber, strasse: e.strasse, hausnummer: e.hausnummer, plz: e.plz, ort: e.ort, land: e.land || 'CH' },
      rappen: r.rappen, waehrung: 'CHF', schuldner,
      referenz: r.referenz || Q.referenzAusNummer(r.nummer),
      mitteilung: r.titel + ' ' + a.nummer
    };
  }

  function rechnungHTML(daten, a, r) {
    const e = daten.einstellungen, k = daten.kunden.find(x => x.id === a.kundeId) || {};
    const zeilen = '<tr><td>' + esc(r.titel) + '<small>' + esc(anlassText(a)) + (a.datum ? ' am ' + M.datumCH(a.datum) : '') + ', gemäss Vertrag ' + esc(a.nummer) + '</small></td><td class="betrag">' + M.chf(r.rappen) + '</td></tr>';
    const inhalt = '<div class="seite">' + kopf(e) +
      '<div class="titelzeile"><h1 class="titel"><span class="caps">Rechnung</span><span class="skript">' + esc(r.titel) + '</span></h1>' + empfaenger(k) + '</div>' +
      '<div class="meta"><div><span>Rechnung Nr.</span><b>' + esc(r.nummer) + '</b></div><div><span>Datum</span><b>' + M.datumCH(r.datum) + '</b></div>' +
      '<div><span>Zahlbar bis</span><b>' + M.datumCH(r.faellig) + '</b></div><div><span>Auftrag</span><b>' + esc(a.nummer) + '</b></div></div>' +
      '<p>' + esc(anrede(a, k)) + '</p><p>' + esc(r.text || 'Vielen Dank für euer Vertrauen. Wir erlauben uns, euch folgenden Betrag in Rechnung zu stellen.') + '</p>' +
      '<table class="posten"><thead><tr><th>Leistung</th><th class="betrag">CHF</th></tr></thead><tbody>' + zeilen +
      '<tr class="total"><td>Total CHF</td><td class="betrag">' + M.chf(r.rappen) + '</td></tr></tbody></table>' +
      '<p class="hinweis">' + esc(e.mwstHinweis) + '</p>' +
      '<p>Bitte bezahlt den Betrag bis ' + M.datumCH(r.faellig) + ' mit dem QR-Code unten in eurer Banking-App. Herzlichen Dank.</p>' +
      '<p>Herzliche Grüsse<br>' + esc(e.inhaber) + '</p>' +
      Q.zahlteilHTML(qrDaten(daten, a, r)) + '</div>';
    return dokument('Rechnung ' + r.nummer + ' ' + (k.name || ''), a, inhalt, 'rechnung');
  }

  // ---------- Mahnung ----------

  function mahnungHTML(daten, a, r, m) {
    const e = daten.einstellungen, k = daten.kunden.find(x => x.id === a.kundeId) || {};
    const total = M.mahnTotal(r, m);
    const texte = {
      1: 'Vielleicht ist es im Alltag untergegangen: Unsere Rechnung Nr. ' + r.nummer + ' vom ' + M.datumCH(r.datum) + ' war am ' + M.datumCH(r.faellig) + ' fällig, und wir haben noch keine Zahlung erhalten. Wir bitten euch, den Betrag bis ' + M.datumCH(m.frist) + ' zu überweisen. Falls ihr bereits bezahlt habt, betrachtet dieses Schreiben bitte als gegenstandslos.',
      2: 'Leider ist unsere Rechnung Nr. ' + r.nummer + ' vom ' + M.datumCH(r.datum) + ' trotz Zahlungserinnerung noch offen. Wir bitten euch, den ausstehenden Betrag bis ' + M.datumCH(m.frist) + ' zu begleichen.',
      3: 'Unsere Rechnung Nr. ' + r.nummer + ' vom ' + M.datumCH(r.datum) + ' ist trotz zwei Mahnungen noch nicht bezahlt. Wir fordern euch auf, den Betrag bis spätestens ' + M.datumCH(m.frist) + ' zu überweisen. Ohne Zahlung bis zu diesem Datum müssen wir weitere Schritte einleiten, insbesondere die Betreibung.'
    };
    const vorher = (r.mahnungen || []).filter(x => x.stufe < m.stufe).map(x => x.titel + ' vom ' + M.datumCH(x.datum)).join(', ');
    let zeilen = '<tr><td>' + esc(r.titel) + '<small>Rechnung ' + esc(r.nummer) + ' vom ' + M.datumCH(r.datum) + ', fällig am ' + M.datumCH(r.faellig) + '</small></td><td class="betrag">' + M.chf(r.rappen) + '</td></tr>';
    (r.mahnungen || []).filter(x => x.stufe <= m.stufe && x.gebuehr).forEach(x => {
      zeilen += '<tr><td>Mahngebühr<small>' + esc(x.titel) + '</small></td><td class="betrag">' + M.chf(x.gebuehr) + '</td></tr>';
    });
    const qr = qrDaten(daten, a, r); qr.rappen = total; qr.mitteilung = m.titel + ' ' + r.nummer;
    const inhalt = '<div class="seite">' + kopf(e) +
      '<div class="titelzeile"><h1 class="titel"><span class="caps">' + esc(m.titel) + '</span><span class="skript">' + esc(r.titel) + '</span></h1>' + empfaenger(k) + '</div>' +
      '<div class="meta"><div><span>Rechnung Nr.</span><b>' + esc(r.nummer) + '</b></div><div><span>Datum</span><b>' + M.datumCH(m.datum) + '</b></div>' +
      '<div><span>Neu zahlbar bis</span><b>' + M.datumCH(m.frist) + '</b></div><div><span>Auftrag</span><b>' + esc(a.nummer) + '</b></div></div>' +
      '<p>' + esc(anrede(a, k)) + '</p><p>' + esc(texte[m.stufe]) + '</p>' +
      (vorher ? '<p class="hinweis" style="margin-bottom:2mm">Bisher: ' + esc(vorher) + '</p>' : '') +
      '<table class="posten"><thead><tr><th>Offener Betrag</th><th class="betrag">CHF</th></tr></thead><tbody>' + zeilen +
      '<tr class="total"><td>Total CHF</td><td class="betrag">' + M.chf(total) + '</td></tr></tbody></table>' +
      '<p>Am einfachsten bezahlt ihr mit dem QR-Code unten in eurer Banking-App. Bei Fragen meldet euch gerne unter ' + esc(e.email) + '.</p>' +
      '<p>' + (m.stufe === 1 ? 'Herzliche Grüsse' : 'Freundliche Grüsse') + '<br>' + esc(e.inhaber) + '</p>' +
      Q.zahlteilHTML(qr) + '</div>';
    return dokument(m.titel + ' ' + r.nummer + ' ' + (k.name || ''), a, inhalt, 'rechnung');
  }


  // ---------- Mailvorlagen ----------
  // Platzhalter in geschweiften Klammern werden beim Senden ersetzt. Eigene Texte aus den Einstellungen haben Vorrang.
  const MAIL_VORLAGEN = {
    offerte: { name: 'Offerte', betreff: 'Eure Offerte für {ihr_anlass}',
      text: '{anrede}\n\nHerzlichen Dank für eure Anfrage, wir haben uns sehr darüber gefreut! Im Anhang findet ihr eure persönliche Offerte für {ihr_anlass}{am_datum}. Sie ist bis am {gueltig} gültig.\n\nSchaut sie euch in Ruhe an. Wenn ihr Fragen habt oder etwas anpassen möchtet, telefonieren wir gerne kurz miteinander. Ruft einfach an unter {telefon} oder schreibt mir, wann es euch passt.\n\nWenn alles für euch stimmt, schicke ich euch gerne den Vertrag.\n\nHerzliche Grüsse\n{absender}\n{firma}' },
    vertrag: { name: 'Vertrag', betreff: 'Euer Vertrag für {ihr_anlass}',
      text: '{anrede}\n\nWie schön, dass ihr euch für uns entschieden habt! Im Anhang findet ihr den Vertrag für {ihr_anlass}{am_datum}. Bitte unterschreibt ihn und schickt ihn mir zurück, ein Foto oder ein Scan reicht völlig. Danach erhaltet ihr die Rechnung für die Anzahlung, und euer Datum ist fix für euch reserviert.\n\nFalls beim Durchlesen Fragen auftauchen, telefonieren wir gerne kurz. Ihr erreicht mich unter {telefon}.\n\nWir freuen uns schon sehr auf {ihr_anlass}!\n\nHerzliche Grüsse\n{absender}\n{firma}' },
    rechnung: { name: 'Rechnung', betreff: 'Rechnung {nummer}, {titel}',
      text: '{anrede}\n\nIm Anhang findet ihr die Rechnung {nummer} ({titel}) über CHF {betrag}. Am einfachsten bezahlt ihr sie bis am {faellig} mit dem QR-Code in eurer Banking-App.\n\nHabt ihr Fragen dazu? Dann ruft mich gerne an unter {telefon}, wir klären das kurz am Telefon.\n\nHerzlichen Dank und liebe Grüsse\n{absender}\n{firma}' },
    mahnung: { name: 'Mahnung', betreff: '{mahnstufe} zu Rechnung {nummer}',
      text: '{anrede}\n\nVielleicht ist es im Alltag untergegangen: Für die Rechnung {nummer} über CHF {betrag} haben wir noch keine Zahlung erhalten. Im Anhang findet ihr die {mahnstufe}. Wir wären froh, wenn ihr den Betrag bis am {faellig} überweist.\n\nFalls ihr in der Zwischenzeit schon bezahlt habt, ist alles gut und ihr könnt diese Mail einfach ignorieren. Und wenn etwas nicht passt, ruft mich gerne an unter {telefon}. Wir finden bestimmt eine Lösung.\n\nHerzliche Grüsse\n{absender}\n{firma}' }
  };
  const PLATZHALTER = ['anrede', 'nummer', 'ihr_anlass', 'am_datum', 'gueltig', 'titel', 'betrag', 'faellig', 'mahnstufe', 'absender', 'firma', 'telefon'];

  function mail(daten, a, art, r, m) {
    const e = daten.einstellungen, k = daten.kunden.find(x => x.id === a.kundeId) || {};
    const eigene = (e.mailVorlagen || {})[art] || {}, std = MAIL_VORLAGEN[art];
    const werte = {
      anrede: anrede(a, k).replace(/[,!.]\s*$/, '') + ',',
      nummer: r ? r.nummer : a.nummer,
      ihr_anlass: ihr(a),
      am_datum: a.datum ? ' am ' + M.datumCH(a.datum) : '',
      gueltig: a.offerte && a.offerte.datum ? M.datumCH(M.plusTage(a.offerte.datum, e.offerteGueltigTage)) : '',
      titel: r ? r.titel : '',
      betrag: r ? M.chf(m ? M.mahnTotal(r, m) : r.rappen) : '',
      faellig: m ? M.datumCH(m.frist) : r ? M.datumCH(r.faellig) : '',
      mahnstufe: m ? m.titel : '',
      absender: e.inhaber || '', firma: e.firma || '', telefon: e.telefon || ''
    };
    const fuellen = t => String(t || '').replace(/\{(\w+)\}/g, (x, n) => n in werte ? werte[n] : x);
    return { an: k.email || '', betreff: fuellen(eigene.betreff || std.betreff), text: fuellen(eigene.text || std.text) };
  }

  global.Dokumente = { offerteHTML, vertragHTML, rechnungHTML, mahnungHTML, qrDaten, mail, MAIL_VORLAGEN, PLATZHALTER };
})(typeof window !== 'undefined' ? window : globalThis);
