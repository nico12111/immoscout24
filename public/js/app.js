/**
 * Cashflow-Scout — Oberflaechenlogik.
 *
 * Der Server liefert normalisierte Angebote; Finanzrechnung und Bewertung
 * laufen hier im Browser, damit jede Regleraenderung sofort durchschlaegt.
 */
import {
  berechneCashflow,
  prognose,
  maxKaufpreisFuerZielCashflow,
  zinsFuerZielCashflow,
} from '/shared/finance.js';
import { analysiere, renovierungsSchaetzung } from '/shared/analysis.js';
import { eur, eurVorzeichen, zahl, prozent, qm, datum, tageSeit, esc } from './format.js';

const $ = (id) => document.getElementById(id);

const zustand = {
  rohListings: [],
  bewertet: [],
  gefiltert: [],
  auswahlId: null,
  modus: 'demo',
  hinweis: null,
  laden: false,
  fehler: null,
  zentrum: null,
  paging: null,
};

/* ------------------------------------------------------------------ */
/*  Einstellungen                                                      */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'cashflow-scout:einstellungen';

function leseEinstellungen() {
  const leerAlsNull = (el) => (el.value === '' ? null : Number(el.value));
  return {
    zinssatz: Number($('zinssatz').value),
    tilgung: Number($('tilgung').value),
    finanzierungsgrad: Number($('finanzierungsgrad').value),
    nebenkostenMitfinanzieren: $('nkMitfinanzieren').checked,
    zinsbindung: Number($('zinsbindung').value),

    grunderwerbsteuer: leerAlsNull($('grest')),
    notarUndGrundbuch: Number($('notar').value),
    maklerprovision: leerAlsNull($('courtage')),

    verwaltungProMonat: Number($('verwaltung').value),
    instandhaltungProQmJahr: Number($('instandhaltung').value),
    mietausfallwagnis: Number($('mietausfall').value),

    steuerBeruecksichtigen: $('steuerAn').checked,
    steuersatz: Number($('steuersatz').value),
    gebaeudeanteil: Number($('gebaeudeanteil').value),
    mietsteigerungProJahr: Number($('mietsteigerung').value),

    // reine Oberflaechen-Optionen
    zielCashflow: Number($('zielCashflow').value),
    nurZiel: $('nurZiel').checked,
    mietbasis: $('mietbasisPotenzial').checked ? 'potenzial' : 'ist',
    sortierung: $('sortierung').value,
  };
}

function schreibeEinstellungen(werte) {
  if (!werte) return;
  const setze = (id, wert) => {
    const el = $(id);
    if (!el || wert === undefined) return;
    if (el.type === 'checkbox') el.checked = Boolean(wert);
    else el.value = wert === null ? '' : wert;
  };
  setze('zinssatz', werte.zinssatz);
  setze('tilgung', werte.tilgung);
  setze('finanzierungsgrad', werte.finanzierungsgrad);
  setze('nkMitfinanzieren', werte.nebenkostenMitfinanzieren);
  setze('zinsbindung', werte.zinsbindung);
  setze('grest', werte.grunderwerbsteuer);
  setze('notar', werte.notarUndGrundbuch);
  setze('courtage', werte.maklerprovision);
  setze('verwaltung', werte.verwaltungProMonat);
  setze('instandhaltung', werte.instandhaltungProQmJahr);
  setze('mietausfall', werte.mietausfallwagnis);
  setze('steuerAn', werte.steuerBeruecksichtigen);
  setze('steuersatz', werte.steuersatz);
  setze('gebaeudeanteil', werte.gebaeudeanteil);
  setze('mietsteigerung', werte.mietsteigerungProJahr);
  setze('zielCashflow', werte.zielCashflow);
  setze('nurZiel', werte.nurZiel);
  setze('mietbasisPotenzial', werte.mietbasis === 'potenzial');
  setze('sortierung', werte.sortierung);
  if (werte.ort) setze('ort', werte.ort);
  if (werte.radius) setze('radius', werte.radius);
  if (werte.objektart) setze('objektart', werte.objektart);
}

function speichereEinstellungen() {
  try {
    const e = leseEinstellungen();
    e.ort = $('ort').value;
    e.radius = $('radius').value;
    e.objektart = $('objektart').value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(e));
  } catch {
    /* localStorage nicht verfuegbar — kein Problem */
  }
}

function ladeEinstellungen() {
  try {
    const roh = localStorage.getItem(STORAGE_KEY);
    if (roh) schreibeEinstellungen(JSON.parse(roh));
  } catch {
    /* ignorieren */
  }
}

/** Beschriftungen der Schieberegler aktualisieren. */
function aktualisiereReglerBeschriftung() {
  $('zinsWert').textContent = `${zahl(Number($('zinssatz').value), 2)} %`;
  $('tilgungWert').textContent = `${zahl(Number($('tilgung').value), 2)} %`;
  const grad = Number($('finanzierungsgrad').value);
  const nk = $('nkMitfinanzieren').checked;
  $('beleihungWert').textContent = nk ? `${grad} % inkl. NK` : `${grad} %`;
  const ziel = Number($('zielCashflow').value);
  $('zielWert').textContent = `${ziel >= 0 ? '+' : '−'}${zahl(Math.abs(ziel))} €/Monat`;
}

/* ------------------------------------------------------------------ */
/*  Berechnung                                                         */
/* ------------------------------------------------------------------ */

