/**
 * Client fuer die ImmoScout24 Search-API (Suche + Expose).
 * Dokumentation: https://api.immobilienscout24.de -> API Reference -> Search
 */
import { authorizationHeader } from './oauth1.js';
import { apiBasis, config, hatCredentials } from './config.js';

export class Is24Error extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'Is24Error';
    this.status = status;
    this.body = body;
  }
}

async function anfrage(pfad, params = {}) {
  if (!hatCredentials()) {
    throw new Is24Error('Keine API-Zugangsdaten hinterlegt', 401, null);
  }

  const url = new URL(`${apiBasis()}${pfad}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }

  const header = authorizationHeader({
    method: 'GET',
    url: url.toString(),
    consumerKey: config.is24.clientKey,
    consumerSecret: config.is24.clientSecret,
    token: config.is24.token || undefined,
    tokenSecret: config.is24.tokenSecret || undefined,
  });

  const steuerung = AbortSignal.timeout(20000);
  const antwort = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: header,
      Accept: 'application/json',
      'User-Agent': 'cashflow-scout/1.0',
    },
    signal: steuerung,
  });

  const text = await antwort.text();
  if (!antwort.ok) {
    throw new Is24Error(
      `ImmoScout24 antwortete mit ${antwort.status}`,
      antwort.status,
      text.slice(0, 800),
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Is24Error('Antwort war kein gueltiges JSON', 502, text.slice(0, 400));
  }
}

/**
 * Radiussuche.
 * @param {object} o
 * @param {number} o.lat
 * @param {number} o.lon
 * @param {number} o.radiusKm
 * @param {string} o.realestatetype z.B. ApartmentBuy, HouseBuy, ApartmentRent
 */
export function sucheRadius({ lat, lon, radiusKm, realestatetype, ...rest }) {
  return anfrage('/search/v1.0/search/radius', {
    realestatetype,
    geocoordinates: `${lat};${lon};${radiusKm}`,
    ...rest,
  });
}

/** Regionssuche ueber IS24-Geocodes. */
export function sucheRegion({ geocodes, realestatetype, ...rest }) {
  return anfrage('/search/v1.0/search/region', { realestatetype, geocodes, ...rest });
}

/** Vollstaendiges Expose zu einer Angebots-ID. */
export function holeExpose(id) {
  return anfrage(`/search/v1.0/expose/${encodeURIComponent(id)}`);
}

/** Verbindungstest: kleinste sinnvolle Suche. */
export async function testeVerbindung() {
  const antwort = await sucheRadius({
    lat: 52.52,
    lon: 13.405,
    radiusKm: 2,
    realestatetype: 'ApartmentBuy',
    pagesize: 1,
  });
  const paging = antwort?.['resultlist.resultlist']?.paging;
  return { ok: true, treffer: paging?.numberOfHits ?? 0, umgebung: config.is24.umgebung };
}
