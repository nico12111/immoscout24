/**
 * Regionale Referenzdaten: Bundesland-Zuordnung ueber PLZ, Grunderwerbsteuer,
 * Mietniveau (Kaltmiete EUR/m2) und Koordinaten der groessten Staedte.
 *
 * Die Mietwerte sind konservative Orientierungswerte fuer Bestandswohnungen
 * (Stand 2025/26) und ersetzen keinen Mietspiegel. Sie dienen nur dazu,
 * Objekte ohne Mietangabe ueberhaupt vergleichbar zu machen.
 */

/** Grunderwerbsteuersatz je Bundesland in Prozent. */
export const GRUNDERWERBSTEUER = {
  'Baden-Württemberg': 5.0,
  Bayern: 3.5,
  Berlin: 6.0,
  Brandenburg: 6.5,
  Bremen: 5.0,
  Hamburg: 5.5,
  Hessen: 6.0,
  'Mecklenburg-Vorpommern': 6.0,
  Niedersachsen: 5.0,
  'Nordrhein-Westfalen': 6.5,
  'Rheinland-Pfalz': 5.0,
  Saarland: 6.5,
  Sachsen: 5.5,
  'Sachsen-Anhalt': 5.0,
  'Schleswig-Holstein': 6.5,
  Thüringen: 5.0,
};

/**
 * PLZ-Praefix (2-stellig) -> Bundesland. Grenzfaelle sind auf das
 * flaechenmaessig dominierende Land gemappt.
 */
const PLZ_BUNDESLAND = {
  '01': 'Sachsen', '02': 'Sachsen', '03': 'Brandenburg', '04': 'Sachsen',
  '06': 'Sachsen-Anhalt', '07': 'Thüringen', '08': 'Sachsen', '09': 'Sachsen',
  10: 'Berlin', 12: 'Berlin', 13: 'Berlin', 14: 'Brandenburg',
  15: 'Brandenburg', 16: 'Brandenburg', 17: 'Mecklenburg-Vorpommern',
  18: 'Mecklenburg-Vorpommern', 19: 'Mecklenburg-Vorpommern',
  20: 'Hamburg', 21: 'Hamburg', 22: 'Hamburg', 23: 'Schleswig-Holstein',
  24: 'Schleswig-Holstein', 25: 'Schleswig-Holstein', 26: 'Niedersachsen',
  27: 'Niedersachsen', 28: 'Bremen', 29: 'Niedersachsen',
  30: 'Niedersachsen', 31: 'Niedersachsen', 32: 'Nordrhein-Westfalen',
  33: 'Nordrhein-Westfalen', 34: 'Hessen', 35: 'Hessen', 36: 'Hessen',
  37: 'Niedersachsen', 38: 'Niedersachsen', 39: 'Sachsen-Anhalt',
  40: 'Nordrhein-Westfalen', 41: 'Nordrhein-Westfalen', 42: 'Nordrhein-Westfalen',
  44: 'Nordrhein-Westfalen', 45: 'Nordrhein-Westfalen', 46: 'Nordrhein-Westfalen',
  47: 'Nordrhein-Westfalen', 48: 'Nordrhein-Westfalen', 49: 'Niedersachsen',
  50: 'Nordrhein-Westfalen', 51: 'Nordrhein-Westfalen', 52: 'Nordrhein-Westfalen',
  53: 'Nordrhein-Westfalen', 54: 'Rheinland-Pfalz', 55: 'Rheinland-Pfalz',
  56: 'Rheinland-Pfalz', 57: 'Nordrhein-Westfalen', 58: 'Nordrhein-Westfalen',
  59: 'Nordrhein-Westfalen',
  60: 'Hessen', 61: 'Hessen', 63: 'Hessen', 64: 'Hessen', 65: 'Hessen',
  66: 'Saarland', 67: 'Rheinland-Pfalz', 68: 'Baden-Württemberg',
  69: 'Baden-Württemberg',
  70: 'Baden-Württemberg', 71: 'Baden-Württemberg', 72: 'Baden-Württemberg',
  73: 'Baden-Württemberg', 74: 'Baden-Württemberg', 75: 'Baden-Württemberg',
  76: 'Baden-Württemberg', 77: 'Baden-Württemberg', 78: 'Baden-Württemberg',
  79: 'Baden-Württemberg',
  80: 'Bayern', 81: 'Bayern', 82: 'Bayern', 83: 'Bayern', 84: 'Bayern',
  85: 'Bayern', 86: 'Bayern', 87: 'Bayern', 88: 'Baden-Württemberg',
  89: 'Baden-Württemberg',
  90: 'Bayern', 91: 'Bayern', 92: 'Bayern', 93: 'Bayern', 94: 'Bayern',
  95: 'Bayern', 96: 'Bayern', 97: 'Bayern', 98: 'Thüringen', 99: 'Thüringen',
};

