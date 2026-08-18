/**
 * Cashflow-Scout — HTTP-Server ohne externe Abhaengigkeiten.
 *
 * Routen:
 *   GET  /api/status        Zustand der API-Zugangsdaten
 *   POST /api/credentials   Zugangsdaten setzen (optional persistieren)
 *   GET  /api/staedte       Staedteliste fuer die Regionsauswahl
 *   GET  /api/suche         Angebote suchen (IS24 oder Demo)
 *   GET  /api/expose/:id    Detaildaten nachladen
 *   *                       statische Dateien aus /public und /shared
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { config, hatCredentials, setzeCredentials, ROOT } from './config.js';
import { sucheRadius, holeExpose, testeVerbindung, Is24Error } from './is24Client.js';
import { ausSuchantwort, mitExpose, veredle } from './normalize.js';
import { demoListings } from './demoData.js';
import { STAEDTE, findeStadt } from '../shared/regions.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

function sendeJson(res, status, daten) {
  const body = JSON.stringify(daten);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function leseBody(req) {
  return new Promise((resolve, reject) => {
    let daten = '';
    req.on('data', (chunk) => {
      daten += chunk;
      if (daten.length > 1e6) {
        reject(new Error('Body zu gross'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(daten ? JSON.parse(daten) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

/** Statische Datei ausliefern, mit Schutz gegen Pfad-Traversal. */
function sendeDatei(res, dateipfad) {
  const normalisiert = path.normalize(dateipfad);
  const erlaubt = [path.join(ROOT, 'public'), path.join(ROOT, 'shared')];
  if (!erlaubt.some((basis) => normalisiert.startsWith(basis + path.sep) || normalisiert === basis)) {
    res.writeHead(403).end('Zugriff verweigert');
    return;
  }
  fs.readFile(normalisiert, (err, inhalt) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden');
      return;
    }
    const typ = MIME[path.extname(normalisiert).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': typ, 'Cache-Control': 'no-cache' });
    res.end(inhalt);
  });
}

/**
 * Suche ausfuehren: echte API, sonst Demo-Daten.
 */
async function fuehreSucheAus(params) {
  const stadtName = params.get('stadt') || 'Leipzig';
  const radiusKm = Math.min(50, Math.max(1, Number(params.get('radius')) || 15));
  const realestatetype = params.get('objektart') || 'ApartmentBuy';
  const seite = Math.max(1, Number(params.get('seite')) || 1);
  const seitengroesse = Math.min(100, Math.max(5, Number(params.get('proSeite')) || 30));
  const details = params.get('details') !== 'false';

  const stadt = findeStadt(stadtName);
  const lat = Number(params.get('lat')) || stadt?.lat;
  const lon = Number(params.get('lon')) || stadt?.lon;

  if (!hatCredentials()) {
    const listings = demoListings({ stadt: stadtName, anzahl: 30, radiusKm, realestatetype }).map(veredle);
    return {
      modus: 'demo',
      hinweis:
        'Ohne API-Zugangsdaten werden realistische Demo-Angebote gezeigt. Trage oben rechts deinen ImmoScout24-Consumer-Key ein, um echte Angebote zu laden.',
      paging: { seite: 1, seiten: 1, treffer: listings.length, seitengroesse: listings.length },
      zentrum: stadt ? { name: stadt.name, lat: stadt.lat, lon: stadt.lon } : null,
      listings,
    };
  }

  if (!lat || !lon) {
    const err = new Error(`Ort "${stadtName}" nicht gefunden. Nutze die Vorschlagsliste oder gib lat/lon an.`);
    err.status = 400;
    throw err;
  }

  const suchparameter = {
    lat,
    lon,
    radiusKm,
    realestatetype,
    pagesize: seitengroesse,
    pagenumber: seite,
    sorting: params.get('sortierung') || 'standard',
  };
  const preisVon = params.get('preisVon');
  const preisBis = params.get('preisBis');
  if (preisVon || preisBis) suchparameter.price = `${preisVon || '0'}-${preisBis || ''}`;
  const flaecheVon = params.get('flaecheVon');
  const flaecheBis = params.get('flaecheBis');
  if (flaecheVon || flaecheBis) suchparameter.livingspace = `${flaecheVon || '0'}-${flaecheBis || ''}`;
  const zimmerVon = params.get('zimmerVon');
  if (zimmerVon) suchparameter.numberofrooms = `${zimmerVon}-`;

  const antwort = await sucheRadius(suchparameter);
  const { paging, listings } = ausSuchantwort(antwort, realestatetype);

  let angereichert = listings;
  if (details) {
    // Exposes parallel, aber gedrosselt nachladen (API-Limits schonen)
    angereichert = await mitDetails(listings, 6);
  }

  return {
    modus: 'live',
    hinweis: null,
    paging,
    zentrum: { name: stadt?.name || stadtName, lat, lon },
    listings: angereichert.map(veredle),
  };
}

