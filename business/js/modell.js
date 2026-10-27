// Datenmodell und Geschäftslogik von theguestbook business.
// Beträge immer in Rappen (ganze Zahlen), Daten als ISO-Text 'JJJJ-MM-TT'.
(function (global) {
  'use strict';

  const VERSION = 1;

  const STATUS = [
    { id: 'anfrage', name: 'Anfrage' },
    { id: 'offerte', name: 'Offerte verschickt' },
    { id: 'vertrag', name: 'Vertrag unterschrieben' },
    { id: 'anzahlung', name: 'Anzahlung bezahlt' },
    { id: 'anlass', name: 'Anlass durchgeführt' },
    { id: 'geliefert', name: 'Film geliefert' },
    { id: 'bezahlt', name: 'Rest bezahlt' },
    { id: 'archiv', name: 'Archiviert' },
    { id: 'abgesagt', name: 'Abgesagt' }
  ];

  const ARTEN = [
    { id: 'hochzeit', name: 'Hochzeit', kategorie: 'hochzeit' },
    { id: 'privat', name: 'Privates Event', kategorie: 'event' },
    { id: 'firma', name: 'Firmen Event', kategorie: 'event' }
  ];

  const QUELLEN = ['Website', 'Instagram', 'Empfehlung', 'Messe', 'Andere'];

  const KATEGORIEN = {
    ein: [
      ['hochzeit', 'Hochzeiten'], ['event', 'Events und Firmenanlässe'],
      ['zusatz', 'Zusatzleistungen'], ['uebrige_e', 'Übrige Einnahmen']
    ],
    aus: [
      ['material', 'Material und Verbrauch'], ['fremd', 'Fremdleistungen'], ['reise', 'Fahrt und Spesen'],
      ['werbung', 'Werbung und Website'], ['software', 'Software und Abos'], ['buero', 'Büro, Telefon, Internet'],
      ['versicherung', 'Versicherungen und Gebühren'], ['weiterbildung', 'Weiterbildung'],
      ['lohn', 'Löhne und Sozialabgaben'], ['ahv', 'AHV/IV/EO-Beiträge'], ['anschaffung', 'Anschaffungen'], ['uebrige_a', 'Übrige Ausgaben']
    ]
  };

  function standardEinstellungen() {
    return {
      firma: 'The Guestbook',
      inhaber: 'Lias Oertig',
      strasse: 'Hanfäckerstrasse', hausnummer: '10', plz: '8500', ort: 'Frauenfeld', land: 'CH',
      email: 'info@liasoertig.ch', telefon: '079 932 95 26', web: 'theguestbook.ch',
      iban: 'CH16 8080 8005 5074 8754 4', bank: 'Raiffeisenbank Frauenfeld',
      mwstHinweis: 'The Guestbook ist nicht mehrwertsteuerpflichtig.',
      anzahlungProzent: 30,
      kmInklusive: 50, kmRappen: 70,
      offerteGueltigTage: 30,
      anzahlungFaelligTage: 10,
      restFaelligTage: 10,
      mahnFristTage: 10,        // neue Zahlungsfrist pro Mahnung
      mahnGebuehrRappen: 0,     // nur verlangen, wenn vertraglich vereinbart
      ablageOfferten: '~/Documents/theguestbook/Dateien/Offerten',     // Standard-Speicherort am Mac
      ablageVertraege: '~/Documents/theguestbook/Dateien/Verträge',
      ablaufVorherTage: 14,
      lieferungWochen: 8,
      korrekturTage: 14,
      archivMonate: 12,
      stornoFruehProzent: 30, stornoSpaetProzent: 100, stornoGrenzeTage: 30,
      kalenderAbgleich: true,
      // Mitarbeiter: art 'fremd' (stellt Rechnung) oder 'lohn' (gemäss Abklärung mit der SVA)
      mitarbeiter: [],
      mitarbeiterProzent: 30,
      mitarbeiterOhneAnfahrt: true,
      mitarbeiterStandard: true,
      ahvMindestbeitragUeberLohn: true, // Mindestbeitrag ist schon über den Lohn bezahlt (Anstellung)
      ahvVerwaltungskostenProzent: 0,   // laut Rechnung der SVA Thurgau, maximal 5 % der Beiträge   // neue Aufträge automatisch der Mitarbeiterin zuordnen
      pakete: [
        { id: 'interviews', name: 'Die Interviews', rappen: 190000, beschreibung: 'Bis zu 4 Stunden ab Ankunft der Gäste, Zweierteam, geschnittener Interviewfilm', kategorie: 'haupt' },
        { id: 'abend', name: 'Abend Interviews', rappen: 190000, beschreibung: 'Ab ca. 21 Uhr, Zweierteam, geschnittener Film', kategorie: 'haupt' },
        { id: 'davor', name: 'Der Moment davor', rappen: 60000, beschreibung: 'Bis zu 1 Stunde vor der Zeremonie, Teil eures Films', kategorie: 'haupt' },
        { id: 'privat', name: 'Privates Event', rappen: 190000, beschreibung: 'Zweierteam, vereinbartes Zeitfenster, geschnittener Gästefilm', kategorie: 'haupt' },
        { id: 'firma', name: 'Firmen Event', rappen: 190000, beschreibung: 'Zweierteam, geschnittener Gästefilm, Nutzungsrecht für eure Kanäle', kategorie: 'haupt' },
        { id: 'highlights', name: 'Highlights', rappen: 30000, beschreibung: '5 vertikale Clips mit dezenten Untertiteln', kategorie: 'zusatz' }
      ]
    };
  }

  function leereDaten() {
    return { version: VERSION, einstellungen: standardEinstellungen(), kunden: [], auftraege: [], buchungen: [] };
  }

  // Ältere oder unvollständige Dateien auf den aktuellen Stand bringen, ohne Daten zu verlieren.
  function normalisieren(d) {
    const basis = leereDaten();
    if (!d || typeof d !== 'object') return basis;
    const e = Object.assign(standardEinstellungen(), d.einstellungen || {});
    return {
      version: VERSION,
      einstellungen: e,
      kunden: Array.isArray(d.kunden) ? d.kunden : [],
      auftraege: Array.isArray(d.auftraege) ? d.auftraege : [],
      buchungen: Array.isArray(d.buchungen) ? d.buchungen : []
    };
  }

  // ---------- Hilfsfunktionen ----------

  function id() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function chf(rappen) {
    const neg = rappen < 0;
    const [a, b] = (Math.abs(rappen) / 100).toFixed(2).split('.');
    return (neg ? '−' : '') + a.replace(/\B(?=(\d{3})+(?!\d))/g, '’') + '.' + b;
  }

  function rappenAusText(t) {
    const s = String(t).replace(/['’\s]/g, '').replace(',', '.');
    if (!/^-?\d+(\.\d{0,2})?$/.test(s)) return null;
    return Math.round(parseFloat(s) * 100);
  }

  // Auf 5 Rappen runden, wie bei Schweizer Franken üblich.
  function auf5(rappen) { return Math.round(rappen / 5) * 5; }

  function iso(d) { return d.toISOString().slice(0, 10); }
  function heute() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function plusTage(isoDatum, tage) {
    const d = new Date(isoDatum + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + tage); return iso(d);
  }
  function plusMonate(isoDatum, monate) {
    const d = new Date(isoDatum + 'T00:00:00Z');
    const tag = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + monate);
    const letzter = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(tag, letzter));
    return iso(d);
  }
  function tageZwischen(a, b) {
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
  }
  function datumCH(isoDatum) {
    if (!isoDatum) return '';
    const [y, m, d] = isoDatum.split('-'); return d + '.' + m + '.' + y;
  }

  // ---------- Nummern ----------

  function neueAuftragsnummer(daten, jahr) {
    const praefix = String(jahr) + '-';
    let max = 0;
    daten.auftraege.forEach(a => {
      if (a.nummer && a.nummer.startsWith(praefix)) max = Math.max(max, parseInt(a.nummer.slice(praefix.length), 10) || 0);
    });
    return praefix + String(max + 1).padStart(3, '0');
  }

  function neueRechnungsnummer(auftrag) {
    const n = (auftrag.rechnungen || []).length + 1;
    return auftrag.nummer + '-' + n;
  }

  // ---------- Offerte und Posten ----------

  function kmBetrag(km, e) {
    const extra = Math.max(0, (Number(km) || 0) - e.kmInklusive);
    return auf5(extra * e.kmRappen);
  }

  function postenTotal(posten, km, e) {
    return (posten || []).reduce((s, p) => s + (p.rappen || 0), 0) + kmBetrag(km || 0, e);
  }

  function anzahlung(total, e) {
    return auf5(Math.round(total * e.anzahlungProzent / 100));
  }

  // ---------- Fristen ----------

  // Liefert alle Fristen eines Auftrags, sortiert nach Datum.
  function fristen(a, e) {
    const f = [];
    const add = (art, datum, text, erledigt) => { if (datum) f.push({ art, datum, text, erledigt: !!erledigt }); };
    const nach = (s) => stufe(a.status) >= stufe(s);
    if (a.offerte && a.offerte.datum) add('offerte', plusTage(a.offerte.datum, e.offerteGueltigTage), 'Offerte läuft ab', nach('vertrag'));
    if (a.vertrag && a.vertrag.unterschrieben) {
      const anz = (a.rechnungen || []).find(r => r.art === 'anzahlung');
      add('anzahlung', (anz && anz.faellig) || plusTage(a.vertrag.unterschrieben, e.anzahlungFaelligTage), 'Anzahlung fällig', anz ? !!anz.bezahlt : nach('anzahlung'));
    }
    if (a.datum && a.vertrag && a.status !== 'abgesagt') {
      add('ablauf', plusTage(a.datum, -e.ablaufVorherTage), 'Ablauf und Ansprechperson einholen', !!a.ablaufErhalten || nach('anlass'));
      const rest = (a.rechnungen || []).find(r => r.art === 'rest');
      add('rest', (rest && rest.faellig) || plusTage(a.datum, e.restFaelligTage), 'Restzahlung fällig', nach('bezahlt') || !!(rest && rest.bezahlt));
      add('lieferung', plusTage(a.datum, e.lieferungWochen * 7), 'Film liefern', nach('geliefert'));
    }
    if (a.geliefertAm) {
      add('korrektur', plusTage(a.geliefertAm, e.korrekturTage), 'Korrekturwünsche möglich bis', true);
      add('rohmaterial', plusMonate(a.geliefertAm, e.archivMonate), 'Film und Rohmaterial löschen', !!a.rohmaterialGeloescht);
    }
    return f.sort((x, y) => x.datum.localeCompare(y.datum));
  }

  function naechsteFrist(a, e, stichtag) {
    return fristen(a, e).find(f => !f.erledigt && f.datum >= (stichtag || '0000-00-00')) ||
           fristen(a, e).find(f => !f.erledigt) || null;
  }

  function stufe(statusId) { return STATUS.findIndex(s => s.id === statusId); }

  // ---------- Absage ----------

  function stornoVorschlag(a, absageDatum, e) {
    const total = a.vertrag ? a.vertrag.total : (a.offerte ? a.offerte.total : 0);
    if (!a.vertrag || !a.datum) return { prozent: 0, rappen: 0 };
    const tage = tageZwischen(absageDatum, a.datum);
    const prozent = tage >= e.stornoGrenzeTage ? e.stornoFruehProzent : e.stornoSpaetProzent;
    return { prozent, rappen: auf5(Math.round(total * prozent / 100)), tageVorher: tage };
  }

  // ---------- Rechnungen und Buchungen ----------

  function kategorieFuer(a) {
    const art = ARTEN.find(x => x.id === a.art);
    return art ? art.kategorie : 'hochzeit';
  }

  // Markiert eine Rechnung als bezahlt und erzeugt die passende Einnahme im Kassenbuch.
  function rechnungBezahlt(daten, auftrag, rechnung, datum, zahlart) {
    if (rechnung.bezahlt) return null;
    const kunde = daten.kunden.find(k => k.id === auftrag.kundeId);
    const b = {
      id: id(), datum, jahr: +datum.slice(0, 4), typ: 'ein', kat: kategorieFuer(auftrag),
      text: (rechnung.titel || 'Rechnung') + ' ' + (kunde ? kunde.name : ''),
      betrag: rechnung.rappen, beleg: rechnung.nummer, zahlart: zahlart || 'Bank',
      auftragId: auftrag.id, rechnungId: rechnung.id, erstellt: new Date().toISOString()
    };
    rechnung.bezahlt = datum;
    rechnung.buchungId = b.id;
    daten.buchungen.push(b);
    return b;
  }

  // Macht «bezahlt» rückgängig und entfernt die automatisch erzeugte Buchung.
  function rechnungOffen(daten, rechnung) {
    if (rechnung.buchungId) daten.buchungen = daten.buchungen.filter(b => b.id !== rechnung.buchungId);
    delete rechnung.bezahlt; delete rechnung.buchungId;
  }

  function offenerBetrag(a) {
    const total = a.vertrag ? a.vertrag.total : 0;
    const bezahlt = (a.rechnungen || []).filter(r => r.bezahlt).reduce((s, r) => s + r.rappen, 0);
    return Math.max(0, total - bezahlt);
  }

  // ---------- Mitarbeiter ----------

  function postenSumme(dok) { return ((dok && dok.posten) || []).reduce((s, p) => s + (p.rappen || 0), 0); }

  // Anteil des Mitarbeiters an einem Auftrag, Basis Vertrag (sonst Offerte), standardmässig ohne Anfahrt
  function mitarbeiterAnteil(a, e) {
    if (!a.mitarbeiterId) return 0;
    const dok = a.vertrag || a.offerte;
    if (!dok) return 0;
    const basis = e.mitarbeiterOhneAnfahrt ? postenSumme(dok) : (dok.total || 0);
    const prozent = a.mitarbeiterProzent != null ? a.mitarbeiterProzent : e.mitarbeiterProzent;
    return auf5(Math.round(basis * prozent / 100));
  }

  function mitarbeiterAuszahlen(daten, a, datum, zahlart) {
    if (!a.mitarbeiterId || (a.auszahlung && a.auszahlung.buchungId)) return null;
    const e = daten.einstellungen;
    const m = e.mitarbeiter.find(x => x.id === a.mitarbeiterId);
    const betrag = mitarbeiterAnteil(a, e);
    if (!m || !betrag) return null;
    const b = {
      id: id(), datum, jahr: +datum.slice(0, 4), typ: 'aus', kat: 'fremd',  // Auftragsverhältnis, laut Buchhalter Fremdleistung
      text: 'Anteil ' + m.name + ', Auftrag ' + a.nummer, betrag, beleg: a.nummer + '-M',
      zahlart: zahlart || 'Bank', auftragId: a.id, mitarbeiterId: m.id, erstellt: new Date().toISOString()
    };
    daten.buchungen.push(b);
    a.auszahlung = { datum, rappen: betrag, buchungId: b.id };
    return b;
  }

  function mitarbeiterAuszahlungZuruecknehmen(daten, a) {
    if (a.auszahlung && a.auszahlung.buchungId) daten.buchungen = daten.buchungen.filter(b => b.id !== a.auszahlung.buchungId);
    delete a.auszahlung;
  }

  // Status für die Anzeige: keine | nicht_faellig | offen | ueberwiesen
  function mitarbeiterStatus(a) {
    if (!a.mitarbeiterId || a.status === 'abgesagt') return 'keine';
    if (a.auszahlung && a.auszahlung.buchungId) return 'ueberwiesen';
    return stufe(a.status) >= stufe('anlass') ? 'offen' : 'nicht_faellig';
  }

  // Alle Aufträge, deren Anteil fällig, aber noch nicht überwiesen ist
  function mitarbeiterOffen(daten) {
    return daten.auftraege.filter(a => mitarbeiterStatus(a) === 'offen')
      .sort((x, y) => (x.datum || '').localeCompare(y.datum || ''));
  }

  // Neue Aufträge standardmässig der (ersten) Mitarbeiterin zuordnen
  function mitarbeiterVorgabe(daten, a) {
    const e = daten.einstellungen;
    if (e.mitarbeiterStandard && e.mitarbeiter.length && !a.mitarbeiterId) a.mitarbeiterId = e.mitarbeiter[0].id;
    return a;
  }

  function mitarbeiterJahr(daten, mitarbeiterId, jahr) {
    const ausbezahlt = daten.buchungen.filter(b => b.mitarbeiterId === mitarbeiterId && b.jahr === jahr);
    const offen = daten.auftraege.filter(a => a.mitarbeiterId === mitarbeiterId && !(a.auszahlung && a.auszahlung.buchungId)
      && a.datum && a.datum.slice(0, 4) === String(jahr) && !['abgesagt', 'anfrage', 'offerte'].includes(a.status));
    return {
      ausbezahlt: ausbezahlt.reduce((s, b) => s + b.betrag, 0),
      einsaetze: ausbezahlt.length,
      offen: offen.reduce((s, a) => s + mitarbeiterAnteil(a, daten.einstellungen), 0),
      offeneAuftraege: offen.map(a => a.nummer)
    };
  }

  // ---------- AHV/IV/EO für Selbständige ----------
  // Sinkende Beitragsskala. Jede Tabelle gilt ab ihrem Jahr, bis eine neuere kommt.
  // 2025/2026: Merkblatt 2.02, Stand 1.1.2026. Ab 2027: Tabelle der Ausgleichskasse (Untergrenze 10'300).
  const AHV_TABELLEN = [
    { ab: 2025, untergrenze: 10100, mindestbeitrag: 53000, nebenerwerbFrei: 2500, stufen: [
      [10100, 5.371], [17600, 5.494], [23000, 5.617], [25500, 5.741], [28000, 5.864], [30500, 5.987], [33000, 6.235], [35500, 6.481],
      [38000, 6.728], [40500, 6.976], [43000, 7.222], [45500, 7.469], [48000, 7.840], [50500, 8.209], [53000, 8.580], [55500, 8.951],
      [58000, 9.321], [60500, 10.000]] },
    { ab: 2027, untergrenze: 10300, mindestbeitrag: 54100, nebenerwerbFrei: 2500, stufen: [
      [10300, 5.371], [17700, 5.494], [24000, 5.617], [26500, 5.741], [29000, 5.864], [31500, 5.987], [34000, 6.235], [36500, 6.481],
      [39000, 6.728], [41500, 6.976], [44000, 7.222], [46500, 7.469], [49000, 7.840], [51500, 8.209], [54000, 8.580], [56500, 8.951],
      [59000, 9.321], [61500, 10.000]] }
  ];
  function ahvTabelle(jahr) {
    return AHV_TABELLEN.filter(t => t.ab <= jahr).pop() || AHV_TABELLEN[0];
  }

  // Beiträge auf dem Gewinn eines Jahres. Bereits gebuchte AHV-Beiträge werden wieder aufgerechnet,
  // wie es die Ausgleichskasse bei der definitiven Abrechnung macht.
  function ahvBerechnung(daten, jahr) {
    const e = daten.einstellungen, t = ahvTabelle(jahr);
    const er = erfolgsrechnung(daten, jahr);
    const bezahlt = er.aufwand.ahv || 0;
    const basis = er.gewinn + bezahlt;               // Rappen
    const franken = basis / 100;
    let satz = 0, beitrag = 0, regel;
    if (franken <= t.nebenerwerbFrei) {
      regel = 'Nebenerwerb bis CHF ' + t.nebenerwerbFrei.toLocaleString('de-CH') + ': Beiträge nur auf Verlangen';
    } else if (franken < t.untergrenze) {
      if (e.ahvMindestbeitragUeberLohn) {
        satz = t.stufen[0][1]; beitrag = Math.round(basis * satz / 100);
        regel = 'Unter CHF ' + t.untergrenze.toLocaleString('de-CH') + ': tiefster Satz, weil der Mindestbeitrag schon über den Lohn bezahlt ist (bei der SVA beantragen)';
      } else {
        beitrag = t.mindestbeitrag;
        regel = 'Unter CHF ' + t.untergrenze.toLocaleString('de-CH') + ': Mindestbeitrag';
      }
    } else {
      satz = t.stufen.filter(s => franken >= s[0]).pop()[1];
      beitrag = Math.round(basis * satz / 100);
      regel = 'Sinkende Beitragsskala';
    }
    beitrag = auf5(beitrag);
    const verwaltung = auf5(Math.round(beitrag * (Number(e.ahvVerwaltungskostenProzent) || 0) / 100));
    const total = beitrag + verwaltung;
    return { jahr, tabelleAb: t.ab, basis, satz, beitrag, verwaltung, total, bezahlt, offen: total - bezahlt,
      gewinnNach: basis - total, regel };
  }

  // Erfolgsrechnung für die Steuern: noch nicht bezahlte AHV/IV/EO-Beiträge des Jahres als Rückstellung im Aufwand
  function erfolgsrechnungSteuer(daten, jahr) {
    const er = erfolgsrechnung(daten, jahr);
    const ahv = ahvBerechnung(daten, jahr);
    const rueckstellung = Math.max(0, ahv.offen);
    const totalAufwand = er.totalAufwand + rueckstellung;
    return { ...er, rueckstellungAhv: rueckstellung, ahv, totalAufwand, gewinn: er.totalErtrag - totalAufwand };
  }

  // ---------- Automatischer Status und Phasen ----------

  // Leitet den Status aus dem ab, was im Auftrag erfasst ist. Abgesagt und Archiviert setzt nur der Mensch.
  function statusErmitteln(a, stichtag) {
    const tag = stichtag || heute();
    const r = a.rechnungen || [];
    let st = 'anfrage';
    if (a.offerte && (a.offerte.verschickt || a.vertrag)) st = 'offerte';
    if (a.vertrag && a.vertrag.unterschrieben) st = 'vertrag';
    if (st === 'vertrag' && r.some(x => x.art === 'anzahlung' && x.bezahlt)) st = 'anzahlung';
    const nachAnlass = a.anlassErledigt || (a.datum && a.datum < tag);
    if (stufe(st) >= stufe('vertrag') && nachAnlass) st = 'anlass';
    if (st === 'anlass' && a.geliefertAm) st = 'geliefert';
    // Abgeschlossen: Film geliefert und alles bezahlt
    if (st === 'geliefert') {
      const total = (a.vertrag && a.vertrag.total) || 0;
      const bezahlt = r.filter(x => x.bezahlt).reduce((t, x) => t + x.rappen, 0);
      if (total > 0 && bezahlt >= total) st = 'bezahlt';
    }
    return st;
  }

  // Wendet den automatischen Status auf alle Aufträge an. Gibt die Anzahl Änderungen zurück.
  function statusAktualisieren(daten, stichtag) {
    let n = 0;
    daten.auftraege.forEach(a => {
      if (['abgesagt', 'archiv'].includes(a.status) || a.statusManuell) return;
      const neu = statusErmitteln(a, stichtag);
      if (neu !== a.status) { a.status = neu; n++; }
    });
    return n;
  }

  const PHASEN = [
    { id: 'anfrage', name: 'Anfrage', status: ['anfrage'] },
    { id: 'offerte', name: 'Offerte', status: ['offerte'] },
    { id: 'gebucht', name: 'Gebucht', status: ['vertrag', 'anzahlung'] },
    { id: 'nachher', name: 'Nach Anlass', status: ['anlass', 'geliefert'] },
    { id: 'fertig', name: 'Abgeschlossen', status: ['bezahlt', 'archiv'] }
  ];
  function phase(a) { return (PHASEN.find(p => p.status.includes(a.status)) || { id: 'abgesagt' }).id; }

  // ---------- Offene Rechnungen und Mahnungen ----------

  // Aktuell gültige Zahlungsfrist: die der letzten Mahnung, sonst die der Rechnung
  function aktuelleFrist(r) {
    const m = (r.mahnungen || []).slice(-1)[0];
    return m ? m.frist : r.faellig;
  }

  function offeneRechnungen(daten, stichtag) {
    const heute_ = stichtag || heute(), liste = [];
    daten.auftraege.forEach(a => {
      if (a.status === 'abgesagt' && !(a.rechnungen || []).some(r => r.art === 'storno')) return;
      (a.rechnungen || []).filter(r => !r.bezahlt).forEach(r => {
        const frist = aktuelleFrist(r);
        const tage = tageZwischen(frist, heute_);
        liste.push({ a, r, frist, ueberfaellig: tage > 0, tageUeber: Math.max(0, tage), stufe: (r.mahnungen || []).length });
      });
    });
    return liste.sort((x, y) => x.frist.localeCompare(y.frist));
  }

  const MAHNSTUFEN = ['Zahlungserinnerung', '2. Mahnung', '3. Mahnung'];

  function mahnungNeu(daten, r, datum) {
    const e = daten.einstellungen;
    const stufe = (r.mahnungen || []).length + 1;
    if (stufe > MAHNSTUFEN.length) throw new Error('Nach der 3. Mahnung bleibt die Betreibung. Kläre das am besten persönlich.');
    const gebuehr = stufe > 1 ? (Number(e.mahnGebuehrRappen) || 0) : 0;
    const m = { stufe, titel: MAHNSTUFEN[stufe - 1], datum, frist: plusTage(datum, e.mahnFristTage || 10), gebuehr };
    (r.mahnungen = r.mahnungen || []).push(m);
    return m;
  }

  function mahnTotal(r, m) {
    return r.rappen + (r.mahnungen || []).filter(x => x.stufe <= m.stufe).reduce((t, x) => t + (x.gebuehr || 0), 0);
  }

  // ---------- Kassenbuch ----------

  function erfolgsrechnung(daten, jahr) {
    const jb = daten.buchungen.filter(b => b.jahr === jahr);
    const summe = (typ) => {
      const m = {}; KATEGORIEN[typ].forEach(([k]) => { m[k] = 0; });
      jb.filter(b => b.typ === typ).forEach(b => { m[b.kat] = (m[b.kat] || 0) + b.betrag; });
      return m;
    };
    const ertrag = summe('ein'), aufwand = summe('aus');
    const tE = Object.values(ertrag).reduce((a, b) => a + b, 0);
    const tA = Object.values(aufwand).reduce((a, b) => a + b, 0);
    return { ertrag, aufwand, totalErtrag: tE, totalAufwand: tA, gewinn: tE - tA };
  }

  function csvZelle(v) { v = String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function csv(zeilen) { return '﻿' + zeilen.map(z => z.map(csvZelle).join(';')).join('\r\n'); }

  function buchungenCSV(daten, jahr) {
    const kn = (t, k) => (KATEGORIEN[t].find(x => x[0] === k) || [k, k])[1];
    const jb = daten.buchungen.filter(b => b.jahr === jahr).sort((a, b) => a.datum.localeCompare(b.datum));
    return csv([['Datum', 'Beleg', 'Art', 'Kategorie', 'Beschreibung', 'Zahlart', 'Betrag CHF'],
      ...jb.map(b => [datumCH(b.datum), b.beleg || '', b.typ === 'ein' ? 'Einnahme' : 'Ausgabe', kn(b.typ, b.kat), b.text, b.zahlart || '',
        (b.typ === 'ein' ? '' : '-') + (b.betrag / 100).toFixed(2)])]);
  }

  // Import aus dem bisherigen Kassenbuch (CSV-Export) in die App.
  function csvLesen(text) {
    const zeilen = []; let z = [], f = '', q = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { f += '"'; i++; }
        else if (c === '"') q = false;
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ';') { z.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        z.push(f); f = ''; if (z.some(x => x !== '')) zeilen.push(z); z = [];
      } else f += c;
    }
    z.push(f); if (z.some(x => x !== '')) zeilen.push(z);
    return zeilen;
  }

  function kassenbuchCSVImport(daten, text) {
    const zeilen = csvLesen(text);
    const kopf = zeilen.shift() || [];
    if (kopf[0] !== 'Datum') throw new Error('Unbekanntes Format');
    let n = 0;
    zeilen.forEach(z => {
      const [d, beleg, art, katName, text, zahlart, betrag] = z;
      const [tt, mm, jj] = d.split('.');
      const typ = art === 'Einnahme' ? 'ein' : 'aus';
      const kat = (KATEGORIEN[typ].find(x => x[1] === katName) || KATEGORIEN[typ][KATEGORIEN[typ].length - 1])[0];
      const datum = jj + '-' + mm + '-' + tt;
      daten.buchungen.push({ id: id(), datum, jahr: +jj, typ, kat, text, betrag: Math.abs(rappenAusText(betrag) || 0), beleg, zahlart, erstellt: new Date().toISOString() });
      n++;
    });
    return n;
  }

  // ---------- Anfragen von der Website ----------

  // Akzeptiert den Link aus der Anfrage-Mail (offerte.html#..., app-uebernehmen.html#...,
  // theguestbook-business://anfrage#...), den ganzen Mailtext mit einem solchen Link oder rohes JSON.
  function anfrageLesen(text) {
    // Zeilenumbrüche und Leerzeichen aus kopierten Links entfernen (Mailprogramme brechen lange Links um)
    let s = String(text || '').trim();
    // Mailprogramme brechen lange Links um: Teile anhängen, bis das JSON geschlossen ist
    const start = s.search(/(?:offerte\.html|app-uebernehmen\.html|theguestbook-business:\/\/anfrage\/?)#/);
    if (start >= 0) {
      const teile = s.slice(start).split(/\s+/);
      let link = teile.shift();
      while (teile.length && !/(%7D|\})$/i.test(link)) link += teile.shift();
      s = link;
    }
    let roh = null;
    const m = s.match(/(?:offerte\.html|app-uebernehmen\.html|theguestbook-business:\/\/anfrage\/?)#(\S+)/);
    if (m) roh = m[1];
    else if (s.startsWith('{')) roh = s;
    else if (s.startsWith('%7B')) roh = s;
    if (!roh) throw new Error('Kein Anfrage-Link gefunden. Kopiere den Link «Offerte erstellen» aus der Mail.');
    let json;
    roh = roh.replace(/[\u2010-\u2015]/g, '-').replace(/[\u201C\u201D\u00AB\u00BB]/g, '"');
    try { json = JSON.parse(roh.startsWith('{') ? roh : decodeURIComponent(roh)); }
    catch (e) { throw new Error('Der Link ist unvollständig. Kopiere ihn bitte ganz aus der Mail.'); }
    if (!json || typeof json !== 'object' || !(json.vorname || json.nachname || json.email)) throw new Error('Im Link stehen keine Kundendaten.');
    return json;
  }

  function artAusAnfrage(a) {
    const p = String(a.paket || '');
    if (a.anlass !== 'Event') return 'hochzeit';
    if (/firm/i.test(p)) return 'firma';
    if (/privat/i.test(p)) return 'privat';
    return a.anlass_oder_firma ? 'firma' : 'privat';
  }

  function postenAusAnfrage(a, e) {
    const namen = [a.paket].concat(String(a.zusatz || '').split(',')).map(x => String(x || '').trim()).filter(Boolean);
    const gesehen = new Set();
    return namen.map(n => e.pakete.find(p => p.name.toLowerCase() === n.toLowerCase()))
      .filter(p => p && !gesehen.has(p.id) && gesehen.add(p.id))
      .map(p => ({ id: id(), paketId: p.id, name: p.name, beschreibung: p.beschreibung, rappen: p.rappen }));
  }

  // Legt Kunde und Auftrag an. Gibt { auftrag, kunde, neu, konflikte } zurück.
  // Dieselbe Anfrage zweimal übernehmen erzeugt keinen zweiten Auftrag.
  function anfrageUebernehmen(daten, anfrage, stichtag) {
    const e = daten.einstellungen;
    const email = String(anfrage.email || '').trim().toLowerCase();
    const datum = /^\d{4}-\d{2}-\d{2}$/.test(anfrage.datum || '') ? anfrage.datum : '';
    const name = [anfrage.vorname, anfrage.nachname].filter(Boolean).join(' ').trim();

    let kunde = email ? daten.kunden.find(k => (k.email || '').toLowerCase() === email) : null;
    const vorhanden = kunde && daten.auftraege.find(x => x.kundeId === kunde.id && x.datum === datum && x.status !== 'abgesagt');
    if (vorhanden) return { auftrag: vorhanden, kunde, neu: false, konflikte: [] };

    const art = artAusAnfrage(anfrage);
    if (!kunde) {
      kunde = {
        id: id(), name: art === 'firma' && anfrage.anlass_oder_firma ? anfrage.anlass_oder_firma : name,
        ansprechperson: name, vorname: anfrage.vorname || '', nachname: anfrage.nachname || '',
        email: anfrage.email || '', telefon: anfrage.telefon || '',
        strasse: anfrage.strasse || '', hausnummer: anfrage.hausnummer || '', plz: anfrage.plz || '', ort: anfrage.wohnort || '',
        quelle: 'Website', erstellt: stichtag || heute()
      };
      daten.kunden.push(kunde);
    }
    const jahr = +((stichtag || heute()).slice(0, 4));
    const auftrag = {
      id: id(), nummer: neueAuftragsnummer(daten, jahr), kundeId: kunde.id, art, status: 'anfrage',
      datum, location: anfrage.ort || '', gaeste: anfrage.gaeste ? Number(anfrage.gaeste) || anfrage.gaeste : '',
      bezeichnung: anfrage.anlass_oder_firma || '', quelle: 'Website',
      wunschPosten: postenAusAnfrage(anfrage, e), nachricht: anfrage.nachricht || '',
      notizen: [{ datum: stichtag || heute(), text: 'Anfrage über theguestbook.ch übernommen' }],
      rechnungen: [], erstellt: stichtag || heute()
    };
    mitarbeiterVorgabe(daten, auftrag);
    daten.auftraege.push(auftrag);
    const konflikte = datum ? daten.auftraege.filter(x => x.id !== auftrag.id && x.datum === datum && !['abgesagt', 'anfrage'].includes(x.status)) : [];
    return { auftrag, kunde, neu: true, konflikte };
  }

  // ---------- Apple Kalender ----------

  // "14:00 bis 18:30", "14-18 Uhr", "14.00 - 18.00" -> { von: '14:00', bis: '18:30' }
  function zeitfensterLesen(t) {
    const m = String(t || '').match(/(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr)?\s*(?:-|–|bis)\s*(\d{1,2})(?:[:.](\d{2}))?/i);
    if (!m) return null;
    const z = (h, mi) => String(+h).padStart(2, '0') + ':' + (mi || '00');
    if (+m[1] > 23 || +m[3] > 23) return null;
    return { von: z(m[1], m[2]), bis: z(m[3], m[4]) };
  }

  // Alle Einträge, die im Kalender «theguestbook» stehen sollen. Der Schlüssel bleibt stabil,
  // damit die Mac-Hülle bestehende Einträge nachführt statt doppelt anzulegen.
  function kalenderEintraege(daten) {
    const e = daten.einstellungen, liste = [];
    daten.auftraege.forEach(a => {
      if (!a.datum || ['abgesagt', 'archiv', 'anfrage'].includes(a.status)) return;
      const k = daten.kunden.find(x => x.id === a.kundeId) || {};
      const art = (ARTEN.find(x => x.id === a.art) || ARTEN[0]).name;
      const zf = zeitfensterLesen(a.zeitfenster);
      liste.push({
        schluessel: a.id + ':anlass',
        titel: art + ' ' + (k.name || '') + (a.bezeichnung && a.art !== 'firma' ? ', ' + a.bezeichnung : ''),
        datum: a.datum, von: zf ? zf.von : null, bis: zf ? zf.bis : null, ganztaegig: !zf,
        ort: a.location || '',
        notizen: ['Auftrag ' + a.nummer, k.ansprechperson || k.name, k.telefon, k.email, a.ansprechpersonTag ? 'Am Tag: ' + a.ansprechpersonTag : '', a.gaeste ? 'ca. ' + a.gaeste + ' Gäste' : '']
          .filter(Boolean).join('\n')
      });
      fristen(a, e).filter(f => !f.erledigt && f.art !== 'offerte' && f.art !== 'korrektur').forEach(f => {
        liste.push({
          schluessel: a.id + ':frist:' + f.art,
          titel: f.text + ': ' + (k.name || a.nummer),
          datum: f.datum, von: null, bis: null, ganztaegig: true, ort: '',
          notizen: 'Auftrag ' + a.nummer
        });
      });
    });
    return liste.sort((x, y) => x.datum.localeCompare(y.datum));
  }

  global.Modell = {
    statusErmitteln, statusAktualisieren, PHASEN, phase,
    aktuelleFrist, offeneRechnungen, MAHNSTUFEN, mahnungNeu, mahnTotal,
    AHV_TABELLEN, ahvTabelle, ahvBerechnung, erfolgsrechnungSteuer,
    postenSumme, mitarbeiterStatus, mitarbeiterOffen, mitarbeiterVorgabe, mitarbeiterAnteil, mitarbeiterAuszahlen, mitarbeiterAuszahlungZuruecknehmen, mitarbeiterJahr,
    zeitfensterLesen, kalenderEintraege,
    anfrageLesen, anfrageUebernehmen,
    VERSION, STATUS, ARTEN, QUELLEN, KATEGORIEN,
    standardEinstellungen, leereDaten, normalisieren,
    id, chf, rappenAusText, auf5, heute, plusTage, plusMonate, tageZwischen, datumCH,
    neueAuftragsnummer, neueRechnungsnummer,
    kmBetrag, postenTotal, anzahlung,
    fristen, naechsteFrist, stufe, stornoVorschlag,
    kategorieFuer, rechnungBezahlt, rechnungOffen, offenerBetrag,
    erfolgsrechnung, buchungenCSV, kassenbuchCSVImport, csv
  };
  if (typeof module !== 'undefined') module.exports = global.Modell;
})(typeof window !== 'undefined' ? window : globalThis);
