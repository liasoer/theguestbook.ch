// theguestbook business: Tab «Gründungspaare» (Bewerbungen von theguestbook.ch/gruenderpaare.html)
(function () {
  'use strict';
  const app = window.App, M = window.Modell, D = window.Dokumente, B = window.Bruecke;
  const esc = app.esc, A = app.ansichten;
  const SEITE = 'https://theguestbook.ch/gruenderpaare.html';
  const FILTER = [['offen', 'Offen'], ['favorit', 'Favoriten'], ['ausgewaehlt', 'Ausgewählt'], ['abgesagt', 'Abgesagt'], ['alle', 'Alle']];
  const statusName = id => (M.BEWERBUNG_STATUS.find(s => s.id === id) || { name: id }).name;
  const finden = id => (app.daten.bewerbungen || []).find(b => b.id === id);
  const datumZeit = iso => { const d = new Date(iso); return isNaN(d) ? '' : M.datumCH(iso.slice(0, 10)) + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  A.gruenderpaare = () => {
    const u = M.gruenderUebersicht(app.daten), f = app.gp.filter, heute = M.heute();
    const tage = M.tageZwischen(heute, u.schluss);
    const rang = { favorit: 0, neu: 1, ausgewaehlt: 2, abgesagt: 3 };
    const liste = (app.daten.bewerbungen || [])
      .filter(b => f === 'alle' || (f === 'offen' ? ['neu', 'favorit'].includes(b.status) : b.status === f))
      .sort((x, y) => (rang[x.status] - rang[y.status]) || String(y.eingegangen).localeCompare(String(x.eingegangen)));

    const karte = b => {
      const a = b.auftragId && app.auftrag(b.auftragId);
      const knopf = (aktion, text, art) => '<button class="knopf klein' + (art ? ' ' + art : '') + '" data-aktion="' + aktion + '" data-wert="' + b.id + '">' + text + '</button>';
      let aktionen = '';
      if (['neu', 'favorit'].includes(b.status)) {
        aktionen = knopf('gp-auswaehlen', 'Auswählen und als Auftrag übernehmen', 'haupt') +
          knopf('gp-favorit', b.status === 'favorit' ? 'Kein Favorit mehr' : 'Als Favorit merken') +
          knopf('gp-absagen', 'Absagen', 'gefahr');
      } else if (b.status === 'ausgewaehlt') {
        aktionen = (a ? knopf('gp-auftrag', 'Zum Auftrag ' + esc(a.nummer), 'haupt') : knopf('gp-auswaehlen', 'Wieder als Auftrag übernehmen', 'haupt')) +
          knopf('gp-zusage', b.zusageGesendet ? 'Zusage nochmals öffnen' : 'Zusage per Mail') +
          knopf('gp-zurueck', 'Auswahl aufheben', 'text');
      } else if (b.status === 'abgesagt') {
        aktionen = knopf('gp-absage', b.absageGesendet ? 'Absage nochmals öffnen' : 'Absage per Mail', b.absageGesendet ? '' : 'haupt') +
          knopf('gp-zurueck', 'Wieder aufnehmen', 'text');
      }
      aktionen += knopf('gp-loeschen', 'Löschen', 'text');
      const versand = [b.zusageGesendet ? 'Zusage geöffnet am ' + M.datumCH(b.zusageGesendet) : '', b.absageGesendet ? 'Absage geöffnet am ' + M.datumCH(b.absageGesendet) : ''].filter(Boolean).join(' · ');
      return '<article class="karte gp-karte ' + esc(b.status) + '">' +
        '<div class="gp-kopf"><div><h3>' + esc(M.paarName(b)) + '</h3>' +
          '<div class="gp-meta">' + [b.datum ? M.datumCH(b.datum) : 'ohne Datum', b.ort, b.gaeste ? b.gaeste + ' Gäste' : ''].filter(Boolean).map(esc).join(' · ') + '</div></div>' +
          '<span class="chip gp-' + esc(b.status) + '">' + esc(statusName(b.status)) + '</span></div>' +
        (b.gaeste_satz ? '<p class="gp-satz">' + esc(b.gaeste_satz) + '</p>' : '') +
        (b.warum ? '<p class="gp-warum">' + esc(b.warum) + '</p>' : '') +
        '<div class="gp-kontakt"><span>' + esc(b.email) + '</span>' + (b.telefon ? '<span>' + esc(b.telefon) + '</span>' : '') + (b.social ? '<span>' + esc(b.social) + '</span>' : '') +
          '<span>eingegangen ' + esc(datumZeit(b.eingegangen)) + '</span>' + (b.einwilligung ? '' : '<span class="frist-ueber">ohne Einverständnis</span>') + '</div>' +
        '<label class="feld"><span>Notiz</span><textarea rows="2" data-gp-notiz="' + b.id + '" placeholder="Eindruck, Telefonat, Treffen">' + esc(b.notiz || '') + '</textarea></label>' +
        (versand ? '<p class="gp-versand">' + esc(versand) + '</p>' : '') +
        '<div class="gp-aktionen">' + aktionen + '</div>' +
      '</article>';
    };

    const leerText = !(app.daten.bewerbungen || []).length
      ? '<strong>Noch keine Bewerbungen</strong>Sobald jemand das Formular auf ' + esc(SEITE.replace('https://', '')) + ' absendet, erscheint die Bewerbung hier.'
      : '<strong>Keine Bewerbungen in dieser Ansicht</strong>Wähle oben einen anderen Filter.';

    return '<div class="kopfzeile"><h1>Gründungspaare 2027<small>Bewerbungen über die Seite Gründungspaare. ' + u.plaetze + ' Plätze, Bewerbung bis ' + M.datumCH(u.schluss) + '.</small></h1>' +
      '<div class="aktionen"><button class="knopf" data-aktion="gp-seite">Seite öffnen</button></div></div>' +
      '<div class="kennzahlen vier">' +
        '<div><span>Plätze frei</span><b class="zahl">' + u.frei + ' von ' + u.plaetze + '</b></div>' +
        '<div><span>Neu</span><b class="zahl">' + u.neu + '</b></div>' +
        '<div><span>Favoriten</span><b class="zahl">' + u.favorit + '</b></div>' +
        '<div><span>Bewerbungsschluss</span><b>' + (tage > 0 ? 'in ' + tage + ' Tagen' : tage === 0 ? 'heute' : 'vorbei') + '</b></div>' +
      '</div>' +
      (u.frei === 0 && (u.neu + u.favorit) > 0 ? '<div class="hinweis"><div><strong>Alle Plätze vergeben</strong><p>Den übrigen Paaren kannst du mit «Absagen» eine freundliche Absage schicken.</p></div></div>' : '') +
      '<div class="filter" role="group" aria-label="Filter">' + FILTER.map(([id, name]) => {
        const n = id === 'alle' ? u.total : id === 'offen' ? u.neu + u.favorit : u[id];
        return '<button type="button" data-aktion="gp-filter" data-wert="' + id + '" aria-pressed="' + (f === id) + '">' + name + ' ' + n + '</button>';
      }).join('') + '</div>' +
      (liste.length ? '<div class="gp-liste">' + liste.map(karte).join('') + '</div>' : '<div class="karte"><div class="leer">' + leerText + '</div></div>');
  };

  async function mailSenden(b, art) {
    const ok = await app.mailOhneAnhang(D.mailBewerbung(app.daten, b, art));
    if (!ok) return;
    if (art === 'gruender_zusage') b.zusageGesendet = M.heute(); else b.absageGesendet = M.heute();
    app.aendern();
  }

  async function auswaehlen(b) {
    const u = M.gruenderUebersicht(app.daten);
    if (u.frei === 0 && !await app.bestaetigen('Alle Plätze vergeben', 'Es sind schon ' + u.plaetze + ' Paare ausgewählt. Trotzdem ' + M.paarKurz(b) + ' dazunehmen?', 'Dazunehmen')) return;
    const r = M.bewerbungUebernehmen(app.daten, b, M.heute());
    app.aendern();
    const a = r.auftrag;
    const warnungen = (r.konflikte || []).map(k => 'Auftrag ' + k.nummer + ' (' + app.kunde(k).name + ', ' + app.statusName(k.status) + ')');
    if (a.datum && B.istMac) {
      try { (await B.kalenderBelegt(a.datum)).forEach(t => warnungen.push(t.titel + ', ' + t.zeit + ' (Kalender ' + t.kalender + ')')); }
      catch (e) { /* Kalender nicht erreichbar */ }
    }
    const d = await app.dialog({
      titel: r.neu ? 'Als Auftrag übernommen' : 'Auftrag besteht schon',
      inhalt: '<p style="margin:0 0 10px"><strong>' + esc(M.paarKurz(b)) + '</strong> ' + (r.neu ? 'sind jetzt Auftrag ' : 'sind schon als Auftrag ') + esc(a.nummer) +
        ' im Auftragsraster, Spalte Anfrage. Die Offerte zeigt «Die Interviews» und darunter den Abzug «Gründungspaar 2027», Total CHF 0. Der Vertrag enthält automatisch die Regelung zu den Nutzungsrechten.</p>' +
        (warnungen.length ? '<div class="hinweis warn"><div><strong>An diesem Tag ist schon etwas eingetragen</strong>' + warnungen.map(w => '<p>' + esc(w) + '</p>').join('') + '</div></div>' : ''),
      knoepfe: [{ text: 'Später', wert: null }, { text: 'Zusage per Mail', wert: 'mail' }, { text: 'Zum Auftrag', art: 'haupt', wert: 'auftrag' }]
    });
    if (d.wert === 'mail') return mailSenden(b, 'gruender_zusage');
    if (d.wert === 'auftrag') app.oeffnen('auftrag', a.id, 'auftrag');
  }

  A.gruenderpaare.danach = main => {
    main.addEventListener('change', e => {
      const id = e.target.dataset && e.target.dataset.gpNotiz;
      const b = id && finden(id);
      if (b) { b.notiz = e.target.value; app.aendern(); }
    });
    const aktionen = {
      'gp-filter': w => { app.gp.filter = w; app.zeichnen(); },
      'gp-seite': () => B.istMac ? B.linkOeffnen(SEITE).catch(() => app.melden('Link konnte nicht geöffnet werden. Bitte die App neu bauen.', true)) : window.open(SEITE, '_blank'),
      'gp-favorit': (w, b) => { b.status = b.status === 'favorit' ? 'neu' : 'favorit'; app.aendern(); },
      'gp-auswaehlen': (w, b) => auswaehlen(b),
      'gp-auftrag': (w, b) => app.oeffnen('auftrag', b.auftragId, 'auftrag'),
      'gp-zusage': (w, b) => mailSenden(b, 'gruender_zusage'),
      'gp-absage': (w, b) => mailSenden(b, 'gruender_absage'),
      'gp-absagen': async (w, b) => {
        const d = await app.dialog({
          titel: M.paarKurz(b) + ' absagen?',
          inhalt: '<p style="margin:0">Die Bewerbung wird als abgesagt markiert. Die Absage-Mail kannst du gleich oder später öffnen.</p>',
          knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Nur markieren', wert: 'markieren' }, { text: 'Absagen und Mail öffnen', art: 'haupt', wert: 'mail' }]
        });
        if (!d.wert) return;
        b.status = 'abgesagt'; app.aendern();
        if (d.wert === 'mail') mailSenden(b, 'gruender_absage');
      },
      'gp-zurueck': async (w, b) => {
        const a = b.auftragId && app.auftrag(b.auftragId);
        if (b.status === 'ausgewaehlt' && a && !await app.bestaetigen('Auswahl aufheben?', 'Die Bewerbung kommt zurück zu den Favoriten. Auftrag ' + a.nummer + ' bleibt im Auftragsraster, den sagst du dort bei Bedarf selbst ab.', 'Aufheben')) return;
        b.status = b.status === 'ausgewaehlt' ? 'favorit' : 'neu'; app.aendern();
      },
      'gp-loeschen': async (w, b) => {
        if (!await app.bestaetigen('Bewerbung löschen?', 'Die Bewerbung von ' + M.paarKurz(b) + ' wird endgültig gelöscht. Ein daraus entstandener Auftrag bleibt bestehen.', 'Löschen', true)) return;
        app.daten.bewerbungen = app.daten.bewerbungen.filter(x => x.id !== b.id); app.aendern();
      }
    };
    main.addEventListener('click', e => {
      const el = e.target.closest('[data-aktion]');
      if (!el || !main.contains(el)) return;
      const f = aktionen[el.dataset.aktion];
      if (!f) return;
      e.preventDefault();
      f(el.dataset.wert, finden(el.dataset.wert));
    });
  };
})();
