/**
 * Minimale OAuth-1.0a-Implementierung (HMAC-SHA1), wie sie die
 * ImmoScout24-REST-API erwartet. Zwei-Bein (nur Consumer-Credentials) und
 * Drei-Bein (mit Access Token) werden unterstuetzt.
 */
import crypto from 'node:crypto';

/** RFC-3986-konforme Kodierung (encodeURIComponent laesst !*'() durch). */
export function rfc3986(str) {
  return encodeURIComponent(String(str)).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function nonce() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Authorization-Header fuer eine Anfrage bauen.
 *
 * @param {object} o
 * @param {string} o.method HTTP-Methode
 * @param {string} o.url vollstaendige URL inkl. Query
 * @param {string} o.consumerKey
 * @param {string} o.consumerSecret
 * @param {string} [o.token]
 * @param {string} [o.tokenSecret]
 * @returns {string} Wert fuer den Authorization-Header
 */
export function authorizationHeader({ method, url, consumerKey, consumerSecret, token, tokenSecret }) {
  const parsed = new URL(url);

  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0',
  };
  if (token) oauthParams.oauth_token = token;

  // Signaturbasis: alle Query-Parameter + OAuth-Parameter, sortiert
  const allParams = [];
  for (const [k, v] of parsed.searchParams.entries()) allParams.push([k, v]);
  for (const [k, v] of Object.entries(oauthParams)) allParams.push([k, v]);

  const encoded = allParams
    .map(([k, v]) => [rfc3986(k), rfc3986(v)])
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));

  const paramString = encoded.map(([k, v]) => `${k}=${v}`).join('&');
  const baseUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  const baseString = [method.toUpperCase(), rfc3986(baseUrl), rfc3986(paramString)].join('&');
  const signingKey = `${rfc3986(consumerSecret)}&${rfc3986(tokenSecret || '')}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  const headerParams = { ...oauthParams, oauth_signature: signature };
  return (
    'OAuth ' +
    Object.entries(headerParams)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${rfc3986(k)}="${rfc3986(v)}"`)
      .join(', ')
  );
}