export function bundeslandAusPlz(plz) {
  if (!plz) return null;
  const p = String(plz).padStart(5, '0').slice(0, 2);
  return PLZ_BUNDESLAND[p] || PLZ_BUNDESLAND[Number(p)] || null;
}

export function grunderwerbsteuerAusPlz(plz) {
  const land = bundeslandAusPlz(plz);
  return land ? GRUNDERWERBSTEUER[land] : 5.5;
}

/**
 * Mietniveau je Stadt: Kaltmiete EUR/m2 (Bestand, mittlere Ausstattung).
 * lat/lon dienen zugleich als Zentrum fuer die Radiussuche.
 */
export const STAEDTE = [
  { name: 'München', plz: '80331', lat: 48.1372, lon: 11.5755, miete: 21.5, kaufQm: 9200 },
  { name: 'Frankfurt am Main', plz: '60311', lat: 50.1109, lon: 8.6821, miete: 16.5, kaufQm: 6300 },
  { name: 'Stuttgart', plz: '70173', lat: 48.7758, lon: 9.1829, miete: 15.8, kaufQm: 5300 },
  { name: 'Hamburg', plz: '20095', lat: 53.5511, lon: 9.9937, miete: 15.2, kaufQm: 6100 },
  { name: 'Berlin', plz: '10115', lat: 52.5200, lon: 13.4050, miete: 15.0, kaufQm: 5300 },
  { name: 'Köln', plz: '50667', lat: 50.9375, lon: 6.9603, miete: 14.5, kaufQm: 4900 },
  { name: 'Düsseldorf', plz: '40213', lat: 51.2277, lon: 6.7735, miete: 14.2, kaufQm: 4800 },
  { name: 'Freiburg im Breisgau', plz: '79098', lat: 47.9990, lon: 7.8421, miete: 14.5, kaufQm: 5400 },
  { name: 'Heidelberg', plz: '69117', lat: 49.3988, lon: 8.6724, miete: 14.0, kaufQm: 5000 },
  { name: 'Mainz', plz: '55116', lat: 49.9929, lon: 8.2473, miete: 13.5, kaufQm: 4600 },
  { name: 'Potsdam', plz: '14467', lat: 52.3906, lon: 13.0645, miete: 13.2, kaufQm: 4700 },
  { name: 'Ingolstadt', plz: '85049', lat: 48.7665, lon: 11.4258, miete: 12.8, kaufQm: 4200 },
  { name: 'Nürnberg', plz: '90402', lat: 49.4521, lon: 11.0767, miete: 12.5, kaufQm: 3900 },
  { name: 'Regensburg', plz: '93047', lat: 49.0134, lon: 12.1016, miete: 13.0, kaufQm: 4600 },
  { name: 'Augsburg', plz: '86150', lat: 48.3705, lon: 10.8978, miete: 12.4, kaufQm: 4200 },
  { name: 'Bonn', plz: '53111', lat: 50.7374, lon: 7.0982, miete: 13.0, kaufQm: 4400 },
  { name: 'Münster', plz: '48143', lat: 51.9607, lon: 7.6261, miete: 13.0, kaufQm: 4400 },
  { name: 'Wiesbaden', plz: '65183', lat: 50.0782, lon: 8.2398, miete: 13.2, kaufQm: 4400 },
  { name: 'Darmstadt', plz: '64283', lat: 49.8728, lon: 8.6512, miete: 13.0, kaufQm: 4300 },
  { name: 'Karlsruhe', plz: '76133', lat: 49.0069, lon: 8.4037, miete: 12.5, kaufQm: 4100 },
  { name: 'Mannheim', plz: '68159', lat: 49.4875, lon: 8.4660, miete: 12.0, kaufQm: 3700 },
  { name: 'Bremen', plz: '28195', lat: 53.0793, lon: 8.8017, miete: 11.0, kaufQm: 3200 },
  { name: 'Hannover', plz: '30159', lat: 52.3759, lon: 9.7320, miete: 11.5, kaufQm: 3300 },
  { name: 'Leipzig', plz: '04109', lat: 51.3397, lon: 12.3731, miete: 10.5, kaufQm: 3100 },
  { name: 'Dresden', plz: '01067', lat: 51.0504, lon: 13.7373, miete: 10.2, kaufQm: 3000 },
  { name: 'Kiel', plz: '24103', lat: 54.3233, lon: 10.1228, miete: 11.0, kaufQm: 3200 },
  { name: 'Lübeck', plz: '23552', lat: 53.8655, lon: 10.6866, miete: 10.8, kaufQm: 3300 },
  { name: 'Rostock', plz: '18055', lat: 54.0924, lon: 12.0991, miete: 10.5, kaufQm: 3300 },
  { name: 'Erfurt', plz: '99084', lat: 50.9787, lon: 11.0328, miete: 9.5, kaufQm: 2700 },
  { name: 'Jena', plz: '07743', lat: 50.9271, lon: 11.5892, miete: 10.5, kaufQm: 3000 },
  { name: 'Magdeburg', plz: '39104', lat: 52.1205, lon: 11.6276, miete: 8.2, kaufQm: 2000 },
  { name: 'Halle (Saale)', plz: '06108', lat: 51.4825, lon: 11.9705, miete: 8.0, kaufQm: 1900 },
  { name: 'Chemnitz', plz: '09111', lat: 50.8278, lon: 12.9214, miete: 7.2, kaufQm: 1500 },
  { name: 'Dortmund', plz: '44135', lat: 51.5136, lon: 7.4653, miete: 9.5, kaufQm: 2500 },
  { name: 'Essen', plz: '45127', lat: 51.4556, lon: 7.0116, miete: 9.3, kaufQm: 2400 },
  { name: 'Duisburg', plz: '47051', lat: 51.4344, lon: 6.7623, miete: 8.5, kaufQm: 1900 },
  { name: 'Bochum', plz: '44787', lat: 51.4818, lon: 7.2162, miete: 9.2, kaufQm: 2300 },
  { name: 'Wuppertal', plz: '42103', lat: 51.2562, lon: 7.1508, miete: 9.0, kaufQm: 2200 },
  { name: 'Gelsenkirchen', plz: '45879', lat: 51.5177, lon: 7.0857, miete: 7.6, kaufQm: 1500 },
  { name: 'Bielefeld', plz: '33602', lat: 52.0302, lon: 8.5325, miete: 9.8, kaufQm: 2700 },
  { name: 'Aachen', plz: '52062', lat: 50.7753, lon: 6.0839, miete: 11.5, kaufQm: 3200 },
  { name: 'Kassel', plz: '34117', lat: 51.3127, lon: 9.4797, miete: 9.8, kaufQm: 2600 },
  { name: 'Braunschweig', plz: '38100', lat: 52.2689, lon: 10.5268, miete: 10.2, kaufQm: 2800 },
  { name: 'Osnabrück', plz: '49074', lat: 52.2799, lon: 8.0472, miete: 10.5, kaufQm: 2900 },
  { name: 'Oldenburg', plz: '26122', lat: 53.1435, lon: 8.2146, miete: 10.5, kaufQm: 3000 },
  { name: 'Würzburg', plz: '97070', lat: 49.7913, lon: 9.9534, miete: 12.5, kaufQm: 4000 },
  { name: 'Ulm', plz: '89073', lat: 48.4011, lon: 9.9876, miete: 12.5, kaufQm: 4000 },
  { name: 'Koblenz', plz: '56068', lat: 50.3569, lon: 7.5890, miete: 10.5, kaufQm: 3000 },
  { name: 'Saarbrücken', plz: '66111', lat: 49.2402, lon: 6.9969, miete: 9.0, kaufQm: 2200 },
  { name: 'Trier', plz: '54290', lat: 49.7490, lon: 6.6371, miete: 11.0, kaufQm: 3200 },
  { name: 'Kaiserslautern', plz: '67655', lat: 49.4401, lon: 7.7491, miete: 9.0, kaufQm: 2100 },
  { name: 'Cottbus', plz: '03046', lat: 51.7563, lon: 14.3329, miete: 7.5, kaufQm: 1700 },
  { name: 'Schwerin', plz: '19053', lat: 53.6355, lon: 11.4012, miete: 9.0, kaufQm: 2300 },
  { name: 'Flensburg', plz: '24937', lat: 54.7937, lon: 9.4469, miete: 10.0, kaufQm: 2800 },
  { name: 'Göttingen', plz: '37073', lat: 51.5413, lon: 9.9158, miete: 11.0, kaufQm: 3000 },
  { name: 'Paderborn', plz: '33098', lat: 51.7189, lon: 8.7575, miete: 9.8, kaufQm: 2700 },
  { name: 'Siegen', plz: '57072', lat: 50.8748, lon: 8.0243, miete: 9.0, kaufQm: 2200 },
  { name: 'Krefeld', plz: '47798', lat: 51.3388, lon: 6.5853, miete: 9.2, kaufQm: 2300 },
  { name: 'Mönchengladbach', plz: '41061', lat: 51.1805, lon: 6.4428, miete: 9.3, kaufQm: 2400 },
  { name: 'Hagen', plz: '58095', lat: 51.3671, lon: 7.4633, miete: 8.2, kaufQm: 1700 },
  { name: 'Hamm', plz: '59065', lat: 51.6739, lon: 7.8150, miete: 8.3, kaufQm: 1800 },
  { name: 'Bremerhaven', plz: '27568', lat: 53.5396, lon: 8.5809, miete: 8.0, kaufQm: 1700 },
  { name: 'Salzgitter', plz: '38226', lat: 52.1506, lon: 10.3336, miete: 7.5, kaufQm: 1500 },
  { name: 'Wolfsburg', plz: '38440', lat: 52.4227, lon: 10.7865, miete: 10.0, kaufQm: 2600 },
  { name: 'Zwickau', plz: '08056', lat: 50.7189, lon: 12.4961, miete: 6.8, kaufQm: 1300 },
  { name: 'Gera', plz: '07545', lat: 50.8809, lon: 12.0821, miete: 6.5, kaufQm: 1200 },
  { name: 'Dessau-Roßlau', plz: '06844', lat: 51.8340, lon: 12.2464, miete: 6.8, kaufQm: 1300 },
  { name: 'Görlitz', plz: '02826', lat: 51.1523, lon: 14.9875, miete: 7.0, kaufQm: 1400 },
  { name: 'Plauen', plz: '08523', lat: 50.4948, lon: 12.1379, miete: 6.5, kaufQm: 1200 },
  { name: 'Bayreuth', plz: '95444', lat: 49.9456, lon: 11.5713, miete: 10.5, kaufQm: 3000 },
  { name: 'Bamberg', plz: '96047', lat: 49.8988, lon: 10.9028, miete: 11.5, kaufQm: 3600 },
  { name: 'Landshut', plz: '84028', lat: 48.5372, lon: 12.1522, miete: 12.5, kaufQm: 4300 },
  { name: 'Rosenheim', plz: '83022', lat: 47.8561, lon: 12.1289, miete: 14.0, kaufQm: 5200 },
  { name: 'Konstanz', plz: '78462', lat: 47.6779, lon: 9.1732, miete: 14.5, kaufQm: 5400 },
  { name: 'Tübingen', plz: '72070', lat: 48.5216, lon: 9.0576, miete: 14.0, kaufQm: 4900 },
  { name: 'Offenbach am Main', plz: '63065', lat: 50.0955, lon: 8.7761, miete: 13.5, kaufQm: 4200 },
  { name: 'Ludwigshafen am Rhein', plz: '67059', lat: 49.4774, lon: 8.4452, miete: 10.5, kaufQm: 2900 },
  { name: 'Fürth', plz: '90762', lat: 49.4783, lon: 10.9903, miete: 11.8, kaufQm: 3600 },
  { name: 'Heilbronn', plz: '74072', lat: 49.1427, lon: 9.2109, miete: 11.5, kaufQm: 3500 },
  { name: 'Pforzheim', plz: '75175', lat: 48.8922, lon: 8.6946, miete: 11.0, kaufQm: 3200 },
  { name: 'Reutlingen', plz: '72764', lat: 48.4919, lon: 9.2114, miete: 12.0, kaufQm: 3700 },
  { name: 'Neubrandenburg', plz: '17033', lat: 53.5575, lon: 13.2610, miete: 7.5, kaufQm: 1600 },
  { name: 'Stralsund', plz: '18435', lat: 54.3091, lon: 13.0818, miete: 9.5, kaufQm: 2600 },
  { name: 'Greifswald', plz: '17489', lat: 54.0865, lon: 13.3923, miete: 9.8, kaufQm: 2700 },
];

