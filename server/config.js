/**
 * Konfiguration: liest .env / .env.local (ohne externe Abhaengigkeit) und
 * haelt die API-Credentials zur Laufzeit vor. Credentials koennen auch aus
 * der Oberflaeche gesetzt und optional nach .env.local geschrieben werden.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const zeile of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = zeile.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// Reihenfolge: echte Umgebungsvariablen schlagen .env.local schlaegt .env
const fileEnv = { ...parseEnvFile(path.join(ROOT, '.env')), ...parseEnvFile(path.join(ROOT, '.env.local')) };

function env(key, fallback = '') {
  return process.env[key] || fileEnv[key] || fallback;
}

export const config = {
  port: Number(env('PORT', '3000')),
  is24: {
    clientKey: env('IS24_CLIENT_KEY'),
    clientSecret: env('IS24_CLIENT_SECRET'),
    token: env('IS24_TOKEN'),
    tokenSecret: env('IS24_TOKEN_SECRET'),
    umgebung: env('IS24_ENV', 'live'),
  },
};

export function apiBasis() {
  return config.is24.umgebung === 'sandbox'
    ? 'https://rest.sandbox-immobilienscout24.de/restapi/api'
    : 'https://rest.immobilienscout24.de/restapi/api';
}

export function hatCredentials() {
  return Boolean(config.is24.clientKey && config.is24.clientSecret);
}

/** Credentials zur Laufzeit setzen (aus der Oberflaeche). */
export function setzeCredentials({ clientKey, clientSecret, token, tokenSecret, umgebung }, persistieren = false) {
  if (clientKey !== undefined) config.is24.clientKey = clientKey.trim();
  if (clientSecret !== undefined) config.is24.clientSecret = clientSecret.trim();
  if (token !== undefined) config.is24.token = token.trim();
  if (tokenSecret !== undefined) config.is24.tokenSecret = tokenSecret.trim();
  if (umgebung !== undefined) config.is24.umgebung = umgebung === 'sandbox' ? 'sandbox' : 'live';

  if (persistieren) {
    const datei = path.join(ROOT, '.env.local');
    const inhalt = [
      '# Von der Oberflaeche gespeichert. Diese Datei ist in .gitignore.',
      `IS24_CLIENT_KEY=${config.is24.clientKey}`,
      `IS24_CLIENT_SECRET=${config.is24.clientSecret}`,
      `IS24_TOKEN=${config.is24.token}`,
      `IS24_TOKEN_SECRET=${config.is24.tokenSecret}`,
      `IS24_ENV=${config.is24.umgebung}`,
      '',
    ].join('\n');
    fs.writeFileSync(datei, inhalt, { mode: 0o600 });
    return datei;
  }
  return null;
}