function bewerteAlle() {
  const s = leseEinstellungen();

  zustand.bewertet = zustand.rohListings.map((listing) => {
    const cashflow = berechneCashflow(listing, s, { mietbasis: s.mietbasis });
    const analyse = analysiere(listing, cashflow, s);
    return { listing, cashflow, analyse };
  });

  zustand.gefiltert = zustand.bewertet
    .filter((e) => (s.nurZiel ? e.cashflow.cashflowMonat >= s.zielCashflow : true))
    .sort(sortierer(s.sortierung));

  if (!zustand.gefiltert.some((e) => e.listing.id === zustand.auswahlId)) {
    zustand.auswahlId = zustand.gefiltert[0]?.listing.id ?? null;
  }
}

function sortierer(art) {
  switch (art) {
    case 'score':
      return (a, b) => b.analyse.score - a.analyse.score || b.cashflow.cashflowMonat - a.cashflow.cashflowMonat;
    case 'rendite':
      return (a, b) => b.cashflow.bruttorendite - a.cashflow.bruttorendite;
    case 'faktor':
      return (a, b) => (a.cashflow.kaufpreisfaktor ?? 1e9) - (b.cashflow.kaufpreisfaktor ?? 1e9);
    case 'preis':
      return (a, b) => a.cashflow.kaufpreis - b.cashflow.kaufpreis;
    case 'qm':
      return (a, b) => (a.cashflow.preisProQm ?? 1e9) - (b.cashflow.preisProQm ?? 1e9);
    case 'cashflow':
    default:
      return (a, b) => b.cashflow.cashflowMonat - a.cashflow.cashflowMonat;
  }
}

/* ------------------------------------------------------------------ */
/*  Darstellung: Liste                                                 */
/* ------------------------------------------------------------------ */

function zeichneAlles() {
  aktualisiereReglerBeschriftung();
  bewerteAlle();
  zeichneListe();
  zeichneDetail();
  zeichneStatistik();
}

function zeichneStatistik() {
  const alle = zustand.bewertet;
  const gezeigt = zustand.gefiltert;
  const s = leseEinstellungen();

  $('trefferZahl').innerHTML = zustand.laden
    ? 'lädt …'
    : `${gezeigt.length} Angebote <small>von ${alle.length} geladen</small>`;

  if (!alle.length) {
    $('statistik').innerHTML = '';
    return;
  }

  const positiv = alle.filter((e) => e.cashflow.cashflowMonat > 0).length;
  const ueberZiel = alle.filter((e) => e.cashflow.cashflowMonat >= s.zielCashflow).length;
  const bester = alle.reduce((a, b) => (b.cashflow.cashflowMonat > a.cashflow.cashflowMonat ? b : a));
  const medianFaktor = median(alle.map((e) => e.cashflow.kaufpreisfaktor).filter(Number.isFinite));

  $('statistik').innerHTML = [
    `<span>Positiver Cashflow: <b>${positiv}</b></span>`,
    `<span>Über Ziel: <b>${ueberZiel}</b></span>`,
    `<span>Bester: <b class="${bester.cashflow.cashflowMonat >= 0 ? 'plus' : 'minus'}">${eurVorzeichen(bester.cashflow.cashflowMonat)}</b></span>`,
    medianFaktor ? `<span>Median-Faktor: <b>${zahl(medianFaktor, 1)}</b></span>` : '',
  ].join('');
}

function median(werte) {
  if (!werte.length) return null;
  const sortiert = [...werte].sort((a, b) => a - b);
  const m = Math.floor(sortiert.length / 2);
  return sortiert.length % 2 ? sortiert[m] : (sortiert[m - 1] + sortiert[m]) / 2;
}

function zeichneListe() {
  const container = $('liste');

  if (zustand.laden) {
    container.innerHTML = `<div class="laden">${'<div class="skelett"></div>'.repeat(6)}</div>`;
    return;
  }

  if (zustand.fehler) {
    container.innerHTML = `<div class="fehlerband"><strong>Suche fehlgeschlagen.</strong><br>${esc(zustand.fehler)}</div>`;
    return;
  }

  const banner = zustand.hinweis ? `<div class="hinweisband">${esc(zustand.hinweis)}</div>` : '';

  if (!zustand.gefiltert.length) {
    const s = leseEinstellungen();

    if (!zustand.bewertet.length) {
      container.innerHTML = `${banner}<div class="leer"><h3>Keine Angebote</h3><p>Wähle eine Region und klicke auf „Angebote laden“.</p></div>`;
      return;
    }

    // Zeigen, wie weit das beste Objekt vom Ziel entfernt ist — sonst steht
    // der Nutzer vor einer leeren Liste ohne zu wissen, welcher Regler klemmt.
    const bester = zustand.bewertet.reduce((a, b) =>
      b.cashflow.cashflowMonat > a.cashflow.cashflowMonat ? b : a,
    );
    const luecke = s.zielCashflow - bester.cashflow.cashflowMonat;
    const noetigerZins = zinsFuerZielCashflow(bester.listing, s, s.zielCashflow);

    container.innerHTML = `
      ${banner}
      <div class="leer">
        <h3>Kein Angebot erreicht dein Ziel</h3>
        <p>
          Bestes Objekt: <b class="${bester.cashflow.cashflowMonat >= 0 ? 'plus' : 'minus'}">${eurVorzeichen(bester.cashflow.cashflowMonat)}/Monat</b>
          — das sind ${eur(Math.abs(luecke))} unter deinem Ziel von ${eurVorzeichen(s.zielCashflow)}.
          ${noetigerZins > 0.5 ? `Bei ${zahl(noetigerZins, 2)} % Sollzins würde es aufgehen.` : 'Auch bei sehr niedrigem Zins reicht die Miete hier nicht.'}
        </p>
        <p style="margin-top:6px">
          <button class="btn btn--geist" type="button" data-aktion="filterAus">Alle ${zustand.bewertet.length} Angebote trotzdem zeigen</button>
        </p>
      </div>`;

    container.querySelector('[data-aktion="filterAus"]')?.addEventListener('click', () => {
      $('nurZiel').checked = false;
      zeichneAlles();
      speichereEinstellungen();
    });
    return;
  }

  container.innerHTML =
    banner +
    zustand.gefiltert
      .map((eintrag) => karteHtml(eintrag, eintrag.listing.id === zustand.auswahlId))
      .join('');

  for (const el of container.querySelectorAll('.karte')) {
    el.addEventListener('click', () => {
      zustand.auswahlId = el.dataset.id;
      zeichneListe();
      zeichneDetail();
      $('detail').scrollTop = 0;
    });
  }
}

