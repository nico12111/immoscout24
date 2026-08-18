import test from 'node:test';
import assert from 'node:assert/strict';

import {
  berechneCashflow,
  berechneNebenkosten,
  restschuldNachJahren,
  zinsFuerZielCashflow,
  maxKaufpreisFuerZielCashflow,
  prognose,
} from '../shared/finance.js';
import { analysiere } from '../shared/analysis.js';
import { grunderwerbsteuerAusPlz, bundeslandAusPlz, schaetzeMarktmiete } from '../shared/regions.js';
import { ausSuchantwort, mitExpose, veredle } from '../server/normalize.js';
import { authorizationHeader } from '../server/oauth1.js';
import { demoListings } from '../server/demoData.js';

const beispiel = {
  id: 'x1',
  typ: 'kauf',
  kaufpreis: 200000,
  wohnflaeche: 70,
  istMieteKaltMonat: 800,
  potenzialMieteKaltMonat: 900,
  plz: '04109',
  stadt: 'Leipzig',
  grunderwerbsteuerSatz: 5.5,
  einheiten: 1,
};

test('Nebenkosten werden aus Steuersatz, Notar und Courtage summiert', () => {
  const nk = berechneNebenkosten(200000, { notarUndGrundbuch: 2, maklerprovision: 3.57 }, beispiel);
  assert.equal(nk.grunderwerbsteuer, 11000); // 5,5 %
  assert.equal(nk.notarUndGrundbuch, 4000); // 2,0 %
  assert.ok(Math.abs(nk.makler - 7140) < 1e-6); // 3,57 %
  assert.ok(Math.abs(nk.summe - 22140) < 1e-6);
  assert.ok(Math.abs(nk.quote - 11.07) < 0.01);
});

test('Courtage aus dem Angebot schlaegt den Fallback', () => {
  const nk = berechneNebenkosten(100000, { maklerprovision: null, maklerprovisionFallback: 3.57 }, {
    ...beispiel,
    courtageProzent: 0,
    provisionsfrei: true,
  });
  assert.equal(nk.makler, 0);
});

test('Annuitaet ist Zins plus Tilgung auf das Darlehen', () => {
  const c = berechneCashflow(beispiel, {
    zinssatz: 4,
    tilgung: 2,
    finanzierungsgrad: 100,
    nebenkostenMitfinanzieren: false,
  });
  assert.equal(c.darlehen, 200000);
  assert.equal(c.annuitaetJahr, 12000); // 6 % von 200.000
  assert.equal(c.annuitaetMonat, 1000);
  assert.equal(c.zinsJahr1, 8000);
  assert.equal(c.tilgungJahr1, 4000);
});

test('Nebenkosten mitfinanzieren erhoeht das Darlehen und senkt das Eigenkapital auf null', () => {
  const ohne = berechneCashflow(beispiel, { finanzierungsgrad: 100, nebenkostenMitfinanzieren: false });
  const mit = berechneCashflow(beispiel, { finanzierungsgrad: 100, nebenkostenMitfinanzieren: true });
  assert.equal(ohne.eigenkapital, ohne.nebenkosten.summe);
  assert.equal(mit.eigenkapital, 0);
  assert.ok(mit.darlehen > ohne.darlehen);
  assert.ok(mit.cashflowMonatVorSteuer < ohne.cashflowMonatVorSteuer);
});

test('Cashflow = Miete minus Bewirtschaftung minus Annuitaet', () => {
  const c = berechneCashflow(beispiel, {
    zinssatz: 3,
    tilgung: 2,
    finanzierungsgrad: 100,
    nebenkostenMitfinanzieren: false,
    verwaltungProMonat: 25,
    instandhaltungProQmJahr: 12,
    mietausfallwagnis: 3,
  });
  const mieteJahr = 800 * 12;
  const bewirtschaftung = 25 * 12 + 12 * 70 + mieteJahr * 0.03;
  const erwartet = (mieteJahr - bewirtschaftung - 200000 * 0.05) / 12;
  assert.ok(Math.abs(c.cashflowMonatVorSteuer - erwartet) < 0.001);
});

