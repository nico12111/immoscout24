/**
 * Regelbasierte Angebotsanalyse: Pro-/Contra-Punkte, Zustandserkennung, Score.
 *
 * Laeuft im Browser und in Node. Textregeln arbeiten auf dem zusammengesetzten
 * Freitext des Exposes (Beschreibung, Ausstattung, Lage, Sonstiges).
 */

const KATEGORIEN = {
  RENDITE: 'Rendite',
  ZUSTAND: 'Zustand',
  LAGE: 'Lage',
  RECHT: 'Recht & Struktur',
  ENERGIE: 'Energie',
  MIETE: 'Miete',
  AUSSTATTUNG: 'Ausstattung',
  KOSTEN: 'Kosten',
};

/**
 * Textregeln. `gewicht` ist der Score-Beitrag (positiv oder negativ),
 * `schwere` steuert die Darstellung: 'hoch' | 'mittel' | 'info'.
 */
const TEXT_REGELN = [
  // --- Zustand: negativ ---
  {
    id: 'sanierungsbeduerftig',
    muster: /sanierungsbed(ü|ue)rftig|kernsanierung (n(ö|oe)tig|erforderlich)|komplett\s?sanierungsbed/i,
    typ: 'contra',
    kategorie: KATEGORIEN.ZUSTAND,
    gewicht: -14,
    schwere: 'hoch',
    titel: 'Sanierungsbedürftig',
    text: 'Das Exposé nennt ausdrücklich Sanierungsbedarf. Kalkuliere 600–1.200 €/m² und plane die Mietausfallzeit ein.',
  },
  {
    id: 'renovierungsbeduerftig',
    muster: /renovierungsbed(ü|ue)rftig|renovierungsstau|instandsetzungsbedarf|modernisierungsbed(ü|ue)rftig/i,
    typ: 'contra',
    kategorie: KATEGORIEN.ZUSTAND,
    gewicht: -8,
    schwere: 'mittel',
    titel: 'Renovierungsbedürftig',
    text: 'Renovierungsbedarf angegeben. Faustwert 250–500 €/m² für Böden, Bad und Malerarbeiten.',
  },
  {
    id: 'sonderumlage',
    muster: /sonderumlage|beschlossene ma(ß|ss)nahme|instandhaltungsstau|sanierung der fassade (steht|geplant)|dachsanierung (steht|geplant|erforderlich)/i,
    typ: 'contra',
    kategorie: KATEGORIEN.KOSTEN,
    gewicht: -9,
    schwere: 'hoch',
    titel: 'Sonderumlage / beschlossene Maßnahmen',
    text: 'Es stehen WEG-Maßnahmen an. Protokolle der letzten 3 Eigentümerversammlungen und den Stand der Rücklage anfordern.',
  },
  {
    id: 'erbbaurecht',
    muster: /erbbaurecht|erbpacht|erbbauzins/i,
    typ: 'contra',
    kategorie: KATEGORIEN.RECHT,
    gewicht: -12,
    schwere: 'hoch',
    titel: 'Erbbaurecht',
    text: 'Kein Grundstückseigentum, laufender Erbbauzins und schwierigere Finanzierung. Restlaufzeit und Zinsanpassungsklausel prüfen.',
  },
  {
    id: 'zwangsversteigerung',
    muster: /zwangsversteigerung|zwangsverwaltung|insolvenzverfahren/i,
    typ: 'contra',
    kategorie: KATEGORIEN.RECHT,
    gewicht: -6,
    schwere: 'mittel',
    titel: 'Zwangsversteigerung / Insolvenz',
    text: 'Kein normaler Kaufprozess: Besichtigung oft eingeschränkt, keine Gewährleistung, Bargebot erforderlich.',
  },
  {
    id: 'denkmalschutz',
    muster: /denkmalschutz|denkmalgesch(ü|ue)tzt|baudenkmal/i,
    typ: 'hinweis',
    kategorie: KATEGORIEN.RECHT,
    gewicht: -2,
    schwere: 'info',
    titel: 'Denkmalschutz',
    text: 'Erhöhte AfA (Denkmal-AfA) möglich, aber Auflagen bei Sanierung und teurere Gewerke. Steuerlich mit dem Berater durchrechnen.',
  },
  {
    id: 'wohnrecht',
    muster: /nie(ß|ss)brauch|wohnrecht (auf lebenszeit|eingetragen)|lebenslanges wohnrecht/i,
    typ: 'contra',
    kategorie: KATEGORIEN.RECHT,
    gewicht: -13,
    schwere: 'hoch',
    titel: 'Nießbrauch / Wohnrecht',
    text: 'Belastung in Abteilung II des Grundbuchs. Der Eigentümer kann die Fläche auf Jahre nicht verwerten.',
  },
  {
    id: 'teileigentum',
    muster: /teileigentum|gewerbliche nutzung vorgeschrieben|nur gewerblich nutzbar/i,
    typ: 'hinweis',
    kategorie: KATEGORIEN.RECHT,
    gewicht: -3,
    schwere: 'info',
    titel: 'Teileigentum statt Wohneigentum',
    text: 'Nutzung laut Teilungserklärung prüfen — Wohnnutzung ist bei Teileigentum nicht automatisch zulässig.',
  },
  {
    id: 'oelheizung',
    muster: /(ö|oe)lheizung|nachtspeicher|kohleofen|ofenheizung|gas(-|\s)?etagenheizung/i,
    typ: 'contra',
    kategorie: KATEGORIEN.ENERGIE,
    gewicht: -7,
    schwere: 'mittel',
    titel: 'Veraltete Heizung',
    text: 'Öl-, Nachtspeicher- oder Etagenheizung. Austauschpflichten (GEG) und Kosten von 15.000–35.000 € einplanen.',
  },
  {
    id: 'asbest',
    muster: /asbest|schimmel|feuchtigkeitssch(a|ä)den|hausschwamm/i,
    typ: 'contra',
    kategorie: KATEGORIEN.ZUSTAND,
    gewicht: -15,
    schwere: 'hoch',
    titel: 'Schadstoffe / Feuchteschäden',
    text: 'Asbest, Schimmel oder Feuchteschäden erwähnt. Ohne Gutachten nicht kalkulierbar.',
  },
  {
    id: 'souterrain',
    muster: /souterrain|untergeschoss(wohnung)?|kellerwohnung/i,
    typ: 'contra',
    kategorie: KATEGORIEN.LAGE,
    gewicht: -5,
    schwere: 'mittel',
    titel: 'Souterrain-Lage',
    text: 'Schlechtere Vermietbarkeit, geringere Miete und Feuchterisiko.',
  },
  {
    id: 'hauptstrasse',
    muster: /an der hauptstra(ß|ss)e|verkehrsl(ä|ae)rm|stark befahren|bahnl(ä|ae)rm/i,
    typ: 'contra',
    kategorie: KATEGORIEN.LAGE,
    gewicht: -4,
    schwere: 'mittel',
    titel: 'Lärmbelastung',
    text: 'Lärm drückt Miete und Wiederverkaufswert, besonders bei Familien als Zielgruppe.',
  },

  // --- Zustand: positiv ---
  {
    id: 'kernsaniert',
    muster: /kernsaniert|vollst(ä|ae)ndig saniert|komplett saniert|hochwertig saniert|frisch renoviert|neu renoviert/i,
    typ: 'pro',
    kategorie: KATEGORIEN.ZUSTAND,
    gewicht: 10,
    schwere: 'hoch',
    titel: 'Saniert / renoviert',
    text: 'Kein akuter Instandhaltungsstau — die Rücklage bleibt für Unerwartetes frei.',
  },
  {
    id: 'neubau',
    muster: /neubau|erstbezug|schl(ü|ue)sselfertig|baujahr 202\d/i,
    typ: 'pro',
    kategorie: KATEGORIEN.ZUSTAND,
    gewicht: 7,
    schwere: 'mittel',
    titel: 'Neubau / Erstbezug',
    text: 'Geringes Instandhaltungsrisiko in den ersten Jahren, gute Energiewerte, oft höhere AfA.',
  },
  {
    id: 'waermepumpe',
    muster: /w(ä|ae)rmepumpe|fernw(ä|ae)rme|pelletheizung|photovoltaik|solaranlage|blockheizkraftwerk/i,
    typ: 'pro',
    kategorie: KATEGORIEN.ENERGIE,
    gewicht: 6,
    schwere: 'mittel',
    titel: 'Moderne Energieversorgung',
    text: 'Zukunftsfähige Heizung — kein GEG-Austauschrisiko, niedrige Nebenkosten als Mietargument.',
  },
  {
    id: 'provisionsfrei',
    muster: /provisionsfrei|courtagefrei|keine k(ä|ae)uferprovision|ohne makler(provision|courtage)/i,
    typ: 'pro',
    kategorie: KATEGORIEN.KOSTEN,
    gewicht: 6,
    schwere: 'mittel',
    titel: 'Provisionsfrei',
    text: 'Spart 3–7 % Kaufnebenkosten — bei 100-%-Finanzierung direkt weniger Eigenkapitalbedarf.',
  },
  {
    id: 'vermietet',
    muster: /vermietet|bestandsmieter|mieteinnahme|ist-miete|aktuelle miete/i,
    typ: 'pro',
    kategorie: KATEGORIEN.MIETE,
    gewicht: 5,
    schwere: 'mittel',
    titel: 'Vermietet',
    text: 'Einnahmen ab Tag 1, die Bank rechnet die Miete beim Kapitaldienst mit an.',
  },
  {
    id: 'bezugsfrei',
    muster: /bezugsfrei|frei ab sofort|leerstehend|unvermietet/i,
    typ: 'hinweis',
    kategorie: KATEGORIEN.MIETE,
    gewicht: 2,
    schwere: 'info',
    titel: 'Bezugsfrei',
    text: 'Miete kann sofort auf Marktniveau angesetzt werden — dafür anfangs Leerstand und Vermietungsaufwand.',
  },
  {
    id: 'staffelmiete',
    muster: /staffelmiete|indexmiete/i,
    typ: 'pro',
    kategorie: KATEGORIEN.MIETE,
    gewicht: 4,
    schwere: 'mittel',
    titel: 'Staffel- oder Indexmiete',
    text: 'Mietsteigerungen sind vertraglich gesichert, unabhängig vom Mietspiegel.',
  },
  {
    id: 'stellplatz',
    muster: /stellplatz|garage|tiefgarage|carport|duplexparker/i,
    typ: 'pro',
    kategorie: KATEGORIEN.AUSSTATTUNG,
    gewicht: 3,
    schwere: 'info',
    titel: 'Stellplatz vorhanden',
    text: 'Separat vermietbar (40–120 €/Monat) und ein Vermietungsvorteil in Städten.',
  },
  {
    id: 'aufzug',
    muster: /aufzug|fahrstuhl|lift/i,
    typ: 'pro',
    kategorie: KATEGORIEN.AUSSTATTUNG,
    gewicht: 2,
    schwere: 'info',
    titel: 'Aufzug',
    text: 'Erweitert die Zielgruppe auf ältere Mieter, hält obere Etagen marktfähig.',
  },
  {
    id: 'gutelage',
    muster: /u-?bahn|s-?bahn|zentrale lage|innenstadtnah|universit(ä|ae)t|hochschule|gute anbindung|szenevie?rtel/i,
    typ: 'pro',
    kategorie: KATEGORIEN.LAGE,
    gewicht: 5,
    schwere: 'mittel',
    titel: 'Gute Anbindung / Mikrolage',
    text: 'ÖPNV und Infrastruktur in der Nähe — kürzere Leerstandszeiten, stabilere Nachfrage.',
  },
  {
    id: 'kapitalanlage',
    muster: /kapitalanlage|anlageobjekt|renditeobjekt|mehrfamilienhaus|zinshaus/i,
    typ: 'hinweis',
    kategorie: KATEGORIEN.RENDITE,
    gewicht: 1,
    schwere: 'info',
    titel: 'Als Kapitalanlage inseriert',
    text: 'Der Verkäufer adressiert Investoren — Mietaufstellung und Nebenkostenabrechnung direkt anfordern.',
  },
];