function karteHtml({ listing, cashflow, analyse }, aktiv) {
  const cf = cashflow.cashflowMonat;
  const bild = listing.bilder?.[0]?.url;
  const marker = [];

  if (analyse.flags.renovierungsbedarf) marker.push('<span class="marker marker--warn">Renovierung</span>');
  if (analyse.flags.kernsaniert) marker.push('<span class="marker marker--gut">Saniert</span>');
  if (analyse.flags.erbbaurecht) marker.push('<span class="marker marker--warn">Erbbaurecht</span>');
  if (listing.provisionsfrei) marker.push('<span class="marker marker--gut">Provisionsfrei</span>');
  if (listing.mietQuelle === 'geschaetzt') marker.push('<span class="marker marker--info">Miete geschätzt</span>');
  if (cashflow.mietsteigerungPotenzialProzent >= 12) {
    marker.push(`<span class="marker marker--gut">+${zahl(cashflow.mietsteigerungPotenzialProzent)} % Mietpotenzial</span>`);
  }

  const ort = [listing.plz, listing.stadt, listing.stadtteil].filter(Boolean).join(' · ');
  const entfernung = Number.isFinite(listing.entfernungKm) ? ` · ${zahl(listing.entfernungKm, 1)} km` : '';

  return `
    <article class="karte ${aktiv ? 'karte--aktiv' : ''}" data-id="${esc(listing.id)}" role="listitem" tabindex="0">
      ${
        bild
          ? `<img class="karte__bild" src="${esc(bild)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'karte__bildLeer',textContent:'kein Bild'}))" />`
          : '<div class="karte__bildLeer">kein Bild</div>'
      }
      <div class="karte__inhalt">
        <div class="karte__titel">${esc(listing.titel)}</div>
        <div class="karte__ort">${esc(ort)}${entfernung}</div>
        <div class="karte__zahlen">
          <span><b>${eur(cashflow.kaufpreis)}</b></span>
          <span>${qm(listing.wohnflaeche)}${listing.zimmer ? ` · ${zahl(listing.zimmer, 1)} Zi.` : ''}</span>
          <span>${cashflow.preisProQm ? `${eur(cashflow.preisProQm)}/m²` : ''}</span>
          <span>Faktor <b>${cashflow.kaufpreisfaktor ? zahl(cashflow.kaufpreisfaktor, 1) : '–'}</b></span>
          <span>${prozent(cashflow.bruttorendite, 1)} brutto</span>
        </div>
        <div class="karte__fuss">
          <span class="cashflow ${cf >= 0 ? 'cashflow--plus' : 'cashflow--minus'}">
            ${eurVorzeichen(cf)}<span class="cashflow__einheit"> /Mon.</span>
          </span>
          <span class="score score--${analyse.bewertung.ton}">${analyse.score} · ${esc(analyse.bewertung.kurz)}</span>
          ${marker.slice(0, 3).join('')}
        </div>
      </div>
    </article>`;
}

/* ------------------------------------------------------------------ */
/*  Darstellung: Detail                                                */
/* ------------------------------------------------------------------ */

function zeichneDetail() {
  const container = $('detail');
  const eintrag = zustand.gefiltert.find((e) => e.listing.id === zustand.auswahlId) ||
    zustand.bewertet.find((e) => e.listing.id === zustand.auswahlId);

  if (!eintrag) {
    container.innerHTML = `
      <div class="leer">
        <h3>Kein Angebot ausgewählt</h3>
        <p>Links ein Angebot anklicken. Rechts erscheinen dann Cashflow-Rechnung, Pro- und Contra-Punkte sowie die Zukunftsprognose.</p>
      </div>`;
    return;
  }

  const { listing, cashflow, analyse } = eintrag;
  const s = leseEinstellungen();
  const reno = renovierungsSchaetzung(listing, analyse.flags);
  const prog = prognose(listing, s, Math.min(15, Math.max(5, s.zinsbindung)));
  const maxPreis = maxKaufpreisFuerZielCashflow(listing, s, s.zielCashflow);

  container.innerHTML = `
    ${detailkopfHtml(listing, cashflow)}
    ${galerieHtml(listing)}
    ${kachelnHtml(listing, cashflow, analyse)}
    ${cashflowBlockHtml(listing, cashflow, s)}
    ${mietBlockHtml(listing, cashflow)}
    ${bewertungsBlockHtml(analyse)}
    ${punkteBlockHtml(analyse)}
    ${objektBlockHtml(listing, reno)}
    ${verhandlungsBlockHtml(cashflow, maxPreis, s)}
    ${prognoseBlockHtml(prog, cashflow)}
    ${beschreibungsBlockHtml(listing)}
  `;

  const mehr = container.querySelector('.mehr');
  if (mehr) {
    mehr.addEventListener('click', () => {
      const box = container.querySelector('.beschreibung');
      const offen = box.classList.toggle('beschreibung--offen');
      mehr.textContent = offen ? 'Weniger anzeigen' : 'Vollständige Beschreibung anzeigen';
    });
  }
}