test('Hoeherer Zins senkt den Cashflow monoton', () => {
  const werte = [2, 3, 4, 5, 6].map(
    (z) => berechneCashflow(beispiel, { zinssatz: z, tilgung: 2 }).cashflowMonatVorSteuer,
  );
  for (let i = 1; i < werte.length; i += 1) assert.ok(werte[i] < werte[i - 1]);
});

test('Kennzahlen: Faktor, Renditen und Preis je m2', () => {
  const c = berechneCashflow(beispiel, {});
  assert.ok(Math.abs(c.kaufpreisfaktor - 200000 / 9600) < 1e-9);
  assert.ok(Math.abs(c.bruttorendite - 4.8) < 1e-9);
  assert.ok(Math.abs(c.preisProQm - 200000 / 70) < 1e-9);
  assert.ok(c.nettorendite < c.bruttorendite);
});

test('Break-even-Zins liefert tatsaechlich einen Cashflow von etwa null', () => {
  const s = { zinssatz: 3.5, tilgung: 2, finanzierungsgrad: 100 };
  const c = berechneCashflow(beispiel, s);
  const cfAmBreakEven = berechneCashflow(beispiel, { ...s, zinssatz: c.breakEvenZins }).cashflowMonatVorSteuer;
  assert.ok(Math.abs(cfAmBreakEven) < 1, `erwartet ~0, war ${cfAmBreakEven}`);
});

test('zinsFuerZielCashflow trifft das Ziel', () => {
  const s = { tilgung: 2, finanzierungsgrad: 100 };
  const zins = zinsFuerZielCashflow(beispiel, s, 100);
  const cf = berechneCashflow(beispiel, { ...s, zinssatz: zins }).cashflowMonatVorSteuer;
  assert.ok(Math.abs(cf - 100) < 1);
});

test('maxKaufpreisFuerZielCashflow trifft das Ziel', () => {
  const s = { zinssatz: 3.5, tilgung: 2, finanzierungsgrad: 100 };
  const preis = maxKaufpreisFuerZielCashflow(beispiel, s, 0);
  const cf = berechneCashflow({ ...beispiel, kaufpreis: preis }, s).cashflowMonatVorSteuer;
  assert.ok(Math.abs(cf) < 2, `erwartet ~0, war ${cf}`);
  assert.ok(preis > 0 && preis < beispiel.kaufpreis * 3);
});

test('Restschuld sinkt und liegt unter dem Darlehen', () => {
  const rest = restschuldNachJahren(200000, 4, 12000, 10);
  assert.ok(rest < 200000);
  assert.ok(rest > 0);
  assert.ok(restschuldNachJahren(200000, 4, 12000, 20) < rest);
});

test('Restschuld bei Nullzins ist reine Tilgung', () => {
  assert.equal(restschuldNachJahren(100000, 0, 10000, 4), 60000);
});

test('Prognose steigt mit der Mietsteigerung und tilgt die Restschuld', () => {
  const reihen = prognose(beispiel, { zinssatz: 3.5, tilgung: 2, mietsteigerungProJahr: 2 }, 10);
  assert.equal(reihen.length, 10);
  assert.ok(reihen[9].miete > reihen[0].miete);
  assert.ok(reihen[9].restschuld < reihen[0].restschuld);
  assert.ok(reihen[9].cashflowMonat > reihen[0].cashflowMonat);
});

test('Steuereffekt greift nur, wenn er eingeschaltet ist', () => {
  const ohne = berechneCashflow(beispiel, { steuerBeruecksichtigen: false });
  const mit = berechneCashflow(beispiel, { steuerBeruecksichtigen: true, steuersatz: 42 });
  assert.equal(ohne.steuerEffekt, 0);
  assert.equal(ohne.cashflowMonat, ohne.cashflowMonatVorSteuer);
  assert.notEqual(mit.steuerEffekt, 0);
  assert.equal(mit.cashflowMonat, mit.cashflowMonatNachSteuer);
});

test('Potenzialmiete als Basis erhoeht den Cashflow', () => {
  const ist = berechneCashflow(beispiel, {}, { mietbasis: 'ist' });
  const pot = berechneCashflow(beispiel, {}, { mietbasis: 'potenzial' });
  assert.ok(pot.cashflowMonatVorSteuer > ist.cashflowMonatVorSteuer);
  assert.ok(Math.abs(ist.mietsteigerungPotenzialProzent - 12.5) < 1e-9);
});

