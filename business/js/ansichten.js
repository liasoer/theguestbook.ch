// theguestbook business: die einzelnen Ansichten
(function () {
  'use strict';
  const app = window.App, M = window.Modell, Q = window.QRRechnung, D = window.Dokumente, B = window.Bruecke;
  const esc = app.esc, A = app.ansichten;
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const E = () => app.daten.einstellungen;

  // ---------- Gemeinsame Bausteine ----------

  // Formularfelder mit data-bind="objekt.feld" schreiben direkt ins Modell.
  function binden(main, objekte, nachher) {
    main.addEventListener('change', e => {
      const el = e.target, b = el.dataset && el.dataset.bind;
      if (!b) return;
      const [obj, ...pfad] = b.split('.');
      const ziel = objekte()[obj];
      if (!ziel) return;
      let wert = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.typ === 'zahl') wert = el.value === '' ? '' : Number(el.value);
      if (el.dataset.typ === 'rappen') {
        const r = M.rappenAusText(el.value);
        if (r == null) { app.melden('Betrag ungültig. Beispiel: 1900 oder 49.90', true); return; }
        wert = r;
      }
      let o = ziel; pfad.slice(0, -1).forEach(k => { o = o[k] = o[k] || {}; });
      o[pfad.at(-1)] = wert;
      if (nachher) nachher(b, wert);
      app.aendern();
    });
  }
  const feld = (label, bind, wert, opt = {}) =>
    '<label class="feld' + (opt.breit ? ' breit' : '') + '"><span>' + esc(label) + '</span>' +
    (opt.auswahl ? '<select data-bind="' + bind + '">' + opt.auswahl.map(([v, t]) => '<option value="' + esc(v) + '"' + (String(v) === String(wert ?? '') ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select>'
      : opt.mehrzeilig ? '<textarea data-bind="' + bind + '" placeholder="' + esc(opt.platz || '') + '">' + esc(wert) + '</textarea>'
      : '<input data-bind="' + bind + '"' + (opt.typ ? ' data-typ="' + opt.typ + '"' : '') + ' type="' + (opt.art || 'text') + '" value="' + esc(opt.typ === 'rappen' ? (wert != null ? (wert / 100).toFixed(2) : '') : wert) + '"' +
        (opt.platz ? ' placeholder="' + esc(opt.platz) + '"' : '') + (opt.typ === 'rappen' ? ' class="betrag"' : '') + '>') +
    (opt.hilfe ? '<small>' + opt.hilfe + '</small>' : '') + '</label>';

  function klick(main, aktionen) {
    main.addEventListener('click', e => {
      const el = e.target.closest('[data-aktion]');
      if (!el || !main.contains(el)) return;
      const f = aktionen[el.dataset.aktion];
      if (f) { e.preventDefault(); f(el.dataset.wert, el); }
    });
  }

  function alleFristen() {
    const liste = [];
    app.daten.auftraege.forEach(a => {
      if (['abgesagt', 'archiv'].includes(a.status)) return;
      M.fristen(a, E()).filter(f => !f.erledigt).forEach(f => liste.push({ ...f, a }));
    });
    return liste.sort((x, y) => x.datum.localeCompare(y.datum));
  }

  // ---------- Übersicht ----------

  // Alles, was ansteht, in einer Liste: überfällige Rechnungen, Überweisungen, neue Anfragen, Fristen
  function zuErledigen() {
    const heute = M.heute(), e = E(), liste = [];
    M.offeneRechnungen(app.daten).filter(x => x.ueberfaellig).forEach(x => liste.push({
      sort: x.frist, wann: '<span class="frist-ueber">seit ' + x.tageUeber + ' T.</span>', a: x.a,
      titel: 'Rechnung überfällig, CHF ' + M.chf(x.r.rappen), info: app.kunde(x.a).name + ', ' + x.r.titel + (x.stufe ? ', ' + M.MAHNSTUFEN[x.stufe - 1] + ' verschickt' : ''),
      knopf: ['auftrag-mahnungen', 'Mahnen', 'gefahr'] }));
    M.mitarbeiterOffen(app.daten).forEach(a => liste.push({
      sort: a.datum || heute, wann: '<span class="frist-bald">fällig</span>', a,
      titel: 'CHF ' + M.chf(M.mitarbeiterAnteil(a, e)) + ' an ' + ((e.mitarbeiter.find(m => m.id === a.mitarbeiterId) || {}).name || 'Mitarbeiterin') + ' überweisen', info: app.kunde(a).name + ', ' + a.nummer,
      knopf: ['ueberwiesen', 'Überwiesen', 'haupt'] }));
    app.daten.auftraege.filter(a => a.status === 'anfrage' && !a.offerte).forEach(a => liste.push({
      sort: a.erstellt || heute, wann: '<span class="frist-bald">neu</span>', a,
      titel: 'Neue Anfrage, Offerte erstellen', info: app.kunde(a).name + ', ' + app.artName(a.art) + (a.datum ? ' am ' + M.datumCH(a.datum) : '') }));
    // Zahlungsfristen nur, solange es noch keine Rechnung dazu gibt (die Rechnung hat ihre eigene Frist)
    alleFristen().filter(f => M.tageZwischen(heute, f.datum) <= 30)
      .filter(f => !((f.art === 'anzahlung' || f.art === 'rest') && (f.a.rechnungen || []).some(r => r.art === f.art)))
      .forEach(f => liste.push({ sort: f.datum, wann: '<span class="' + app.fristKlasse(f.datum) + '">' + esc(app.wann(f.datum)) + '</span>', a: f.a, titel: f.text, info: app.kunde(f.a).name + ', ' + f.a.nummer }));
    return liste.sort((x, y) => String(x.sort).localeCompare(String(y.sort)));
  }

  // Kennzahlen in drei Gruppen: Geld, laufendes Jahr, Aufträge. Jede Kachel führt zur passenden Ansicht.
  function kennzahlenGruppen(aktiv, kommende, offen, ahv, jahr) {
    const heute = M.heute(), e = E();
    const er = M.erfolgsrechnung(app.daten, jahr);
    const rech = M.offeneRechnungen(app.daten), ueber = rech.filter(x => x.ueberfaellig);
    const rechSumme = rech.reduce((t, x) => t + x.r.rappen, 0), ueberSumme = ueber.reduce((t, x) => t + x.r.rappen, 0);
    const maOffen = M.mitarbeiterOffen(app.daten), maSumme = maOffen.reduce((t, a) => t + M.mitarbeiterAnteil(a, e), 0);
    const phase = id => aktiv.filter(a => M.phase(a) === id);
    const anfragen = phase('anfrage'), offerten = phase('offerte'), gebucht = phase('gebucht'), nachher = phase('nachher');
    const filmOffen = nachher.filter(a => !a.geliefertAm);
    const naechster = kommende[0];
    const saison = jahr + 1, inSaison = aktiv.filter(a => (a.datum || '').startsWith(String(saison)) && ['gebucht', 'nachher', 'fertig'].includes(M.phase(a)));
    const umsatzGebucht = gebucht.reduce((t, a) => t + app.total(a), 0);
    const kachel = (label, wert, info, ziel, klasse) => '<button class="kachel' + (klasse ? ' ' + klasse : '') + '" data-aktion="ziel" data-wert="' + ziel + '">' +
      '<span class="k-label">' + label + '</span><b class="k-wert zahl">' + wert + '</b><span class="k-info">' + info + '</span></button>';
    const chf = r => 'CHF ' + M.chf(r);
    const gruppe = (titel, inhalt) => '<section class="gruppe"><h2>' + titel + '</h2><div class="kacheln">' + inhalt + '</div></section>';
    return '<div class="gruppen">' +
      gruppe('Aufträge',
        kachel('Neue Anfragen', anfragen.length, anfragen.length ? anfragen.filter(a => !a.offerte).length + ' ohne Offerte' : 'keine offen', 'auftraege', anfragen.some(a => !a.offerte) ? 'warn' : '') +
        kachel('Offerten offen', offerten.length, offerten.length ? 'warten auf Antwort' : 'keine', 'auftraege') +
        kachel('Gebucht', gebucht.length, naechster ? 'nächster ' + app.wann(naechster.datum) : 'keine geplant', 'auftraege') +
        kachel('Film liefern', filmOffen.length, filmOffen.length ? 'nach dem Anlass' : 'alles geliefert', 'auftraege', filmOffen.length ? 'warn' : '')) +
      gruppe('Geld',
        kachel('Rechnungen offen', chf(rechSumme), rech.length ? rech.length + (rech.length === 1 ? ' Rechnung' : ' Rechnungen') : 'keine offen', 'auftraege') +
        kachel('Überfällig', chf(ueberSumme), ueber.length ? ueber.length + ' zum Mahnen' : 'nichts überfällig', 'auftraege', ueber.length ? 'krit' : '') +
        kachel('Noch zu verrechnen', chf(Math.max(0, offen - rechSumme)), 'aus gebuchten Aufträgen', 'auftraege') +
        kachel('An Mitarbeiterin', chf(maSumme), maOffen.length ? maOffen.length + ' zu überweisen' : 'alles überwiesen', 'start', maOffen.length ? 'warn' : '')) +
      gruppe('Jahr ' + jahr,
        kachel('Einnahmen', chf(er.totalErtrag), 'gebucht im Kassenbuch', 'kassenbuch') +
        kachel('Ausgaben', chf(er.totalAufwand), 'inkl. Mitarbeiterin', 'kassenbuch') +
        kachel('Gewinn', chf(ahv.gewinnNach), 'nach Sozialversicherung', 'steuern') +
        kachel('AHV zurücklegen', chf(ahv.offen), ahv.offen > 0 ? 'für die SVA Thurgau' : 'gedeckt', 'steuern', ahv.offen > 0 ? 'warn' : '')) +
      gruppe('Ausblick',
        kachel('Nächster Anlass', naechster ? M.datumCH(naechster.datum) : 'keiner', naechster ? app.kunde(naechster).name : 'noch keiner gebucht', naechster ? 'auftrag:' + naechster.id : 'kalender') +
        kachel('Umsatz gebucht', chf(umsatzGebucht), 'aus ' + gebucht.length + (gebucht.length === 1 ? ' Auftrag' : ' Aufträgen'), 'auftraege') +
        kachel('Saison ' + saison, inSaison.length, inSaison.length === 1 ? 'Anlass gebucht' : 'Anlässe gebucht', 'kalender') +
        kachel('Anlässe ' + jahr, aktiv.concat(app.daten.auftraege.filter(a => a.status === 'archiv')).filter(a => (a.datum || '').startsWith(String(jahr)) && a.datum <= heute && M.stufe(a.status) >= M.stufe('vertrag')).length, 'durchgeführt', 'kalender')) +
      '</div>';
  }

  A.start = () => {
    const heute = M.heute(), jahr = +heute.slice(0, 4);
    const aktiv = app.daten.auftraege.filter(a => !['abgesagt', 'archiv'].includes(a.status));
    const offen = aktiv.reduce((s, a) => s + app.offen(a), 0);
    const kommende = aktiv.filter(a => a.datum && a.datum >= heute && !['anfrage', 'offerte'].includes(a.status)).sort((x, y) => x.datum.localeCompare(y.datum));
    const ahv = M.ahvBerechnung(app.daten, jahr);
    const todo = zuErledigen();

    return '<div class="kopfzeile"><h1>Übersicht<small>' + new Date().toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '</small></h1>' +
      '<div class="aktionen"><button class="knopf" data-aktion="anfrage">Anfrage einfügen</button><button class="knopf haupt" data-aktion="neu">Neuer Auftrag</button></div></div>' +
      (!app.sync.konfig && !B.istMac ? '<div class="hinweis warn"><div><strong>Noch nicht mit dem Mac verbunden</strong><p>Unter Mehr, Abgleich gibst du einmal deinen GitHub-Schlüssel ein. Danach siehst du hier dieselben Daten wie am Mac.</p></div></div>' : '') +
      (app.sync.status === 'fehler' ? '<div class="hinweis krit"><div><strong>Abgleich mit GitHub fehlgeschlagen</strong><p>' + esc(app.sync.fehler) + '</p></div></div>' : '') +
      '<div class="start-inhalt">' + kennzahlenGruppen(aktiv, kommende, offen, ahv, jahr) +
      '<div class="raster zwei">' +
        '<div class="karte zu-erledigen"><h2>Zu erledigen</h2>' + (todo.length ? '<div class="zeilen">' + todo.map(t =>
          '<div class="zeile" data-aktion="auftrag" data-wert="' + t.a.id + '"><div class="datum">' + t.wann + '</div>' +
          '<div class="haupt"><b>' + esc(t.titel) + '</b><span>' + esc(t.info) + '</span></div>' +
          (t.knopf ? '<button class="knopf klein ' + t.knopf[2] + '" data-aktion="' + t.knopf[0] + '" data-wert="' + t.a.id + '">' + t.knopf[1] + '</button>'
            : (() => { const sch = naechsterSchritt(t.a); return sch ? '<button class="knopf klein" data-aktion="schritt" data-wert="' + t.a.id + ':' + sch[0] + '">' + esc(kurz(sch[1])) + '</button>' : ''; })()) + '</div>').join('') + '</div>'
          : '<div class="leer"><strong>Alles erledigt</strong>Neue Anfragen, fällige Zahlungen und Fristen erscheinen hier.</div>') + '</div>' +
        '<div class="karte"><h2>Nächste Anlässe</h2>' + (kommende.length ? '<div class="zeilen">' + kommende.slice(0, 5).map(a =>
          '<div class="zeile" data-aktion="auftrag" data-wert="' + a.id + '"><div class="datum">' + M.datumCH(a.datum) + '</div>' +
          '<div class="haupt"><b>' + esc(app.kunde(a).name) + '</b><span>' + esc(app.artName(a.art)) + (a.location ? ', ' + esc(a.location) : '') + '</span></div></div>').join('') + '</div>'
          : '<div class="leer"><strong>Noch keine Anlässe</strong>Sobald ein Vertrag unterschrieben ist, steht der Anlass hier.</div>') + '</div>' +
      '</div></div>';
  };
  // Nächsten Schritt eines Auftrags auslösen: Auftrag öffnen und dort denselben Knopf drücken
  function schrittAusfuehren(w) {
    const [id, aktion] = w.split(':');
    app.oeffnen('auftrag', id, aktion === 'tab-rechnungen' ? 'rechnungen' : 'auftrag');
    const knopf = document.querySelector('main .kopfzeile [data-aktion="' + aktion + '"]');
    if (knopf && aktion !== 'tab-rechnungen') knopf.click();
  }
  A.start.danach = main => klick(main, {
    schritt: schrittAusfuehren,
    ziel: z => {
      if (z.startsWith('auftrag:')) return app.oeffnen('auftrag', z.slice(8), 'auftrag');
      if (z === 'steuern') { app.kb.tab = 'er'; return app.oeffnen('kassenbuch'); }
      if (z === 'kassenbuch') app.kb.tab = 'liste';
      if (z !== 'start') app.oeffnen(z);
      else { const el = document.querySelector('.zu-erledigen'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }
    },
    'auftrag-rechnungen': id => app.oeffnen('auftrag', id, 'rechnungen'),
    'auftrag-mahnungen': id => app.oeffnen('auftrag', id, 'mahnungen'),
    anfrage: () => app.anfrageEinfuegen(),
    neu: () => neuerAuftrag(),
    auftrag: id => app.oeffnen('auftrag', id, 'auftrag'),
    ueberwiesen: async id => {
      const a = app.auftrag(id), e = E(), m = e.mitarbeiter.find(x => x.id === a.mitarbeiterId);
      const d = await app.datumFragen('Überweisung an ' + (m ? m.name : 'Mitarbeiterin'), 'CHF ' + M.chf(M.mitarbeiterAnteil(a, e)) + ' für Auftrag ' + a.nummer + ' werden als Fremdleistung ins Kassenbuch gebucht.', M.heute(), 'Als überwiesen buchen'); if (!d) return;
      M.mitarbeiterAuszahlen(app.daten, a, d, 'Bank'); app.melden('Als überwiesen gebucht'); app.aendern();
    }
  });

  async function neuerAuftrag() {
    const kunden = app.daten.kunden.slice().sort((a, b) => a.name.localeCompare(b.name));
    const r = await app.dialog({
      titel: 'Neuer Auftrag',
      inhalt: '<div class="felder">' +
        '<label class="feld breit"><span>Kunde</span><select name="kunde"><option value="">Neuer Kunde</option>' + kunden.map(k => '<option value="' + k.id + '">' + esc(k.name) + '</option>').join('') + '</select></label>' +
        '<label class="feld"><span>Vorname</span><input name="vorname"></label><label class="feld"><span>Nachname oder Firma</span><input name="nachname"></label>' +
        '<label class="feld"><span>E-Mail</span><input name="email" type="email"></label><label class="feld"><span>Telefon</span><input name="telefon"></label>' +
        '<label class="feld"><span>Anlass</span><select name="art">' + M.ARTEN.map(x => '<option value="' + x.id + '">' + x.name + '</option>').join('') + '</select></label>' +
        '<label class="feld"><span>Datum</span><input name="datum" type="date"></label>' +
        '<label class="feld"><span>Quelle</span><select name="quelle">' + M.QUELLEN.map(q => '<option>' + q + '</option>').join('') + '</select></label>' +
        '<label class="feld"><span>Location</span><input name="location"></label></div>',
      knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Anlegen', art: 'haupt', wert: true }],
      pruefen: f => { const ok = f.kunde.value || f.vorname.value.trim() || f.nachname.value.trim(); if (!ok) app.melden('Bitte einen Namen eingeben oder einen Kunden wählen.', true); return !!ok; }
    });
    if (!r.wert) return;
    const w = r.werte;
    let k = app.daten.kunden.find(x => x.id === w.kunde);
    if (!k) {
      const name = [w.vorname, w.nachname].filter(Boolean).join(' ').trim();
      k = { id: M.id(), name: w.art === 'firma' && w.nachname ? w.nachname : name, ansprechperson: name, vorname: w.vorname, nachname: w.nachname, email: w.email, telefon: w.telefon, quelle: w.quelle, erstellt: M.heute() };
      app.daten.kunden.push(k);
    }
    const a = { id: M.id(), nummer: M.neueAuftragsnummer(app.daten, new Date().getFullYear()), kundeId: k.id, art: w.art, status: 'anfrage', datum: w.datum,
      location: w.location, quelle: w.quelle, wunschPosten: [], rechnungen: [], notizen: [], erstellt: M.heute() };
    M.mitarbeiterVorgabe(app.daten, a);
    app.daten.auftraege.push(a);
    app.aendern(false);
    app.oeffnen('auftrag', a.id, 'auftrag');
  }
  app.neuerAuftrag = neuerAuftrag;

  // ---------- Aufträge als Board ----------

  A.auftraege = () => {
    const f = app.filter, s = f.suche.toLowerCase(), heute = M.heute();
    const ueberfaellig = new Set(M.offeneRechnungen(app.daten).filter(x => x.ueberfaellig).map(x => x.a.id));
    const sichtbar = app.daten.auftraege
      .filter(a => !s || [a.nummer, app.kunde(a).name, app.kunde(a).email, a.location].join(' ').toLowerCase().includes(s))
      .filter(a => f.abgesagte || a.status !== 'abgesagt');

    const karte = a => {
      const k = app.kunde(a), schritt = naechsterSchritt(a), nf = M.naechsteFrist(a, E(), heute);
      const hinweise = [];
      if (ueberfaellig.has(a.id)) hinweise.push('<span class="frist-ueber">Rechnung überfällig</span>');
      else if (nf && !['bezahlt', 'archiv', 'abgesagt'].includes(a.status) && M.tageZwischen(heute, nf.datum) <= 14)
        hinweise.push('<span class="' + app.fristKlasse(nf.datum) + '">' + esc(nf.text) + ' ' + esc(app.wann(nf.datum)) + '</span>');
      if (M.mitarbeiterStatus(a) === 'offen') hinweise.push('<span class="frist-bald">Mitarbeiterin überweisen</span>');
      const geld = app.offen(a) ? 'offen CHF ' + M.chf(app.offen(a)) : app.total(a) ? 'CHF ' + M.chf(app.total(a)) : '';
      return '<div class="bkarte' + (app.istEvent(a) ? ' event' : '') + '" data-aktion="auftrag" data-wert="' + a.id + '" tabindex="0">' +
        '<div class="bk-kopf"><b>' + esc(k.name) + '</b>' + (a.statusManuell ? '<span class="leise" title="Status von Hand gesetzt">✎</span>' : '') + '</div>' +
        '<div class="bk-zeile">' + (a.datum ? M.datumCH(a.datum) : 'ohne Datum') + ' · ' + app.artChip(a) + '</div>' +
        (a.location ? '<div class="bk-zeile leise">' + esc(a.location) + '</div>' : '') +
        (geld ? '<div class="bk-zeile zahl">' + geld + '</div>' : '') +
        (hinweise.length ? '<div class="bk-hinweise">' + hinweise.join('') + '</div>' : '') +
        (a.status === 'abgesagt' ? '<div>' + app.chip('abgesagt') + '</div>' : '') +
        (schritt && a.status !== 'abgesagt' ? '<button class="knopf klein" data-aktion="schritt" data-wert="' + a.id + ':' + schritt[0] + '">' + esc(kurz(schritt[1])) + '</button>' : '') +
      '</div>';
    };

    const spalten = M.PHASEN.map(p => {
      let liste = sichtbar.filter(a => M.phase(a) === p.id || (p.id === 'fertig' && a.status === 'abgesagt'));
      liste.sort((x, y) => p.id === 'fertig' ? (y.datum || '').localeCompare(x.datum || '') : (x.datum || '9999').localeCompare(y.datum || '9999'));
      let mehr = 0;
      if (p.id === 'fertig' && !s && liste.length > 8) { mehr = liste.length - 8; liste = liste.slice(0, 8); }
      return '<section class="spalte"><h2>' + p.name + ' <span class="anz">' + (liste.length + mehr) + '</span></h2>' +
        (liste.length ? liste.map(karte).join('') : '<p class="spalte-leer">Keine</p>') +
        (mehr ? '<p class="spalte-leer">und ' + mehr + ' ältere, über die Suche finden</p>' : '') + '</section>';
    }).join('');

    return '<div class="kopfzeile"><h1>Aufträge<small>Der Status läuft automatisch mit. Klick auf einen Auftrag öffnet ihn.</small></h1>' +
      '<div class="aktionen"><button class="knopf" data-aktion="anfrage">Anfrage einfügen</button><button class="knopf haupt" data-aktion="neu">Neuer Auftrag</button></div></div>' +
      '<div class="filter"><input type="search" placeholder="Suchen" value="' + esc(f.suche) + '" data-aktion-input="suche" aria-label="Suchen">' +
        '<label class="check"><input type="checkbox" data-aktion-change="abgesagte"' + (f.abgesagte ? ' checked' : '') + '> Abgesagte zeigen</label></div>' +
      '<div class="board">' + spalten + '</div>' +
      '<p style="margin:18px 0 0"><button class="knopf text" data-aktion="kunden">Alle Kunden anzeigen</button></p>';
  };
  const kurz = t => t.replace('Rechnung für die Anzahlung erstellen', 'Rechnung Anzahlung').replace('Rechnung für die Restzahlung erstellen', 'Rechnung Rest')
    .replace('Zahlung der Anzahlung erfassen', 'Anzahlung erfassen').replace('Zahlung der Restzahlung erfassen', 'Restzahlung erfassen')
    .replace('Vertrag als unterschrieben markieren', 'Vertrag unterschrieben').replace('Offerte als verschickt markieren', 'Offerte verschickt')
    .replace('Film als geliefert markieren', 'Film geliefert');

  A.auftraege.danach = main => {
    klick(main, {
      anfrage: () => app.anfrageEinfuegen(),
      neu: () => neuerAuftrag(),
      auftrag: id => app.oeffnen('auftrag', id, 'auftrag'),
      kunden: () => app.oeffnen('kunden'),
      schritt: w => {
        const [id, aktion] = w.split(':');
        app.oeffnen('auftrag', id, aktion === 'tab-rechnungen' ? 'rechnungen' : 'auftrag');
        // Den gleichen Knopf im Auftrag auslösen, damit alles an einem Ort definiert ist
        const knopf = document.querySelector('main .kopfzeile [data-aktion="' + aktion + '"]');
        if (knopf && aktion !== 'tab-rechnungen') knopf.click();
      }
    });
    main.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList.contains('bkarte')) app.oeffnen('auftrag', e.target.dataset.wert, 'auftrag'); });
    main.querySelector('[data-aktion-change="abgesagte"]').addEventListener('change', e => { app.filter.abgesagte = e.target.checked; app.zeichnen(); });
    const suche = main.querySelector('[data-aktion-input="suche"]');
    suche.addEventListener('input', e => {
      app.filter.suche = e.target.value; const pos = e.target.selectionStart; app.zeichnen();
      const neu = document.querySelector('[data-aktion-input="suche"]'); neu.focus(); neu.setSelectionRange(pos, pos);
    });
  };

  // ---------- Auftrag ----------

  function postenEditor(dok, name) {
    const e = E();
    const zeilen = (dok.posten || []).map((p, i) =>
      '<tr><td style="width:45%"><input data-posten="' + i + '" data-f="name" value="' + esc(p.name) + '" aria-label="Leistung"><input class="beschr" data-posten="' + i + '" data-f="beschreibung" value="' + esc(p.beschreibung || '') + '" placeholder="Beschreibung" aria-label="Beschreibung"></td>' +
      '<td class="r" style="width:140px"><input class="betrag" data-posten="' + i + '" data-f="rappen" value="' + (p.rappen / 100).toFixed(2) + '" aria-label="Betrag CHF"></td>' +
      '<td style="width:36px"><button class="entfernen" data-aktion="posten-weg" data-wert="' + i + '" title="Position entfernen" aria-label="Position entfernen">×</button></td></tr>').join('');
    const km = M.kmBetrag(dok.km || 0, e);
    return '<table class="tabelle posten" data-dok="' + name + '"><thead><tr><th>Leistung</th><th class="r">CHF</th><th></th></tr></thead><tbody>' + zeilen +
      '<tr><td><div class="check" style="gap:8px;flex-wrap:nowrap;white-space:nowrap">Anfahrt <input type="number" min="0" step="1" style="width:80px" data-km value="' + esc(dok.km || 0) + '" aria-label="Kilometer"> km ab ' + esc(e.ort) + '</div>' +
      '<div class="beschr" style="padding:2px 7px 0">' + e.kmInklusive + ' km inklusive, danach CHF ' + M.chf(e.kmRappen) + ' pro km</div></td><td class="r zahl">' + M.chf(km) + '</td><td></td></tr>' +
      '<tr class="summe"><td>Total</td><td class="r zahl">' + M.chf(M.postenTotal(dok.posten, dok.km, e)) + '</td><td></td></tr></tbody></table>' +
      '<div class="aktionen" style="margin-top:10px"><select class="eingabe" style="width:auto" data-paket aria-label="Paket hinzufügen"><option value="">Paket hinzufügen</option>' +
      e.pakete.map(p => '<option value="' + p.id + '">' + esc(p.name) + ', CHF ' + M.chf(p.rappen) + '</option>').join('') + '</select>' +
      '<button class="knopf klein" data-aktion="posten-frei">Freie Position</button></div>';
  }
  function postenBinden(main, a) {
    main.addEventListener('change', ev => {
      const el = ev.target, tab = el.closest('[data-dok]') || (el.dataset.paket !== undefined ? main.querySelector('[data-dok]') : null);
      if (!tab) return;
      const dok = a[tab.dataset.dok];
      if (el.dataset.posten !== undefined) {
        const p = dok.posten[+el.dataset.posten];
        if (el.dataset.f === 'rappen') { const r = M.rappenAusText(el.value); if (r == null) return app.melden('Betrag ungültig', true); p.rappen = r; }
        else p[el.dataset.f] = el.value;
      } else if (el.dataset.km !== undefined) dok.km = Math.max(0, Number(el.value) || 0);
      else return;
      dok.total = M.postenTotal(dok.posten, dok.km, E());
      app.aendern();
    });
    const paket = main.querySelector('[data-paket]');
    if (paket) paket.addEventListener('change', () => {
      const dok = a[main.querySelector('[data-dok]').dataset.dok];
      const p = E().pakete.find(x => x.id === paket.value); if (!p) return;
      dok.posten.push({ id: M.id(), paketId: p.id, name: p.name, beschreibung: p.beschreibung, rappen: p.rappen });
      dok.total = M.postenTotal(dok.posten, dok.km, E());
      app.aendern();
    });
  }

  function naechsterSchritt(a) {
    switch (a.status) {
      case 'anfrage': return a.offerte ? ['offerte-verschickt', 'Offerte als verschickt markieren'] : ['offerte-erstellen', 'Offerte erstellen'];
      case 'offerte': return a.vertrag ? ['vertrag-unterschrieben', 'Vertrag als unterschrieben markieren'] : ['vertrag-erstellen', 'Vertrag erstellen'];
      case 'vertrag': return (a.rechnungen || []).some(r => r.art === 'anzahlung') ? ['tab-rechnungen', 'Zahlung der Anzahlung erfassen'] : ['rechnung-anzahlung', 'Rechnung für die Anzahlung erstellen'];
      case 'anzahlung': return a.ablaufErhalten || !a.datum || M.tageZwischen(M.heute(), a.datum) > 30 ? null : ['ablauf-erhalten', 'Ablauf erhalten'];
      case 'anlass': return ['geliefert', 'Film als geliefert markieren'];
      case 'geliefert': return (a.rechnungen || []).some(r => r.art === 'rest') ? ['tab-rechnungen', 'Zahlung der Restzahlung erfassen'] : ['rechnung-rest', 'Rechnung für die Restzahlung erstellen'];
      case 'geliefert_': return null;
      case 'bezahlt': return ['archivieren', 'Archivieren'];
      default: return null;
    }
  }

  A.auftrag = () => {
    const a = app.auftrag(app.ansicht.id);
    if (!a) return '<div class="leer"><strong>Auftrag nicht gefunden</strong></div>';
    const k = app.kunde(a), schritt = naechsterSchritt(a);
    const ueber = M.offeneRechnungen(app.daten).filter(x => x.a.id === a.id && x.ueberfaellig).length;
    const kl = (l, k) => '<span class="lang">' + l + '</span><span class="kurz">' + k + '</span>';
    const mahnRelevant = ueber || (a.rechnungen || []).some(r => (r.mahnungen || []).length) || app.tab === 'mahnungen';
    if (app.tab === 'notizen') app.tab = 'auftrag';
    const tabs = [['auftrag', 'Auftrag'], ['offerte', 'Offerte'], ['vertrag', 'Vertrag'], ['rechnungen', kl('Rechnungen', 'Rechnung')]]
      .concat(mahnRelevant ? [['mahnungen', kl('Mahnungen', 'Mahnung') + (ueber ? ' <span class="tz krit">' + ueber + '</span>' : '')]] : []);
    let inhalt = '';
    if (app.tab === 'auftrag') inhalt = tabAuftrag(a, k);
    if (app.tab === 'offerte') inhalt = tabOfferte(a);
    if (app.tab === 'vertrag') inhalt = tabVertrag(a);
    if (app.tab === 'rechnungen') inhalt = tabRechnungen(a);
    if (app.tab === 'mahnungen') inhalt = tabMahnungen(a);
    const fristen = M.fristen(a, E()).filter(f => !f.erledigt);
    return '<div class="kopfzeile"><h1>' + esc(k.name) + '<small>Auftrag ' + esc(a.nummer) + ' · ' + esc(app.artName(a.art)) + (a.datum ? ' am ' + M.datumCH(a.datum) : '') + '</small></h1>' +
      '<div class="aktionen">' + app.chip(a.status) + (a.statusManuell ? '<span class="leise" title="Status von Hand gesetzt">✎</span>' : '') +
        (schritt ? '<button class="knopf haupt" data-aktion="' + schritt[0] + '">' + schritt[1] + '</button>' : '') +
        '<button class="knopf mehr-knopf" data-aktion="mehr" aria-label="Weitere Aktionen" title="Status, Absagen, Archivieren">•••</button></div></div>' +
      '<div class="tabs" role="tablist">' + tabs.map(([t, n]) => '<button role="tab" data-aktion="tab" data-wert="' + t + '" aria-selected="' + (app.tab === t) + '">' + n +
        (t === 'rechnungen' && (a.rechnungen || []).length ? ' <span class="tz">' + a.rechnungen.length + '</span>' : '') + '</button>').join('') + '</div>' +
      '<div class="raster haupt-seite tab-' + app.tab + '"><div style="min-width:0">' + inhalt + '</div>' +
      '<div class="raster" style="align-content:start">' +
        '<div class="karte"><h2>Fristen</h2>' + (fristen.length ? fristen.map(f => {
          const ueber = !f.erledigt && f.datum < M.heute();
          return '<div class="frist' + (f.erledigt ? ' erledigt' : '') + (ueber ? ' ueber' : '') + '"><span class="punkt"></span><div><div>' + esc(f.text) + '</div><div class="wann">' + M.datumCH(f.datum) + (f.erledigt ? ', erledigt' : (f.datum < M.heute() || M.tageZwischen(M.heute(), f.datum) < 14 ? ', ' + esc(app.wann(f.datum)) : '')) + '</div></div></div>';
        }).join('') : '<p class="leise" style="margin:0;color:var(--muted)">Keine offenen Fristen.</p>') + '</div>' +
        '<div class="karte"><h2>Beträge</h2><table class="er" style="width:100%"><tbody>' +
          '<tr><td>Total</td><td>CHF ' + M.chf(app.total(a)) + '</td></tr>' +
          '<tr><td>Bezahlt</td><td>CHF ' + M.chf((a.rechnungen || []).filter(r => r.bezahlt).reduce((s, r) => s + r.rappen, 0)) + '</td></tr>' +
          '<tr class="summe"><td>Offen</td><td>CHF ' + M.chf(app.offen(a)) + '</td></tr></tbody></table></div>' +
        mitarbeiterKarte(a) +
      '</div></div>';
  };

  // Mitarbeiterin: in der Seitenspalte jedes Auftrags, damit Zuweisung und Überweisung an einem Ort sind
  function mitarbeiterKarte(a) {
    const e = E(); if (!e.mitarbeiter.length) return '';
    const st = M.mitarbeiterStatus(a);
    const stText = {
      nicht_faellig: '<span class="chip offerte">noch nicht fällig</span><div class="leise" style="color:var(--muted);font-size:12px;margin-top:6px">Fällig, sobald der Anlass vorbei ist.</div>',
      offen: '<span class="chip anfrage">zu überweisen</span><button class="knopf haupt" style="margin-top:10px;width:100%" data-aktion="auszahlen">Als überwiesen bestätigen</button>',
      ueberwiesen: a.auszahlung ? '<span class="chip anzahlung">überwiesen am ' + M.datumCH(a.auszahlung.datum) + '</span> <button class="knopf klein text" data-aktion="auszahlung-zurueck">Rückgängig</button>' : ''
    }[st] || '';
    return '<div class="karte' + (st === 'offen' ? ' hervor' : '') + '"><h2>Mitarbeiterin</h2>' +
      feld('Zugewiesen', 'auftrag.mitarbeiterId', a.mitarbeiterId || '', { auswahl: [['', 'Keine']].concat(e.mitarbeiter.map(x => [x.id, x.name])) }) +
      (a.mitarbeiterId ? '<table class="er" style="width:100%;margin-top:10px"><tbody><tr><td>Anteil ' + e.mitarbeiterProzent + ' %' + (e.mitarbeiterOhneAnfahrt ? ', ohne Anfahrt' : '') + '</td><td>CHF ' + M.chf(M.mitarbeiterAnteil(a, e)) + '</td></tr></tbody></table>' +
        '<div style="margin-top:10px">' + stText + '</div>' : '') + '</div>';
  }

  function tabAuftrag(a, k) {
    const e = E();
    return '<div class="karte"><h2>Kunde</h2><div class="felder">' +
        feld(a.art === 'firma' ? 'Firma' : 'Name (wie auf Dokumenten)', 'kunde.name', k.name) +
        feld('Ansprechperson', 'kunde.ansprechperson', k.ansprechperson) +
        feld('Anrede auf Dokumenten', 'kunde.anrede', k.anrede || '', { platz: a.art === 'firma' ? 'Guten Tag ' + (k.ansprechperson || '') : 'Liebe Anna, lieber Marc', hilfe: 'Leer lassen ergibt «' + esc(a.art === 'firma' ? 'Guten Tag ' + (k.ansprechperson || k.vorname || '') : 'Hallo ' + (k.vorname || k.name || '')) + '»' }) +
        feld('Quelle', 'kunde.quelle', k.quelle || '', { auswahl: M.QUELLEN.map(q => [q, q]) }) +
        feld('E-Mail', 'kunde.email', k.email, { art: 'email' }) + feld('Telefon', 'kunde.telefon', k.telefon) +
      '</div><details style="margin-top:12px"><summary style="cursor:pointer;color:var(--muted)">Postadresse (optional)</summary><div class="felder" style="margin-top:10px">' +
        feld('Strasse', 'kunde.strasse', k.strasse) + feld('Nr.', 'kunde.hausnummer', k.hausnummer) + feld('PLZ', 'kunde.plz', k.plz) + feld('Ort', 'kunde.ort', k.ort) +
      '</div></details></div>' +
      '<div class="karte" style="margin-top:16px"><h2>Anlass</h2><div class="felder">' +
        feld('Art', 'auftrag.art', a.art, { auswahl: M.ARTEN.map(x => [x.id, x.name]) }) +
        feld('Datum', 'auftrag.datum', a.datum, { art: 'date' }) +
        feld('Zeitfenster vor Ort', 'auftrag.zeitfenster', a.zeitfenster, { platz: '14:00 bis 18:00' }) +
        feld('Location', 'auftrag.location', a.location) +
        feld('Anzahl Gäste', 'auftrag.gaeste', a.gaeste, { typ: 'zahl', art: 'number' }) +
        feld(a.art === 'firma' ? 'Anlass, z.B. Jubiläum' : 'Bezeichnung (optional)', 'auftrag.bezeichnung', a.bezeichnung) +
        feld('Ansprechperson am Tag', 'auftrag.ansprechpersonTag', a.ansprechpersonTag, { breit: true, platz: 'Name, Telefon' }) +
      '</div><div class="aktionen" style="margin-top:12px">' +
        '<label class="check"><input type="checkbox" data-bind="auftrag.ablaufErhalten"' + (a.ablaufErhalten ? ' checked' : '') + '> Ablauf und Ansprechperson erhalten</label>' +
        (a.geliefertAm ? '<span>Film geliefert am ' + M.datumCH(a.geliefertAm) + '</span>' : '') +
        (a.geliefertAm ? '<label class="check"><input type="checkbox" data-bind="auftrag.rohmaterialGeloescht"' + (a.rohmaterialGeloescht ? ' checked' : '') + '> Rohmaterial gelöscht</label>' : '') +
      '</div>' +
      (a.wunschPosten && a.wunschPosten.length && !a.offerte ? '<p style="margin:12px 0 0;color:var(--muted)">Gewünscht laut Anfrage: ' + a.wunschPosten.map(p => esc(p.name)).join(', ') + '</p>' : '') +
      (a.nachricht ? '<p style="margin:12px 0 0"><b>Nachricht:</b> ' + esc(a.nachricht) + '</p>' : '') +
      '</div>' + tabNotizen(a);
  }

  function tabOfferte(a) {
    if (!a.offerte) return '<div class="karte leer"><strong>Noch keine Offerte</strong>Die Offerte übernimmt die gewünschten Pakete aus der Anfrage. Du kannst alles anpassen.<div style="margin-top:14px"><button class="knopf haupt" data-aktion="offerte-erstellen">Offerte erstellen</button></div></div>';
    const o = a.offerte;
    return '<div class="karte"><div class="kopfzeile" style="margin-bottom:12px"><h2 style="margin:0">Offerte ' + esc(a.nummer) + '</h2>' +
      '<div class="aktionen"><button class="knopf" data-aktion="offerte-zeigen">Ansehen und PDF</button><button class="knopf haupt" data-aktion="offerte-mail">Per Mail senden</button></div></div>' +
      (o.verschickt ? '<p class="leise" style="margin:-4px 0 12px;color:var(--muted)">Verschickt am ' + M.datumCH(o.verschickt) + '</p>' : '') +
      '<div class="felder" style="margin-bottom:14px">' + feld('Offertdatum', 'offerte.datum', o.datum, { art: 'date', hilfe: 'gültig bis ' + M.datumCH(M.plusTage(o.datum, E().offerteGueltigTage)) }) + '</div>' +
      postenEditor(o, 'offerte') +
      '<div class="felder" style="margin-top:14px">' + feld('Einleitung (leer lassen für Standardtext)', 'offerte.einleitung', o.einleitung || '', { mehrzeilig: true, breit: true }) + '</div></div>';
  }

  function tabVertrag(a) {
    if (!a.vertrag) return '<div class="karte leer"><strong>Noch kein Vertrag</strong>' + (a.offerte ? 'Der Vertrag übernimmt alle Positionen aus der Offerte.' : 'Erstelle zuerst eine Offerte.') +
      (a.offerte ? '<div style="margin-top:14px"><button class="knopf haupt" data-aktion="vertrag-erstellen">Vertrag aus Offerte erstellen</button></div>' : '') + '</div>';
    const v = a.vertrag;
    return '<div class="karte"><div class="kopfzeile" style="margin-bottom:12px"><h2 style="margin:0">Vertrag ' + esc(a.nummer) + '</h2>' +
      '<div class="aktionen"><button class="knopf" data-aktion="vertrag-zeigen">Ansehen und PDF</button><button class="knopf haupt" data-aktion="vertrag-mail">Per Mail senden</button></div></div>' +
      (a.vertrag.verschickt ? '<p class="leise" style="margin:-4px 0 12px;color:var(--muted)">Verschickt am ' + M.datumCH(a.vertrag.verschickt) + '</p>' : '') +
      '<div class="felder drei" style="margin-bottom:14px">' + feld('Vertragsdatum', 'vertrag.datum', v.datum, { art: 'date' }) +
        feld('Unterschrieben am', 'vertrag.unterschrieben', v.unterschrieben || '', { art: 'date', hilfe: v.unterschrieben ? '' : 'leer, solange nicht unterschrieben' }) +
        feld('Veröffentlichung', 'vertrag.veroeffentlichung', v.veroeffentlichung || '', { auswahl: [['', 'Kunde wählt im Vertrag'], ['ja', 'Ja'], ['ruecksprache', 'Nach Rücksprache'], ['nein', 'Nein']] }) + '</div>' +
      postenEditor(v, 'vertrag') + '</div>';
  }

  function tabRechnungen(a) {
    const r = a.rechnungen || [];
    const hatAnz = r.some(x => x.art === 'anzahlung'), hatRest = r.some(x => x.art === 'rest');
    const knoepfe = a.vertrag ? '<div class="aktionen">' + (!hatAnz ? '<button class="knopf" data-aktion="rechnung-anzahlung">Anzahlung ' + E().anzahlungProzent + ' %</button>' : '') +
      (!hatRest ? '<button class="knopf" data-aktion="rechnung-rest">Restzahlung</button>' : '') + '<button class="knopf" data-aktion="rechnung-frei">Freie Rechnung</button></div>' : '';
    if (!a.vertrag) return '<div class="karte leer"><strong>Noch keine Rechnungen</strong>Rechnungen basieren auf dem Vertrag. Erstelle zuerst den Vertrag.</div>';
    return '<div class="karte flach"><div class="kopfzeile" style="padding:14px 16px 0;margin-bottom:10px"><h2 style="margin:0">QR-Rechnungen</h2>' + knoepfe + '</div>' +
      (r.length ? '<div style="overflow-x:auto"><table class="tabelle"><thead><tr><th>Nr.</th><th>Rechnung</th><th>Zahlbar bis</th><th class="r">CHF</th><th>Status</th><th></th></tr></thead><tbody>' + r.map(x =>
        '<tr><td class="zahl">' + esc(x.nummer) + '</td><td>' + esc(x.titel) + '<br><span class="leise">' + esc(Q.inVierern(x.referenz || '')) + '</span></td>' +
        '<td><span class="' + (!x.bezahlt ? app.fristKlasse(x.faellig) : '') + '">' + M.datumCH(x.faellig) + '</span></td><td class="r zahl">' + M.chf(x.rappen) + '</td>' +
        '<td>' + (x.bezahlt ? '<span class="chip anzahlung">bezahlt ' + M.datumCH(x.bezahlt) + '</span>' : '<span class="chip anfrage">offen</span>') + '</td>' +
        '<td class="r"><div class="aktionen" style="justify-content:flex-end"><button class="knopf klein" data-aktion="rechnung-zeigen" data-wert="' + x.id + '">PDF / Mail</button>' +
          (x.bezahlt ? '<button class="knopf klein text" data-aktion="rechnung-offen" data-wert="' + x.id + '">Zurücknehmen</button>'
            : '<button class="knopf klein haupt" data-aktion="rechnung-bezahlt" data-wert="' + x.id + '">Bezahlt</button><button class="entfernen" data-aktion="rechnung-weg" data-wert="' + x.id + '" title="Rechnung löschen" aria-label="Rechnung löschen">×</button>') +
        '</div></td></tr>').join('') + '</tbody></table></div>'
        : '<div class="leer"><strong>Noch keine Rechnungen</strong>Erstelle die Rechnung für die Anzahlung, sobald der Vertrag unterschrieben ist.</div>') +
      '<p style="margin:0;padding:12px 16px;color:var(--muted);border-top:1px solid var(--linie)">Mit «Bezahlt» wird die Einnahme automatisch ins Kassenbuch gebucht.</p></div>';
  }

  function tabMahnungen(a) {
    const offen = M.offeneRechnungen(app.daten).filter(x => x.a.id === a.id);
    const alle = (a.rechnungen || []).filter(r => (r.mahnungen || []).length);
    const zeile = x => {
      const naechste = x.stufe < M.MAHNSTUFEN.length ? M.MAHNSTUFEN[x.stufe] : null;
      return '<tr><td class="zahl">' + esc(x.r.nummer) + '</td><td>' + esc(x.r.titel) + '<br><span class="leise">CHF ' + M.chf(x.r.rappen) + '</span></td>' +
        '<td>' + M.datumCH(x.frist) + '<br>' + (x.ueberfaellig ? '<span class="frist-ueber">seit ' + x.tageUeber + ' Tagen überfällig</span>' : '<span class="leise">' + esc(app.wann(x.frist)) + '</span>') + '</td>' +
        '<td>' + (x.stufe ? esc(M.MAHNSTUFEN[x.stufe - 1]) + ' verschickt' : '<span class="leise">noch nicht gemahnt</span>') + '</td>' +
        '<td class="r">' + (x.ueberfaellig && naechste ? '<button class="knopf klein haupt" data-aktion="mahnen" data-wert="' + x.r.id + '">' + esc(naechste) + ' erstellen</button>'
          : x.ueberfaellig ? '<span class="leise">alle Stufen ausgeschöpft</span>' : '<span class="leise">noch nicht fällig</span>') + '</td></tr>';
    };
    return '<div class="karte flach" style="margin-bottom:16px"><div style="padding:14px 16px 0"><h2>Offene Rechnungen</h2></div>' +
      (offen.length ? '<div style="overflow-x:auto"><table class="tabelle"><thead><tr><th>Nr.</th><th>Rechnung</th><th>Frist</th><th>Stand</th><th></th></tr></thead><tbody>' + offen.map(zeile).join('') + '</tbody></table></div>'
        : '<div class="leer"><strong>Keine offenen Rechnungen</strong>Alle Rechnungen dieses Auftrags sind bezahlt.</div>') + '</div>' +
      '<div class="karte"><h2>Verschickte Mahnungen</h2>' + (alle.length ? '<div class="zeilen">' + alle.flatMap(r => r.mahnungen.map(m =>
        '<div class="zeile" style="cursor:default"><div class="datum">' + M.datumCH(m.datum) + '</div><div class="haupt"><b>' + esc(m.titel) + '</b><span>Rechnung ' + esc(r.nummer) + ', neue Frist ' + M.datumCH(m.frist) + ', CHF ' + M.chf(M.mahnTotal(r, m)) + '</span></div>' +
        '<button class="knopf klein" data-aktion="mahnung-zeigen" data-wert="' + r.id + ':' + m.stufe + '">PDF</button></div>')).join('') + '</div>'
        : '<p style="margin:0;color:var(--muted)">Noch keine Mahnungen. Bei überfälligen Rechnungen erstellt die App die passende Stufe: zuerst eine freundliche Zahlungserinnerung, dann die 2. und 3. Mahnung, jeweils mit neuer Frist von ' + E().mahnFristTage + ' Tagen.</p>') + '</div>';
  }

  function tabNotizen(a) {
    const n = (a.notizen || []).slice().reverse();
    return '<div class="karte" style="margin-top:16px"><h2>Notizen</h2><form data-notiz class="aktionen" style="margin-bottom:12px;flex-wrap:nowrap"><input class="eingabe" name="text" placeholder="Telefonat, Wunsch, wichtige Gäste" aria-label="Neue Notiz"><button class="knopf haupt">Hinzufügen</button></form>' +
      (n.length ? '<div class="zeilen">' + n.map((x, i) => '<div class="zeile" style="cursor:default"><div class="datum">' + M.datumCH(x.datum) + '</div><div class="haupt" style="white-space:pre-wrap">' + esc(x.text) + '</div>' +
        '<button class="entfernen" data-aktion="notiz-weg" data-wert="' + (a.notizen.length - 1 - i) + '" aria-label="Notiz löschen">×</button></div>').join('') + '</div>'
        : '<p style="margin:0;color:var(--muted)">Noch keine Notizen.</p>') + '</div>';
  }

  // Rechnung anlegen
  function rechnungNeu(a, art, titel, rappen, faellig) {
    const nummer = M.neueRechnungsnummer(a);
    const r = { id: M.id(), nummer, titel, art, rappen, datum: M.heute(), faellig, referenz: Q.referenzAusNummer(nummer) };
    a.rechnungen = a.rechnungen || []; a.rechnungen.push(r);
    app.tab = 'rechnungen';
    app.aendern();
    return r;
  }
  function statusMindestens(a, st) { if (M.stufe(a.status) < M.stufe(st) && a.status !== 'abgesagt') a.status = st; }

  A.auftrag.danach = main => {
    const a = app.auftrag(app.ansicht.id); if (!a) return;
    const offerteName = () => 'Offerte ' + a.nummer + ' ' + app.kunde(a).name;
    const vertragName = () => 'Vertrag ' + a.nummer + ' ' + app.kunde(a).name;
    const offerteErledigt = w => { if (w && a.offerte && !a.offerte.verschickt) { a.offerte.verschickt = M.heute(); app.aendern(); } };
    const vertragErledigt = w => { if (w === 'mail' && a.vertrag && !a.vertrag.verschickt) { a.vertrag.verschickt = M.heute(); app.aendern(); } };
    binden(main, () => ({ auftrag: a, kunde: app.kunde(a), offerte: a.offerte, vertrag: a.vertrag }), (b, w) => {
      if (b === 'vertrag.unterschrieben' && w) statusMindestens(a, 'vertrag');
      if (b === 'auftrag.mitarbeiterId' && !w) M.mitarbeiterAuszahlungZuruecknehmen(app.daten, a);
    });
    postenBinden(main, a);
    const nf = main.querySelector('[data-notiz]');
    if (nf) nf.addEventListener('submit', e => {
      e.preventDefault(); const t = nf.text.value.trim(); if (!t) return;
      (a.notizen = a.notizen || []).push({ datum: M.heute(), text: t }); app.aendern();
    });
    const e = E(), total = () => app.total(a);
    const aktionen = {
      mehr: async () => {
        const loeschbar = !app.daten.buchungen.some(x => x.auftragId === a.id);
        const offen = !['abgesagt', 'archiv'].includes(a.status);
        const r = await app.dialog({
          titel: 'Auftrag ' + a.nummer,
          inhalt: '<label class="feld"><span>Status</span><select name="status">' +
            '<option value="auto"' + (!a.statusManuell && offen ? ' selected' : '') + '>Automatisch (' + esc(app.statusName(M.statusErmitteln(a))) + ')</option>' +
            M.STATUS.map(x => '<option value="' + x.id + '"' + ((a.statusManuell || !offen) && x.id === a.status ? ' selected' : '') + '>Von Hand: ' + x.name + '</option>').join('') + '</select>' +
            '<small>Der Status läuft normalerweise von selbst mit. Von Hand nur für Ausnahmen.</small></label>' +
            (offen || loeschbar ? '<h3 class="unter">Auftrag beenden</h3><div class="aktionen mehr-aktionen"></div>' : '') +
            (!loeschbar ? '<p style="margin:10px 0 0;color:var(--muted)">Löschen geht nicht, weil es Buchungen im Kassenbuch gibt. Absagen oder archivieren geht immer.</p>' : ''),
          knoepfe: [{ text: 'Schliessen', wert: null }]
            .concat(offen ? [{ text: 'Absagen', art: 'gefahr verschieben', wert: 'absagen' }, { text: 'Archivieren', art: 'verschieben', wert: 'archivieren' }] : [])
            .concat(loeschbar ? [{ text: 'Löschen', art: 'gefahr verschieben', wert: 'auftrag-loeschen' }] : [])
            .concat([{ text: 'Status übernehmen', art: 'haupt', wert: 'status' }]),
          // Absagen, Archivieren und Löschen stehen als eigene Gruppe über der Fusszeile
          danach: hg => { const ziel = hg.querySelector('.mehr-aktionen'); if (ziel) hg.querySelectorAll('.unten .verschieben').forEach(k => ziel.appendChild(k)); }
        });
        if (r.wert === 'status') {
          const w = r.werte.status;
          if (w === 'auto') { delete a.statusManuell; a.status = M.statusErmitteln(a); }
          else { a.status = w; a.statusManuell = !['abgesagt', 'archiv'].includes(w); }
          return app.aendern();
        }
        if (r.wert && aktionen[r.wert]) aktionen[r.wert]();
      },
      tab: t => { app.tab = t; app.zeichnen(); },
      'tab-rechnungen': () => { app.tab = 'rechnungen'; app.zeichnen(); },
      'offerte-erstellen': () => {
        const vorgabe = e.pakete.find(p => p.id === (a.art === 'hochzeit' ? 'interviews' : a.art));
        const quelle = a.wunschPosten && a.wunschPosten.length ? a.wunschPosten
          : vorgabe ? [{ paketId: vorgabe.id, name: vorgabe.name, beschreibung: vorgabe.beschreibung, rappen: vorgabe.rappen }] : [];
        const posten = quelle.map(p => ({ ...p, id: M.id() }));
        a.offerte = { datum: M.heute(), posten, km: 0 };
        a.offerte.total = M.postenTotal(posten, 0, e);
        app.tab = 'offerte'; app.aendern();
      },
      'offerte-verschickt': () => { a.offerte.verschickt = M.heute(); app.aendern(); },
      'offerte-zeigen': async () => offerteErledigt(await app.dokumentZeigen(D.offerteHTML(app.daten, a), offerteName(), D.mail(app.daten, a, 'offerte'))),
      'offerte-pdf': async () => offerteErledigt(await app.pdfSpeichern(D.offerteHTML(app.daten, a), offerteName())),
      'offerte-mail': async () => offerteErledigt(await app.mailSenden(D.offerteHTML(app.daten, a), offerteName(), D.mail(app.daten, a, 'offerte'))),
      'ablauf-erhalten': () => { a.ablaufErhalten = true; app.aendern(); },
      'vertrag-erstellen': () => {
        if (!a.offerte) { app.tab = 'offerte'; return app.zeichnen(); }
        a.vertrag = { datum: M.heute(), posten: a.offerte.posten.map(p => ({ ...p, id: M.id() })), km: a.offerte.km || 0 };
        a.vertrag.total = M.postenTotal(a.vertrag.posten, a.vertrag.km, e);
        statusMindestens(a, 'offerte');
        app.tab = 'vertrag'; app.aendern();
      },
      'vertrag-zeigen': async () => vertragErledigt(await app.dokumentZeigen(D.vertragHTML(app.daten, a), vertragName(), D.mail(app.daten, a, 'vertrag'))),
      'vertrag-pdf': () => app.pdfSpeichern(D.vertragHTML(app.daten, a), vertragName()),
      'vertrag-mail': async () => vertragErledigt(await app.mailSenden(D.vertragHTML(app.daten, a), vertragName(), D.mail(app.daten, a, 'vertrag'))),
      'vertrag-unterschrieben': async () => {
        const d = await app.datumFragen('Vertrag unterschrieben', 'Wann hat der Kunde unterschrieben?', M.heute()); if (!d) return;
        a.vertrag.unterschrieben = d; statusMindestens(a, 'vertrag'); app.tab = 'rechnungen'; app.aendern();
      },
      'rechnung-anzahlung': () => {
        const basis = a.vertrag.unterschrieben || M.heute();
        rechnungNeu(a, 'anzahlung', 'Anzahlung', M.anzahlung(total(), e), M.plusTage(basis > M.heute() ? basis : M.heute(), e.anzahlungFaelligTage));
      },
      'rechnung-rest': () => {
        const schon = (a.rechnungen || []).reduce((s, r) => s + r.rappen, 0);
        const faellig = a.datum && M.plusTage(a.datum, e.restFaelligTage) > M.heute() ? M.plusTage(a.datum, e.restFaelligTage) : M.plusTage(M.heute(), e.restFaelligTage);
        if (total() - schon <= 0) return app.melden('Es ist kein Restbetrag offen.', true);
        rechnungNeu(a, 'rest', 'Restzahlung', total() - schon, faellig);
      },
      'rechnung-frei': async () => {
        const r = await app.dialog({ titel: 'Freie Rechnung', inhalt: '<div class="felder"><label class="feld breit"><span>Titel</span><input name="titel" required placeholder="z.B. Zusätzliche Stunde"></label>' +
          '<label class="feld"><span>Betrag CHF</span><input name="betrag" required class="betrag"></label><label class="feld"><span>Zahlbar bis</span><input type="date" name="faellig" required value="' + M.plusTage(M.heute(), 30) + '"></label></div>',
          knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Erstellen', art: 'haupt', wert: true }],
          pruefen: f => { const ok = M.rappenAusText(f.betrag.value) > 0; if (!ok) app.melden('Betrag ungültig', true); return ok; } });
        if (r.wert) rechnungNeu(a, 'frei', r.werte.titel, M.rappenAusText(r.werte.betrag), r.werte.faellig);
      },
      'rechnung-zeigen': async id => {
        const r = a.rechnungen.find(x => x.id === id); let html;
        try { html = D.rechnungHTML(app.daten, a, r); } catch (err) { return app.melden(err.message, true); }
        if (await app.dokumentZeigen(html, 'Rechnung ' + r.nummer + ' ' + app.kunde(a).name, D.mail(app.daten, a, 'rechnung', r)) === 'mail' && !r.verschickt) { r.verschickt = M.heute(); app.aendern(); }
      },
      'rechnung-bezahlt': async id => {
        const r = a.rechnungen.find(x => x.id === id);
        const d = await app.datumFragen('Zahlung erfassen', r.titel + ' über CHF ' + M.chf(r.rappen) + '. Die Einnahme wird ins Kassenbuch gebucht.', M.heute(), 'Als bezahlt buchen'); if (!d) return;
        M.rechnungBezahlt(app.daten, a, r, d, 'Bank');
        if (r.art === 'anzahlung') statusMindestens(a, 'anzahlung');
        if (app.offen(a) === 0 && M.stufe(a.status) >= M.stufe('anlass')) a.status = 'bezahlt';
        app.melden('Bezahlt und im Kassenbuch gebucht');
        app.aendern();
      },
      'rechnung-offen': async id => {
        if (!await app.bestaetigen('Zahlung zurücknehmen?', 'Die Buchung im Kassenbuch wird entfernt.', 'Zurücknehmen')) return;
        M.rechnungOffen(app.daten, a.rechnungen.find(x => x.id === id)); app.aendern();
      },
      'rechnung-weg': async id => {
        if (!await app.bestaetigen('Rechnung löschen?', 'Die Rechnung wird entfernt. Bereits verschickte Rechnungen besser stehen lassen.', 'Löschen', true)) return;
        a.rechnungen = a.rechnungen.filter(x => x.id !== id); app.aendern();
      },
      'status-anlass': () => { a.anlassErledigt = M.heute(); app.aendern(); },
      geliefert: async () => {
        const d = await app.datumFragen('Film geliefert', 'Ab diesem Datum laufen Korrekturfrist und Aufbewahrung.', M.heute()); if (!d) return;
        a.geliefertAm = d; statusMindestens(a, 'geliefert'); app.aendern();
      },
      archivieren: () => { a.status = 'archiv'; app.aendern(); app.melden('Archiviert'); },
      absagen: async () => {
        const v = M.stornoVorschlag(a, M.heute(), e);
        const bezahlt = (a.rechnungen || []).filter(r => r.bezahlt).reduce((s, r) => s + r.rappen, 0);
        const r = await app.dialog({ titel: 'Auftrag absagen',
          inhalt: a.vertrag && a.datum ? '<p style="margin:0 0 10px">' + (v.tageVorher > 0 ? 'Absage ' + v.tageVorher + (v.tageVorher === 1 ? ' Tag' : ' Tage') + ' vor dem Anlass.' : v.tageVorher === 0 ? 'Absage am Tag des Anlasses.' : 'Der Anlass ist schon vorbei.') + ' Laut Vertrag sind ' + v.prozent + ' % geschuldet: CHF ' + M.chf(v.rappen) + '. Bereits bezahlt: CHF ' + M.chf(bezahlt) + '.</p>' +
            (v.rappen > bezahlt ? '<label class="check"><input type="checkbox" name="rechnung" checked> Rechnung über CHF ' + M.chf(v.rappen - bezahlt) + ' für die Annullation erstellen</label>' : '<p style="margin:0">Es ist nichts mehr zu verrechnen.</p>')
            : '<p style="margin:0">Der Auftrag wird als abgesagt markiert und aus dem Kalender entfernt.</p>',
          knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Absagen', art: 'haupt gefahr', wert: true }] });
        if (!r.wert) return;
        a.status = 'abgesagt';
        (a.notizen = a.notizen || []).push({ datum: M.heute(), text: 'Auftrag abgesagt' });
        if (r.werte && r.werte.rechnung) rechnungNeu(a, 'storno', 'Annullation', v.rappen - bezahlt, M.plusTage(M.heute(), 30));
        else app.aendern();
      },
      auszahlen: async () => {
        const m = e.mitarbeiter.find(x => x.id === a.mitarbeiterId);
        const d = await app.datumFragen('Überweisung an ' + (m ? m.name : 'Mitarbeiterin'), 'CHF ' + M.chf(M.mitarbeiterAnteil(a, e)) + ' werden als Fremdleistung ins Kassenbuch gebucht.', M.heute(), 'Als überwiesen buchen'); if (!d) return;
        M.mitarbeiterAuszahlen(app.daten, a, d, 'Bank'); app.aendern();
      },
      'auszahlung-zurueck': () => { M.mitarbeiterAuszahlungZuruecknehmen(app.daten, a); app.aendern(); },
      'posten-weg': i => {
        const dok = a[main.querySelector('[data-dok]').dataset.dok];
        dok.posten.splice(+i, 1); dok.total = M.postenTotal(dok.posten, dok.km, e); app.aendern();
      },
      'posten-frei': () => {
        const dok = a[main.querySelector('[data-dok]').dataset.dok];
        dok.posten.push({ id: M.id(), name: 'Weitere Leistung', beschreibung: '', rappen: 0 }); app.aendern();
      },
      mahnen: async id => {
        const r = a.rechnungen.find(x => x.id === id);
        const naechste = M.MAHNSTUFEN[(r.mahnungen || []).length];
        if (!await app.bestaetigen(naechste + ' erstellen?', 'Rechnung ' + r.nummer + ' über CHF ' + M.chf(r.rappen) + '. Neue Zahlungsfrist: ' + M.datumCH(M.plusTage(M.heute(), e.mahnFristTage || 10)) + '. Danach kannst du das PDF speichern und dem Kunden schicken.', 'Erstellen')) return;
        let m; try { m = M.mahnungNeu(app.daten, r, M.heute()); } catch (err) { return app.melden(err.message, true); }
        (a.notizen = a.notizen || []).push({ datum: M.heute(), text: m.titel + ' zu Rechnung ' + r.nummer + ' erstellt' });
        app.aendern();
        try { app.dokumentZeigen(D.mahnungHTML(app.daten, a, r, m), m.titel + ' ' + r.nummer + ' ' + app.kunde(a).name, D.mail(app.daten, a, 'mahnung', r, m)); } catch (err) { app.melden(err.message, true); }
      },
      'mahnung-zeigen': w => {
        const [rid, st] = w.split(':'); const r = a.rechnungen.find(x => x.id === rid); const m = r.mahnungen.find(x => x.stufe === +st);
        try { app.dokumentZeigen(D.mahnungHTML(app.daten, a, r, m), m.titel + ' ' + r.nummer + ' ' + app.kunde(a).name, D.mail(app.daten, a, 'mahnung', r, m)); } catch (err) { app.melden(err.message, true); }
      },
      'notiz-weg': i => { a.notizen.splice(+i, 1); app.aendern(); },
      'auftrag-loeschen': async () => {
        if (app.daten.buchungen.some(x => x.auftragId === a.id)) return;
        if (!await app.bestaetigen('Auftrag ' + a.nummer + ' löschen?', 'Auftrag, Offerte, Vertrag und Rechnungen werden entfernt. Der Ordner mit den PDFs kommt in den Papierkorb des Mac (vom iPhone aus, sobald die App auf dem Mac läuft).', 'Löschen', true)) return;
        app.ordnerVormerken(a);
        app.daten.auftraege = app.daten.auftraege.filter(x => x.id !== a.id);
        // Kunde mitlöschen, wenn er keine anderen Aufträge hat
        if (!app.daten.auftraege.some(x => x.kundeId === a.kundeId)) app.daten.kunden = app.daten.kunden.filter(k => k.id !== a.kundeId);
        app.melden('Auftrag gelöscht');
        app.ansicht = { name: 'auftraege' }; app.aendern();
        app.ordnerAufraeumen();
      }
    };
    klick(main, aktionen);
  };
})();