function detailkopfHtml(listing, cashflow) {
  const ort = [
    [listing.strasse, listing.hausnummer].filter(Boolean).join(' '),
    [listing.plz, listing.stadt].filter(Boolean).join(' '),
    listing.stadtteil,
  ]
    .filter(Boolean)
    .join(' · ');
  const alter = tageSeit(listing.veroeffentlicht);

  return `
    <div class="detailkopf">
      <div>
        <h2>${esc(listing.titel)}</h2>
        <div class="detailkopf__ort">
          ${esc(ort || 'Adresse nicht angegeben')}
          ${listing.objekttypLabel ? ` · ${esc(listing.objekttypLabel)}` : ''}
          ${alter !== null ? ` · online seit ${alter} Tag${alter === 1 ? '' : 'en'}` : ''}
        </div>
      </div>
      <div class="detailkopf__aktion">
        ${
          listing.quelle === 'is24'
            ? `<a class="btn btn--geist" href="${esc(listing.url)}" target="_blank" rel="noreferrer">Bei IS24 öffnen</a>`
            : '<span class="marker marker--info">Demo-Angebot</span>'
        }
      </div>
    </div>`;
}

function galerieHtml(listing) {
  const bilder = (listing.bilder || []).slice(0, 5);
  if (!bilder.length) return '';
  return `
    <div class="galerie galerie--${bilder.length}">
      ${bilder
        .map(
          (b) =>
            `<img src="${esc(b.url)}" alt="${b.grundriss ? 'Grundriss' : 'Objektbild'}" loading="lazy" onclick="window.open(this.src,'_blank')" onerror="this.style.display='none'" />`,
        )
        .join('')}
    </div>`;
}

function kachel(label, wert, zusatz = '', klasse = '') {
  return `
    <div class="kachel ${klasse}">
      <div class="kachel__label">${label}</div>
      <div class="kachel__wert">${wert}</div>
      ${zusatz ? `<div class="kachel__zusatz">${zusatz}</div>` : ''}
    </div>`;
}

function kachelnHtml(listing, cashflow, analyse) {
  const cf = cashflow.cashflowMonat;
  return `
    <div class="kacheln">
      ${kachel(
        'Cashflow / Monat',
        eurVorzeichen(cf),
        cashflow.mietbasis === 'potenzial' ? 'mit Potenzialmiete' : 'mit Ist-Miete',
        cf >= 0 ? 'kachel--plus' : 'kachel--minus',
      )}
      ${kachel('Kaufpreis', eur(cashflow.kaufpreis), cashflow.preisProQm ? `${eur(cashflow.preisProQm)} je m²` : '')}
      ${kachel('Kaufpreisfaktor', cashflow.kaufpreisfaktor ? zahl(cashflow.kaufpreisfaktor, 1) : '–', 'Jahresmieten')}
      ${kachel('Bruttorendite', prozent(cashflow.bruttorendite, 2), `netto ${prozent(cashflow.nettorendite, 2)}`)}
      ${kachel('Bewertung', `${analyse.score}`, analyse.bewertung.lang)}
      ${kachel(
        'Break-even-Zins',
        cashflow.breakEvenZins !== null && cashflow.breakEvenZins > 0 ? prozent(cashflow.breakEvenZins, 2) : '–',
        'ab hier negativ',
      )}
    </div>`;
}

function zeile(label, wert, klasse = '') {
  return `<div class="zeile ${klasse}"><span>${label}</span><span>${wert}</span></div>`;
}

