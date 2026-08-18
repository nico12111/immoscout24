/**
 * Uebersetzt die ImmoScout24-Antworten (Resultlist + Expose) in ein flaches,
 * stabiles Angebotsmodell, mit dem Finanz- und Analysemodul arbeiten.
 *
 * Die IS24-JSON-Struktur liefert Listen mal als Array, mal als Einzelobjekt.
 * Alle Zugriffe laufen deshalb ueber `liste()` und `zahl()`.
 */
import { analysiere } from '../shared/analysis.js';
import { schaetzeMarktmiete, grunderwerbsteuerAusPlz, bundeslandAusPlz } from '../shared/regions.js';

export function liste(wert) {
  if (wert === undefined || wert === null) return [];
  return Array.isArray(wert) ? wert : [wert];
}

export function zahl(wert, fallback = null) {
  if (wert === undefined || wert === null || wert === '') return fallback;
  const n = typeof wert === 'object' ? Number(wert.value ?? wert['#text']) : Number(wert);
  return Number.isFinite(n) ? n : fallback;
}

function bool(wert) {
  if (typeof wert === 'boolean') return wert;
  if (typeof wert === 'string') return wert.toLowerCase() === 'true';
  return false;
}

function text(wert) {
  if (wert === undefined || wert === null) return '';
  if (typeof wert === 'string') return wert;
  if (typeof wert === 'object') return String(wert['#text'] ?? wert.value ?? '');
  return String(wert);
}

const TYP_LABEL = {
  ApartmentBuy: 'Eigentumswohnung',
  ApartmentRent: 'Mietwohnung',
  HouseBuy: 'Haus (Kauf)',
  HouseRent: 'Haus (Miete)',
  Investment: 'Anlageobjekt',
  LivingBuySite: 'Wohngrundstück',
  CompulsoryAuction: 'Zwangsversteigerung',
  ShortTermAccommodation: 'Wohnen auf Zeit',
  GarageBuy: 'Garage (Kauf)',
  GarageRent: 'Garage (Miete)',
};

/** Bilder aus einem titlePicture- oder picture-Knoten ziehen. */
function bilderAus(knoten) {
  const bilder = [];
  for (const bild of liste(knoten)) {
    if (!bild) continue;
    const urls = liste(bild.urls).flatMap((u) => liste(u.url));
    // Bevorzugt eine grosse, skalierbare Variante
    const gross =
      urls.find((u) => u['@scale'] === 'SCALE_AND_CROP') ||
      urls.find((u) => u['@scale'] === 'SCALE') ||
      urls.find((u) => u['@scale'] === 'SCALE_210x210') ||
      urls[0];
    let href = gross?.['@href'] || bild['@xlink.href'];
    if (!href) continue;
    // Platzhalter der IS24-Bild-URLs auf eine brauchbare Groesse setzen
    href = href.replace(/%WIDTH%/g, '800').replace(/%HEIGHT%/g, '600');
    bilder.push({
      url: href,
      grundriss: bool(bild.floorplan),
    });
  }
  return bilder;
}

/**
 * Einen Eintrag der Ergebnisliste normalisieren.
 * @param {object} eintrag resultlistEntry
 * @param {string} realestatetype angefragter Typ
 */
export function ausListenEintrag(eintrag, realestatetype) {
  const objekt = eintrag['resultlist.realEstate'] || eintrag.realEstate || {};
  const adresse = objekt.address || {};
  const koord = adresse.wgs84Coordinate || {};
  const id = String(eintrag['@id'] || eintrag.realEstateId || objekt['@id'] || '');

  const typRoh = String(objekt['@xsi.type'] || '').replace(/^search:/, '') || realestatetype;
  const istMietobjekt = /Rent$/i.test(typRoh);

  const preis = zahl(objekt.price?.value, 0) || 0;
  const kalkPreis = zahl(objekt.calculatedPrice?.value, null);

  const listing = {
    id,
    quelle: 'is24',
    url: `https://www.immobilienscout24.de/expose/${id}`,
    apiUrl: eintrag['@xlink.href'] || null,
    titel: text(objekt.title) || 'Ohne Titel',
    objekttyp: typRoh,
    objekttypLabel: TYP_LABEL[typRoh] || typRoh,
    typ: istMietobjekt ? 'miete' : 'kauf',

    strasse: text(adresse.street),
    hausnummer: text(adresse.houseNumber),
    plz: text(adresse.postcode),
    stadt: text(adresse.city),
    stadtteil: text(adresse.quarter),
    lat: zahl(koord.latitude, null),
    lon: zahl(koord.longitude, null),
    entfernungKm: zahl(eintrag.distance, null),

    wohnflaeche: zahl(objekt.livingSpace, null) ?? zahl(objekt.totalFloorSpace, null),
    grundstueck: zahl(objekt.plotArea, null),
    zimmer: zahl(objekt.numberOfRooms, null),
    balkon: bool(objekt.balcony),
    garten: bool(objekt.garden),
    einbaukueche: bool(objekt.builtInKitchen),

    privatanbieter: bool(objekt.privateOffer),
    anbieterId: text(objekt.companyWideCustomerId),
    grundriss: bool(objekt.floorplan),

    veroeffentlicht: eintrag['@publishDate'] || eintrag['@creation'] || null,
    geaendert: eintrag['@modification'] || null,

    bilder: bilderAus(objekt.titlePicture),
    detailsGeladen: false,
  };

  if (istMietobjekt) {
    listing.kaufpreis = 0;
    listing.istMieteKaltMonat = preis;
    listing.warmmiete = kalkPreis;
  } else {
    listing.kaufpreis = preis;
    listing.istMieteKaltMonat = 0;
  }

  listing.bundesland = bundeslandAusPlz(listing.plz);
  listing.grunderwerbsteuerSatz = grunderwerbsteuerAusPlz(listing.plz);
  return listing;
}

