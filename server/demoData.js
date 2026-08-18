/**
 * Demo-Angebote fuer den Betrieb ohne API-Zugang.
 * Die Struktur entspricht exakt dem normalisierten Modell aus normalize.js,
 * damit Oberflaeche und Rechenkern identisch arbeiten.
 */
import { grunderwerbsteuerAusPlz, bundeslandAusPlz, findeStadt, STAEDTE } from '../shared/regions.js';

const VORLAGEN = [
  {
    titel: '3-Zi-ETW im Bestand, vermietet – solide Rendite',
    objekttyp: 'ApartmentBuy',
    faktor: 18.5,
    flaeche: 72,
    zimmer: 3,
    baujahr: 1968,
    energieklasse: 'E',
    zustand: 'gepflegt',
    beschreibung:
      'Vermietete 3-Zimmer-Wohnung in ruhiger Wohnlage. Die Wohnung ist seit acht Jahren an eine ruhige Mieterin vermietet, die Miete liegt deutlich unter dem Mietspiegel. Das Objekt ist gepflegt, das Bad wurde 2015 modernisiert. Fenster wurden 2012 erneuert. Aufzug ist vorhanden, ein Stellplatz gehört zur Einheit.',
    ausstattung: 'Aufzug, Kellerabteil, Stellplatz, Balkon nach Süden, Laminat, Bad mit Fenster.',
    lage: 'Gute Anbindung, U-Bahn in 400 m, Nahversorgung fußläufig.',
    mieteUnterMarkt: 0.78,
    hausgeld: 240,
    courtage: 3.57,
  },
  {
    titel: 'Renovierungsbedürftige 2-Zi-Wohnung – Potenzial für Aufwerter',
    objekttyp: 'ApartmentBuy',
    faktor: 14.0,
    flaeche: 54,
    zimmer: 2,
    baujahr: 1955,
    energieklasse: 'G',
    zustand: 'renovierungsbedürftig',
    beschreibung:
      'Die Wohnung ist renovierungsbedürftig und wird im aktuellen Zustand verkauft. Böden, Bad und Elektrik stammen aus den 80er Jahren. Nach der Renovierung ist eine deutlich höhere Miete erzielbar. Die WEG hat eine Sonderumlage für die Fassadensanierung beschlossen.',
    ausstattung: 'Ofenheizung, Kellerabteil, kein Balkon.',
    lage: 'Innenstadtnah, viele Studenten im Viertel, Universität in 2 km.',
    mieteUnterMarkt: 0.7,
    hausgeld: 190,
    courtage: 3.57,
    leerstand: true,
  },
  {
    titel: 'Neubau-ETW mit Wärmepumpe – Erstbezug, provisionsfrei',
    objekttyp: 'ApartmentBuy',
    faktor: 29.0,
    flaeche: 63,
    zimmer: 2,
    baujahr: 2024,
    energieklasse: 'A',
    zustand: 'Erstbezug',
    beschreibung:
      'Neubau mit Erstbezug, schlüsselfertig übergeben. Wärmepumpe und Photovoltaik auf dem Dach, KfW-Effizienzhaus. Provisionsfrei direkt vom Bauträger. Die Wohnung ist bezugsfrei und kann sofort vermietet werden.',
    ausstattung: 'Fußbodenheizung, Aufzug, Tiefgarage, Balkon, Einbauküche.',
    lage: 'Neubaugebiet mit guter Anbindung, S-Bahn in 900 m.',
    mieteUnterMarkt: 1.0,
    hausgeld: 210,
    courtage: 0,
    leerstand: true,
  },
  {
    titel: 'Mehrfamilienhaus, 6 Einheiten, voll vermietet',
    objekttyp: 'Investment',
    faktor: 16.0,
    flaeche: 380,
    zimmer: 14,
    baujahr: 1974,
    energieklasse: 'F',
    zustand: 'gepflegt',
    einheiten: 6,
    beschreibung:
      'Zinshaus mit sechs Wohneinheiten, alle Wohnungen vermietet. Kapitalanlage mit stabilen Mieteinnahmen. Das Dach wurde 2019 neu gedeckt, die Gasheizung stammt von 2010. Mietaufstellung liegt vor, die Mieten liegen unter dem örtlichen Mietspiegel.',
    ausstattung: 'Kellerräume, Garagenhof mit 4 Stellplätzen, Gartenanteil.',
    lage: 'Etablierte Wohnlage, Nahversorgung und Schule in der Nähe.',
    mieteUnterMarkt: 0.82,
    hausgeld: 0,
    courtage: 5.95,
  },
  {
    titel: 'ETW im Erbbaurecht – niedriger Kaufpreis',
    objekttyp: 'ApartmentBuy',
    faktor: 12.5,
    flaeche: 68,
    zimmer: 3,
    baujahr: 1979,
    energieklasse: 'D',
    zustand: 'gepflegt',
    beschreibung:
      'Wohnung im Erbbaurecht mit einer Restlaufzeit von 44 Jahren. Der jährliche Erbbauzins beträgt 1.450 €. Dadurch ist der Kaufpreis deutlich niedriger als bei vergleichbaren Objekten. Wohnung ist vermietet.',
    ausstattung: 'Balkon, Kellerabteil, Stellplatz.',
    lage: 'Ruhige Randlage, Bus in 200 m.',
    mieteUnterMarkt: 0.9,
    hausgeld: 265,
    courtage: 3.57,
  },
  {
    titel: 'Kernsanierte Altbauwohnung mit Stuck',
    objekttyp: 'ApartmentBuy',
    faktor: 26.0,
    flaeche: 88,
    zimmer: 3,
    baujahr: 1908,
    energieklasse: 'C',
    zustand: 'kernsaniert',
    beschreibung:
      'Kernsaniert im Jahr 2022: Elektrik, Leitungen, Bäder und Böden komplett erneuert, Stuck erhalten. Fernwärme. Die Wohnung ist bezugsfrei und lässt sich sofort zur Marktmiete vermieten.',
    ausstattung: 'Parkett, Fußbodenheizung im Bad, Gäste-WC, Balkon zum Hof.',
    lage: 'Szeneviertel, sehr gute Anbindung, U-Bahn in 300 m.',
    mieteUnterMarkt: 1.0,
    hausgeld: 280,
    courtage: 3.57,
    leerstand: true,
  },
  {
    titel: 'Kompakte 1-Zi-Wohnung, möbliert vermietet',
    objekttyp: 'ApartmentBuy',
    faktor: 21.0,
    flaeche: 31,
    zimmer: 1,
    baujahr: 1996,
    energieklasse: 'D',
    zustand: 'gepflegt',
    beschreibung:
      'Kleine Einheit, aktuell möbliert vermietet mit Staffelmiete. Ideal als Einstieg in die Kapitalanlage. Verwaltung ist eingespielt, Rücklage gut gefüllt.',
    ausstattung: 'Einbauküche, Duschbad, Fahrradkeller, Aufzug.',
    lage: 'Zentrale Lage, Hochschule fußläufig.',
    mieteUnterMarkt: 1.05,
    hausgeld: 145,
    courtage: 3.57,
  },
  {
    titel: 'Reihenmittelhaus, vermietet, Baujahr 1962',
    objekttyp: 'HouseBuy',
    faktor: 22.0,
    flaeche: 112,
    zimmer: 4,
    baujahr: 1962,
    energieklasse: 'F',
    zustand: 'gepflegt',
    beschreibung:
      'Reihenmittelhaus in gewachsener Siedlung, vermietet. Ölheizung von 2004, Fenster teilweise erneuert. Grundstück 210 m². Modernisierungsbedarf bei Heizung und Dämmung.',
    ausstattung: 'Garten, Garage, Keller, Gäste-WC.',
    lage: 'Ruhige Siedlungslage, Grundschule in der Nähe, Bus 300 m.',
    mieteUnterMarkt: 0.85,
    hausgeld: 0,
    courtage: 3.57,
    grundstueck: 210,
  },
  {
    titel: 'ETW mit Fernwärme, vermietet an Bestandsmieter',
    objekttyp: 'ApartmentBuy',
    faktor: 19.5,
    flaeche: 61,
    zimmer: 2,
    baujahr: 1988,
    energieklasse: 'C',
    zustand: 'gepflegt',
    beschreibung:
      'Vermietete Zweizimmerwohnung mit Fernwärme, Bestandsmieter seit 2019. Die Wohnung ist gepflegt, Bad 2018 modernisiert. Hausverwaltung professionell, Instandhaltungsrücklage gut dotiert.',
    ausstattung: 'Balkon, Aufzug, Tiefgaragenstellplatz, Kellerabteil.',
    lage: 'Gute Anbindung, Straßenbahn in 250 m, Einkaufszentrum in 600 m.',
    mieteUnterMarkt: 0.88,
    hausgeld: 195,
    courtage: 2.38,
  },
  {
    titel: 'Vermietete 3-Zi-Wohnung in B-Lage – Faktor 11',
    objekttyp: 'ApartmentBuy',
    faktor: 11.0,
    flaeche: 66,
    zimmer: 3,
    baujahr: 1994,
    energieklasse: 'D',
    zustand: 'gepflegt',
    beschreibung:
      'Vermietete Wohnung in einer Mittelstadt mit stabilem Mietermarkt. Die Miete liegt leicht unter dem Mietspiegel, der Kaufpreisfaktor bei rund 11. Kapitalanlage mit sofortigem Überschuss. Verwaltung eingespielt, Rücklage vorhanden.',
    ausstattung: 'Balkon, Kellerabteil, Stellplatz, Bad mit Fenster.',
    lage: 'Gewachsenes Wohngebiet, Bus und Nahversorgung fußläufig, gute Anbindung zur Innenstadt.',
    mieteUnterMarkt: 0.95,
    hausgeld: 175,
    courtage: 3.57,
  },
  {
    titel: 'Kleines Mehrfamilienhaus, 4 Einheiten, Faktor 12',
    objekttyp: 'Investment',
    faktor: 12.0,
    flaeche: 240,
    zimmer: 9,
    baujahr: 1982,
    energieklasse: 'E',
    zustand: 'gepflegt',
    einheiten: 4,
    beschreibung:
      'Zinshaus mit vier Wohneinheiten, vollständig vermietet, Kapitalanlage mit stabilem Überschuss. Dach 2016 saniert, Gasheizung 2018 erneuert. Mietaufstellung und Nebenkostenabrechnungen liegen vor. Die Mieten liegen unter dem Mietspiegel.',
    ausstattung: 'Kellerräume, vier Stellplätze, Gartenanteil, separater Fahrradkeller.',
    lage: 'Etablierte Wohnlage einer Mittelstadt, Schule und Nahversorgung in der Nähe.',
    mieteUnterMarkt: 0.9,
    hausgeld: 0,
    courtage: 3.57,
  },
  {
    titel: 'Zwei-Zimmer-Wohnung, hohe Rendite, einfache Ausstattung',
    objekttyp: 'ApartmentBuy',
    faktor: 12.8,
    flaeche: 49,
    zimmer: 2,
    baujahr: 1976,
    energieklasse: 'E',
    zustand: 'gepflegt',
    beschreibung:
      'Vermietete Zweizimmerwohnung mit einfacher, aber gepflegter Ausstattung. Bestandsmieter seit 2017, Staffelmiete vereinbart. Fernwärme im Haus, Fenster 2014 erneuert.',
    ausstattung: 'Balkon, Kellerabteil, Aufzug, Fernwärme.',
    lage: 'Wohnsiedlung mit Straßenbahnanschluss, Einkaufszentrum in 500 m.',
    mieteUnterMarkt: 0.98,
    hausgeld: 160,
    courtage: 0,
  },
  {
    titel: 'Souterrainwohnung, günstig, Sanierungsstau im Haus',
    objekttyp: 'ApartmentBuy',
    faktor: 13.0,
    flaeche: 46,
    zimmer: 2,
    baujahr: 1952,
    energieklasse: 'H',
    zustand: 'renovierungsbedürftig',
    beschreibung:
      'Souterrainwohnung mit niedrigem Kaufpreis. Im Haus besteht Instandhaltungsstau, eine Dachsanierung ist erforderlich. Im Bad wurden Feuchtigkeitsschäden festgestellt. Nachtspeicherheizung.',
    ausstattung: 'Kellerabteil, kein Balkon, Nachtspeicheröfen.',
    lage: 'An der Hauptstraße, Verkehrslärm, Bus direkt vor der Tür.',
    mieteUnterMarkt: 0.75,
    hausgeld: 165,
    courtage: 3.57,
  },
];