function cashflowBlockHtml(listing, c, s) {
  const steuer = s.steuerBeruecksichtigen;
  return `
    <div class="block">
      <div class="block__titel">
        Cashflow-Rechnung
        <span class="leise">${zahl(s.zinssatz, 2)} % Zins · ${zahl(s.tilgung, 2)} % Tilgung · ${s.finanzierungsgrad} % Beleihung${s.nebenkostenMitfinanzieren ? ' inkl. NK' : ''}</span>
      </div>
      <div class="spalten2">
        <div>
          ${zeile('Kaufpreis', eur(c.kaufpreis))}
          ${zeile(`Grunderwerbsteuer (${zahl(c.nebenkosten.grunderwerbsteuerSatz, 1)} %)`, eur(c.nebenkosten.grunderwerbsteuer))}
          ${zeile(`Notar &amp; Grundbuch (${zahl(s.notarUndGrundbuch, 1)} %)`, eur(c.nebenkosten.notarUndGrundbuch))}
          ${zeile(`Courtage (${zahl(c.nebenkosten.courtageSatz, 2)} %)`, eur(c.nebenkosten.makler))}
          ${zeile('Gesamtinvestition', eur(c.gesamtinvestition), 'zeile--summe')}
          ${zeile('Darlehen', eur(c.darlehen))}
          ${zeile(
            'Eigenkapital',
            `<span class="${c.eigenkapital > 0 ? '' : 'plus'}">${eur(c.eigenkapital)}</span>`,
          )}
          ${zeile('Annuität', `${eur(c.annuitaetMonat)} / Monat`)}
          ${zeile('davon Zins (Jahr 1)', `${eur(c.zinsJahr1 / 12)} / Monat`)}
          ${zeile('davon Tilgung (Jahr 1)', `${eur(c.tilgungJahr1 / 12)} / Monat`)}
        </div>
        <div>
          ${zeile('Kaltmiete', `<span class="plus">${eur(c.mieteMonat)} / Monat</span>`)}
          ${zeile(`Verwaltung`, `<span class="minus">−${eur(c.verwaltungJahr / 12)}</span>`)}
          ${zeile(`Instandhaltung (${zahl(s.instandhaltungProQmJahr)} €/m²·a)`, `<span class="minus">−${eur(c.instandhaltungJahr / 12)}</span>`)}
          ${zeile(`Mietausfallwagnis (${zahl(s.mietausfallwagnis, 1)} %)`, `<span class="minus">−${eur(c.mietausfallJahr / 12)}</span>`)}
          ${c.hausgeldNichtUmlagefaehigJahr > 0 ? zeile('Hausgeld (nicht umlagefähig)', `<span class="minus">−${eur(c.hausgeldNichtUmlagefaehigJahr / 12)}</span>`) : ''}
          ${zeile('Nettomietertrag', `${eur(c.nettomietertragJahr / 12)} / Monat`, 'zeile--summe')}
          ${zeile('Kapitaldienst', `<span class="minus">−${eur(c.annuitaetMonat)}</span>`)}
          ${zeile(
            'Cashflow vor Steuer',
            `<span class="${c.cashflowMonatVorSteuer >= 0 ? 'plus' : 'minus'}">${eurVorzeichen(c.cashflowMonatVorSteuer)} / Monat</span>`,
            'zeile--summe',
          )}
          ${
            steuer
              ? zeile('Steuereffekt', `<span class="${c.steuerEffekt >= 0 ? 'plus' : 'minus'}">${eurVorzeichen(c.steuerEffekt / 12)} / Monat</span>`) +
                zeile('AfA (Jahr)', eur(c.afaJahr)) +
                zeile(
                  'Cashflow nach Steuer',
                  `<span class="${c.cashflowMonatNachSteuer >= 0 ? 'plus' : 'minus'}">${eurVorzeichen(c.cashflowMonatNachSteuer)} / Monat</span>`,
                  'zeile--summe',
                )
              : ''
          }
          ${zeile('Vermögenszuwachs inkl. Tilgung', `<span class="plus">${eurVorzeichen(c.cashflowMonatVorSteuer + c.tilgungJahr1 / 12)} / Monat</span>`)}
        </div>
      </div>
    </div>`;
}

function mietBlockHtml(listing, c) {
  const quelleText = {
    angebot: 'Mietangebot laut Inserat',
    expose: 'Mieteinnahme laut Exposé',
    geschaetzt: `geschätzt aus ${listing.marktmieteQuelle || 'Regionalindex'}`,
    unbekannt: 'unbekannt',
  }[listing.mietQuelle] || 'unbekannt';

  const diff = c.mietsteigerungPotenzialProzent;

  return `
    <div class="block">
      <div class="block__titel">Miete heute und Potenzial <span class="leise">${esc(quelleText)}</span></div>
      <div class="spalten2">
        <div>
          ${zeile('Ist-Kaltmiete', `${eur(c.istMieteMonat)} / Monat`)}
          ${zeile('je m²', listing.wohnflaeche ? `${eur(c.istMieteMonat / listing.wohnflaeche, 2)} / m²` : '–')}
          ${zeile('Jahresmiete', eur(c.mieteJahr))}
        </div>
        <div>
          ${zeile('Marktmiete (geschätzt)', `${eur(c.potenzialMieteMonat)} / Monat`)}
          ${zeile('je m²', listing.marktmieteProQm ? `${eur(listing.marktmieteProQm, 2)} / m²` : '–')}
          ${zeile(
            diff === null ? 'Abstand zur Ist-Miete' : diff >= 0 ? 'Mietpotenzial' : 'Ist-Miete über Markt',
            diff === null
              ? '–'
              : `<span class="${diff >= 0 ? 'plus' : 'minus'}">${diff >= 0 ? '+' : '−'}${zahl(Math.abs(diff), 1)} %</span>`,
          )}
          ${zeile(
            'Cashflow zur Marktmiete',
            `<span class="${c.cashflowMonatPotenzial >= 0 ? 'plus' : 'minus'}">${eurVorzeichen(c.cashflowMonatPotenzial)} / Monat</span>`,
            'zeile--summe',
          )}
        </div>
      </div>
    </div>`;
}