/** Alle Eintraege aus einer Suchantwort ziehen. */
export function ausSuchantwort(antwort, realestatetype) {
  const wurzel = antwort?.['resultlist.resultlist'] || {};
  const paging = wurzel.paging || {};
  const gruppen = liste(wurzel.resultlistEntries);
  const eintraege = gruppen.flatMap((g) => liste(g.resultlistEntry));

  return {
    paging: {
      seite: zahl(paging.pageNumber, 1),
      seitengroesse: zahl(paging.pageSize, 0),
      seiten: zahl(paging.numberOfPages, 1),
      treffer: zahl(paging.numberOfHits, eintraege.length),
    },
    listings: eintraege.map((e) => ausListenEintrag(e, realestatetype)).filter((l) => l.id),
  };
}

const ENERGIE_KLASSE_AUS_KENNWERT = (kwh) => {
  if (!Number.isFinite(kwh)) return null;
  if (kwh <= 30) return 'A+';
  if (kwh <= 50) return 'A';
  if (kwh <= 75) return 'B';
  if (kwh <= 100) return 'C';
  if (kwh <= 130) return 'D';
  if (kwh <= 160) return 'E';
  if (kwh <= 200) return 'F';
  if (kwh <= 250) return 'G';
  return 'H';
};

/**
 * Expose-Detaildaten in ein bestehendes Listing mischen.
 */