test('Objekt ohne Kaufpreis erzeugt keine NaN-Werte', () => {
  const c = berechneCashflow({ ...beispiel, kaufpreis: 0, istMieteKaltMonat: 0 }, {});
  for (const [schluessel, wert] of Object.entries(c)) {
    if (typeof wert === 'number') assert.ok(Number.isFinite(wert), `${schluessel} ist ${wert}`);
  }
  assert.equal(c.kaufpreisfaktor, null);
});

test('Grunderwerbsteuer und Bundesland kommen aus der PLZ', () => {
  assert.equal(bundeslandAusPlz('80331'), 'Bayern');
  assert.equal(grunderwerbsteuerAusPlz('80331'), 3.5);
  assert.equal(bundeslandAusPlz('10115'), 'Berlin');
  assert.equal(grunderwerbsteuerAusPlz('10115'), 6.0);
  assert.equal(grunderwerbsteuerAusPlz('04109'), 5.5); // Sachsen
});

test('Marktmiete beruecksichtigt Flaeche und Zustand', () => {
  const klein = schaetzeMarktmiete({ wohnflaeche: 30, plz: '10115', stadt: 'Berlin' }, {});
  const gross = schaetzeMarktmiete({ wohnflaeche: 150, plz: '10115', stadt: 'Berlin' }, {});
  assert.ok(klein.proQm > gross.proQm);

  const saniert = schaetzeMarktmiete({ wohnflaeche: 70, stadt: 'Berlin' }, { kernsaniert: true });
  const marode = schaetzeMarktmiete({ wohnflaeche: 70, stadt: 'Berlin' }, { renovierungsbedarf: true });
  assert.ok(saniert.monat > marode.monat);
});

test('Analyse erkennt Risiken im Freitext', () => {
  const a = analysiere(
    { ...beispiel, beschreibung: 'Die Wohnung ist sanierungsbedürftig und steht im Erbbaurecht. Ölheizung von 1990.' },
    null,
    {},
  );
  const ids = a.contra.map((p) => p.id);
  assert.ok(ids.includes('sanierungsbeduerftig'));
  assert.ok(ids.includes('erbbaurecht'));
  assert.ok(ids.includes('oelheizung'));
  assert.equal(a.flags.renovierungsbedarf, true);
  assert.equal(a.flags.erbbaurecht, true);
  assert.ok(a.score < 50);
});

test('Analyse erkennt Pluspunkte und vergibt hoeheren Score', () => {
  const gut = analysiere(
    {
      ...beispiel,
      baujahr: 2022,
      energieklasse: 'A',
      beschreibung: 'Neubau mit Wärmepumpe, provisionsfrei, vermietet, Aufzug und Tiefgarage. Sehr gute Anbindung, U-Bahn in 200 m.',
      bilder: [{ url: 'x' }],
    },
    null,
    {},
  );
  const schlecht = analysiere({ ...beispiel, baujahr: 1930, energieklasse: 'H', beschreibung: 'renovierungsbedürftig' }, null, {});
  assert.ok(gut.score > schlecht.score);
  assert.ok(gut.pro.length >= 4);
});

test('Analyse bewertet den Cashflow gegen das gesetzte Ziel', () => {
  const c = berechneCashflow(beispiel, { zinssatz: 3, tilgung: 2 });
  const mitZiel = analysiere(beispiel, c, { zielCashflow: 1000, zinssatz: 3, tilgung: 2 });
  const ohneZiel = analysiere(beispiel, c, { zielCashflow: 0, zinssatz: 3, tilgung: 2 });
  assert.ok(mitZiel.alle.some((p) => p.id === 'cashflow_negativ' || p.id === 'cashflow_positiv'));
  assert.ok(ohneZiel.alle.some((p) => ['cashflow_positiv', 'cashflow_negativ'].includes(p.id)));
});