/** Energieausweis-Klassen → Bewertung */
const ENERGIE_KLASSEN = {
  A_PLUS: 8,
  A: 7,
  B: 5,
  C: 3,
  D: 0,
  E: -3,
  F: -6,
  G: -9,
  H: -12,
};

/** Zahl im deutschen Format, damit die Texte nicht mit Punkten brechen. */
function n(wert, nachkomma = 1) {
  if (!Number.isFinite(Number(wert))) return '–';
  return Number(wert).toLocaleString('de-DE', {
    minimumFractionDigits: nachkomma,
    maximumFractionDigits: nachkomma,
  });
}

function sammleText(listing) {
  return [
    listing.titel,
    listing.beschreibung,
    listing.ausstattungText,
    listing.lageText,
    listing.sonstigesText,
    listing.mietText,
  ]
    .filter(Boolean)
    .join('\n');
}

function punkt(regel, extra = {}) {
  return {
    id: regel.id,
    typ: regel.typ,
    kategorie: regel.kategorie,
    titel: regel.titel,
    text: regel.text,
    gewicht: regel.gewicht,
    schwere: regel.schwere,
    ...extra,
  };
}

/**
 * Hauptanalyse.
 * @param {object} listing normalisiertes Angebot
 * @param {object} cashflow Ergebnis aus berechneCashflow (optional)
 * @param {object} settings Nutzereinstellungen (fuer Zielwerte)
 */
