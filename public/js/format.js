/** Formatierungshilfen (de-DE). */

const EUR0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const EUR2 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ZAHL = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const ZAHL1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ZAHL2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function eur(wert, nachkomma = 0) {
  if (wert === null || wert === undefined || !Number.isFinite(Number(wert))) return '–';
  return nachkomma === 2 ? EUR2.format(wert) : EUR0.format(wert);
}

export function eurVorzeichen(wert) {
  if (!Number.isFinite(Number(wert))) return '–';
  const gerundet = Math.round(wert);
  return `${gerundet > 0 ? '+' : gerundet < 0 ? '−' : ''}${EUR0.format(Math.abs(gerundet))}`;
}

export function zahl(wert, nachkomma = 0) {
  if (wert === null || wert === undefined || !Number.isFinite(Number(wert))) return '–';
  if (nachkomma === 1) return ZAHL1.format(wert);
  if (nachkomma === 2) return ZAHL2.format(wert);
  return ZAHL.format(wert);
}

export function prozent(wert, nachkomma = 1) {
  if (wert === null || wert === undefined || !Number.isFinite(Number(wert))) return '–';
  return `${zahl(wert, nachkomma)} %`;
}

export function qm(wert) {
  if (!Number.isFinite(Number(wert))) return '–';
  return `${zahl(wert, 0)} m²`;
}

export function datum(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function tageSeit(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/** Text fuer die Ausgabe in HTML entschaerfen. */
export function esc(wert) {
  return String(wert ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