/** Mietniveau-Fallback je PLZ-Praefix (2-stellig), wenn keine Stadt passt. */
const PLZ_MIETNIVEAU = {
  '01': 9.5, '02': 7.2, '03': 7.5, '04': 9.8, '06': 7.8, '07': 8.5,
  '08': 7.0, '09': 7.2,
  10: 15.0, 12: 14.0, 13: 13.5, 14: 11.5, 15: 9.5, 16: 9.0,
  17: 8.5, 18: 9.5, 19: 8.5,
  20: 16.0, 21: 13.0, 22: 15.0, 23: 10.5, 24: 10.5, 25: 10.0,
  26: 9.8, 27: 9.0, 28: 11.0, 29: 8.5,
  30: 11.0, 31: 9.0, 32: 9.0, 33: 9.5, 34: 9.5, 35: 9.5, 36: 8.8,
  37: 10.0, 38: 9.5, 39: 8.0,
  40: 14.0, 41: 9.5, 42: 9.2, 44: 9.5, 45: 9.0, 46: 8.8, 47: 8.8,
  48: 11.5, 49: 9.8,
  50: 14.0, 51: 11.5, 52: 10.8, 53: 12.0, 54: 9.5, 55: 12.0, 56: 9.8,
  57: 8.8, 58: 8.5, 59: 8.5,
  60: 16.5, 61: 12.5, 63: 12.0, 64: 12.5, 65: 12.5, 66: 8.8, 67: 10.0,
  68: 11.8, 69: 13.0,
  70: 15.5, 71: 13.0, 72: 12.5, 73: 11.5, 74: 11.0, 75: 11.0, 76: 12.0,
  77: 10.5, 78: 12.0, 79: 13.0,
  80: 21.0, 81: 20.0, 82: 17.0, 83: 13.5, 84: 11.5, 85: 14.0, 86: 12.0,
  87: 11.5, 88: 11.5, 89: 11.5,
  90: 12.3, 91: 10.5, 92: 9.5, 93: 12.0, 94: 10.0, 95: 9.0, 96: 10.0,
  97: 11.5, 98: 8.0, 99: 8.8,
};

