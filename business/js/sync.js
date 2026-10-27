// Abgleich über ein privates GitHub-Repository (daten.json), damit Mac und iPhone dieselben Daten haben.
// Jedes Gerät merkt sich den zuletzt abgeglichenen Stand («Basis»). Haben beide Seiten etwas geändert,
// werden die Änderungen pro Kunde, Auftrag und Buchung zusammengeführt (Dreiwege-Abgleich).
(function (global) {
  'use strict';
  const API = global.__SYNC_API || 'https://api.github.com';  // __SYNC_API nur für Tests
  const PFAD = 'daten.json';
  const LISTEN = ['kunden', 'auftraege', 'buchungen'];

  // ---------- Zusammenführen (ohne Netz, getestet in tests/sync.test.js) ----------

  const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const kopie = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));

  function listeZusammen(basis, lokal, fern, konflikte, art) {
    const nachId = l => { const m = new Map(); (l || []).forEach(x => x && x.id && m.set(x.id, x)); return m; };
    const B = nachId(basis), L = nachId(lokal), F = nachId(fern);
    const ergebnis = new Map();
    const ids = [...new Set([...(fern || []).map(x => x.id), ...(lokal || []).map(x => x.id), ...(basis || []).map(x => x.id)])].filter(Boolean);
    for (const id of ids) {
      const b = B.get(id), l = L.get(id), f = F.get(id);
      const lokalNeu = !gleich(l, b), fernNeu = !gleich(f, b);
      let wahl;
      if (lokalNeu && !fernNeu) wahl = l;
      else if (!lokalNeu) wahl = f;
      else if (gleich(l, f)) wahl = l;
      else {
        // Beide haben denselben Eintrag geändert: Eintrag von diesem Gerät gewinnt, gelöscht verliert
        wahl = l !== undefined ? l : f;
        konflikte.push({ art, id });
      }
      if (wahl !== undefined) ergebnis.set(id, kopie(wahl));
    }
    // Reihenfolge: zuerst wie auf GitHub, dann neue Einträge von diesem Gerät
    const reihenfolge = [...(fern || []).map(x => x.id), ...(lokal || []).map(x => x.id)];
    return [...new Set(reihenfolge)].filter(id => ergebnis.has(id)).map(id => ergebnis.get(id));
  }

  function zusammenfuehren(basis, lokal, fern) {
    basis = basis || {}; const konflikte = [];
    const out = { version: fern.version || lokal.version };
    // Einstellungen pro Feld
    const eb = basis.einstellungen || {}, el = lokal.einstellungen || {}, ef = fern.einstellungen || {};
    out.einstellungen = {};
    for (const k of new Set([...Object.keys(ef), ...Object.keys(el)])) {
      const lokalNeu = !gleich(el[k], eb[k]);
      out.einstellungen[k] = kopie(lokalNeu ? el[k] : (k in ef ? ef[k] : el[k]));
      if (lokalNeu && !gleich(ef[k], eb[k]) && !gleich(el[k], ef[k])) konflikte.push({ art: 'einstellungen', id: k });
    }
    for (const n of LISTEN) out[n] = listeZusammen(basis[n], lokal[n], fern[n], konflikte, n);
    return { daten: out, konflikte };
  }

  // ---------- GitHub ----------

  function base64AusText(text) {
    const bytes = new TextEncoder().encode(text);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function textAusBase64(b64) {
    const s = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  class GitHubFehler extends Error {
    constructor(status, text) {
      super(status === 401 ? 'Der Schlüssel ist ungültig oder abgelaufen.'
        : status === 403 ? 'Der Schlüssel darf dieses Repository nicht bearbeiten. Prüfe bei GitHub, ob «Contents: Read and write» erlaubt ist.'
        : status === 404 ? 'Repository nicht gefunden. Prüfe den Namen und ob der Schlüssel Zugriff darauf hat.'
        : 'GitHub antwortet mit Fehler ' + status + (text ? ': ' + text : ''));
      this.status = status;
    }
  }

  function client(konfig) {
    const kopf = { 'Authorization': 'Bearer ' + konfig.token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    const url = p => API + '/repos/' + konfig.repo + p;
    async function anfrage(p, opt = {}) {
      let r;
      try { r = await fetch(url(p), Object.assign({}, opt, { cache: 'no-store', headers: Object.assign({}, kopf, opt.headers || {}) })); }
      catch (e) { const f = new Error('Keine Verbindung zu GitHub'); f.offline = true; throw f; }
      if (!r.ok) {
        let t = ''; try { t = (await r.json()).message || ''; } catch (e) { /* leer */ }
        throw new GitHubFehler(r.status, t);
      }
      return r.status === 204 ? null : r.json();
    }
    return {
      // Prüft Zugriff und ob das Repository privat ist
      async pruefen() {
        const info = await anfrage('');
        return { privat: !!info.private, name: info.full_name };
      },
      // Liest daten.json. Gibt null zurück, wenn es die Datei noch nicht gibt.
      async lesen() {
        let info;
        try { info = await anfrage('/contents/' + PFAD); }
        catch (e) { if (e.status === 404) return null; throw e; }
        let b64 = info.content;
        if (!b64 || info.encoding === 'none') b64 = (await anfrage('/git/blobs/' + info.sha)).content;  // Dateien über 1 MB
        return { sha: info.sha, text: textAusBase64(b64) };
      },
      // Schreibt daten.json. Mit sha nur, wenn sich die Datei seither nicht geändert hat (sonst Fehler 409).
      async schreiben(text, sha, geraet) {
        const body = { message: 'Abgleich von ' + (geraet || 'theguestbook business'), content: base64AusText(text) };
        if (sha) body.sha = sha;
        const r = await anfrage('/contents/' + PFAD, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
        return r.content.sha;
      }
    };
  }

  global.Sync = { zusammenfuehren, client, base64AusText, textAusBase64 };
  if (typeof module !== 'undefined') module.exports = global.Sync;
})(typeof window !== 'undefined' ? window : globalThis);