test('Suchantwort wird auch bei Einzeltreffern korrekt gelesen', () => {
  const einzeln = {
    'resultlist.resultlist': {
      paging: { pageNumber: 1, pageSize: 20, numberOfPages: 1, numberOfHits: 1 },
      resultlistEntries: {
        resultlistEntry: {
          '@id': '123',
          '@publishDate': '2024-01-01T00:00:00.000+01:00',
          realEstateId: 123,
          'resultlist.realEstate': {
            '@xsi.type': 'search:ApartmentBuy',
            title: 'Test',
            address: { postcode: '10115', city: 'Berlin', wgs84Coordinate: { latitude: 52.5, longitude: 13.4 } },
            price: { value: 300000 },
            livingSpace: 60,
            numberOfRooms: 2,
          },
        },
      },
    },
  };
  const { paging, listings } = ausSuchantwort(einzeln, 'ApartmentBuy');
  assert.equal(paging.treffer, 1);
  assert.equal(listings.length, 1);
  assert.equal(listings[0].kaufpreis, 300000);
  assert.equal(listings[0].stadt, 'Berlin');
  assert.equal(listings[0].typ, 'kauf');
  assert.equal(listings[0].bundesland, 'Berlin');
});

test('Mietobjekte landen in der Ist-Miete statt im Kaufpreis', () => {
  const antwort = {
    'resultlist.resultlist': {
      paging: { numberOfHits: 1 },
      resultlistEntries: [
        {
          resultlistEntry: [
            {
              '@id': '9',
              'resultlist.realEstate': {
                '@xsi.type': 'search:ApartmentRent',
                title: 'Miete',
                address: { postcode: '04109', city: 'Leipzig' },
                price: { value: 750 },
                livingSpace: 65,
              },
            },
          ],
        },
      ],
    },
  };
  const { listings } = ausSuchantwort(antwort, 'ApartmentRent');
  assert.equal(listings[0].typ, 'miete');
  assert.equal(listings[0].istMieteKaltMonat, 750);
  assert.equal(listings[0].kaufpreis, 0);
});

test('Expose-Daten werden ins Listing gemischt', () => {
  const basis = { id: '1', typ: 'kauf', kaufpreis: 250000, bilder: [], wohnflaeche: 70 };
  const expose = {
    'expose.expose': {
      realEstate: {
        descriptionNote: 'Schöne Wohnung, kernsaniert.',
        constructionYear: 1965,
        livingSpace: 72,
        energyCertificate: { energyEfficiencyClass: 'D', thermalCharacteristic: 120 },
        courtage: { hasCourtage: 'YES', courtage: '3,57 % inkl. MwSt.' },
        serviceCharge: 200,
        lift: 'true',
        rented: 'true',
      },
    },
  };
  const gemischt = mitExpose(basis, expose);
  assert.equal(gemischt.baujahr, 1965);
  assert.equal(gemischt.wohnflaeche, 72);
  assert.equal(gemischt.energieklasse, 'D');
  assert.equal(gemischt.courtageProzent, 3.57);
  assert.equal(gemischt.provisionsfrei, false);
  assert.equal(gemischt.hausgeldMonat, 200);
  assert.ok(Math.abs(gemischt.hausgeldNichtUmlagefaehigMonat - 60) < 1e-9);
  assert.equal(gemischt.aufzug, true);
  assert.equal(gemischt.detailsGeladen, true);
});

test('Energieklasse wird notfalls aus dem Kennwert abgeleitet', () => {
  const gemischt = mitExpose(
    { id: '1', typ: 'kauf', bilder: [] },
    { 'expose.expose': { realEstate: { energyCertificate: { thermalCharacteristic: 45 } } } },
  );
  assert.equal(gemischt.energieklasse, 'A');
});

test('veredle ergaenzt geschaetzte Miete, wenn keine vorliegt', () => {
  const l = veredle({
    id: '1',
    typ: 'kauf',
    kaufpreis: 200000,
    wohnflaeche: 70,
    istMieteKaltMonat: 0,
    plz: '04109',
    stadt: 'Leipzig',
    bilder: [],
  });
  assert.equal(l.mietQuelle, 'geschaetzt');
  assert.ok(l.istMieteKaltMonat > 0);
  assert.equal(l.potenzialMieteKaltMonat, l.istMieteKaltMonat);
});

test('veredle behaelt eine vorhandene Miete und setzt Potenzial mindestens darauf', () => {
  const l = veredle({
    id: '1',
    typ: 'kauf',
    kaufpreis: 200000,
    wohnflaeche: 70,
    istMieteKaltMonat: 400,
    plz: '10115',
    stadt: 'Berlin',
    bilder: [],
    mietQuelle: 'expose',
  });
  assert.equal(l.istMieteKaltMonat, 400);
  assert.ok(l.potenzialMieteKaltMonat > 400);
});

