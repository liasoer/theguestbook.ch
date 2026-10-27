// theguestbook business: Oberfläche (Grundgerüst, Speichern, Dialoge, Anfragen)
(function () {
  'use strict';
  const M = window.Modell, Q = window.QRRechnung, D = window.Dokumente, B = window.Bruecke;

  // ---------- Zustand ----------
  const app = window.App = {
    daten: M.leereDaten(),
    ansicht: { name: 'start' },     // start | auftraege | auftrag | kunden | kalender | kassenbuch | einstellungen
    filter: { status: 'aktiv', jahr: 'alle', suche: '', abgesagte: false },
    tab: 'auftrag',
    kb: { jahr: new Date().getFullYear(), typ: 'ein', bearbeiten: null, tab: 'liste', filter: 'alle' },
    kal: { jahr: new Date().getFullYear(), monat: new Date().getMonth() },
    kalenderStatus: ''
  };

  // ---------- Hilfen ----------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  app.esc = esc;
  app.kunde = a => app.daten.kunden.find(k => k.id === a.kundeId) || { name: 'Unbekannt' };
  app.auftrag = id => app.daten.auftraege.find(a => a.id === id);
  app.statusName = id => (M.STATUS.find(s => s.id === id) || { name: id }).name;
  app.artName = id => (M.ARTEN.find(s => s.id === id) || M.ARTEN[0]).name;
  app.istEvent = a => a.art === 'privat' || a.art === 'firma';
  app.chip = st => '<span class="chip ' + esc(st) + '">' + esc(app.statusName(st)) + '</span>';
  app.artChip = a => '<span class="art' + (app.istEvent(a) ? ' event' : '') + '">' + esc(app.artName(a.art)) + '</span>';
  app.total = a => a.vertrag ? M.postenTotal(a.vertrag.posten, a.vertrag.km, app.daten.einstellungen)
    : a.offerte ? M.postenTotal(a.offerte.posten, a.offerte.km, app.daten.einstellungen) : 0;
  app.offen = a => {
    if (!a.vertrag || ['abgesagt'].includes(a.status)) return 0;
    const bez = (a.rechnungen || []).filter(r => r.bezahlt).reduce((s, r) => s + r.rappen, 0);
    return Math.max(0, app.total(a) - bez);
  };
  app.fristKlasse = datum => {
    const t = M.tageZwischen(M.heute(), datum);
    return t < 0 ? 'frist-ueber' : t <= 7 ? 'frist-bald' : '';
  };
  app.wann = datum => {
    const t = M.tageZwischen(M.heute(), datum);
    if (t === 0) return 'heute';
    if (t === 1) return 'morgen';
    if (t === -1) return 'gestern';
    if (t < 0) return 'seit ' + (-t) + ' Tagen';
    if (t < 14) return 'in ' + t + ' Tagen';
    return M.datumCH(datum);
  };

  // ---------- Meldungen und Dialoge ----------
  let meldungTimer;
  app.melden = (text, fehler) => {
    let el = $('.meldung');
    if (!el) { el = document.createElement('div'); el.className = 'meldung'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = text; el.classList.toggle('fehler', !!fehler); el.hidden = false;
    clearTimeout(meldungTimer); meldungTimer = setTimeout(() => { el.hidden = true; }, fehler ? 6000 : 2500);
  };

  // dialog({titel, inhalt (HTML), knoepfe:[{text, art, wert}], gross}) -> Promise mit {wert, form}
  app.dialog = (o) => new Promise(resolve => {
    const hg = document.createElement('div'); hg.className = 'dialog-hg';
    hg.innerHTML = '<div class="dialog' + (o.gross ? ' gross' : '') + '" role="dialog" aria-modal="true">' +
      (o.titel ? '<h3>' + esc(o.titel) + '</h3>' : '') + '<form class="d-inhalt" style="display:contents">' + (o.inhalt || '') +
      '<div class="unten">' + (o.knoepfe || [{ text: 'OK', art: 'haupt', wert: true }]).map((k, i) =>
        '<button type="' + ((k.art || '').includes('haupt') ? 'submit' : 'button') + '" class="knopf ' + (k.art || '') + '" data-i="' + i + '">' + esc(k.text) + '</button>').join('') +
      '</div></form></div>';
    document.body.appendChild(hg);
    const form = $('form', hg);
    const schliessen = (wert) => { hg.remove(); document.removeEventListener('keydown', taste); resolve({ wert, form }); };
    const taste = e => { if (e.key === 'Escape') schliessen(null); };
    document.addEventListener('keydown', taste);
    $$('.unten button', hg).forEach(b => b.addEventListener('click', e => {
      const k = o.knoepfe ? o.knoepfe[+b.dataset.i] : { wert: true };
      if (b.type === 'submit') return; // läuft über submit
      e.preventDefault(); schliessen(k.wert);
    }));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const k = (o.knoepfe || [{ wert: true }]).find(x => (x.art || '').includes('haupt')) || { wert: true };
      if (o.pruefen && !o.pruefen(form)) return;
      const werte = {}; new FormData(form).forEach((v, key) => { werte[key] = v; });
      hg.remove(); document.removeEventListener('keydown', taste); resolve({ wert: k.wert, form, werte });
    });
    hg.addEventListener('mousedown', e => { if (e.target === hg) schliessen(null); });
    const erstes = $('input,textarea,select', hg) || $('.unten .haupt', hg); if (erstes) setTimeout(() => erstes.focus(), 30);
    if (o.danach) o.danach(hg);
  });

  app.bestaetigen = (titel, text, knopf, gefahr) =>
    app.dialog({ titel, inhalt: '<p style="margin:0">' + esc(text) + '</p>', knoepfe: [{ text: 'Abbrechen', wert: false }, { text: knopf || 'OK', art: 'haupt' + (gefahr ? ' gefahr' : ''), wert: true }] })
      .then(r => r.wert === true);

  app.datumFragen = (titel, text, vorgabe, knopf) => {
    const tag = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const schnell = [[0, 'Heute'], [1, 'Gestern'], [2, 'Vorgestern']];
    return app.dialog({ titel, inhalt: (text ? '<p style="margin:0 0 12px">' + esc(text) + '</p>' : '') +
      '<div class="schnellwahl" role="group" aria-label="Schnellwahl">' + schnell.map(([n, t]) => '<button type="button" class="knopf klein" data-tag="' + tag(n) + '">' + t + '</button>').join('') + '</div>' +
      '<label class="feld datumfeld"><span>Datum</span><input type="date" name="datum" required value="' + esc(vorgabe || M.heute()) + '"></label>',
      knoepfe: [{ text: 'Abbrechen', wert: null }, { text: knopf || 'Übernehmen', art: 'haupt', wert: true }],
      danach: hg => {
        const feld = $('input[name=datum]', hg);
        const markieren = () => $$('.schnellwahl button', hg).forEach(b => b.setAttribute('aria-pressed', b.dataset.tag === feld.value));
        $$('.schnellwahl button', hg).forEach(b => b.addEventListener('click', () => { feld.value = b.dataset.tag; markieren(); }));
        feld.addEventListener('input', markieren); markieren();
      } })
      .then(r => r.wert ? r.werte.datum : null);
  };

  // ---------- Dokumentvorschau und PDF ----------
  // Mehrseitige Dokumente (Vertrag) brauchen auf jeder Seite einen Rand: 16 mm oben, 18 mm unten
  const raenderFuer = html => /<body class="[^"]*\bvertrag\b/.test(html) ? { oben: 45, unten: 51 } : {};
  const dateiName = n => n.replace(/[\\/:*?"<>|]/g, '-');

  // Vorschau mit «Als PDF speichern» und, wenn eine Mailvorlage mitkommt, «Per Mail senden».
  // Gibt 'pdf', 'mail' oder false zurück, damit der Aufrufer z.B. die Offerte als verschickt markieren kann.
  app.dokumentZeigen = async (html, dateiname, mail) => {
    if (!B.istMac) return app.dokumentImBrowser(html, dateiname, mail);
    const r = await app.dialog({
      gross: true, inhalt: '<iframe title="Vorschau"></iframe>',
      knoepfe: [{ text: 'Schliessen', wert: null }].concat(mail ? [{ text: 'Per Mail senden', wert: 'mail' }] : [], [{ text: 'Als PDF speichern', art: 'haupt', wert: 'pdf' }]),
      danach: hg => { $('iframe', hg).srcdoc = html; }
    });
    if (r.wert === 'pdf') return app.pdfSpeichern(html, dateiname);
    if (r.wert === 'mail') return app.mailSenden(html, dateiname, mail);
    return false;
  };
  app.pdfSpeichern = async (html, dateiname) => {
    if (!B.istMac) return app.dokumentImBrowser(html, dateiname);
    try {
      const pfad = await B.pdf(html, dateiName(dateiname) + '.pdf', raenderFuer(html));
      if (pfad && pfad !== 'abgebrochen') { app.melden('PDF gespeichert'); return 'pdf'; }
    } catch (e) { app.melden('PDF konnte nicht gespeichert werden: ' + e.message, true); }
    return false;
  };
  // Mac: PDF erstellen und eine neue Mail in Apple Mail öffnen, mit Empfänger, Betreff, Text und Anhang
  app.mailSenden = async (html, dateiname, mail) => {
    if (!B.istMac) return app.dokumentImBrowser(html, dateiname, mail);
    if (!mail.an) app.melden('Beim Kunden ist keine E-Mail-Adresse erfasst. Den Empfänger trägst du in Mail ein.');
    const prog = app.daten.einstellungen.mailProgramm || 'outlook365';
    const basis = { outlook365: 'https://outlook.office.com/mail/deeplink/compose', outlookcom: 'https://outlook.live.com/mail/0/deeplink/compose' }[prog];
    const enc = encodeURIComponent;
    const link = basis ? basis + '?to=' + enc(mail.an || '') + '&subject=' + enc(mail.betreff) + '&body=' + enc(mail.text) : null;
    try {
      await B.mail({ html, dateiname: dateiName(dateiname) + '.pdf', raender: raenderFuer(html), an: mail.an, betreff: mail.betreff, text: mail.text, link });
      app.melden(link ? 'Outlook geöffnet. Das PDF ist im Finder markiert, zieh es in die Mail.' : 'Mail mit PDF in Apple Mail vorbereitet');
      return 'mail';
    } catch (e) { app.melden('Mail konnte nicht vorbereitet werden: ' + e.message, true); }
    return false;
  };

  // Im Browser und auf dem iPhone: Das PDF wird direkt hier erstellt (PdfWeb), dann über «Teilen»
  // weitergegeben. Teilen muss direkt aus einem Tipp kommen, darum zuerst erstellen, dann tippen.
  app.dokumentImBrowser = async (html, dateiname, mail) => {
    let ergebnis = false, blob = null;
    const titel = dateiName(dateiname);
    const mitTitel = html.replace(/<title>[^<]*<\/title>/, '<title>' + esc(titel) + '</title>');
    const fehler = err => { if (err && (err.name === 'AbortError' || err.code === 'declined')) return; app.melden('PDF konnte nicht weitergegeben werden: ' + (err && err.message || err), true); };
    await app.dialog({
      gross: true, inhalt: '<iframe title="Vorschau"></iframe><p class="pdf-status" aria-live="polite">PDF wird erstellt</p>',
      knoepfe: [{ text: 'Schliessen', wert: null }],
      danach: hg => {
        const f = $('iframe', hg), status = $('.pdf-status', hg);
        f.addEventListener('load', () => {
          // Vorschau auf die Breite des Bildschirms verkleinern
          const st = f.contentDocument.createElement('style');
          st.textContent = '@media screen{html{zoom:' + Math.min(1, (f.clientWidth - 4) / 794).toFixed(3) + '}}';
          f.contentDocument.head.appendChild(st);
        });
        f.srcdoc = mitTitel;
        const knopf = (text, haupt) => { const k = document.createElement('button'); k.type = 'button'; k.className = 'knopf' + (haupt ? ' haupt' : ''); k.textContent = text; k.disabled = true; $('.unten', hg).appendChild(k); return k; };
        const kMail = mail ? knopf('Per Mail senden', true) : null;
        const kPdf = knopf(mail ? 'PDF sichern' : 'PDF sichern oder teilen', !mail);
        // Manche Mail-Apps (z.B. Outlook) übernehmen beim Teilen nur den Anhang: Text zum Einfügen bereithalten
        if (mail) { const kText = knopf('Mailtext kopieren'); kText.disabled = false; kText.addEventListener('click', () => {
          if (navigator.clipboard) navigator.clipboard.writeText(mail.text).then(() => app.melden('Mailtext kopiert'), () => app.melden('Kopieren nicht möglich', true));
        }); }
        kPdf.addEventListener('click', () => { if (!blob) return; PdfWeb.weitergeben(blob, titel).then(() => { ergebnis = ergebnis || 'pdf'; }).catch(fehler); });
        if (kMail) kMail.addEventListener('click', () => {
          if (!blob) return;
          // Die Adresse lässt sich nicht an Mail übergeben, darum in die Zwischenablage
          if (mail.an && navigator.clipboard) navigator.clipboard.writeText(mail.an).then(() => app.melden('Adresse ' + mail.an + ' kopiert. In Mail bei «An» einfügen.'), () => {});
          PdfWeb.weitergeben(blob, titel, { titel: mail.betreff, text: mail.text }).then(() => { ergebnis = 'mail'; }).catch(fehler);
        });
        PdfWeb.erstellen(mitTitel).then(b => {
          blob = b; status.textContent = 'PDF bereit, ' + Math.max(1, Math.round(b.size / 1024)) + ' KB';
          kPdf.disabled = false; if (kMail) kMail.disabled = false;
        }).catch(err => { status.textContent = 'PDF konnte nicht erstellt werden: ' + err.message; status.classList.add('fehler'); });
      }
    });
    return ergebnis;
  };

  // ---------- Speichern und Kalender ----------
  let speicherTimer, kalenderTimer, speichertGerade = false, nochmal = false;
  app.aendern = (neuZeichnen = true) => {
    clearTimeout(speicherTimer);
    speicherTimer = setTimeout(speichern, 300);
    $('#speicherstand').textContent = 'Wird gespeichert';
    if (neuZeichnen) app.zeichnen();
    if (app.daten.einstellungen.kalenderAbgleich && B.istMac) {
      clearTimeout(kalenderTimer); kalenderTimer = setTimeout(() => app.kalenderAbgleichen(true), 2500);
    }
  };
  async function speichern() {
    if (speichertGerade) { nochmal = true; return; }
    speichertGerade = true;
    try {
      await B.speichern(app.daten);
      $('#speicherstand').textContent = 'Gespeichert ' + new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
      app.syncBald();
    } catch (e) {
      $('#speicherstand').textContent = 'Nicht gespeichert';
      app.melden('Speichern fehlgeschlagen: ' + e.message, true);
    } finally {
      speichertGerade = false;
      if (nochmal) { nochmal = false; speichern(); }
    }
  }
  app.kalenderAbgleichen = async (still) => {
    try {
      const r = await B.kalenderAbgleichen(M.kalenderEintraege(app.daten));
      app.kalenderStatus = 'Abgeglichen um ' + new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
      if (!still) app.melden('Kalender abgeglichen: ' + r.neu + ' neu, ' + r.geaendert + ' geändert, ' + r.geloescht + ' entfernt');
    } catch (e) {
      app.kalenderStatus = 'Fehler: ' + e.message;
      if (!still) app.melden(e.message, true);
    }
    if (app.ansicht.name === 'kalender' || app.ansicht.name === 'einstellungen') app.zeichnen();
  };


  // ---------- Abgleich über GitHub (Mac und iPhone) ----------
  const SY = window.Sync;
  const kopieVon = x => JSON.parse(JSON.stringify(x));
  const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const zeit = d => d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  app.sync = { konfig: null, sha: null, basis: null, status: 'aus', fehler: '', zuletzt: null, laeuft: false, nochmal: false };
  const geraet = B.istMac ? 'Mac' : (/iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : 'Browser');

  async function syncKonfigLaden() {
    try {
      const k = await B.lokalLesen('sync'); app.sync.konfig = k ? JSON.parse(k) : null;
      const b = await B.lokalLesen('sync-basis');
      if (b) { const o = JSON.parse(b); app.sync.sha = o.sha; app.sync.basis = o.daten; }
      app.sync.status = app.sync.konfig ? 'bereit' : 'aus';
    } catch (e) { app.sync.konfig = null; }
  }
  async function basisMerken(sha, daten) {
    app.sync.sha = sha; app.sync.basis = kopieVon(daten);
    await B.lokalSchreiben('sync-basis', JSON.stringify({ sha, daten }));
  }
  // Neue Daten von GitHub übernehmen. Wird gerade ein Feld bearbeitet, erst danach neu zeichnen.
  function datenUebernehmen(neu) {
    app.daten = neu;
    B.speichern(app.daten).catch(() => {});
    const fokus = document.activeElement;
    if (fokus && fokus.closest && fokus.closest('main') && /INPUT|TEXTAREA|SELECT/.test(fokus.tagName)) {
      fokus.addEventListener('blur', () => setTimeout(app.zeichnen, 50), { once: true });
    } else app.zeichnen();
  }
  function syncAnzeigen() {
    const s = app.sync, el = $('#speicherstand');
    if (s.status === 'ok' && el) el.textContent = 'Abgeglichen ' + zeit(s.zuletzt);
    if (s.status === 'offline' && el) el.textContent = 'Offline, Abgleich folgt';
    if (s.status === 'fehler' && el) el.textContent = 'Abgleich fehlgeschlagen';
    const p = $('[data-sync-status]'); if (p) p.textContent = app.syncText();
  }
  app.syncText = () => {
    const s = app.sync;
    return s.status === 'aus' ? 'Nicht verbunden'
      : s.laeuft ? 'Wird abgeglichen'
      : s.status === 'ok' ? 'Abgeglichen um ' + zeit(s.zuletzt)
      : s.status === 'offline' ? 'Keine Verbindung. Änderungen bleiben auf diesem Gerät und werden später abgeglichen.'
      : s.status === 'fehler' ? 'Fehler: ' + s.fehler
      : 'Verbunden';
  };

  app.syncJetzt = async (still = true) => {
    const s = app.sync;
    if (!s.konfig) return;
    if (s.laeuft) { s.nochmal = true; return; }
    s.laeuft = true; syncAnzeigen();
    const gh = SY.client(s.konfig);
    try {
      for (let versuch = 0; versuch < 4; versuch++) {
        const fern = await gh.lesen();
        let ziel, sha = fern ? fern.sha : undefined;
        if (fern && fern.sha !== s.sha) {
          // Auf GitHub gibt es Neues: mit dem Stand auf diesem Gerät zusammenführen
          const fd = M.normalisieren(JSON.parse(fern.text));
          const r = SY.zusammenfuehren(s.basis, app.daten, fd);
          const neu = M.normalisieren(r.daten);
          if (!gleich(neu, app.daten)) datenUebernehmen(neu);
          if (r.konflikte.length) app.melden(r.konflikte.length + (r.konflikte.length === 1 ? ' Eintrag wurde' : ' Einträge wurden') + ' auf zwei Geräten gleichzeitig geändert. Die Version von diesem Gerät gilt.');
          if (gleich(neu, fd)) { await basisMerken(fern.sha, fd); break; }
          ziel = kopieVon(neu);
        } else {
          if (fern && gleich(app.daten, s.basis)) break;          // nichts zu tun
          ziel = kopieVon(app.daten);
        }
        try { await basisMerken(await gh.schreiben(JSON.stringify(ziel, null, 2), sha, geraet), ziel); break; }
        catch (e) { if (e.status === 409 || e.status === 422) continue; throw e; }  // jemand war schneller: nochmals lesen
      }
      s.status = 'ok'; s.zuletzt = new Date(); s.fehler = '';
    } catch (e) {
      s.status = e.offline ? 'offline' : 'fehler'; s.fehler = e.message;
      if (!still) app.melden(e.offline ? 'Keine Verbindung zu GitHub' : 'Abgleich fehlgeschlagen: ' + e.message, true);
    } finally {
      s.laeuft = false; syncAnzeigen();
      if (s.nochmal) { s.nochmal = false; app.syncBald(); }
    }
  };
  let syncTimer;
  app.syncBald = () => { if (!app.sync.konfig) return; clearTimeout(syncTimer); syncTimer = setTimeout(() => app.syncJetzt(true), 2000); };

  // Verbinden: prüft Zugriff, verlangt ein privates Repository und klärt, welche Daten gelten
  app.syncVerbinden = async (repo, token) => {
    repo = repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    token = token.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return app.melden('Repository bitte als «benutzer/name» angeben, zum Beispiel liasoer/theguestbook-daten.', true);
    if (!token) return app.melden('Bitte den Schlüssel einfügen.', true);
    const gh = SY.client({ repo, token });
    let info, fern;
    try { info = await gh.pruefen(); } catch (e) { return app.melden(e.message, true); }
    if (!info.privat) return app.melden('Das Repository ist öffentlich. Stelle es bei GitHub auf «Private», sonst könnte jeder deine Kundendaten lesen.', true);
    try { fern = await gh.lesen(); } catch (e) { return app.melden(e.message, true); }
    let start;
    if (fern) {
      const fd = M.normalisieren(JSON.parse(fern.text));
      const r = await app.dialog({
        titel: 'Auf GitHub liegen schon Daten',
        inhalt: '<p style="margin:0 0 10px">GitHub: ' + fd.auftraege.length + ' Aufträge, ' + fd.buchungen.length + ' Buchungen. Auf diesem Gerät: ' + app.daten.auftraege.length + ' Aufträge, ' + app.daten.buchungen.length + ' Buchungen.</p>' +
          '<p style="margin:0">«Von GitHub übernehmen» ersetzt die Daten auf diesem Gerät. «Zusammenführen» behält beides.</p>',
        knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Zusammenführen', wert: 'beide' }, { text: 'Von GitHub übernehmen', art: 'haupt', wert: 'github' }]
      });
      if (!r.wert) return;
      if (r.wert === 'github') { datenUebernehmen(fd); start = { sha: fern.sha, daten: fd }; }
      else { const z = M.normalisieren(SY.zusammenfuehren({}, app.daten, fd).daten); datenUebernehmen(z); start = { sha: fern.sha, daten: fd }; }
    } else {
      if (!await app.bestaetigen('Daten hochladen?', 'Das Repository ist noch leer. Die Daten von diesem Gerät (' + app.daten.auftraege.length + ' Aufträge, ' + app.daten.buchungen.length + ' Buchungen) werden zu GitHub hochgeladen. Danach verbindest du das andere Gerät.', 'Hochladen')) return;
      start = { sha: null, daten: null };
    }
    app.sync.konfig = { repo, token };
    await B.lokalSchreiben('sync', JSON.stringify(app.sync.konfig));
    await basisMerken(start.sha, start.daten);
    await app.syncJetzt(false);
    if (app.sync.status === 'ok') app.melden('Verbunden mit ' + repo);
    app.zeichnen();
  };
  app.syncTrennen = async () => {
    if (!await app.bestaetigen('Abgleich beenden?', 'Dieses Gerät gleicht nicht mehr mit GitHub ab und vergisst den Schlüssel. Die Daten auf GitHub und auf diesem Gerät bleiben bestehen.', 'Trennen', true)) return;
    app.sync = Object.assign(app.sync, { konfig: null, sha: null, basis: null, status: 'aus' });
    await B.lokalSchreiben('sync', null); await B.lokalSchreiben('sync-basis', null);
    app.zeichnen();
  };
  // Regelmässig und beim Zurückkehren in die App nachsehen
  setInterval(() => { if (document.visibilityState === 'visible') app.syncJetzt(true); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') app.syncJetzt(true); });
  window.addEventListener('online', () => app.syncJetzt(true));

  // ---------- Anfragen übernehmen ----------
  app.anfrageEinfuegen = async () => {
    const r = await app.dialog({
      titel: 'Anfrage einfügen',
      inhalt: '<p style="margin:0 0 10px">Kopiere den Link «Offerte erstellen» oder «In App übernehmen» aus der Anfrage-Mail und füge ihn hier ein. Der ganze Mailtext geht auch.</p>' +
        '<textarea name="text" required placeholder="https://theguestbook.ch/offerte.html#..."></textarea>',
      knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Übernehmen', art: 'haupt', wert: true }]
    });
    if (r.wert) app.anfrageVerarbeiten(r.werte.text);
  };

  app.anfrageVerarbeiten = async (text) => {
    let anfrage;
    try { anfrage = M.anfrageLesen(text); } catch (e) { return app.melden(e.message, true); }
    const r = M.anfrageUebernehmen(app.daten, anfrage, M.heute());
    app.aendern(false);
    app.oeffnen('auftrag', r.auftrag.id, 'auftrag');
    if (!r.neu) return app.melden('Diese Anfrage ist schon als Auftrag ' + r.auftrag.nummer + ' erfasst.');

    // Warnungen: eigene Aufträge und Apple Kalender
    const warnungen = r.konflikte.map(k => 'Auftrag ' + k.nummer + ' (' + app.kunde(k).name + ', ' + app.statusName(k.status) + ')');
    if (r.auftrag.datum && B.istMac) {
      try {
        const termine = await B.kalenderBelegt(r.auftrag.datum);
        termine.forEach(t => warnungen.push(t.titel + ', ' + t.zeit + ' (Kalender ' + t.kalender + ')'));
      } catch (e) { warnungen.push('Kalender konnte nicht geprüft werden: ' + e.message); }
    }
    const k = r.kunde, a = r.auftrag;
    app.dialog({
      titel: 'Anfrage übernommen',
      inhalt: '<p style="margin:0 0 10px"><strong>' + esc(k.name) + '</strong>, ' + esc(app.artName(a.art)) + (a.datum ? ' am ' + M.datumCH(a.datum) : '') +
        (a.location ? ' in ' + esc(a.location) : '') + '. Erfasst als Auftrag ' + esc(a.nummer) + '.</p>' +
        (warnungen.length ? '<div class="hinweis warn"><div><strong>An diesem Tag ist schon etwas eingetragen</strong>' + warnungen.map(w => '<p>' + esc(w) + '</p>').join('') + '</div></div>'
          : (a.datum ? '<div class="hinweis gut"><p>Der ' + M.datumCH(a.datum) + ' ist frei.</p></div>' : '')),
      knoepfe: [{ text: 'Zum Auftrag', art: 'haupt', wert: true }]
    });
  };
  window.__linkGeoeffnet = url => app.anfrageVerarbeiten(url);

  // ---------- Navigation ----------
  app.oeffnen = (name, id, tab) => {
    app.ansicht = { name, id };
    if (tab) app.tab = tab;
    app.zeichnen();
    $('main').scrollTop = 0;
  };

  function leisteZeichnen() {
    const n = app.ansicht.name === 'auftrag' ? 'auftraege' : app.ansicht.name;
    const anfragen = app.daten.auftraege.filter(a => a.status === 'anfrage').length;
    $$('.nav button').forEach(b => {
      b.setAttribute('aria-current', b.dataset.ziel === n ? 'page' : 'false');
      if (b.dataset.ziel === 'auftraege') {
        const z = $('.anzahl', b); z.textContent = anfragen; z.hidden = !anfragen;
      }
    });
  }

  app.zeichnen = () => {
    // Status automatisch nachführen (z.B. wenn ein Anlassdatum vorbei ist) und Änderungen speichern
    if (M.statusAktualisieren(app.daten)) { clearTimeout(speicherTimer); speicherTimer = setTimeout(speichern, 300); }
    leisteZeichnen();
    // Neues Element statt innerHTML, damit keine alten Ereignis-Handler hängen bleiben
    const alt = $('main');
    const v = app.ansichten[app.ansicht.name] || app.ansichten.start;
    const main = document.createElement('main');
    main.innerHTML = v();
    const scroll = alt.scrollTop, fokus = document.activeElement && document.activeElement.dataset ? { bind: document.activeElement.dataset.bind } : null;
    alt.replaceWith(main);
    main.scrollTop = scroll;
    if (fokus && fokus.bind) { const el = main.querySelector('[data-bind="' + fokus.bind + '"]'); if (el) el.focus(); }
    if (v.danach) v.danach(main);
  };
  app.ansichten = {};

  // ---------- Start ----------
  async function start() {
    $$('.nav button').forEach(b => b.addEventListener('click', () => app.oeffnen(b.dataset.ziel)));
    if (B.istMac) $('#ordner').addEventListener('click', () => B.ordnerZeigen().catch(() => {}));
    else $('#ordner').hidden = true;
    try {
      const roh = await B.laden();
      app.daten = M.normalisieren(roh ? JSON.parse(roh) : null);
      if (!roh) await B.speichern(app.daten);
      $('#speicherstand').textContent = 'Daten geladen';
    } catch (e) {
      app.daten = M.leereDaten();
      app.melden('Daten konnten nicht geladen werden: ' + e.message + '. Es wird nichts überschrieben, bis du etwas änderst.', true);
    }
    // Sicherheitsnetz: offene Änderungen beim Schliessen sofort schreiben
    window.addEventListener('beforeunload', () => { clearTimeout(speicherTimer); B.speichern(app.daten); });
    await syncKonfigLaden();
    app.zeichnen();
    app.syncJetzt(true);
    try { (await B.ausstehendeLinks() || []).forEach(u => app.anfrageVerarbeiten(u)); } catch (e) { /* ohne Mac-Hülle */ }
    if (app.daten.einstellungen.kalenderAbgleich && B.istMac) app.kalenderAbgleichen(true);
  }
  document.addEventListener('DOMContentLoaded', start);
})();