export function mitExpose(listing, exposeAntwort) {
  const wurzel =
    exposeAntwort?.['expose.expose']?.realEstate ||
    exposeAntwort?.expose?.realEstate ||
    exposeAntwort?.realEstate ||
    {};
  if (!wurzel || Object.keys(wurzel).length === 0) return listing;

  const kontakt = wurzel.contactDetails || {};
  const energie = wurzel.energyCertificate || {};
  const courtage = wurzel.courtage || {};

  const detail = {
    ...listing,
    detailsGeladen: true,
    beschreibung: text(wurzel.descriptionNote),
    ausstattungText: text(wurzel.furnishingNote),
    lageText: text(wurzel.locationNote),
    sonstigesText: text(wurzel.otherNote),

    baujahr: zahl(wurzel.constructionYear, listing.baujahr ?? null),
    letzteModernisierung: zahl(wurzel.lastRefurbishment, null),
    zustand: text(wurzel.condition),
    ausstattungsqualitaet: text(wurzel.interiorQuality),
    etage: zahl(wurzel.floor, null),
    etagenGesamt: zahl(wurzel.numberOfFloors, null),
    heizungsart: text(wurzel.heatingType || wurzel.heatingTypeEnev2014),
    befeuerung: liste(wurzel.firingTypes).map(text).filter(Boolean).join(', '),
    aufzug: bool(wurzel.lift),
    keller: bool(wurzel.cellar),
    stellplaetze: zahl(wurzel.numberOfParkingSpaces, null),
    freiAb: text(wurzel.freeFrom),
    vermietet: bool(wurzel.rented),
    denkmalschutz: bool(wurzel.listed),
    barrierefrei: bool(wurzel.handicappedAccessible),

    anbieter: text(kontakt.company) || [text(kontakt.firstname), text(kontakt.lastname)].filter(Boolean).join(' '),
    anbieterOrt: text(kontakt.address?.city),
  };

  // Flaechen aus dem Expose sind praeziser als aus der Liste
  detail.wohnflaeche = zahl(wurzel.livingSpace, detail.wohnflaeche);
  detail.zimmer = zahl(wurzel.numberOfRooms, detail.zimmer);
  if (!detail.kaufpreis && listing.typ === 'kauf') detail.kaufpreis = zahl(wurzel.price?.value, 0) || 0;

  // Energie
  const kennwert = zahl(energie.thermalCharacteristic, null);
  detail.energiekennwert = kennwert;
  detail.energieklasse =
    text(energie.energyEfficiencyClass).replace('A_PLUS', 'A+') ||
    ENERGIE_KLASSE_AUS_KENNWERT(kennwert) ||
    null;
  detail.energieausweisTyp = text(energie.energyCertificateCreationDate || energie.buildingEnergyRatingType);

  // Courtage
  const hatCourtage = text(courtage.hasCourtage).toUpperCase();
  const courtageText = text(courtage.courtage);
  detail.provisionsfrei = hatCourtage === 'NO';
  detail.courtageText = courtageText || (detail.provisionsfrei ? 'provisionsfrei' : '');
  const courtageProzent = courtageText.match(/(\d+[.,]?\d*)\s*%/);
  detail.courtageProzent = detail.provisionsfrei ? 0 : courtageProzent ? Number(courtageProzent[1].replace(',', '.')) : null;

  // Hausgeld / Nebenkosten
  const hausgeld = zahl(wurzel.serviceCharge, null) ?? zahl(wurzel.additionalCosts, null);
  detail.hausgeldMonat = hausgeld;
  // Faustregel: rund 30 % des Hausgelds sind nicht auf den Mieter umlegbar
  // (Verwaltervergütung + Instandhaltungsrücklage).
  detail.hausgeldNichtUmlagefaehigMonat = hausgeld ? hausgeld * 0.3 : 0;

  // Mieteinnahmen aus dem Expose (bei Anlageobjekten/vermieteten Wohnungen)
  const mieteinnahmen =
    zahl(wurzel.rentalIncome, null) ??
    zahl(wurzel.rentalIncomeActual, null) ??
    zahl(wurzel.netRentPerMonth, null) ??
    zahl(wurzel.baseRent, null);
  if (mieteinnahmen && listing.typ === 'kauf') {
    detail.istMieteKaltMonat = mieteinnahmen;
    detail.mietQuelle = 'expose';
  }
  detail.mietText = [detail.freiAb, text(wurzel.rented), courtageText].filter(Boolean).join(' ');

  // Bilder aus dem Expose (Galerie)
  const galerie = bilderAus(wurzel.attachments?.attachment || wurzel.pictures?.picture || wurzel.picture);
  if (galerie.length) {
    const bekannt = new Set(detail.bilder.map((b) => b.url));
    detail.bilder = [...detail.bilder, ...galerie.filter((b) => !bekannt.has(b.url))].slice(0, 20);
  }

  return detail;
}

/**
 * Miete ergaenzen und Analyse-Flags berechnen.
 * Setzt `istMieteKaltMonat` (falls unbekannt geschaetzt) und
 * `potenzialMieteKaltMonat` (Marktmiete laut Regionalindex).
 */
export function veredle(listing) {
  const l = { ...listing };
  const vorabAnalyse = analysiere(l, null, {});
  const markt = schaetzeMarktmiete(l, vorabAnalyse.flags);

  if (markt) {
    l.marktmieteProQm = markt.proQm;
    l.marktmieteMonat = markt.monat;
    l.marktmieteQuelle = markt.quelle;
  }

  // Die Potenzialmiete ist bewusst NICHT auf "mindestens Ist-Miete" geklemmt:
  // liegt die Bestandsmiete ueber dem Marktniveau, ist das ein Risiko beim
  // Mieterwechsel und soll sichtbar werden, statt weggerundet zu werden.
  if (l.typ === 'miete') {
    l.potenzialMieteKaltMonat = markt?.monat ?? l.istMieteKaltMonat;
    l.mietQuelle = 'angebot';
  } else if (l.istMieteKaltMonat > 0) {
    l.mietQuelle = l.mietQuelle || 'expose';
    l.potenzialMieteKaltMonat = markt ? markt.monat : l.istMieteKaltMonat;
  } else if (markt) {
    l.istMieteKaltMonat = markt.monat;
    l.potenzialMieteKaltMonat = markt.monat;
    l.mietQuelle = 'geschaetzt';
    l.mietPreisProQm = markt.proQm;
  } else {
    l.potenzialMieteKaltMonat = 0;
    l.mietQuelle = 'unbekannt';
  }

  l.mietPreisProQm = l.wohnflaeche ? l.istMieteKaltMonat / l.wohnflaeche : null;
  l.flags = vorabAnalyse.flags;
  return l;
}
