/**
 * Finanzierungs- und Cashflow-Rechner fuer vermietete Wohnimmobilien (DE).
 *
 * Laeuft unverandert im Browser und in Node: keine Imports, keine Seiteneffekte.
 * Alle Geldbetraege in EUR, alle Quoten als Prozentwerte (5.5 == 5,5 %).
 */

export const DEFAULT_SETTINGS = {
  // Finanzierung
  zinssatz: 3.6, // Sollzins p.a. in %
  tilgung: 2.0, // Anfangstilgung p.a. in %
  finanzierungsgrad: 100, // % des Kaufpreises, die fremdfinanziert werden
  nebenkostenMitfinanzieren: false, // true => Kaufnebenkosten wandern ins Darlehen
  zinsbindung: 10, // Jahre, nur fuer die Restschuld-Prognose

  // Kaufnebenkosten
  grunderwerbsteuer: null, // null => aus PLZ/Bundesland ableiten
  notarUndGrundbuch: 2.0, // % vom Kaufpreis
  maklerprovision: null, // null => Courtage aus dem Angebot, sonst Fallback
  maklerprovisionFallback: 3.57, // % inkl. USt, wenn das Angebot nichts liefert

  // Bewirtschaftung
  verwaltungProMonat: 25, // EUR je Einheit und Monat
  instandhaltungProQmJahr: 12, // EUR je m2 und Jahr (Ruecklage)
  mietausfallwagnis: 3, // % der Jahreskaltmiete

  // Steuern (optional)
  steuerBeruecksichtigen: false,
  steuersatz: 42, // persoenlicher Grenzsteuersatz in %
  gebaeudeanteil: 75, // % der Anschaffungskosten, die abgeschrieben werden
  afaSatz: 2.0, // % p.a.

  // Wertannahmen fuer die Prognose
  mietsteigerungProJahr: 1.5, // % p.a.
};