export function analysiere(listing, cashflow = null, settings = {}) {
  const text = sammleText(listing);
  const punkte = [];
  const treffer = new Set();

  for (const regel of TEXT_REGELN) {
    if (regel.muster.test(text)) {
      punkte.push(punkt(regel, { quelle: 'text' }));
      treffer.add(regel.id);
    }
  }

  // --- Strukturierte Felder ---
  const baujahr = Number(listing.baujahr);
  if (Number.isFinite(baujahr) && baujahr > 1500) {
    if (baujahr < 1950 && !treffer.has('kernsaniert')) {
      punkte.push({
        id: 'altbau_unsaniert',
        typ: 'contra',
        kategorie: KATEGORIEN.ZUSTAND,
        titel: `Baujahr ${baujahr} ohne Sanierungshinweis`,
        text: 'Alte Bausubstanz ohne erkennbare Sanierung: Leitungen, Elektrik, Fenster und Dach kritisch prüfen.',
        gewicht: -7,
        schwere: 'mittel',
        quelle: 'feld',
      });
    } else if (baujahr >= 2015) {
      punkte.push({
        id: 'junger_bau',
        typ: 'pro',
        kategorie: KATEGORIEN.ZUSTAND,
        titel: `Baujahr ${baujahr}`,
        text: 'Junge Bausubstanz — überschaubares Instandhaltungsrisiko für die nächsten Jahre.',
        gewicht: 5,
        schwere: 'mittel',
        quelle: 'feld',
      });
    }
  } else {
    punkte.push({
      id: 'baujahr_fehlt',
      typ: 'hinweis',
      kategorie: KATEGORIEN.ZUSTAND,
      titel: 'Baujahr nicht angegeben',
      text: 'Ohne Baujahr lässt sich weder AfA noch Instandhaltungsrisiko sauber schätzen — beim Anbieter nachfragen.',
      gewicht: -1,
      schwere: 'info',
      quelle: 'feld',
    });
  }

  const klasse = (listing.energieklasse || '').toUpperCase().replace('+', '_PLUS');
  if (klasse && klasse in ENERGIE_KLASSEN) {
    const g = ENERGIE_KLASSEN[klasse];
    let energieText;
    if (g <= -6) {
      energieText =
        'Schlechte Effizienzklasse: Sanierungsdruck durch GEG/EU-Vorgaben, schwerer finanzierbar, geringere Mieternachfrage.';
    } else if (g < 0) {
      energieText =
        'Unterdurchschnittliche Effizienz. Noch keine akute Auflage, aber hohe Nebenkosten drücken die erzielbare Kaltmiete und der Sanierungsdruck steigt mittelfristig.';
    } else if (g === 0) {
      energieText = 'Durchschnittliche Effizienz, keine akuten Auflagen zu erwarten.';
    } else {
      energieText = 'Gute Effizienzklasse — niedrige Warmmiete, oft KfW-Förderung möglich.';
    }
    punkte.push({
      id: 'energieklasse',
      typ: g > 0 ? 'pro' : g < 0 ? 'contra' : 'hinweis',
      kategorie: KATEGORIEN.ENERGIE,
      titel: `Energieeffizienzklasse ${listing.energieklasse}`,
      text: energieText,
      gewicht: g,
      schwere: g <= -6 ? 'hoch' : 'info',
      quelle: 'feld',
    });
  } else if (listing.typ !== 'miete') {
    punkte.push({
      id: 'energieausweis_fehlt',
      typ: 'hinweis',
      kategorie: KATEGORIEN.ENERGIE,
      titel: 'Kein Energieausweis im Exposé',
      text: 'Der Energieausweis ist beim Verkauf Pflicht. Fehlt er, ist das ein Verhandlungsargument.',
      gewicht: -2,
      schwere: 'info',
      quelle: 'feld',
    });
  }

  if (listing.mietPotenzialQuelle === 'geschaetzt' && listing.istMieteKaltMonat > 0) {
    // nichts, das deckt die Cashflow-Sektion ab
  }

  // --- Kennzahlen ---
  if (cashflow) {
    const zielCashflow = Number(settings.zielCashflow ?? 0);
    const cf = cashflow.cashflowMonat;

    if (cf >= zielCashflow && zielCashflow > 0) {
      punkte.push({
        id: 'cashflow_ziel',
        typ: 'pro',
        kategorie: KATEGORIEN.RENDITE,
        titel: `Cashflow-Ziel erreicht (${Math.round(cf)} €/Monat)`,
        text: `Liegt über deinem Ziel von ${Math.round(zielCashflow)} €/Monat bei ${settings.finanzierungsgrad ?? 100} % Finanzierung.`,
        gewicht: 14,
        schwere: 'hoch',
        quelle: 'kennzahl',
      });
    } else if (cf > 0) {
      punkte.push({
        id: 'cashflow_positiv',
        typ: 'pro',
        kategorie: KATEGORIEN.RENDITE,
        titel: `Positiver Cashflow (${Math.round(cf)} €/Monat)`,
        text: 'Das Objekt trägt sich selbst, auch ohne Steuervorteil.',
        gewicht: 10,
        schwere: 'hoch',
        quelle: 'kennzahl',
      });
    } else {
      punkte.push({
        id: 'cashflow_negativ',
        typ: 'contra',
        kategorie: KATEGORIEN.RENDITE,
        titel: `Negativer Cashflow (${Math.round(cf)} €/Monat)`,
        text: `Du musst monatlich ${Math.abs(Math.round(cf))} € zuschießen. Bei ${settings.zinssatz ?? '?'} % Zins und ${settings.tilgung ?? '?'} % Tilgung.`,
        gewicht: -14,
        schwere: 'hoch',
        quelle: 'kennzahl',
      });
    }

    if (cashflow.kaufpreisfaktor !== null) {
      const f = cashflow.kaufpreisfaktor;
      if (f <= 20) {
        punkte.push({
          id: 'faktor_gut',
          typ: 'pro',
          kategorie: KATEGORIEN.RENDITE,
          titel: `Kaufpreisfaktor ${n(f, 1)}`,
          text: 'Günstig bewertet: unter dem 20-Fachen der Jahreskaltmiete — typisch für cashflowstarke Lagen.',
          gewicht: 9,
          schwere: 'hoch',
          quelle: 'kennzahl',
        });
      } else if (f >= 30) {
        punkte.push({
          id: 'faktor_hoch',
          typ: 'contra',
          kategorie: KATEGORIEN.RENDITE,
          titel: `Kaufpreisfaktor ${n(f, 1)}`,
          text: 'Teuer bewertet: über dem 30-Fachen der Jahresmiete. Der Deal lebt dann von Wertsteigerung, nicht von Cashflow.',
          gewicht: -10,
          schwere: 'hoch',
          quelle: 'kennzahl',
        });
      }
    }

    if (cashflow.bruttorendite >= 6) {
      punkte.push({
        id: 'rendite_hoch',
        typ: 'pro',
        kategorie: KATEGORIEN.RENDITE,
        titel: `Bruttomietrendite ${n(cashflow.bruttorendite, 1)} %`,
        text: 'Deutlich über dem Marktschnitt. Prüfe, ob der Grund ein Risiko ist (Lage, Zustand, Leerstand).',
        gewicht: 8,
        schwere: 'mittel',
        quelle: 'kennzahl',
      });
    } else if (cashflow.bruttorendite > 0 && cashflow.bruttorendite < 3.5) {
      punkte.push({
        id: 'rendite_niedrig',
        typ: 'contra',
        kategorie: KATEGORIEN.RENDITE,
        titel: `Bruttomietrendite nur ${n(cashflow.bruttorendite, 1)} %`,
        text: 'Unter dem aktuellen Zinsniveau — negativer Leverage, die Finanzierung frisst die Rendite auf.',
        gewicht: -9,
        schwere: 'hoch',
        quelle: 'kennzahl',
      });
    }

    if (cashflow.breakEvenZins !== null && cashflow.breakEvenZins > 0) {
      const puffer = cashflow.breakEvenZins - Number(settings.zinssatz ?? 0);
      if (puffer >= 1.5) {
        punkte.push({
          id: 'zinspuffer',
          typ: 'pro',
          kategorie: KATEGORIEN.RENDITE,
          titel: `Zinspuffer ${n(puffer, 1)} Prozentpunkte`,
          text: `Erst ab ${n(cashflow.breakEvenZins, 1)} % Sollzins kippt der Cashflow ins Minus — solide Reserve für die Anschlussfinanzierung.`,
          gewicht: 6,
          schwere: 'mittel',
          quelle: 'kennzahl',
        });
      } else if (puffer < 0.5) {
        punkte.push({
          id: 'zinspuffer_duenn',
          typ: 'contra',
          kategorie: KATEGORIEN.RENDITE,
          titel: 'Kaum Zinspuffer',
          text: `Schon ab ${n(cashflow.breakEvenZins, 1)} % Sollzins ist der Cashflow negativ. Bei der Anschlussfinanzierung riskant.`,
          gewicht: -7,
          schwere: 'mittel',
          quelle: 'kennzahl',
        });
      }
    }

    if (cashflow.mietsteigerungPotenzialProzent !== null && cashflow.mietsteigerungPotenzialProzent >= 12) {
      punkte.push({
        id: 'mietpotenzial',
        typ: 'pro',
        kategorie: KATEGORIEN.MIETE,
        titel: `Mietpotenzial +${Math.round(cashflow.mietsteigerungPotenzialProzent)} %`,
        text: `Ist-Miete ${Math.round(cashflow.istMieteMonat)} € vs. Marktmiete ca. ${Math.round(cashflow.potenzialMieteMonat)} €. Nach Mieterwechsel oder Modernisierung hebbar (Kappungsgrenze beachten).`,
        gewicht: 9,
        schwere: 'hoch',
        quelle: 'kennzahl',
      });
    } else if (
      cashflow.mietsteigerungPotenzialProzent !== null &&
      cashflow.mietsteigerungPotenzialProzent <= -10
    ) {
      punkte.push({
        id: 'miete_ueber_markt',
        typ: 'contra',
        kategorie: KATEGORIEN.MIETE,
        titel: 'Ist-Miete über Marktniveau',
        text: 'Die aktuelle Miete liegt über der geschätzten Marktmiete. Bei Mieterwechsel droht der Cashflow zu sinken.',
        gewicht: -8,
        schwere: 'mittel',
        quelle: 'kennzahl',
      });
    }

    if (cashflow.eigenkapital <= 0) {
      punkte.push({
        id: 'vollfinanzierung',
        typ: 'hinweis',
        kategorie: KATEGORIEN.KOSTEN,
        titel: 'Vollfinanzierung gerechnet',
        text: `Gerechnet mit ${settings.finanzierungsgrad ?? 100} % Beleihung${settings.nebenkostenMitfinanzieren ? ' inkl. Kaufnebenkosten' : ''}. Banken verlangen dafür in der Regel Bonität, Zusatzsicherheiten oder einen Zinsaufschlag von 0,3–0,8 %.`,
        gewicht: -3,
        schwere: 'info',
        quelle: 'kennzahl',
      });
    }

    if (cashflow.nebenkosten.quote >= 12) {
      punkte.push({
        id: 'hohe_nebenkosten',
        typ: 'contra',
        kategorie: KATEGORIEN.KOSTEN,
        titel: `Kaufnebenkosten ${n(cashflow.nebenkosten.quote, 1)} %`,
        text: `${Math.round(cashflow.nebenkosten.summe).toLocaleString('de-DE')} € on top — davon ${Math.round(cashflow.nebenkosten.makler).toLocaleString('de-DE')} € Courtage. Bei 100-%-Finanzierung ist das dein Eigenkapitalbedarf.`,
        gewicht: -5,
        schwere: 'mittel',
        quelle: 'kennzahl',
      });
    }
  }

  // --- Datenqualitaet ---
  if (listing.mietQuelle === 'geschaetzt') {
    punkte.push({
      id: 'miete_geschaetzt',
      typ: 'hinweis',
      kategorie: KATEGORIEN.MIETE,
      titel: 'Miete ist geschätzt',
      text: `Das Angebot enthält keine Mietangabe. Angesetzt sind ${n(listing.mietPreisProQm, 2)} €/m² aus dem regionalen Mietniveau — vor Kaufentscheidung mit dem echten Mietspiegel abgleichen.`,
      gewicht: -3,
      schwere: 'info',
      quelle: 'daten',
    });
  }

  if (!listing.bilder || listing.bilder.length === 0) {
    punkte.push({
      id: 'keine_bilder',
      typ: 'hinweis',
      kategorie: KATEGORIEN.ZUSTAND,
      titel: 'Keine Bilder im Exposé',
      text: 'Angebote ohne Bilder sind oft Off-Market, Zwangsversteigerung oder in schlechtem Zustand.',
      gewicht: -2,
      schwere: 'info',
      quelle: 'daten',
    });
  }

  // --- Score ---
  const summe = punkte.reduce((acc, p) => acc + p.gewicht, 0);
  // 50 ist die neutrale Mitte. Die Enden bleiben bei 3 bzw. 97 offen: eine
  // Textanalyse kann ein Objekt weder freisprechen noch endgueltig verurteilen.
  const score = Math.max(3, Math.min(97, Math.round(50 + summe)));

  const pro = punkte.filter((p) => p.typ === 'pro').sort((a, b) => b.gewicht - a.gewicht);
  const contra = punkte.filter((p) => p.typ === 'contra').sort((a, b) => a.gewicht - b.gewicht);
  const hinweise = punkte.filter((p) => p.typ === 'hinweis');

  return {
    score,
    bewertung: bewertungsLabel(score),
    pro,
    contra,
    hinweise,
    alle: punkte,
    flags: {
      renovierungsbedarf: treffer.has('sanierungsbeduerftig') || treffer.has('renovierungsbeduerftig'),
      kernsaniert: treffer.has('kernsaniert') || treffer.has('neubau'),
      erbbaurecht: treffer.has('erbbaurecht'),
      vermietet: treffer.has('vermietet') && !treffer.has('bezugsfrei'),
      provisionsfrei: treffer.has('provisionsfrei'),
      schadstoffe: treffer.has('asbest'),
    },
  };
}

