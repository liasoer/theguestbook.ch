/*
 * Passwortschutz für die internen Seiten (Offerte, Vertrag, Unterschrift).
 * Läuft als Cloudflare Pages Function vor jeder Anfrage.
 *
 * Benutzer: guestbook. Das Passwort steht nicht im Klartext hier, nur als SHA-256-Hash mit Salz
 * (das Repo ist öffentlich). Passwort ändern: neuen Hash von SALZ + ":" + Passwort berechnen,
 * oder in Cloudflare (Settings > Variables and Secrets) INTERN_PASSWORT als Secret setzen,
 * das hat dann Vorrang. INTERN_BENUTZER ist optional.
 */
const SALZ = '49fdf59290ae2b0985233ddc0558dc50';
const HASH = '5c75b3c9df2c4d6880aef7fa247bc8e67e62901d715ee3cbea385efa37b95958';
const GESCHUETZT = [
  /^\/offerte(\.html)?\/?$/i,
  /^\/vertrag(\.html)?\/?$/i,
  /^\/unterschrift-lias\.png$/i,
];

function gleich(a, b) {
  // Vergleich in konstanter Zeit, damit sich das Passwort nicht durch Zeitmessung erraten lässt
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function passwortOk(eingabe, env) {
  if (env.INTERN_PASSWORT) return gleich(eingabe, env.INTERN_PASSWORT);
  return gleich(await sha256(SALZ + ':' + eingabe), HASH);
}

function antwort(text, status, extra) {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...(extra || {}) },
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const pfad = new URL(request.url).pathname;
  if (!GESCHUETZT.some((r) => r.test(pfad))) return next();

  const benutzer = env.INTERN_BENUTZER || 'guestbook';

  const kopf = request.headers.get('Authorization') || '';
  if (kopf.startsWith('Basic ')) {
    let dekodiert = '';
    try { dekodiert = atob(kopf.slice(6)); } catch (e) {}
    const i = dekodiert.indexOf(':');
    if (i >= 0 && gleich(dekodiert.slice(0, i), benutzer) && (await passwortOk(dekodiert.slice(i + 1), env))) {
      const res = await next();
      const neu = new Response(res.body, res);
      neu.headers.set('Cache-Control', 'no-store');
      neu.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return neu;
    }
  }
  return antwort('Interner Bereich von The Guestbook. Bitte anmelden.', 401, {
    'WWW-Authenticate': 'Basic realm="The Guestbook intern", charset="UTF-8"',
  });
}
