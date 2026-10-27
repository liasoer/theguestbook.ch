// theguestbook business: Kunden, Kalender, Kassenbuch, Einstellungen
(function () {
  'use strict';
  const app = window.App, M = window.Modell, Q = window.QRRechnung, B = window.Bruecke, D = window.Dokumente;
  const esc = app.esc, A = app.ansichten;
  const E = () => app.daten.einstellungen;
  const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  function klick(main, aktionen) {
    main.addEventListener('click', e => {
      const el = e.target.closest('[data-aktion]');
      if (!el || !main.contains(el)) return;
      const f = aktionen[el.dataset.aktion];
      if (f) { e.preventDefault(); f(el.dataset.wert, el); }
    });
  }

  // ---------- Kunden ----------

  A.kunden = () => {
    const liste = app.daten.kunden.map(k => {
      const auf = app.daten.auftraege.filter(a => a.kundeId === k.id);
      const umsatz = app.daten.buchungen.filter(b => b.typ === 'ein' && auf.some(a => a.id === b.auftragId)).reduce((s, b) => s + b.betrag, 0);
      const letzter = auf.slice().sort((x, y) => (y.datum || '').localeCompare(x.datum || ''))[0];
      return { k, auf, umsatz, letzter };
    }).sort((x, y) => x.k.name.localeCompare(y.k.name));
    return '<div class="kopfzeile"><h1>Kunden<small>' + liste.length + ' Kunden</small></h1><div class="aktionen"><button class="knopf haupt" data-aktion="neu">Neuer Auftrag</button></div></div>' +
      '<div class="karte flach">' + (liste.length ? '<table class="tabelle"><thead><tr><th>Name</th><th>Kontakt</th><th>Quelle</th><th>Aufträge</th><th class="r">Bezahlt CHF</th></tr></thead><tbody>' +
        liste.map(x => '<tr class="klickbar" data-aktion="auftrag" data-wert="' + (x.letzter ? x.letzter.id : '') + '"><td><b>' + esc(x.k.name) + '</b>' + (x.k.ansprechperson && x.k.ansprechperson !== x.k.name ? '<br><span class="leise">' + esc(x.k.ansprechperson) + '</span>' : '') + '</td>' +
          '<td>' + esc(x.k.email || '') + '<br><span class="leise">' + esc(x.k.telefon || '') + '</span></td><td>' + esc(x.k.quelle || '') + '</td>' +
          '<td>' + x.auf.map(a => esc(a.nummer)).join(', ') + '</td><td class="r zahl">' + (x.umsatz ? M.chf(x.umsatz) : '') + '</td></tr>').join('') + '</tbody></table>'
        : '<div class="leer"><strong>Noch keine Kunden</strong>Kunden entstehen automatisch aus Anfragen und neuen Aufträgen.</div>') + '</div>';
  };
  A.kunden.danach = main => klick(main, { neu: () => app.neuerAuftrag(), auftrag: id => id && app.oeffnen('auftrag', id, 'auftrag') });

  // ---------- Kalender ----------

  A.kalender = () => {
    const { jahr, monat } = app.kal;
    const erster = new Date(Date.UTC(jahr, monat, 1));
    const versatz = (erster.getUTCDay() + 6) % 7; // Montag zuerst
    const start = new Date(Date.UTC(jahr, monat, 1 - versatz));
    const heute = M.heute();
    const nachDatum = {};
    app.daten.auftraege.filter(a => a.datum && !['abgesagt'].includes(a.status)).forEach(a => { (nachDatum[a.datum] = nachDatum[a.datum] || []).push(a); });
    // Offene Fristen pro Tag (Zahlungen, Ablauf einholen, Film liefern ...)
    const fristenNachDatum = {};
    app.daten.auftraege.filter(a => !['abgesagt', 'archiv'].includes(a.status)).forEach(a =>
      M.fristen(a, E()).filter(f => !f.erledigt).forEach(f => { (fristenNachDatum[f.datum] = fristenNachDatum[f.datum] || []).push({ a, f }); }));
    const KURZ = { offerte: 'Offerte läuft ab', anzahlung: 'Anzahlung', ablauf: 'Ablauf einholen', rest: 'Restzahlung', lieferung: 'Film liefern', rohmaterial: 'Rohmaterial löschen' };
    let zellen = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(t => '<div class="wt">' + t + '</div>').join('');
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getTime() + i * 864e5), iso = d.toISOString().slice(0, 10);
      const eintr = (nachDatum[iso] || []).map(a => '<button class="ereignis' + (app.istEvent(a) ? ' event' : '') + (['anfrage', 'offerte'].includes(a.status) ? ' anfrage' : '') +
        '" data-aktion="auftrag" data-wert="' + a.id + '" title="' + esc(app.kunde(a).name + ', ' + app.statusName(a.status)) + '">' + esc(app.kunde(a).name) + '</button>').join('') +
        (fristenNachDatum[iso] || []).map(({ a, f }) => '<button class="frist-eintrag' + (iso < heute ? ' ueber' : '') + '" data-aktion="auftrag" data-wert="' + a.id + '" title="' +
          esc(f.text + ': ' + app.kunde(a).name + (iso < heute ? ' (überfällig)' : '')) + '"><i></i>' + esc((KURZ[f.art] || f.text) + ' ' + app.kunde(a).name) + '</button>').join('');
      zellen += '<div class="tag' + (d.getUTCMonth() !== monat ? ' fremd' : '') + (iso === heute ? ' heute' : '') + '"><span class="nr">' + d.getUTCDate() + '</span>' + eintr + '</div>';
      if (i >= 34 && d.getUTCMonth() !== monat && new Date(start.getTime() + (i + 1) * 864e5).getUTCDay() === 1) break;
    }
    const e = E();
    return '<div class="kopfzeile"><h1>' + MONATE[monat] + ' ' + jahr + '<small>Anlässe als Balken, was fällig ist mit Punkt. Rot heisst überfällig.</small></h1>' +
      '<div class="aktionen"><button class="knopf" data-aktion="zurueck" aria-label="Vorheriger Monat">‹</button><button class="knopf" data-aktion="heute">Heute</button><button class="knopf" data-aktion="vor" aria-label="Nächster Monat">›</button></div></div>' +
      '<div class="karte flach"><div class="monat">' + zellen + '</div></div>' +
      monatsliste() +
      (B.istMac ? '<div class="karte" style="margin-top:16px"><h2>Apple Kalender</h2>' +
        '<p style="margin:0 0 10px">' + (e.kalenderAbgleich ? 'Anlässe und offene Fristen werden automatisch in den Kalender «theguestbook» eingetragen.' : 'Der Abgleich mit dem Apple Kalender ist ausgeschaltet.') +
        (app.kalenderStatus ? ' <span style="color:var(--muted)">' + esc(app.kalenderStatus) + '</span>' : '') + '</p>' +
        '<div class="aktionen"><button class="knopf" data-aktion="abgleich"' + (B.istMac ? '' : ' disabled title="Nur in der Mac-App"') + '>Jetzt abgleichen</button>' +
        '<label class="check"><input type="checkbox" data-aktion-check="auto"' + (e.kalenderAbgleich ? ' checked' : '') + '> Automatisch abgleichen</label></div></div>' : '');

    // Auf dem iPhone: alle Einträge des Monats als Liste, weil die Zellen zu klein für Text sind
    function monatsliste() {
      const prefix = jahr + '-' + String(monat + 1).padStart(2, '0');
      const tage = Object.keys(nachDatum).concat(Object.keys(fristenNachDatum)).filter(d => d.startsWith(prefix));
      const sortiert = [...new Set(tage)].sort();
      if (!sortiert.length) return '<div class="karte nur-mobil monatsliste" style="margin-top:12px"><p style="margin:0;color:var(--muted)">Nichts in diesem Monat.</p></div>';
      return '<div class="karte nur-mobil monatsliste" style="margin-top:12px">' + sortiert.map(d => {
        const dt = new Date(d + 'T12:00:00');
        return '<div class="ml-tag">' + dt.toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'long' }) + '</div>' +
          (nachDatum[d] || []).map(a => '<button class="anlass' + (app.istEvent(a) ? ' event' : '') + '" data-aktion="auftrag" data-wert="' + a.id + '"><i></i>' + esc(app.artName(a.art) + ' ' + app.kunde(a).name) + '</button>').join('') +
          (fristenNachDatum[d] || []).map(({ a, f }) => '<button class="' + (d < heute ? 'ueber' : '') + '" data-aktion="auftrag" data-wert="' + a.id + '"><i></i>' + esc(f.text + ': ' + app.kunde(a).name) + (d < heute ? ' (überfällig)' : '') + '</button>').join('');
      }).join('') + '</div>';
    }
  };
  A.kalender.danach = main => {
    klick(main, {
      zurueck: () => { app.kal.monat--; if (app.kal.monat < 0) { app.kal.monat = 11; app.kal.jahr--; } app.zeichnen(); },
      vor: () => { app.kal.monat++; if (app.kal.monat > 11) { app.kal.monat = 0; app.kal.jahr++; } app.zeichnen(); },
      heute: () => { const d = new Date(); app.kal = { jahr: d.getFullYear(), monat: d.getMonth() }; app.zeichnen(); },
      auftrag: id => app.oeffnen('auftrag', id, 'auftrag'),
      abgleich: () => app.kalenderAbgleichen(false)
    });
    const auto = main.querySelector('[data-aktion-check="auto"]'); if (auto) auto.addEventListener('change', ev => { E().kalenderAbgleich = ev.target.checked; app.aendern(); });
  };

  // ---------- Kassenbuch ----------

  const katName = (t, k) => (M.KATEGORIEN[t].find(x => x[0] === k) || [k, k])[1];
  const KAT_HILFE = {
    material: 'Speicherkarten, Akkus, Kabel, kleines Zubehör', fremd: 'Zweitkamera, Schnitt, Helfer mit eigener Rechnung', reise: 'Fahrten zu Anlässen, Parkgebühren',
    werbung: 'Hosting, Domain, Inserate, Visitenkarten', software: 'DaVinci Resolve, Lightroom, Cloud-Speicher', buero: 'Nur der geschäftliche Anteil',
    versicherung: 'Geräteversicherung, Bankgebühren', ahv: 'Akontozahlungen an die SVA Thurgau', weiterbildung: 'Kurse, Workshops', lohn: 'Löhne und AHV-Beiträge für Mitarbeiter',
    anschaffung: 'Kamera, Objektive, Mikrofone ab ca. CHF 1’000, werden meist abgeschrieben', zusatz: 'z.B. einzeln verkaufte Highlights'
  };

  A.kassenbuch = () => {
    const kb = app.kb, jahr = kb.jahr;
    const jahre = new Set(app.daten.buchungen.map(b => b.jahr)); jahre.add(new Date().getFullYear()); jahre.add(jahr);
    const jb = app.daten.buchungen.filter(b => b.jahr === jahr);
    const er = M.erfolgsrechnung(app.daten, jahr);
    const b = kb.bearbeiten ? app.daten.buchungen.find(x => x.id === kb.bearbeiten) : null;
    const typ = b ? b.typ : kb.typ;
    const formSichtbar = !!(b || kb.formOffen);
    const heute = M.heute();
    const form = '<form class="karte" data-buchung style="margin-bottom:16px"><div class="kopfzeile" style="margin-bottom:12px"><h2 style="margin:0">' + (b ? 'Buchung bearbeiten' : 'Neue Buchung') + '</h2>' +
      '<div class="umschalter" role="group" aria-label="Art"><button type="button" class="ein" data-aktion="typ" data-wert="ein" aria-pressed="' + (typ === 'ein') + '">Einnahme</button><button type="button" class="aus" data-aktion="typ" data-wert="aus" aria-pressed="' + (typ === 'aus') + '">Ausgabe</button></div></div>' +
      '<div class="felder drei">' +
        '<label class="feld"><span>Datum</span><input type="date" name="datum" required value="' + esc(b ? b.datum : (heute.startsWith(String(jahr)) ? heute : jahr + '-12-31')) + '"></label>' +
        '<label class="feld"><span>Betrag CHF</span><input name="betrag" required class="betrag" placeholder="0.00" value="' + (b ? (b.betrag / 100).toFixed(2) : '') + '"></label>' +
        '<label class="feld"><span>Kategorie</span><select name="kat">' + M.KATEGORIEN[typ].map(([k, n]) => '<option value="' + k + '"' + (b && b.kat === k ? ' selected' : '') + ' title="' + esc(KAT_HILFE[k] || '') + '">' + n + '</option>').join('') + '</select></label>' +
        '<label class="feld breit"><span>Beschreibung</span><input name="text" required maxlength="140" value="' + esc(b ? b.text : '') + '" placeholder="z.B. SanDisk Speicherkarten 2 x 128 GB"></label>' +
        '<label class="feld"><span>Bezahlt per</span><select name="zahlart">' + ['Bank', 'Twint', 'Bar', 'Karte'].map(z => '<option' + (b && b.zahlart === z ? ' selected' : '') + '>' + z + '</option>').join('') + '</select></label>' +
        '<label class="feld"><span>Beleg Nr.</span><input name="beleg" value="' + esc(b ? b.beleg || '' : nextBeleg(jahr)) + '"></label>' +
        '<label class="feld"><span>Auftrag (optional)</span><select name="auftragId"><option value="">Kein Auftrag</option>' + app.daten.auftraege.slice().reverse().map(a => '<option value="' + a.id + '"' + (b && b.auftragId === a.id ? ' selected' : '') + '>' + esc(a.nummer + ' ' + app.kunde(a).name) + '</option>').join('') + '</select></label>' +
      '</div><div class="aktionen" style="margin-top:12px"><button class="knopf haupt">' + (b ? 'Änderung speichern' : 'Buchen') + '</button>' +
        '<button type="button" class="knopf" data-aktion="abbrechen">Abbrechen</button>' + (b ? '<button type="button" class="knopf gefahr" data-aktion="loeschen" data-wert="' + b.id + '">Löschen</button>' : '') +
        (b && (b.rechnungId || b.mitarbeiterId) ? '<span style="color:var(--muted)">Automatisch aus ' + (b.rechnungId ? 'einer Rechnung' : 'der Mitarbeiter-Auszahlung') + ' gebucht. Änderungen besser dort vornehmen.</span>' : '') + '</div></form>';

    const sichtbar = jb.slice().sort((x, y) => y.datum.localeCompare(x.datum));
    let liste = '', monat = -1;
    sichtbar.forEach(x => {
      const m = +x.datum.slice(5, 7) - 1;
      if (m !== monat) { monat = m; liste += '<tr><td colspan="5" style="background:var(--flaeche);font-weight:600;font-size:12px;color:var(--muted)">' + MONATE[m] + '</td></tr>'; }
      liste += '<tr class="klickbar" data-aktion="bearbeiten" data-wert="' + x.id + '"><td class="zahl leise">' + M.datumCH(x.datum).slice(0, 6) + '</td><td>' + esc(x.text) + '<br><span class="leise">' + esc(katName(x.typ, x.kat)) + ' · ' + esc(x.zahlart || '') + '</span></td>' +
        '<td class="leise zahl">' + esc(x.beleg || '') + '</td><td class="r zahl ' + (x.typ === 'ein' ? 'plus' : 'minus') + '">' + (x.typ === 'ein' ? '+' : '−') + M.chf(x.betrag) + '</td></tr>';
    });

    const es = M.erfolgsrechnungSteuer(app.daten, jahr);
    const erTab = '<div class="karte"><div class="kopfzeile" style="margin-bottom:6px"><h2 style="margin:0">Erfolgsrechnung ' + jahr + '</h2><button class="knopf" data-aktion="er-csv">Als CSV speichern</button></div>' +
      '<p style="margin:0 0 6px;color:var(--muted)">Selbständige Nebenerwerbstätigkeit, Kanton Thurgau. Den Reingewinn trägst du in der Steuererklärung beim Einkommen aus selbständiger Erwerbstätigkeit ein.</p>' +
      '<table class="er" style="width:100%"><tbody><tr class="kopf"><td>Ertrag</td><td></td></tr>' +
      M.KATEGORIEN.ein.map(([k, n]) => '<tr' + (er.ertrag[k] ? '' : ' class="null"') + '><td>' + n + '</td><td>CHF ' + M.chf(er.ertrag[k]) + '</td></tr>').join('') +
      '<tr class="summe"><td>Total Ertrag</td><td>CHF ' + M.chf(er.totalErtrag) + '</td></tr><tr class="kopf"><td>Aufwand</td><td></td></tr>' +
      M.KATEGORIEN.aus.map(([k, n]) => '<tr' + (er.aufwand[k] ? '' : ' class="null"') + '><td>' + (k === 'ahv' ? n + ', bezahlt' : n) + '</td><td>CHF ' + M.chf(er.aufwand[k]) + '</td></tr>').join('') +
      '<tr' + (es.rueckstellungAhv ? '' : ' class="null"') + '><td>Rückstellung AHV/IV/EO-Beiträge, noch nicht bezahlt</td><td>CHF ' + M.chf(es.rueckstellungAhv) + '</td></tr>' +
      '<tr class="summe"><td>Total Aufwand</td><td>CHF ' + M.chf(es.totalAufwand) + '</td></tr>' +
      '<tr class="total"><td>Reingewinn</td><td>CHF ' + M.chf(es.gewinn) + '</td></tr></tbody></table>' +
      ahvKarte(jahr) +
      '<ul style="margin:14px 0 0;padding-left:18px;color:var(--muted)"><li>Belege 10 Jahre aufbewahren.</li><li>Anschaffungen wie eine Kamera sind separat ausgewiesen, weil sie meist über mehrere Jahre abgeschrieben werden.</li><li>Gewinn aus selbständigem Nebenerwerb ist AHV-pflichtig (SVA Thurgau).</li></ul></div>';

    return '<div class="kopfzeile"><h1>Kassenbuch<small>Einnahmen und Ausgaben, Milchbüchlein</small></h1><div class="aktionen">' +
      '<select class="eingabe" style="width:auto" data-jahr aria-label="Jahr">' + [...jahre].sort((x, y) => y - x).map(j => '<option' + (j === jahr ? ' selected' : '') + '>' + j + '</option>').join('') + '</select>' +
      (formSichtbar ? '' : '<button class="knopf haupt" data-aktion="erfassen" data-wert="aus">Ausgabe erfassen</button><button class="knopf" data-aktion="erfassen" data-wert="ein">Einnahme</button>') + '</div></div>' +
      '<div class="karte flach saldo" style="margin-bottom:16px"><div><div class="leise" style="color:var(--muted)">Einnahmen</div><div class="wert zahl plus">' + M.chf(er.totalErtrag) + '</div></div>' +
        '<div><div style="color:var(--muted)">Ausgaben</div><div class="wert zahl minus">' + M.chf(er.totalAufwand) + '</div></div>' +
        '<div style="background:var(--akzent-bg)"><div style="color:var(--muted)">Gewinn</div><div class="wert zahl">' + M.chf(er.gewinn) + '</div></div></div>' +
      '<div class="tabs"><button data-aktion="kbtab" data-wert="liste" aria-selected="' + (kb.tab === 'liste') + '">Buchungen</button><button data-aktion="kbtab" data-wert="er" aria-selected="' + (kb.tab === 'er') + '">Für die Steuern</button></div>' +
      (kb.tab === 'er' ? erTab : (formSichtbar ? form : '') +
        '<div class="karte flach">' + (sichtbar.length ? '<table class="tabelle"><tbody>' + liste + '</tbody></table>' : '<div class="leer"><strong>Noch keine Buchungen in ' + jahr + '</strong>Bezahlte Rechnungen und Überweisungen an die Mitarbeiterin werden automatisch gebucht. Ausgaben erfasst du mit «Ausgabe erfassen».</div>') + '</div>' +
        '<p class="nebenlinks"><button class="knopf text" data-aktion="import">CSV einlesen</button><button class="knopf text" data-aktion="csv">Buchungen als CSV speichern</button></p>') +
      '<input type="file" accept=".csv,text/csv" data-datei hidden>';
  };

  function ahvKarte(jahr) {
    const r = M.ahvBerechnung(app.daten, jahr), t = M.ahvTabelle(jahr);
    const z = (l, w, k) => '<tr' + (k ? ' class="' + k + '"' : '') + '><td>' + l + '</td><td>' + w + '</td></tr>';
    return '<div class="karte" style="margin-top:16px;padding:16px 18px;background:var(--flaeche)"><div class="kopfzeile" style="margin-bottom:6px"><h2 style="margin:0">Sozialversicherungsbeiträge ' + jahr + '</h2>' +
      '<span class="chip ' + (r.offen > 0 ? 'anfrage' : 'anzahlung') + '">' + (r.offen > 0 ? 'zurücklegen CHF ' + M.chf(r.offen) : 'gedeckt') + '</span></div>' +
      '<p style="margin:0 0 6px;color:var(--muted)">AHV, IV und EO für Selbständige, berechnet auf dem Gewinn. Tabelle gültig ab ' + t.ab + '. ' + esc(r.regel) + '.</p>' +
      '<table class="er" style="width:100%"><tbody>' +
        z('Gewinn vor AHV-Beiträgen', 'CHF ' + M.chf(r.basis)) +
        z('Beitragssatz', r.satz ? r.satz.toFixed(3) + ' %' : '') +
        z('AHV/IV/EO-Beitrag', 'CHF ' + M.chf(r.beitrag)) +
        (r.verwaltung ? z('Verwaltungskosten (' + E().ahvVerwaltungskostenProzent + ' %)', 'CHF ' + M.chf(r.verwaltung)) : '') +
        z('Total geschuldet', 'CHF ' + M.chf(r.total), 'summe') +
        z('Bereits an SVA bezahlt (Kategorie AHV/IV/EO-Beiträge)', 'CHF ' + M.chf(r.bezahlt)) +
        z(r.offen >= 0 ? 'Noch offen' : 'Zu viel bezahlt', 'CHF ' + M.chf(Math.abs(r.offen)), 'summe') +
        z('Gewinn nach Sozialversicherung', 'CHF ' + M.chf(r.gewinnNach), 'total') +
      '</tbody></table>' +
      '<p style="margin:10px 0 0;color:var(--muted);font-size:12.5px">Schätzung. Massgebend ist die Abrechnung der SVA Thurgau auf Basis der Steuerveranlagung. Akontozahlungen an die SVA als Ausgabe mit der Kategorie «AHV/IV/EO-Beiträge» buchen.</p></div>';
  }

  function nextBeleg(jahr) {
    const n = app.daten.buchungen.filter(b => b.jahr === jahr && b.typ === 'aus').map(b => { const m = /^B-(\d+)$/.exec(b.beleg || ''); return m ? +m[1] : 0; });
    return 'B-' + String((n.length ? Math.max(0, ...n) : 0) + 1).padStart(3, '0');
  }

  A.kassenbuch.danach = main => {
    const kb = app.kb;
    main.querySelector('[data-jahr]').addEventListener('change', e => { kb.jahr = +e.target.value; kb.bearbeiten = null; app.zeichnen(); });
    const form = main.querySelector('[data-buchung]');
    if (form) form.addEventListener('submit', e => {
      e.preventDefault();
      const betrag = M.rappenAusText(form.betrag.value);
      if (!betrag || betrag <= 0) return app.melden('Betrag fehlt oder ist ungültig. Beispiel: 1900 oder 49.90', true);
      const alt = kb.bearbeiten ? app.daten.buchungen.find(x => x.id === kb.bearbeiten) : null;
      const typ = alt ? alt.typ : kb.typ;
      const neu = { ...(alt || { id: M.id(), erstellt: new Date().toISOString() }), datum: form.datum.value, jahr: +form.datum.value.slice(0, 4), typ, kat: form.kat.value,
        text: form.text.value.trim(), betrag, zahlart: form.zahlart.value, beleg: form.beleg.value.trim(), auftragId: form.auftragId.value || undefined };
      if (alt) Object.assign(alt, neu); else app.daten.buchungen.push(neu);
      kb.bearbeiten = null; kb.formOffen = false; kb.jahr = neu.jahr;
      app.melden(alt ? 'Änderung gespeichert' : 'Gebucht');
      app.aendern();
    });
    const datei = main.querySelector('[data-datei]');
    datei.addEventListener('change', () => {
      const f = datei.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try { const n = M.kassenbuchCSVImport(app.daten, String(r.result)); app.melden(n + ' Buchungen eingelesen'); app.aendern(); }
        catch (err) { app.melden('CSV konnte nicht gelesen werden: ' + err.message, true); }
      };
      r.readAsText(f, 'utf-8');
    });
    klick(main, {
      typ: t => { if (kb.bearbeiten) return; kb.typ = t; app.zeichnen(); },
      bearbeiten: id => { kb.bearbeiten = id; app.zeichnen(); main.scrollTop = 0; },
      abbrechen: () => { kb.bearbeiten = null; kb.formOffen = false; app.zeichnen(); },
      erfassen: t => { kb.typ = t; kb.formOffen = true; kb.tab = 'liste'; app.zeichnen(); const f = document.querySelector('[data-buchung] [name=betrag]'); if (f) f.focus(); },
      loeschen: async id => {
        const b = app.daten.buchungen.find(x => x.id === id);
        if (!await app.bestaetigen('Buchung löschen?', b.text + ', CHF ' + M.chf(b.betrag), 'Löschen', true)) return;
        // Verknüpfte Rechnung oder Auszahlung wieder öffnen, damit nichts auseinanderläuft
        app.daten.auftraege.forEach(a => {
          (a.rechnungen || []).forEach(r => { if (r.buchungId === id) { delete r.bezahlt; delete r.buchungId; } });
          if (a.auszahlung && a.auszahlung.buchungId === id) delete a.auszahlung;
        });
        app.daten.buchungen = app.daten.buchungen.filter(x => x.id !== id);
        kb.bearbeiten = null; app.aendern();
      },
      filter: f => { kb.filter = f; app.zeichnen(); },
      kbtab: t => { kb.tab = t; app.zeichnen(); },
      csv: () => B.exportieren(M.buchungenCSV(app.daten, kb.jahr), 'theguestbook_buchungen_' + kb.jahr + '.csv').then(p => p && p !== 'abgebrochen' && app.melden('CSV gespeichert')).catch(e => app.melden(e.message, true)),
      'er-csv': () => {
        const er = M.erfolgsrechnungSteuer(app.daten, kb.jahr);
        const z = [['Erfolgsrechnung The Guestbook ' + kb.jahr, ''], ['Ertrag', ''], ...M.KATEGORIEN.ein.map(([k, n]) => [n, (er.ertrag[k] / 100).toFixed(2)]), ['Total Ertrag', (er.totalErtrag / 100).toFixed(2)],
          ['Aufwand', ''], ...M.KATEGORIEN.aus.map(([k, n]) => [k === 'ahv' ? n + ', bezahlt' : n, (er.aufwand[k] / 100).toFixed(2)]),
          ['Rückstellung AHV/IV/EO-Beiträge, noch nicht bezahlt', (er.rueckstellungAhv / 100).toFixed(2)],
          ['Total Aufwand', (er.totalAufwand / 100).toFixed(2)], ['Reingewinn', (er.gewinn / 100).toFixed(2)]];
        B.exportieren(M.csv(z), 'theguestbook_erfolgsrechnung_' + kb.jahr + '.csv').then(p => p && p !== 'abgebrochen' && app.melden('CSV gespeichert')).catch(e => app.melden(e.message, true));
      },
      import: () => datei.click()
    });
  };

  // ---------- Einstellungen ----------

  // Einstellungen als aufklappbare Abschnitte: das Wichtigste oben, Seltenes eingeklappt
  app.offeneAbschnitte = app.offeneAbschnitte || new Set();
  A.einstellungen = () => {
    const e = E();
    const ib = Q.ibanPruefen(e.iban);
    const f = (label, key, opt = {}) => '<label class="feld' + (opt.breit ? ' breit' : '') + (opt.fehler ? ' fehler' : '') + '"><span>' + esc(label) + '</span><input data-e="' + key + '"' + (opt.zahl ? ' type="number" step="any" inputmode="decimal" data-typ="zahl"' : '') +
      (opt.rappen ? ' data-typ="rappen" inputmode="decimal" class="betrag"' : '') + ' value="' + esc(opt.rappen ? (e[key] / 100).toFixed(2) : e[key]) + '">' + (opt.hilfe ? '<small>' + opt.hilfe + '</small>' : '') + '</label>';
    const abschnitt = (id, titel, info, inhalt, offen) => '<details class="abschnitt" data-abschnitt="' + id + '"' + (offen || app.offeneAbschnitte.has(id) ? ' open' : '') + '>' +
      '<summary><span class="a-titel">' + titel + '</span><span class="a-info">' + info + '</span></summary><div class="a-inhalt">' + inhalt + '</div></details>';
    const ma = e.mitarbeiter[0];
    return '<div class="kopfzeile"><h1>Einstellungen<small>Gelten für alle neuen Dokumente</small></h1></div>' +
      '<div class="abschnitte">' +
      abschnitt('sync', 'Abgleich Mac und iPhone', app.sync.konfig ? esc(app.syncText()) : 'Nicht verbunden', syncKarte(), !app.sync.konfig) +
      abschnitt('absender', 'Absender und Bank', esc([e.firma, e.iban].filter(Boolean).join(', ')),
        '<div class="felder">' + f('Firma', 'firma') + f('Inhaber', 'inhaber') + f('Strasse', 'strasse') + f('Nr.', 'hausnummer') + f('PLZ', 'plz') + f('Ort', 'ort') +
        f('E-Mail', 'email') + f('Telefon', 'telefon') + f('Website', 'web') +
        f('IBAN', 'iban', { breit: true, fehler: !ib.ok, hilfe: ib.ok ? (ib.qrIban ? 'Das ist eine QR-IBAN. Für RF-Referenzen brauchst du die normale IBAN.' : 'Gültig') : esc(ib.grund) }) +
        f('Bank', 'bank') + f('Hinweis Mehrwertsteuer', 'mwstHinweis', { breit: true }) + '</div>') +
      abschnitt('pakete', 'Pakete und Preise', e.pakete.length + ' Pakete',
        '<table class="tabelle posten"><thead><tr><th>Name</th><th>Beschreibung</th><th class="r">CHF</th><th></th></tr></thead><tbody>' + e.pakete.map((p, i) =>
          '<tr><td style="width:24%"><input data-paket="' + i + '" data-f="name" value="' + esc(p.name) + '" aria-label="Name"></td><td><input data-paket="' + i + '" data-f="beschreibung" value="' + esc(p.beschreibung) + '" aria-label="Beschreibung"></td>' +
          '<td class="r" style="width:120px"><input class="betrag" inputmode="decimal" data-paket="' + i + '" data-f="rappen" value="' + (p.rappen / 100).toFixed(2) + '" aria-label="Preis"></td><td style="width:36px"><button class="entfernen" data-aktion="paket-weg" data-wert="' + i + '" aria-label="Paket entfernen">×</button></td></tr>').join('') +
        '</tbody></table><div class="aktionen" style="margin-top:10px"><button class="knopf klein" data-aktion="paket-neu">Paket hinzufügen</button></div>') +
      abschnitt('konditionen', 'Zahlungen und Fristen', 'Anzahlung ' + e.anzahlungProzent + ' %, Offerte ' + e.offerteGueltigTage + ' Tage gültig',
        '<div class="felder drei">' + f('Anzahlung %', 'anzahlungProzent', { zahl: true }) + f('Anzahlung fällig (Tage)', 'anzahlungFaelligTage', { zahl: true }) +
        f('Rest fällig nach Anlass (Tage)', 'restFaelligTage', { zahl: true }) + f('km inklusive', 'kmInklusive', { zahl: true }) + f('CHF pro km', 'kmRappen', { rappen: true }) + f('Offerte gültig (Tage)', 'offerteGueltigTage', { zahl: true }) +
        f('Ablauf vorher (Tage)', 'ablaufVorherTage', { zahl: true }) + f('Lieferung (Wochen)', 'lieferungWochen', { zahl: true }) + f('Aufbewahrung (Monate)', 'archivMonate', { zahl: true }) +
        f('Mahnfrist (Tage)', 'mahnFristTage', { zahl: true }) + f('Mahngebühr ab 2. Mahnung', 'mahnGebuehrRappen', { rappen: true, hilfe: 'Nur verlangen, wenn im Vertrag vereinbart' }) + f('Storno früh %', 'stornoFruehProzent', { zahl: true }) + f('Storno spät %', 'stornoSpaetProzent', { zahl: true }) + f('Grenze (Tage vorher)', 'stornoGrenzeTage', { zahl: true }) + '</div>') +
      abschnitt('mail', 'Mailvorlagen', 'Texte für Offerte, Vertrag, Rechnung und Mahnung', mailKarte()) +
      abschnitt('mitarbeiterin', 'Mitarbeiterin', ma ? esc(ma.name) + ', ' + e.mitarbeiterProzent + ' %, Fremdleistung' : 'Keine erfasst',
        (e.mitarbeiter.length ? e.mitarbeiter.map((m, i) => {
          const j = M.mitarbeiterJahr(app.daten, m.id, new Date().getFullYear());
          return '<div class="felder" style="margin-bottom:10px;align-items:end"><label class="feld"><span>Name</span><input data-ma="' + i + '" data-f="name" value="' + esc(m.name) + '"></label>' +
            '<div class="feld"><span>Abrechnung</span><div style="padding:7px 0">Auftragsverhältnis, Fremdleistung</div></div>' +
            '<p class="breit" style="margin:0;color:var(--muted)">' + new Date().getFullYear() + ': ausbezahlt CHF ' + M.chf(j.ausbezahlt) + (j.offen ? ', noch offen CHF ' + M.chf(j.offen) + ' (' + j.offeneAuftraege.join(', ') + ')' : '') + '</p></div>';
        }).join('') + '<div class="felder">' + f('Anteil %', 'mitarbeiterProzent', { zahl: true }) +
          '<label class="check" style="align-self:end;padding-bottom:8px"><input type="checkbox" data-e="mitarbeiterOhneAnfahrt" data-typ="check"' + (e.mitarbeiterOhneAnfahrt ? ' checked' : '') + '> Anteil ohne Anfahrt berechnen</label>' +
          '<label class="check breit"><input type="checkbox" data-e="mitarbeiterStandard" data-typ="check"' + (e.mitarbeiterStandard ? ' checked' : '') + '> Neue Aufträge automatisch ihr zuordnen</label></div>'
          : '<p style="margin:0 0 10px;color:var(--muted)">Noch keine Mitarbeiterin erfasst.</p><button class="knopf klein" data-aktion="ma-neu">Mitarbeiterin erfassen</button>')) +
      abschnitt('sozial', 'Sozialversicherung', 'AHV/IV/EO für Selbständige',
        '<label class="check" style="margin-bottom:10px"><input type="checkbox" data-e="ahvMindestbeitragUeberLohn" data-typ="check"' + (e.ahvMindestbeitragUeberLohn ? ' checked' : '') + '> Mindestbeitrag ist schon über meinen Lohn bezahlt (Anstellung)</label>' +
        '<div class="felder">' + f('Verwaltungskosten SVA in %', 'ahvVerwaltungskostenProzent', { zahl: true, hilfe: 'Steht auf der Akontorechnung der SVA, höchstens 5 %' }) + '</div>') +
      (B.istMac ? abschnitt('kalender', 'Apple Kalender', e.kalenderAbgleich ? 'Automatischer Abgleich ein' : 'Ausgeschaltet',
        '<label class="check"><input type="checkbox" data-e="kalenderAbgleich" data-typ="check"' + (e.kalenderAbgleich ? ' checked' : '') + '> Anlässe und Fristen automatisch in den Kalender «theguestbook» eintragen</label>' +
        '<p style="margin:10px 0 0;color:var(--muted)">' + esc(app.kalenderStatus || 'Noch nicht abgeglichen.') + '</p><div class="aktionen" style="margin-top:10px"><button class="knopf" data-aktion="abgleich">Jetzt abgleichen</button></div>') : '') +
      abschnitt('daten', 'Daten und Sicherung', B.istMac ? 'Datenordner und Sicherung' : 'Sicherung exportieren',
        '<p style="margin:0 0 10px;color:var(--muted)">' + (B.istMac ? 'Die Daten liegen in deinem Dokumente-Ordner (iCloud) mit automatischen Sicherungen.' : 'Eine Sicherung ist eine Datei mit allen Daten, zum Aufbewahren.') + '</p>' +
        '<div class="aktionen">' + (B.istMac ? '<button class="knopf" data-aktion="ordner">Datenordner zeigen</button>' : '') + '<button class="knopf" data-aktion="sicherung">Sicherung exportieren</button></div>') +
      '</div>';
  };

  // Abgleich zwischen Mac und iPhone über ein privates GitHub-Repository
  function syncKarte() {
    const s = app.sync;
    if (s.konfig) return '' +
      '<p style="margin:0 0 6px">Verbunden mit <strong>' + esc(s.konfig.repo) + '</strong></p>' +
      '<p style="margin:0 0 12px;color:var(--muted)" data-sync-status>' + esc(app.syncText()) + '</p>' +
      '<div class="aktionen"><button class="knopf" data-aktion="sync-jetzt">Jetzt abgleichen</button><button class="knopf text" data-aktion="sync-trennen">Trennen</button></div>';
    return '' +
      '<p style="margin:0 0 12px;color:var(--muted)">Die Daten werden in deinem privaten GitHub-Repository gespeichert, damit Mac und iPhone dasselbe sehen. Den Schlüssel gibst du auf jedem Gerät einmal ein, er bleibt nur auf diesem Gerät.</p>' +
      '<div class="felder">' +
        '<label class="feld"><span>Repository</span><input id="sync-repo" autocomplete="off" autocapitalize="off" spellcheck="false" value="liasoer/theguestbook-daten"></label>' +
        '<label class="feld"><span>Schlüssel (github_pat_…)</span><input id="sync-token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…"></label>' +
      '</div><div class="aktionen" style="margin-top:12px"><button class="knopf haupt" data-aktion="sync-verbinden">Verbinden</button></div>';
  }

  // Mailvorlagen: leer lassen heisst Standardtext. Platzhalter werden beim Senden ersetzt.
  function mailKarte() {
    const e = E(), eigene = e.mailVorlagen || {};
    return '' +
      '<label class="feld" style="max-width:360px;margin-bottom:12px"><span>Senden am Mac mit</span><select data-e="mailProgramm">' +
        [['outlook365', 'Outlook im Browser (Microsoft 365)'], ['outlookcom', 'Outlook im Browser (outlook.com)'], ['apple', 'Standard-Mailprogramm (Apple Mail oder Outlook-App)']]
          .map(([w, t]) => '<option value="' + w + '"' + ((e.mailProgramm || 'outlook365') === w ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>' +
        '<small>Im Browser öffnet sich die fertige Mail, das PDF liegt im Finder bereit zum Hineinziehen.</small></label>' +
      '<p style="margin:0 0 12px;color:var(--muted)">Die Vorlagen werden beim Senden von Offerte, Vertrag, Rechnung und Mahnung automatisch ausgefüllt. Platzhalter: ' +
        D.PLATZHALTER.map(p => '<code>{' + p + '}</code>').join(' ') + '</p>' +
      Object.keys(D.MAIL_VORLAGEN).map(art => {
        const std = D.MAIL_VORLAGEN[art], ei = eigene[art] || {};
        return '<details class="vorlage"' + (ei.betreff || ei.text ? ' open' : '') + '><summary>' + std.name + (ei.betreff || ei.text ? ' <span class="leise">angepasst</span>' : '') + '</summary>' +
          '<label class="feld"><span>Betreff</span><input data-mv="' + art + '" data-f="betreff" value="' + esc(ei.betreff || std.betreff) + '"></label>' +
          '<label class="feld"><span>Text</span><textarea rows="9" data-mv="' + art + '" data-f="text">' + esc(ei.text || std.text) + '</textarea></label>' +
          (ei.betreff || ei.text ? '<button class="knopf klein text" data-aktion="mv-zurueck" data-wert="' + art + '">Standardtext wiederherstellen</button>' : '') +
        '</details>';
      }).join('');
  }

  A.einstellungen.danach = main => {
    const e = E();
    main.querySelectorAll('details.abschnitt').forEach(d => d.addEventListener('toggle', () => { d.open ? app.offeneAbschnitte.add(d.dataset.abschnitt) : app.offeneAbschnitte.delete(d.dataset.abschnitt); }));
    main.addEventListener('change', ev => {
      const el = ev.target;
      if (el.dataset.e) {
        let w = el.value;
        if (el.dataset.typ === 'zahl') w = Number(el.value) || 0;
        if (el.dataset.typ === 'check') w = el.checked;
        if (el.dataset.typ === 'rappen') { w = M.rappenAusText(el.value); if (w == null) return app.melden('Betrag ungültig', true); }
        if (el.dataset.e === 'iban') w = Q.inVierern(w);
        e[el.dataset.e] = w; return app.aendern();
      }
      if (el.dataset.paket !== undefined) {
        const p = e.pakete[+el.dataset.paket];
        if (el.dataset.f === 'rappen') { const r = M.rappenAusText(el.value); if (r == null) return app.melden('Betrag ungültig', true); p.rappen = r; } else p[el.dataset.f] = el.value;
        return app.aendern();
      }
      if (el.dataset.ma !== undefined) { e.mitarbeiter[+el.dataset.ma][el.dataset.f] = el.value; return app.aendern(); }
      if (el.dataset.mv) {
        const art = el.dataset.mv, std = D.MAIL_VORLAGEN[art];
        e.mailVorlagen = e.mailVorlagen || {}; const v = e.mailVorlagen[art] = e.mailVorlagen[art] || {};
        // Nur speichern, was vom Standard abweicht, damit verbesserte Standardtexte ankommen
        if (el.value.trim() && el.value !== std[el.dataset.f]) v[el.dataset.f] = el.value; else delete v[el.dataset.f];
        if (!v.betreff && !v.text) delete e.mailVorlagen[art];
        return app.aendern();
      }
    });
    klick(main, {
      ordner: () => B.ordnerZeigen().catch(err => app.melden(err.message, true)),
      sicherung: () => B.exportieren(JSON.stringify(app.daten, null, 2), 'theguestbook-business-sicherung-' + M.heute() + '.json').then(p => p && p !== 'abgebrochen' && app.melden('Sicherung gespeichert')).catch(err => app.melden(err.message, true)),
      'paket-neu': () => { e.pakete.push({ id: M.id(), name: 'Neues Paket', beschreibung: '', rappen: 0, kategorie: 'zusatz' }); app.aendern(); },
      'paket-weg': async i => { if (await app.bestaetigen('Paket entfernen?', e.pakete[+i].name + ' wird aus der Auswahl entfernt. Bestehende Offerten bleiben unverändert.', 'Entfernen', true)) { e.pakete.splice(+i, 1); app.aendern(); } },
      'ma-neu': () => {
        e.mitarbeiter.push({ id: M.id(), name: 'Mitarbeiterin', art: 'fremd' });
        // Bestehende aktive Aufträge ohne Zuordnung gleich übernehmen
        app.daten.auftraege.filter(a => !['abgesagt', 'archiv', 'bezahlt'].includes(a.status)).forEach(a => M.mitarbeiterVorgabe(app.daten, a));
        app.aendern();
      },
      abgleich: () => app.kalenderAbgleichen(false),
      'mv-zurueck': art => { if (e.mailVorlagen) delete e.mailVorlagen[art]; app.aendern(); },
      'sync-verbinden': () => app.syncVerbinden(main.querySelector('#sync-repo').value, main.querySelector('#sync-token').value),
      'sync-jetzt': () => app.syncJetzt(false),
      'sync-trennen': () => app.syncTrennen()
    });
  };
})();