export function bewertungsLabel(score) {
  if (score >= 78) return { kurz: 'Top', lang: 'Sehr aussichtsreich', ton: 'top' };
  if (score >= 62) return { kurz: 'Gut', lang: 'Solider Kandidat', ton: 'gut' };
  if (score >= 45) return { kurz: 'Mittel', lang: 'Genauer prüfen', ton: 'mittel' };
  if (score >= 30) return { kurz: 'Schwach', lang: 'Viele Schwachpunkte', ton: 'schwach' };
  return { kurz: 'Finger weg', lang: 'Überwiegend Risiken', ton: 'kritisch' };
}

/** Grober Renovierungskosten-Schaetzer fuer die Detailansicht. */
export function renovierungsSchaetzung(listing, flags) {
  const flaeche = Number(listing.wohnflaeche) || 0;
  if (!flaeche) return null;
  if (flags.kernsaniert) return { von: 0, bis: flaeche * 100, stufe: 'keine' };
  if (flags.renovierungsbedarf) {
    const kern = /sanierungsbed|kernsanierung/i.test(
      [listing.beschreibung, listing.titel, listing.ausstattungText].filter(Boolean).join(' '),
    );
    return kern
      ? { von: flaeche * 600, bis: flaeche * 1200, stufe: 'kernsanierung' }
      : { von: flaeche * 250, bis: flaeche * 500, stufe: 'renovierung' };
  }
  const baujahr = Number(listing.baujahr);
  if (Number.isFinite(baujahr) && baujahr < 1980) {
    return { von: flaeche * 150, bis: flaeche * 400, stufe: 'altbestand' };
  }
  return { von: 0, bis: flaeche * 150, stufe: 'gering' };
}