/** Exposes mit begrenzter Parallelitaet nachladen. */
async function mitDetails(listings, parallel = 6) {
  const ergebnis = new Array(listings.length);
  let index = 0;

  async function arbeiter() {
    while (index < listings.length) {
      const eigener = index;
      index += 1;
      const listing = listings[eigener];
      try {
        const expose = await holeExpose(listing.id);
        ergebnis[eigener] = mitExpose(listing, expose);
      } catch {
        // Detail fehlgeschlagen: mit Listendaten weiterarbeiten
        ergebnis[eigener] = listing;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(parallel, listings.length) }, arbeiter));
  return ergebnis;
}

/** Klartext-Hinweis zu den haeufigsten Fehlerantworten der API. */
function fehlerHinweis(status) {
  switch (status) {
    case 401:
      return 'Die API hat die Zugangsdaten abgelehnt. Prüfe Consumer Key/Secret und ob dein Zugang für die Search-API freigeschaltet ist.';
    case 403:
      return 'Zugriff verweigert. Entweder ist dein Zugang nicht für diese Ressource freigeschaltet, oder das Netzwerk blockiert rest.immobilienscout24.de (Proxy/Firewall).';
    case 404:
      return 'Die Ressource wurde nicht gefunden — bei Exposé-Abrufen heißt das meist, dass das Angebot bereits offline ist.';
    case 429:
      return 'Zu viele Anfragen. Die API drosselt — warte einen Moment und suche mit kleinerer Seitengröße erneut.';
    default:
      return undefined;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pfad = url.pathname;

  try {
    if (pfad === '/api/status') {
      sendeJson(res, 200, {
        credentials: hatCredentials(),
        umgebung: config.is24.umgebung,
        dreiBein: Boolean(config.is24.token),
        modus: hatCredentials() ? 'live' : 'demo',
      });
      return;
    }

    if (pfad === '/api/credentials' && req.method === 'POST') {
      const body = await leseBody(req);
      const datei = setzeCredentials(body, Boolean(body.speichern));
      let test = null;
      if (hatCredentials()) {
        try {
          test = await testeVerbindung();
        } catch (err) {
          test = { ok: false, fehler: err.message, status: err.status ?? null, details: err.body ?? null };
        }
      }
      sendeJson(res, 200, { gespeichert: Boolean(datei), datei, credentials: hatCredentials(), test });
      return;
    }

    if (pfad === '/api/staedte') {
      sendeJson(res, 200, {
        staedte: STAEDTE.map((s) => ({ name: s.name, plz: s.plz, lat: s.lat, lon: s.lon, miete: s.miete })),
      });
      return;
    }

    if (pfad === '/api/suche') {
      const ergebnis = await fuehreSucheAus(url.searchParams);
      sendeJson(res, 200, ergebnis);
      return;
    }

    if (pfad.startsWith('/api/expose/')) {
      const id = decodeURIComponent(pfad.slice('/api/expose/'.length));
      if (!hatCredentials()) {
        sendeJson(res, 400, { fehler: 'Im Demo-Modus sind alle Details bereits geladen.' });
        return;
      }
      const expose = await holeExpose(id);
      sendeJson(res, 200, { listing: veredle(mitExpose({ id, typ: 'kauf', bilder: [] }, expose)) });
      return;
    }

    if (pfad.startsWith('/api/')) {
      sendeJson(res, 404, { fehler: 'Unbekannte Route' });
      return;
    }

    // Statische Auslieferung
    if (pfad.startsWith('/shared/')) {
      sendeDatei(res, path.join(ROOT, pfad));
      return;
    }
    const datei = pfad === '/' ? '/index.html' : pfad;
    sendeDatei(res, path.join(ROOT, 'public', datei));
  } catch (err) {
    const status = err instanceof Is24Error ? err.status || 502 : err.status || 500;
    console.error(`[Fehler] ${req.method} ${pfad}:`, err.message);
    sendeJson(res, status, {
      fehler: err.message,
      details: err instanceof Is24Error ? err.body : undefined,
      hinweis: fehlerHinweis(status),
    });
  }
});

server.listen(config.port, () => {
  const modus = hatCredentials() ? `live (${config.is24.umgebung})` : 'Demo (keine API-Zugangsdaten)';
  console.log(`\n  Cashflow-Scout laeuft auf http://localhost:${config.port}`);
  console.log(`  Modus: ${modus}\n`);
});