const BILD_FARBEN = ['1f6feb', '238636', '8957e5', 'bb8009', 'd29922', '1a7f64', 'a371f7'];

function platzhalterBild(seed, label) {
  const farbe = BILD_FARBEN[seed % BILD_FARBEN.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="#${farbe}"/><stop offset="100%" stop-color="#0d1117"/></linearGradient></defs>
<rect width="800" height="600" fill="url(#g)"/>
<g fill="rgba(255,255,255,.16)"><rect x="90" y="330" width="240" height="200"/><rect x="360" y="250" width="180" height="280"/><rect x="570" y="360" width="150" height="170"/></g>
<g fill="rgba(255,255,255,.28)"><rect x="120" y="360" width="40" height="40"/><rect x="180" y="360" width="40" height="40"/><rect x="240" y="360" width="40" height="40"/><rect x="120" y="430" width="40" height="40"/><rect x="180" y="430" width="40" height="40"/><rect x="390" y="290" width="45" height="45"/><rect x="460" y="290" width="45" height="45"/><rect x="390" y="370" width="45" height="45"/><rect x="460" y="370" width="45" height="45"/><rect x="600" y="400" width="40" height="40"/><rect x="660" y="400" width="40" height="40"/></g>
<text x="400" y="80" font-family="system-ui,sans-serif" font-size="30" fill="rgba(255,255,255,.85)" text-anchor="middle">${label}</text>
<text x="400" y="120" font-family="system-ui,sans-serif" font-size="17" fill="rgba(255,255,255,.5)" text-anchor="middle">Demo-Bild ohne API-Zugang</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

/** Deterministischer Pseudozufall, damit die Demo bei gleichem Filter stabil bleibt. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Demo-Angebote rund um eine Stadt erzeugen.
 * @param {object} o
 * @param {string} o.stadt
 * @param {number} o.anzahl
 * @param {number} o.radiusKm
 */
export function demoListings({ stadt = 'Leipzig', anzahl = 24, radiusKm = 15, realestatetype = 'ApartmentBuy' } = {}) {
  const zentrum = findeStadt(stadt) || STAEDTE.find((s) => s.name === 'Leipzig');
  const zufall = rng(
    [...zentrum.name].reduce((a, c) => a + c.charCodeAt(0), 0) * 7 + Math.round(radiusKm),
  );
  const listings = [];

  for (let i = 0; i < anzahl; i += 1) {
    const v = VORLAGEN[i % VORLAGEN.length];
    if (realestatetype === 'HouseBuy' && v.objekttyp !== 'HouseBuy') continue;
    if (realestatetype === 'Investment' && v.objekttyp !== 'Investment') continue;

    const streuung = 0.82 + zufall() * 0.42;
    const flaeche = Math.round(v.flaeche * (0.9 + zufall() * 0.25));
    const marktMieteQm = zentrum.miete * (0.88 + zufall() * 0.28);
    const marktmiete = marktMieteQm * flaeche;
    const istMiete = Math.round(marktmiete * v.mieteUnterMarkt);
    const kaufpreis = Math.round(((istMiete * 12 * v.faktor) / 1000) * 1000 * streuung);

    // Koordinaten im Radius streuen
    const winkel = zufall() * Math.PI * 2;
    const dist = Math.sqrt(zufall()) * radiusKm;
    const lat = zentrum.lat + (dist / 111) * Math.cos(winkel);
    const lon = zentrum.lon + (dist / (111 * Math.cos((zentrum.lat * Math.PI) / 180))) * Math.sin(winkel);

    const id = `demo-${zentrum.name.slice(0, 3).toLowerCase()}-${1000 + i}`;
    const anzahlBilder = 2 + Math.floor(zufall() * 3);
    const stadtteil = ['Nord', 'Süd', 'Ost', 'West', 'Zentrum', 'Altstadt'][i % 6];
    // Vorlagen wiederholen sich; der Stadtteil macht die Titel in der Liste
    // unterscheidbar, statt zweimal dieselbe Zeile zu zeigen.
    const titel = i < VORLAGEN.length ? v.titel : `${v.titel} (${stadtteil})`;

    listings.push({
      id,
      quelle: 'demo',
      url: 'https://www.immobilienscout24.de/',
      titel,
      objekttyp: v.objekttyp,
      objekttypLabel:
        v.objekttyp === 'HouseBuy' ? 'Haus (Kauf)' : v.objekttyp === 'Investment' ? 'Anlageobjekt' : 'Eigentumswohnung',
      typ: 'kauf',

      strasse: ['Gartenstraße', 'Lindenweg', 'Bahnhofstraße', 'Am Park', 'Ringstraße', 'Schulstraße'][i % 6],
      hausnummer: String(3 + ((i * 7) % 60)),
      plz: zentrum.plz,
      stadt: zentrum.name,
      stadtteil,
      lat,
      lon,
      entfernungKm: Number(dist.toFixed(1)),
      bundesland: bundeslandAusPlz(zentrum.plz),
      grunderwerbsteuerSatz: grunderwerbsteuerAusPlz(zentrum.plz),

      kaufpreis,
      istMieteKaltMonat: v.leerstand ? 0 : istMiete,
      wohnflaeche: flaeche,
      grundstueck: v.grundstueck ?? null,
      zimmer: v.zimmer,
      einheiten: v.einheiten ?? 1,
      baujahr: v.baujahr,
      energieklasse: v.energieklasse,
      zustand: v.zustand,
      hausgeldMonat: v.hausgeld || null,
      hausgeldNichtUmlagefaehigMonat: v.hausgeld ? v.hausgeld * 0.3 : 0,

      balkon: /balkon/i.test(v.ausstattung),
      garten: /garten/i.test(v.ausstattung),
      einbaukueche: /einbauküche/i.test(v.ausstattung),
      aufzug: /aufzug/i.test(v.ausstattung),
      keller: /keller/i.test(v.ausstattung),
      stellplaetze: /stellplatz|garage|tiefgarage/i.test(v.ausstattung) ? 1 : 0,
      vermietet: !v.leerstand,
      provisionsfrei: v.courtage === 0,
      courtageProzent: v.courtage,
      courtageText: v.courtage === 0 ? 'provisionsfrei' : `${String(v.courtage).replace('.', ',')} % inkl. MwSt.`,

      beschreibung: v.beschreibung,
      ausstattungText: v.ausstattung,
      lageText: v.lage,
      sonstigesText: v.leerstand ? 'Bezugsfrei ab sofort.' : 'Vermietet, Mietvertrag wird übernommen.',
      anbieter: i % 3 === 0 ? 'Privatanbieter' : 'Demo Immobilien GmbH',
      privatanbieter: i % 3 === 0,

      veroeffentlicht: new Date(Date.now() - i * 86400000 * 2).toISOString(),
      bilder: Array.from({ length: anzahlBilder }, (_, b) =>
        ({ url: platzhalterBild(i + b, `${v.objekttyp === 'HouseBuy' ? 'Haus' : 'Wohnung'} ${flaeche} m²`), grundriss: false }),
      ),
      detailsGeladen: true,
    });
  }
  return listings;
}
