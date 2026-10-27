// Brücke zur Mac-Hülle. Im normalen Browser (Vorschau) wird stattdessen localStorage genutzt.
(function (global) {
  'use strict';
  let naechsteId = 1;
  const offen = new Map();
  const mac = !!(global.webkit && global.webkit.messageHandlers && global.webkit.messageHandlers.bruecke);

  global.__brueckeAntwort = function (a) {
    const p = offen.get(a.id);
    if (!p) return;
    offen.delete(a.id);
    a.ok ? p.resolve(a.wert) : p.reject(new Error(a.wert));
  };

  function senden(cmd, args) {
    if (!mac) return vorschau(cmd, args || {});
    return new Promise((resolve, reject) => {
      const id = naechsteId++;
      offen.set(id, { resolve, reject });
      global.webkit.messageHandlers.bruecke.postMessage({ id, cmd, args: args || {} });
    });
  }

  // Ersatz für die Vorschau im Browser
  async function vorschau(cmd, args) {
    const KEY = 'tgb-business-daten';
    switch (cmd) {
      case 'laden': try { return localStorage.getItem(KEY); } catch (e) { return null; }
      case 'speichern': try { localStorage.setItem(KEY, args.json); } catch (e) { /* Vorschau ohne Speicher */ } return null;
      case 'pdf': {
        const w = global.open('', '_blank');
        if (w) { w.document.write(args.html); w.document.close(); }
        return 'vorschau';
      }
      case 'exportieren': {
        const blob = new Blob([args.inhalt], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = args.dateiname; a.click();
        return 'vorschau';
      }
      case 'ausstehendeLinks': return [];
      case 'mitteilung': return null;
      case 'lokalLesen': try { return localStorage.getItem('tgb-lokal-' + args.schluessel); } catch (e) { return null; }
      case 'lokalSchreiben': try { if (args.inhalt == null) localStorage.removeItem('tgb-lokal-' + args.schluessel); else localStorage.setItem('tgb-lokal-' + args.schluessel, args.inhalt); } catch (e) { throw new Error('Speicher im Browser ist voll oder gesperrt'); } return null;
      case 'kalenderAbgleichen': return { neu: 0, geaendert: 0, geloescht: 0, vorschau: true };
      case 'kalenderBelegt': return [];
      default: return null;
    }
  }

  global.Bruecke = {
    istMac: mac,
    laden: () => senden('laden'),
    speichern: (daten) => senden('speichern', { json: JSON.stringify(daten, null, 2) }),
    pdf: (html, dateiname, raender, ordner) => senden('pdf', { html, dateiname, raender: raender || {}, ordner: ordner || '' }),
    mail: (o) => senden('mail', o),
    mitteilung: (titel, text) => senden('mitteilung', { titel, text }),
    lokalLesen: (schluessel) => senden('lokalLesen', { schluessel }),
    lokalSchreiben: (schluessel, inhalt) => senden('lokalSchreiben', inhalt == null ? { schluessel } : { schluessel, inhalt }),
    exportieren: (inhalt, dateiname) => senden('exportieren', { inhalt, dateiname }),
    ordnerZeigen: () => senden('ordnerZeigen'),
    ausstehendeLinks: () => senden('ausstehendeLinks'),
    kalenderAbgleichen: (eintraege) => senden('kalenderAbgleichen', { eintraege }),
    kalenderBelegt: (datum) => senden('kalenderBelegt', { datum })
  };
})(typeof window !== 'undefined' ? window : globalThis);