/**
 * Marktmiete (Kaltmiete EUR/m2) fuer eine Adresse schaetzen.
 * Sucht zuerst die Stadt, dann den PLZ-Bereich, sonst Bundesdurchschnitt.
 */
export function mietniveau({ plz, stadt } = {}) {
  if (stadt) {
    const norm = String(stadt).toLowerCase();
    const hit = STAEDTE.find((s) => norm.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(norm));
    if (hit) return { wert: hit.miete, quelle: `Stadtwert ${hit.name}` };
  }
  if (plz) {
    const p = String(plz).padStart(5, '0').slice(0, 2);
    const wert = PLZ_MIETNIVEAU[p] ?? PLZ_MIETNIVEAU[Number(p)];
    if (wert) return { wert, quelle: `PLZ-Gebiet ${p}` };
  }
  return { wert: 9.5, quelle: 'Bundesdurchschnitt' };
}

/**
 * Flaechenzuschlag: kleine Wohnungen erzielen mehr EUR/m2 als grosse.
 */
export function flaechenFaktor(wohnflaeche) {
  const f = Number(wohnflaeche) || 0;
  if (f <= 0) return 1;
  if (f < 35) return 1.25;
  if (f < 50) return 1.12;
  if (f < 70) return 1.0;
  if (f < 100) return 0.94;
  if (f < 140) return 0.9;
  return 0.85;
}

