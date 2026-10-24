# Seller-E-Mails aus Keepa-Export

Liest für Verkäufer aus einem Keepa-Export („KeepaExport-…-TopSellerList.xlsx“) die
E-Mail-Adressen aus dem öffentlichen Amazon-Verkäuferprofil
(`https://www.amazon.de/sp?seller=<Seller Id>`, Blöcke „Info zum Verkäufer“ und
„Impressum & Info zum Verkäufer“) und speichert sie nach Sprache getrennt.

## Installation

```bash
cd <repo-ordner>
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
```

## Aufruf

```bash
python seller_emails.py KeepaExport.xlsx --countries DE --min-ratings 1000 --limit 300
```

Nach einem Abbruch (Robot-Check, Strg+C, Netzwerkfehler) einfach mit `--resume`
und denselben Filtern weitermachen:

```bash
python seller_emails.py KeepaExport.xlsx --countries DE --min-ratings 1000 --limit 300 --resume
```

| Option | Bedeutung |
|---|---|
| `--countries DE,AT,CH` | nur diese Ländercodes (Spalte „Country“) |
| `--min-ratings 500` | mindestens so viele „Rating Count: Lifetime“ |
| `--fba yes\|no` | nur mit / ohne FBA |
| `--category "Computer"` | Teilstring in „Selling primarily: Category“ |
| `--limit 500` | höchstens so viele Verkäufer |
| `--priority DE,AT,CH,…` | diese Länder zuerst, in dieser Reihenfolge (Standard: DE, AT, CH, dann Europa, dann alle anderen); innerhalb eines Landes nach Bewertungen absteigend |
| `--resume` | bereits verarbeitete Seller IDs (`progress.json`) überspringen |
| `--out-dir ordner` | Ausgabeordner (Standard: aktueller Ordner) |
| `--headful` | Browserfenster sichtbar machen |

## Ausgabe

- `emails_de.csv`, `emails_en.csv`: eine Spalte `email`, über alle Verkäufer dedupliziert
- Adressen mit „datenschutz“ vor dem @ (`datenschutz@`, `datenschutzbeauftragter@` …) werden nicht übernommen
- `log.csv`: Seller Id, Name, Land (Keepa / Geschäftsadresse), E-Mails, Sprache, Status
  (`ok`, `keine E-Mail`, `blockiert`, `Fehler: …`)
- `progress.json`: bereits verarbeitete Seller IDs

**Deutsch**, wenn Country (Keepa) DE/AT/CH/LI ist, sonst (Country leer/„-“) wenn das
Land der Geschäftsadresse DE/AT/CH/LI ist, sonst (beides unbekannt) wenn die
E-Mail-Domain auf .de/.at/.ch endet. Alles andere: **Englisch**.

## Verhalten bei Sperren

Bilder, Videos und Schriften werden nicht geladen. Ein Seitenaufruf nach dem anderen, 6–12 Sekunden zufällige Pause dazwischen.
Liefert Amazon eine CAPTCHA-, Robot-Check- oder Fehlerseite (HTTP 429/5xx), wird
**nicht** versucht, das zu umgehen: Der Fortschritt wird gespeichert, das Programm
beendet sich (Exit-Code 2), und du setzt später mit `--resume` fort. Nach 3 Fehlern
in Folge (z. B. Timeouts) wird ebenfalls angehalten (Exit-Code 3).

Durchsatz: ca. 9 s pro Verkäufer → rund 400 pro Stunde, wenn Amazon nicht sperrt.
Alle ~84.700 Verkäufer wären reine Laufzeit von gut 9 Tagen; realistisch kommen
Sperren dazu. Deshalb vorher filtern.

## Rechtlicher Hinweis

Eine Impressums-Adresse ist **keine Einwilligung** in Werbe-E-Mails. Werbung per
E-Mail ohne vorherige Einwilligung ist nach § 7 Abs. 2 UWG auch gegenüber
Unternehmen unzulässig (abmahnfähig), dazu kommt die DSGVO, sobald Adressen
personenbezogen sind (z. B. vorname.nachname@…). Automatisierter Abruf verstößt
außerdem gegen die Nutzungsbedingungen von Amazon.