test('Ist-Miete ueber Marktniveau wird als Risiko erkannt', () => {
  // 70 m2 in Chemnitz zu 1.400 EUR liegt weit ueber dem oertlichen Niveau.
  const l = veredle({
    id: '1',
    typ: 'kauf',
    kaufpreis: 180000,
    wohnflaeche: 70,
    istMieteKaltMonat: 1400,
    plz: '09111',
    stadt: 'Chemnitz',
    bilder: [{ url: 'x' }],
    mietQuelle: 'expose',
  });
  assert.ok(l.potenzialMieteKaltMonat < l.istMieteKaltMonat, 'Marktmiete muss unter der Ist-Miete liegen duerfen');

  const c = berechneCashflow(l, { zinssatz: 3.5, tilgung: 2 });
  assert.ok(c.mietsteigerungPotenzialProzent < -10);
  const a = analysiere(l, c, {});
  assert.ok(
    a.contra.some((p) => p.id === 'miete_ueber_markt'),
    'Warnung vor uebermarktlicher Bestandsmiete fehlt',
  );
  // Zur Marktmiete gerechnet muss der Cashflow schlechter sein als zur Ist-Miete.
  assert.ok(c.cashflowMonatPotenzial < c.cashflowMonatVorSteuer);
});

test('OAuth-Signatur folgt dem RFC-5849-Beispiel-Aufbau', () => {
  const header = authorizationHeader({
    method: 'GET',
    url: 'https://rest.immobilienscout24.de/restapi/api/search/v1.0/search/radius?realestatetype=ApartmentBuy&geocoordinates=52.5;13.4;5',
    consumerKey: 'key',
    consumerSecret: 'secret',
  });
  assert.match(header, /^OAuth /);
  assert.match(header, /oauth_consumer_key="key"/);
  assert.match(header, /oauth_signature_method="HMAC-SHA1"/);
  assert.match(header, /oauth_signature="[^"]+"/);
  assert.match(header, /oauth_nonce="[a-f0-9]{32}"/);
});

test('OAuth-Signatur ist reproduzierbar bei gleichen Eingaben', () => {
  // Nonce und Zeitstempel unterscheiden sich, die Struktur muss aber stabil sein.
  const a = authorizationHeader({ method: 'GET', url: 'https://x.de/a?b=1', consumerKey: 'k', consumerSecret: 's' });
  const b = authorizationHeader({ method: 'GET', url: 'https://x.de/a?b=1', consumerKey: 'k', consumerSecret: 's' });
  assert.notEqual(a, b); // Nonce macht sie unterschiedlich
  assert.equal(a.split(',').length, b.split(',').length);
});

test('Demo-Daten sind vollstaendig und rechenbar', () => {
  const listings = demoListings({ stadt: 'Leipzig', anzahl: 10, radiusKm: 10 }).map(veredle);
  assert.ok(listings.length >= 8);
  for (const l of listings) {
    assert.ok(l.kaufpreis > 0, 'Kaufpreis fehlt');
    assert.ok(l.wohnflaeche > 0, 'Flaeche fehlt');
    assert.ok(l.bilder.length > 0, 'Bilder fehlen');
    const c = berechneCashflow(l, { zinssatz: 3.5, tilgung: 2 });
    assert.ok(Number.isFinite(c.cashflowMonatVorSteuer));
    const a = analysiere(l, c, { zielCashflow: 100 });
    assert.ok(a.score >= 0 && a.score <= 100);
    assert.ok(a.alle.length > 0);
  }
});

test('Demo-Daten reagieren auf die gewaehlte Stadt', () => {
  const leipzig = demoListings({ stadt: 'Leipzig', anzahl: 10 }).map(veredle);
  const muenchen = demoListings({ stadt: 'München', anzahl: 10 }).map(veredle);
  assert.equal(muenchen[0].stadt, 'München');
  const schnittL = leipzig.reduce((a, l) => a + l.kaufpreis, 0) / leipzig.length;
  const schnittM = muenchen.reduce((a, l) => a + l.kaufpreis, 0) / muenchen.length;
  assert.ok(schnittM > schnittL, 'München sollte teurer sein als Leipzig');
});