/** Zahl aus beliebigem Input, sonst Fallback. */
export function num(value, fallback = 0) {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pct(value) {
  return num(value, 0) / 100;
}

/**
 * Kaufnebenkosten aufschluesseln.
 * @param {number} kaufpreis
 * @param {object} settings
 * @param {object} listing normalisiertes Angebot (fuer Courtage + Bundesland)
 */
export function berechneNebenkosten(kaufpreis, settings, listing = {}) {
  const grestSatz =
    settings.grunderwerbsteuer === null || settings.grunderwerbsteuer === undefined || settings.grunderwerbsteuer === ''
      ? num(listing.grunderwerbsteuerSatz, 5.5)
      : num(settings.grunderwerbsteuer, 5.5);

  let courtageSatz;
  if (settings.maklerprovision !== null && settings.maklerprovision !== undefined && settings.maklerprovision !== '') {
    courtageSatz = num(settings.maklerprovision, 0);
  } else if (listing.courtageProzent !== null && listing.courtageProzent !== undefined) {
    courtageSatz = num(listing.courtageProzent, 0);
  } else if (listing.provisionsfrei) {
    courtageSatz = 0;
  } else {
    courtageSatz = num(settings.maklerprovisionFallback, 3.57);
  }

  const grunderwerbsteuer = kaufpreis * (grestSatz / 100);
  const notar = kaufpreis * pct(settings.notarUndGrundbuch);
  const makler = kaufpreis * (courtageSatz / 100);
  const summe = grunderwerbsteuer + notar + makler;

  return {
    grunderwerbsteuerSatz: grestSatz,
    grunderwerbsteuer,
    notarUndGrundbuch: notar,
    courtageSatz,
    makler,
    summe,
    quote: kaufpreis > 0 ? (summe / kaufpreis) * 100 : 0,
  };
}

/**
 * Restschuld und kumulierte Tilgung nach n Jahren bei konstanter Annuitaet.
 */
export function restschuldNachJahren(darlehen, zinssatzProzent, annuitaetJahr, jahre) {
  const i = pct(zinssatzProzent);
  if (darlehen <= 0) return 0;
  if (i === 0) return Math.max(0, darlehen - annuitaetJahr * jahre);
  const q = 1 + i;
  const rest = darlehen * Math.pow(q, jahre) - annuitaetJahr * ((Math.pow(q, jahre) - 1) / i);
  return Math.max(0, rest);
}

/**
 * Vollstaendige Cashflow-Rechnung fuer ein Angebot.
 *
 * @param {object} listing normalisiertes Angebot
 * @param {object} userSettings Teilmenge von DEFAULT_SETTINGS
 * @param {object} opts { mietbasis: 'ist' | 'potenzial' }
 */
export function berechneCashflow(listing, userSettings = {}, opts = {}) {
  const s = { ...DEFAULT_SETTINGS, ...userSettings };
  const mietbasis = opts.mietbasis || 'ist';

  const kaufpreis = num(listing.kaufpreis, 0);
  const flaeche = num(listing.wohnflaeche, 0);
  const einheiten = Math.max(1, num(listing.einheiten, 1));

  const nebenkosten = berechneNebenkosten(kaufpreis, s, listing);
  const gesamtinvestition = kaufpreis + nebenkosten.summe;

  // --- Darlehen ---
  const basis = s.nebenkostenMitfinanzieren ? gesamtinvestition : kaufpreis;
  const darlehen = Math.max(0, basis * pct(s.finanzierungsgrad));
  const eigenkapital = Math.max(0, gesamtinvestition - darlehen);

  const annuitaetProzent = num(s.zinssatz, 0) + num(s.tilgung, 0);
  const annuitaetJahr = darlehen * (annuitaetProzent / 100);
  const annuitaetMonat = annuitaetJahr / 12;
  const zinsJahr1 = darlehen * pct(s.zinssatz);
  const tilgungJahr1 = Math.max(0, annuitaetJahr - zinsJahr1);

  // --- Mieteinnahmen ---
  const istMieteMonat = num(listing.istMieteKaltMonat, 0);
  const potenzialMieteMonat = num(listing.potenzialMieteKaltMonat, istMieteMonat);
  const mieteMonat = mietbasis === 'potenzial' ? potenzialMieteMonat : istMieteMonat || potenzialMieteMonat;
  const mieteJahr = mieteMonat * 12;

  // --- Bewirtschaftungskosten (nicht umlagefaehig) ---
  const verwaltungJahr = num(s.verwaltungProMonat, 0) * 12 * einheiten;
  const instandhaltungJahr = num(s.instandhaltungProQmJahr, 0) * flaeche;
  const mietausfallJahr = mieteJahr * pct(s.mietausfallwagnis);
  // Hausgeld-Anteile, die nicht auf den Mieter umlegbar sind, kommen ueber das
  // Angebot herein, sofern ImmoScout sie liefert.
  const hausgeldNichtUmlagefaehigJahr = num(listing.hausgeldNichtUmlagefaehigMonat, 0) * 12;
  const bewirtschaftungJahr =
    verwaltungJahr + instandhaltungJahr + mietausfallJahr + hausgeldNichtUmlagefaehigJahr;

  const nettomietertragJahr = mieteJahr - bewirtschaftungJahr;

  // --- Cashflow ---
  const cashflowJahrVorSteuer = nettomietertragJahr - annuitaetJahr;
  const cashflowMonatVorSteuer = cashflowJahrVorSteuer / 12;

  // --- Steuern ---
  const afaBasis = gesamtinvestition * pct(s.gebaeudeanteil);
  const afaJahr = afaBasis * pct(s.afaSatz);
  const steuerlichesErgebnis = mieteJahr - bewirtschaftungJahr - zinsJahr1 - afaJahr;
  const steuerEffekt = s.steuerBeruecksichtigen ? -steuerlichesErgebnis * pct(s.steuersatz) : 0;
  const cashflowJahrNachSteuer = cashflowJahrVorSteuer + steuerEffekt;
  const cashflowMonatNachSteuer = cashflowJahrNachSteuer / 12;

  // --- Kennzahlen ---
  const bruttorendite = kaufpreis > 0 ? (mieteJahr / kaufpreis) * 100 : 0;
  const nettorendite = gesamtinvestition > 0 ? (nettomietertragJahr / gesamtinvestition) * 100 : 0;
  // Ohne Kaufpreis (z.B. Mietangebote im Vergleichsmodus) sind Faktor und
  // Quadratmeterpreis nicht definiert — 0 wuerde beim Sortieren nach oben rutschen.
  const kaufpreisfaktor = mieteJahr > 0 && kaufpreis > 0 ? kaufpreis / mieteJahr : null;
  const preisProQm = flaeche > 0 && kaufpreis > 0 ? kaufpreis / flaeche : null;
  const eigenkapitalrendite =
    eigenkapital > 0 ? ((cashflowJahrVorSteuer + tilgungJahr1) / eigenkapital) * 100 : null;
  const dscr = annuitaetJahr > 0 ? nettomietertragJahr / annuitaetJahr : null;

  // Zinssatz, bei dem der Cashflow auf 0 dreht (Annuitaet = Nettomietertrag).
  const maxAnnuitaetProzent = darlehen > 0 ? (nettomietertragJahr / darlehen) * 100 : null;
  const breakEvenZins = maxAnnuitaetProzent === null ? null : maxAnnuitaetProzent - num(s.tilgung, 0);

  // Restschuld / Tilgungsstand am Ende der Zinsbindung
  const jahre = Math.max(1, num(s.zinsbindung, 10));
  const restschuld = restschuldNachJahren(darlehen, s.zinssatz, annuitaetJahr, jahre);
  const getilgt = Math.max(0, darlehen - restschuld);

  // Cashflow mit Potenzialmiete (fuer die Zukunftsansicht immer mitliefern)
  const potenzialMieteJahr = potenzialMieteMonat * 12;
  const potenzialBewirtschaftung =
    verwaltungJahr + instandhaltungJahr + potenzialMieteJahr * pct(s.mietausfallwagnis) + hausgeldNichtUmlagefaehigJahr;
  const cashflowMonatPotenzial = (potenzialMieteJahr - potenzialBewirtschaftung - annuitaetJahr) / 12;

  return {
    kaufpreis,
    nebenkosten,
    gesamtinvestition,
    darlehen,
    eigenkapital,
    annuitaetProzent,
    annuitaetMonat,
    annuitaetJahr,
    zinsJahr1,
    tilgungJahr1,
    mietbasis,
    mieteMonat,
    mieteJahr,
    istMieteMonat,
    potenzialMieteMonat,
    mietsteigerungPotenzialProzent:
      istMieteMonat > 0 ? ((potenzialMieteMonat - istMieteMonat) / istMieteMonat) * 100 : null,
    verwaltungJahr,
    instandhaltungJahr,
    mietausfallJahr,
    hausgeldNichtUmlagefaehigJahr,
    bewirtschaftungJahr,
    bewirtschaftungMonat: bewirtschaftungJahr / 12,
    nettomietertragJahr,
    cashflowMonatVorSteuer,
    cashflowJahrVorSteuer,
    cashflowMonatNachSteuer,
    cashflowJahrNachSteuer,
    cashflowMonat: s.steuerBeruecksichtigen ? cashflowMonatNachSteuer : cashflowMonatVorSteuer,
    cashflowMonatPotenzial,
    steuerlichesErgebnis,
    afaJahr,
    steuerEffekt,
    bruttorendite,
    nettorendite,
    kaufpreisfaktor,
    preisProQm,
    eigenkapitalrendite,
    dscr,
    breakEvenZins,
    zinsbindung: jahre,
    restschuld,
    getilgt,
  };
}

/**
 * Zinssatz finden, bei dem der Cashflow genau auf `ziel` EUR/Monat landet.
 * Praktisch fuer "wie weit duerfen die Zinsen steigen?".
 */
export function zinsFuerZielCashflow(listing, settings, zielCashflowMonat = 0) {
  let lo = 0;
  let hi = 20;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    const cf = berechneCashflow(listing, { ...settings, zinssatz: mid }).cashflowMonatVorSteuer;
    if (cf > zielCashflowMonat) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Maximaler Kaufpreis, bei dem der Ziel-Cashflow noch erreicht wird.
 */
export function maxKaufpreisFuerZielCashflow(listing, settings, zielCashflowMonat = 0) {
  const start = num(listing.kaufpreis, 0);
  if (start <= 0) return null;
  let lo = 0;
  let hi = start * 3;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    const cf = berechneCashflow({ ...listing, kaufpreis: mid }, settings).cashflowMonatVorSteuer;
    if (cf > zielCashflowMonat) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Einfache Mehrjahresprognose: Cashflow-Entwicklung inkl. Mietsteigerung.
 */
export function prognose(listing, userSettings = {}, jahre = 10) {
  const s = { ...DEFAULT_SETTINGS, ...userSettings };
  const basis = berechneCashflow(listing, s);
  const reihen = [];
  let restschuld = basis.darlehen;
  const i = pct(s.zinssatz);

  for (let jahr = 1; jahr <= jahre; jahr += 1) {
    const zins = restschuld * i;
    const tilgung = Math.max(0, basis.annuitaetJahr - zins);
    restschuld = Math.max(0, restschuld - tilgung);
    const steigerung = Math.pow(1 + pct(s.mietsteigerungProJahr), jahr - 1);
    const miete = basis.mieteJahr * steigerung;
    const bewirtschaftung =
      basis.verwaltungJahr + basis.instandhaltungJahr + basis.hausgeldNichtUmlagefaehigJahr + miete * pct(s.mietausfallwagnis);
    reihen.push({
      jahr,
      miete,
      zins,
      tilgung,
      restschuld,
      cashflowJahr: miete - bewirtschaftung - basis.annuitaetJahr,
      cashflowMonat: (miete - bewirtschaftung - basis.annuitaetJahr) / 12,
    });
  }
  return reihen;
}