function bewertungsBlockHtml(analyse) {
  const farbe =
    analyse.score >= 78
      ? 'var(--gruen)'
      : analyse.score >= 62
        ? 'var(--akzent)'
        : analyse.score >= 45
          ? 'var(--gelb)'
          : 'var(--rot)';
  return `
    <div class="block">
      <div class="block__titel">Gesamtbewertung</div>
      <div class="scoreleiste">
        <div class="scoreleiste__balken">
          <div class="scoreleiste__fuellung" style="width:${analyse.score}%;background:${farbe}"></div>
        </div>
        <div class="scoreleiste__zahl" style="color:${farbe}">${analyse.score}/100</div>
      </div>
      <div style="font-size:12.5px;color:var(--text-leise)">
        ${esc(analyse.bewertung.lang)} — ${analyse.pro.length} Pluspunkte, ${analyse.contra.length} Minuspunkte,
        ${analyse.hinweise.length} Hinweise. Die Bewertung gewichtet Cashflow, Kaufpreisfaktor, Zustand,
        Energie, Rechtslage und Mietpotenzial.
      </div>
    </div>`;
}

function punktHtml(p) {
  const icon = p.typ === 'pro' ? '▲' : p.typ === 'contra' ? '▼' : '●';
  return `
    <div class="punkt punkt--${p.typ}">
      <div class="punkt__icon">${icon}</div>
      <div>
        <div class="punkt__titel">${esc(p.titel)}</div>
        <div class="punkt__text">${esc(p.text)}</div>
        <div class="punkt__kat">${esc(p.kategorie)}</div>
      </div>
    </div>`;
}

function punkteBlockHtml(analyse) {
  return `
    <div class="spalten2">
      <div class="block">
        <div class="block__titel">Positiv <span class="leise">${analyse.pro.length}</span></div>
        <div class="punkte">
          ${analyse.pro.length ? analyse.pro.map(punktHtml).join('') : '<div class="punkt__text">Keine ausgeprägten Pluspunkte erkannt.</div>'}
        </div>
      </div>
      <div class="block">
        <div class="block__titel">Negativ <span class="leise">${analyse.contra.length}</span></div>
        <div class="punkte">
          ${analyse.contra.length ? analyse.contra.map(punktHtml).join('') : '<div class="punkt__text">Keine klaren Minuspunkte erkannt.</div>'}
        </div>
      </div>
    </div>
    ${
      analyse.hinweise.length
        ? `<div class="block">
             <div class="block__titel">Wichtige Hinweise <span class="leise">${analyse.hinweise.length}</span></div>
             <div class="punkte">${analyse.hinweise.map(punktHtml).join('')}</div>
           </div>`
        : ''
    }`;
}

function objektBlockHtml(listing, reno) {
  const merkmale = [
    ['Wohnfläche', qm(listing.wohnflaeche)],
    ['Zimmer', listing.zimmer ? zahl(listing.zimmer, 1) : '–'],
    ['Baujahr', listing.baujahr || '–'],
    ['Zustand', listing.zustand || '–'],
    ['Energieklasse', listing.energieklasse || '–'],
    ['Energiekennwert', listing.energiekennwert ? `${zahl(listing.energiekennwert)} kWh/m²·a` : '–'],
    ['Heizung', listing.heizungsart || listing.befeuerung || '–'],
    ['Etage', listing.etage !== null && listing.etage !== undefined ? `${listing.etage}${listing.etagenGesamt ? ` von ${listing.etagenGesamt}` : ''}` : '–'],
    ['Hausgeld', listing.hausgeldMonat ? `${eur(listing.hausgeldMonat)} / Monat` : '–'],
    ['Vermietet', listing.vermietet ? 'ja' : listing.vermietet === false ? 'nein' : '–'],
    ['Stellplätze', listing.stellplaetze ?? '–'],
    ['Bundesland', listing.bundesland || '–'],
    ['Courtage', listing.courtageText || (listing.provisionsfrei ? 'provisionsfrei' : '–')],
    ['Anbieter', listing.anbieter || (listing.privatanbieter ? 'Privatanbieter' : '–')],
    ['Grundstück', listing.grundstueck ? qm(listing.grundstueck) : '–'],
    ['Frei ab', listing.freiAb || '–'],
  ].filter(([, wert]) => wert !== '–' || true);

  return `
    <div class="block">
      <div class="block__titel">Objektdaten</div>
      <div class="spalten2">
        <div>${merkmale.slice(0, Math.ceil(merkmale.length / 2)).map(([l, w]) => zeile(l, esc(String(w)))).join('')}</div>
        <div>${merkmale.slice(Math.ceil(merkmale.length / 2)).map(([l, w]) => zeile(l, esc(String(w)))).join('')}</div>
      </div>
      ${
        reno && reno.stufe !== 'keine' && reno.bis > 0
          ? `<div style="margin-top:10px;font-size:12px;color:var(--text-leise)">
               <strong style="color:var(--text)">Renovierungsbudget grob:</strong>
               ${eur(reno.von)} – ${eur(reno.bis)}
               <span style="opacity:.75">(${
                 { kernsanierung: 'Kernsanierung 600–1.200 €/m²', renovierung: 'Renovierung 250–500 €/m²', altbestand: 'Altbestand 150–400 €/m²', gering: 'Puffer bis 150 €/m²' }[reno.stufe]
               })</span>
             </div>`
          : ''
      }
    </div>`;
}