/** Baujahrs-/Zustandsfaktor auf die Marktmiete. */
export function zustandsFaktor({ baujahr, kernsaniert, renovierungsbedarf }) {
  let f = 1;
  const bj = Number(baujahr);
  if (Number.isFinite(bj)) {
    if (bj >= 2020) f *= 1.25;
    else if (bj >= 2010) f *= 1.15;
    else if (bj >= 1995) f *= 1.05;
    else if (bj < 1950) f *= 0.92;
  }
  if (kernsaniert) f *= 1.12;
  if (renovierungsbedarf) f *= 0.85;
  return f;
}

/**
 * Marktmiete (EUR/Monat, kalt) fuer ein Objekt schaetzen.
 */
export function schaetzeMarktmiete(listing, flags = {}) {
  const flaeche = Number(listing.wohnflaeche) || 0;
  if (!flaeche) return null;
  const basis = mietniveau({ plz: listing.plz, stadt: listing.stadt });
  const proQm =
    basis.wert *
    flaechenFaktor(flaeche) *
    zustandsFaktor({
      baujahr: listing.baujahr,
      kernsaniert: flags.kernsaniert,
      renovierungsbedarf: flags.renovierungsbedarf,
    });
  return {
    proQm,
    monat: proQm * flaeche,
    quelle: basis.quelle,
  };
}

export function findeStadt(name) {
  if (!name) return null;
  const norm = String(name).trim().toLowerCase();
  return (
    STAEDTE.find((s) => s.name.toLowerCase() === norm) ||
    STAEDTE.find((s) => s.name.toLowerCase().startsWith(norm)) ||
    STAEDTE.find((s) => s.name.toLowerCase().includes(norm)) ||
    null
  );
}