function verhandlungsBlockHtml(c, maxPreis, s) {
  const differenz = maxPreis !== null ? maxPreis - c.kaufpreis : null;
  const rabatt = maxPreis !== null && c.kaufpreis > 0 ? ((c.kaufpreis - maxPreis) / c.kaufpreis) * 100 : null;

  return `
    <div class="block">
      <div class="block__titel">Was der Deal verträgt <span class="leise">bei Ziel ${eurVorzeichen(s.zielCashflow)} / Monat</span></div>
      <div class="spalten2">
        <div>
          ${zeile('Maximaler Kaufpreis', maxPreis === null ? '–' : eur(maxPreis))}
          ${zeile(
            differenz === null ? 'Spielraum' : differenz >= 0 ? 'Puffer über Angebotspreis' : 'Nötiger Nachlass',
            differenz === null
              ? '–'
              : `<span class="${differenz >= 0 ? 'plus' : 'minus'}">${eurVorzeichen(differenz)}</span>`,
          )}
          ${zeile('entspricht', rabatt === null ? '–' : `${zahl(Math.abs(rabatt), 1)} % ${rabatt > 0 ? 'Nachlass' : 'Aufschlag möglich'}`)}
        </div>
        <div>
          ${zeile('Break-even-Zins', c.breakEvenZins !== null && c.breakEvenZins > 0 ? prozent(c.breakEvenZins, 2) : 'schon negativ')}
          ${zeile('Zinspuffer', c.breakEvenZins !== null ? `${zahl(c.breakEvenZins - s.zinssatz, 2)} Prozentpunkte` : '–')}
          ${zeile('Kapitaldienstdeckung (DSCR)', c.dscr !== null ? zahl(c.dscr, 2) : '–')}
          ${zeile('Eigenkapitalrendite', c.eigenkapitalrendite !== null ? prozent(c.eigenkapitalrendite, 1) : 'kein EK eingesetzt')}
        </div>
      </div>
    </div>`;
}

function prognoseBlockHtml(prog, c) {
  const zeilen = prog
    .map(
      (p) => `
      <tr>
        <td>Jahr ${p.jahr}</td>
        <td>${eur(p.miete / 12)}</td>
        <td>${eur(p.zins / 12)}</td>
        <td>${eur(p.tilgung / 12)}</td>
        <td class="${p.cashflowMonat >= 0 ? 'plus' : 'minus'}">${eurVorzeichen(p.cashflowMonat)}</td>
        <td>${eur(p.restschuld)}</td>
      </tr>`,
    )
    .join('');

  return `
    <div class="block">
      <div class="block__titel">Prognose <span class="leise">Restschuld nach ${c.zinsbindung} Jahren: ${eur(c.restschuld)} · getilgt ${eur(c.getilgt)}</span></div>
      <table class="tabelle">
        <thead>
          <tr><th>Jahr</th><th>Miete/Mon.</th><th>Zins/Mon.</th><th>Tilgung/Mon.</th><th>Cashflow/Mon.</th><th>Restschuld</th></tr>
        </thead>
        <tbody>${zeilen}</tbody>
      </table>
    </div>`;
}

function beschreibungsBlockHtml(listing) {
  const teile = [
    listing.beschreibung && `${listing.beschreibung}`,
    listing.ausstattungText && `\n\nAusstattung\n${listing.ausstattungText}`,
    listing.lageText && `\n\nLage\n${listing.lageText}`,
    listing.sonstigesText && `\n\nSonstiges\n${listing.sonstigesText}`,
  ].filter(Boolean);

  if (!teile.length) {
    return `
      <div class="block">
        <div class="block__titel">Beschreibung</div>
        <div class="punkt__text">Für dieses Angebot liegt kein Beschreibungstext vor. ${
          listing.quelle === 'is24' ? 'Öffne das Exposé bei ImmoScout24 für den Volltext.' : ''
        }</div>
      </div>`;
  }

  return `
    <div class="block">
      <div class="block__titel">Beschreibung im Exposé</div>
      <div class="beschreibung">${esc(teile.join(''))}</div>
      <button class="mehr" type="button">Vollständige Beschreibung anzeigen</button>
    </div>`;
}

/* ------------------------------------------------------------------ */
/*  Datenabruf                                                         */
/* ------------------------------------------------------------------ */

async function ladeAngebote() {
  zustand.laden = true;
  zustand.fehler = null;
  $('suchen').disabled = true;
  $('suchen').textContent = 'lädt …';
  zeichneListe();
  zeichneStatistik();

  const params = new URLSearchParams({
    stadt: $('ort').value.trim() || 'Leipzig',
    radius: $('radius').value,
    objektart: $('objektart').value,
    proSeite: '40',
  });

  try {
    const antwort = await fetch(`/api/suche?${params}`);
    const daten = await antwort.json();
    if (!antwort.ok) throw new Error(daten.hinweis ? `${daten.fehler} — ${daten.hinweis}` : daten.fehler || 'Unbekannter Fehler');

    zustand.rohListings = daten.listings || [];
    zustand.modus = daten.modus;
    zustand.hinweis = daten.hinweis;
    zustand.zentrum = daten.zentrum;
    zustand.paging = daten.paging;
    zustand.auswahlId = null;
    aktualisiereModusZeile();
  } catch (err) {
    zustand.fehler = err.message;
    zustand.rohListings = [];
  } finally {
    zustand.laden = false;
    $('suchen').disabled = false;
    $('suchen').textContent = 'Angebote laden';
    zeichneAlles();
  }
}

function aktualisiereModusZeile() {
  const el = $('modusZeile');
  if (zustand.modus === 'live') {
    el.innerHTML = `<b>Live</b> · ${zustand.paging?.treffer ?? 0} Treffer bei ImmoScout24${zustand.zentrum ? ` rund um ${esc(zustand.zentrum.name)}` : ''}`;
  } else {
    el.innerHTML = '<b class="demo">Demo-Modus</b> · keine API-Zugangsdaten hinterlegt';
  }
}

async function ladeStatus() {
  try {
    const daten = await (await fetch('/api/status')).json();
    zustand.modus = daten.modus;
    aktualisiereModusZeile();
    $('apiUmgebung').value = daten.umgebung || 'live';
  } catch {
    $('modusZeile').textContent = 'Server nicht erreichbar';
  }
}

async function ladeStaedte() {
  try {
    const daten = await (await fetch('/api/staedte')).json();
    $('staedteListe').innerHTML = daten.staedte
      .map((s) => `<option value="${esc(s.name)}">${esc(s.name)} · ca. ${zahl(s.miete, 1)} €/m² Miete</option>`)
      .join('');
  } catch {
    /* Vorschlagsliste ist optional */
  }
}

/* ------------------------------------------------------------------ */
/*  API-Dialog                                                         */
/* ------------------------------------------------------------------ */

function verdrahteApiDialog() {
  const dialog = $('apiDialog');
  $('apiOeffnen').addEventListener('click', () => dialog.showModal());

  $('apiSpeichernBtn').addEventListener('click', async () => {
    const status = $('apiStatus');
    status.className = 'dialog__status';
    status.textContent = 'prüfe Zugangsdaten …';

    try {
      const antwort = await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientKey: $('apiKey').value,
          clientSecret: $('apiSecret').value,
          token: $('apiToken').value,
          tokenSecret: $('apiTokenSecret').value,
          umgebung: $('apiUmgebung').value,
          speichern: $('apiSpeichern').checked,
        }),
      });
      const daten = await antwort.json();

      if (daten.test?.ok) {
        status.className = 'dialog__status ok';
        status.textContent = `Verbindung steht (${daten.test.treffer} Treffer im Test, Umgebung ${daten.test.umgebung}).${daten.gespeichert ? ' In .env.local gespeichert.' : ''}`;
        zustand.modus = 'live';
        aktualisiereModusZeile();
        setTimeout(() => {
          dialog.close();
          ladeAngebote();
        }, 900);
      } else if (daten.credentials) {
        status.className = 'dialog__status fehler';
        status.textContent = `Zugangsdaten gespeichert, aber der Test schlug fehl: ${daten.test?.fehler || 'unbekannt'}${
          daten.test?.status === 401 ? ' — prüfe Key/Secret und die Freischaltung deines Kontos für die Search-API.' : ''
        }`;
      } else {
        status.className = 'dialog__status fehler';
        status.textContent = 'Consumer Key und Secret werden beide benötigt.';
      }
    } catch (err) {
      status.className = 'dialog__status fehler';
      status.textContent = `Fehler: ${err.message}`;
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Start                                                              */
/* ------------------------------------------------------------------ */

function verdrahteRegler() {
  const sofortNeu = [
    'zinssatz', 'tilgung', 'finanzierungsgrad', 'nkMitfinanzieren', 'zielCashflow', 'nurZiel',
    'mietbasisPotenzial', 'verwaltung', 'instandhaltung', 'mietausfall', 'notar', 'courtage',
    'grest', 'steuerAn', 'steuersatz', 'gebaeudeanteil', 'zinsbindung', 'mietsteigerung', 'sortierung',
  ];
  for (const id of sofortNeu) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener('input', () => {
      zeichneAlles();
      speichereEinstellungen();
    });
    el.addEventListener('change', () => {
      zeichneAlles();
      speichereEinstellungen();
    });
  }

  $('suchen').addEventListener('click', () => {
    speichereEinstellungen();
    ladeAngebote();
  });
  $('ort').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') ladeAngebote();
  });

  $('reglerToggle').addEventListener('click', () => {
    const regler = $('regler');
    const versteckt = regler.hasAttribute('hidden');
    if (versteckt) regler.removeAttribute('hidden');
    else regler.setAttribute('hidden', '');
    $('reglerToggle').textContent = versteckt ? 'Regler ausblenden' : 'Regler einblenden';
    $('reglerToggle').setAttribute('aria-expanded', String(versteckt));
  });

  // Tastaturnavigation in der Liste
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'j' && e.key !== 'k') return;
    const idx = zustand.gefiltert.findIndex((x) => x.listing.id === zustand.auswahlId);
    const richtung = e.key === 'ArrowDown' || e.key === 'j' ? 1 : -1;
    const neu = Math.max(0, Math.min(zustand.gefiltert.length - 1, idx + richtung));
    if (zustand.gefiltert[neu]) {
      e.preventDefault();
      zustand.auswahlId = zustand.gefiltert[neu].listing.id;
      zeichneListe();
      zeichneDetail();
      document.querySelector('.karte--aktiv')?.scrollIntoView({ block: 'nearest' });
    }
  });
}

async function start() {
  ladeEinstellungen();
  aktualisiereReglerBeschriftung();
  verdrahteRegler();
  verdrahteApiDialog();
  await Promise.all([ladeStatus(), ladeStaedte()]);
  await ladeAngebote();
}

start();
