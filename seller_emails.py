#!/usr/bin/env python3
"""Liest E-Mail-Adressen aus öffentlichen Amazon-Verkäuferprofilen (Impressum)
für Verkäufer aus einem Keepa-TopSellerList-Export und speichert sie nach
Sprache getrennt (emails_de.csv / emails_en.csv).

Höflicher, sequenzieller Abruf. Bei CAPTCHA/Robot-Check/Fehlerseite wird
NICHT umgangen, sondern der Fortschritt gespeichert und sauber beendet.
"""

import argparse
import csv
import json
import os
import random
import re
import sys
import time
from pathlib import Path

from openpyxl import load_workbook
from tqdm import tqdm

SELLER_URL = "https://www.amazon.de/sp?seller={seller_id}"
GERMAN_COUNTRIES = {"DE", "AT", "CH", "LI"}
GERMAN_TLDS = (".de", ".at", ".ch")

COL_NAME = "Name"
COL_SELLER_ID = "Seller Id"
COL_COUNTRY = "Country"
COL_RATINGS = "Rating Count: Lifetime"
COL_FBA = "Uses FBA"
COL_CATEGORY = "Selling primarily: Category"
REQUIRED_COLUMNS = [COL_NAME, COL_SELLER_ID, COL_COUNTRY, COL_RATINGS, COL_FBA, COL_CATEGORY]

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,24}")
FILE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico", "css", "js", "avif"}
IGNORED_DOMAINS = ("amazon.", "amazonaws.", "media-amazon.", "ssl-images-amazon.")
# Datenschutz-Adressen (datenschutz@, datenschutzbeauftragter@ …) nicht übernehmen.
PRIVACY_LOCAL_RE = re.compile(r"datenschutz")

BLOCK_MARKERS = (
    "geben sie die unten angezeigten zeichen ein",
    "enter the characters you see below",
    "type the characters you see in this image",
    "bitte bestätigen sie, dass sie kein roboter sind",
    "sorry, we just need to make sure you're not a robot",
    "es tut uns leid! beim verarbeiten ihrer anfrage ist ein fehler aufgetreten",
    "sorry! something went wrong",
)

# Alle Textknoten außerhalb von script/style, getrennt durch Zeilenumbrüche.
# Erfasst auch zugeklappte Blöcke (z. B. "Impressum & Info zum Verkäufer").
PAGE_TEXT_JS = """
() => {
  const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const parts = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement && skip.has(node.parentElement.tagName)) continue;
    const t = node.textContent.trim();
    if (t) parts.push(t);
  }
  return parts.join('\\n');
}
"""


class Blocked(Exception):
    """Amazon hat eine CAPTCHA-, Robot-Check- oder Fehlerseite geliefert."""


# --------------------------------------------------------------------------
# Input / Filter
# --------------------------------------------------------------------------

def clean(value):
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text == "-" else text


def to_int(value):
    text = clean(value).replace(".", "").replace(",", "")
    try:
        return int(float(text))
    except ValueError:
        return 0


def read_sellers(path):
    wb = load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = ws.iter_rows(values_only=True)
    header = [clean(h) for h in next(rows)]
    missing = [c for c in REQUIRED_COLUMNS if c not in header]
    if missing:
        sys.exit(f"Fehlende Spalten in {path}: {', '.join(missing)}")
    idx = {c: header.index(c) for c in REQUIRED_COLUMNS}

    sellers = []
    for row in rows:
        def get(col):
            i = idx[col]
            return row[i] if i < len(row) else None

        seller_id = clean(get(COL_SELLER_ID))
        if not seller_id:
            continue
        sellers.append({
            "seller_id": seller_id,
            "name": clean(get(COL_NAME)),
            "country": clean(get(COL_COUNTRY)).upper(),
            "ratings": to_int(get(COL_RATINGS)),
            "fba": clean(get(COL_FBA)).lower(),
            "category": clean(get(COL_CATEGORY)),
        })
    wb.close()
    return sellers


def is_truthy(text):
    return text in {"yes", "ja", "true", "1", "y"}


def apply_filters(sellers, args):
    result = sellers
    if args.countries:
        wanted = {c.strip().upper() for c in args.countries.split(",") if c.strip()}
        result = [s for s in result if s["country"] in wanted]
    if args.min_ratings is not None:
        result = [s for s in result if s["ratings"] >= args.min_ratings]
    if args.fba:
        want = args.fba == "yes"
        result = [s for s in result if is_truthy(s["fba"]) == want]
    if args.category:
        needle = args.category.lower()
        result = [s for s in result if needle in s["category"].lower()]

    # Doppelte Seller IDs im Export nur einmal verarbeiten.
    seen, unique = set(), []
    for s in result:
        if s["seller_id"] not in seen:
            seen.add(s["seller_id"])
            unique.append(s)

    unique.sort(key=lambda s: s["ratings"], reverse=True)
    if args.limit:
        unique = unique[: args.limit]
    return unique


# --------------------------------------------------------------------------
# Extraktion
# --------------------------------------------------------------------------

def extract_emails(text):
    found = []
    for match in EMAIL_RE.findall(text):
        email = match.strip(".-").lower()
        local, _, domain = email.partition("@")
        tld = domain.rsplit(".", 1)[-1]
        if not local or not domain or ".." in email:
            continue
        if tld in FILE_EXTENSIONS:
            continue
        if re.fullmatch(r"\d+x", local):  # z. B. logo@2x.png
            continue
        if PRIVACY_LOCAL_RE.search(local):
            continue
        if domain.startswith(IGNORED_DOMAINS) or any("." + d in domain for d in IGNORED_DOMAINS):
            continue
        if email not in found:
            found.append(email)
    return found


ADDRESS_LABEL_RE = re.compile(r"^(geschäftsadresse|business address)\s*:?\s*$", re.I)
NEXT_LABEL_RE = re.compile(r":\s*$|^(e-mail|telefon|phone|handelsregister|umsatzsteuer|vat)", re.I)


def extract_address_country(text):
    lines = [l.strip() for l in text.splitlines()]
    for i, line in enumerate(lines):
        if not ADDRESS_LABEL_RE.match(line):
            continue
        country = ""
        for nxt in lines[i + 1 : i + 12]:
            if not nxt or NEXT_LABEL_RE.search(nxt):
                break
            if re.fullmatch(r"[A-Z]{2}", nxt):
                country = nxt
        if country:
            return country
    return ""


def language_for(email, keepa_country, address_country):
    if keepa_country:
        return "de" if keepa_country in GERMAN_COUNTRIES else "en"
    if address_country:
        return "de" if address_country in GERMAN_COUNTRIES else "en"
    return "de" if email.endswith(GERMAN_TLDS) else "en"


# --------------------------------------------------------------------------
# Abruf
# --------------------------------------------------------------------------

def looks_blocked(url, title, text):
    if "captcha" in url.lower() or "/errors/" in url.lower():
        return True
    if "robot check" in title.lower():
        return True
    lower = text.lower()
    return any(marker in lower for marker in BLOCK_MARKERS)


def fetch_seller_text(page, seller_id, timeout_ms):
    response = page.goto(SELLER_URL.format(seller_id=seller_id),
                         wait_until="domcontentloaded", timeout=timeout_ms)
    status = response.status if response else 0
    if status in (429, 503) or status >= 500:
        raise Blocked(f"HTTP {status}")
    try:
        page.wait_for_selector("#seller-profile-container, #page-section-detail-seller-info",
                               timeout=min(timeout_ms, 10000))
    except Exception:
        pass
    text = page.evaluate(PAGE_TEXT_JS) or ""
    if looks_blocked(page.url, page.title(), text):
        raise Blocked("CAPTCHA/Robot-Check erkannt")
    return status, text


# --------------------------------------------------------------------------
# Persistenz
# --------------------------------------------------------------------------

class Store:
    LOG_FIELDS = ["seller_id", "name", "keepa_country", "address_country", "emails", "language", "status"]

    def __init__(self, out_dir, resume):
        self.out_dir = Path(out_dir)
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.progress_path = self.out_dir / "progress.json"
        self.paths = {"de": self.out_dir / "emails_de.csv", "en": self.out_dir / "emails_en.csv"}
        self.log_path = self.out_dir / "log.csv"

        if not resume:
            existing = [p for p in [self.progress_path, self.log_path, *self.paths.values()] if p.exists()]
            if existing:
                sys.exit("Es gibt bereits Ergebnisse in "
                         f"{self.out_dir}. Mit --resume fortsetzen oder die Dateien vorher löschen/verschieben.")

        self.done = set()
        if self.progress_path.exists():
            self.done = set(json.loads(self.progress_path.read_text(encoding="utf-8")).get("done", []))

        self.seen_emails = set()
        for path in self.paths.values():
            if path.exists():
                with path.open(newline="", encoding="utf-8") as f:
                    self.seen_emails.update(r["email"] for r in csv.DictReader(f) if r.get("email"))

        self._files = {}
        self._writers = {}
        self._log_fh = None

    def open(self):
        for lang, path in self.paths.items():
            new = not path.exists()
            fh = path.open("a", newline="", encoding="utf-8")
            w = csv.writer(fh)
            if new:
                w.writerow(["email"])
            self._files[lang], self._writers[lang] = fh, w

        new_log = not self.log_path.exists()
        self._log_fh = self.log_path.open("a", newline="", encoding="utf-8")
        self._log = csv.DictWriter(self._log_fh, fieldnames=self.LOG_FIELDS)
        if new_log:
            self._log.writeheader()

    def add_email(self, email, lang):
        if email in self.seen_emails:
            return False
        self.seen_emails.add(email)
        self._writers[lang].writerow([email])
        self._files[lang].flush()
        return True

    def log(self, seller, status, emails=(), languages=(), address_country=""):
        self._log.writerow({
            "seller_id": seller["seller_id"],
            "name": seller["name"],
            "keepa_country": seller["country"],
            "address_country": address_country,
            "emails": ";".join(emails),
            "language": ";".join(sorted(set(languages))),
            "status": status,
        })
        self._log_fh.flush()

    def mark_done(self, seller_id):
        self.done.add(seller_id)
        self.save_progress()

    def save_progress(self):
        tmp = self.progress_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps({"done": sorted(self.done)}), encoding="utf-8")
        os.replace(tmp, self.progress_path)

    def close(self):
        if self._log_fh is None:
            return
        self.save_progress()
        for fh in [*self._files.values(), self._log_fh]:
            fh.close()


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def parse_args(argv=None):
    p = argparse.ArgumentParser(description="E-Mail-Adressen aus Amazon-Verkäuferprofilen (Keepa-Export) auslesen.")
    p.add_argument("input", help="Keepa-Export (.xlsx)")
    p.add_argument("--countries", help="Ländercodes aus Spalte 'Country', z. B. DE,AT,CH")
    p.add_argument("--min-ratings", type=int, help="Mindestanzahl 'Rating Count: Lifetime'")
    p.add_argument("--fba", choices=["yes", "no"], help="Nur Verkäufer mit/ohne FBA")
    p.add_argument("--category", help="Teilstring in 'Selling primarily: Category'")
    p.add_argument("--limit", type=int, help="Maximal so viele Verkäufer verarbeiten")
    p.add_argument("--resume", action="store_true", help="Fortsetzen, bereits verarbeitete Seller IDs überspringen")
    p.add_argument("--out-dir", default=".", help="Ausgabeordner (Standard: aktueller Ordner)")
    p.add_argument("--headful", action="store_true", help="Browserfenster anzeigen")
    p.add_argument("--browser-path", help="Pfad zu einer eigenen Chromium-Installation (optional)")
    p.add_argument("--timeout", type=int, default=30, help="Seiten-Timeout in Sekunden (Standard: 30)")
    p.add_argument("--max-errors", type=int, default=3,
                   help="Nach so vielen Fehlern in Folge abbrechen (Standard: 3)")
    return p.parse_args(argv)


def run(args):
    sellers = apply_filters(read_sellers(args.input), args)
    store = Store(args.out_dir, args.resume)
    todo = [s for s in sellers if s["seller_id"] not in store.done]
    print(f"{len(sellers)} Verkäufer nach Filter, {len(sellers) - len(todo)} bereits erledigt, {len(todo)} offen.")
    store.close()
    if not todo:
        return 0

    from playwright.sync_api import sync_playwright

    exit_code = 0
    consecutive_errors = 0
    stats = {"ok": 0, "keine E-Mail": 0, "Fehler": 0, "neue E-Mails": 0}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not args.headful, executable_path=args.browser_path)
        store = Store(args.out_dir, resume=True)
        store.open()
        context = browser.new_context(locale="de-DE", extra_http_headers={"Accept-Language": "de-DE,de;q=0.9"})
        page = context.new_page()
        bar = tqdm(todo, unit="Verkäufer")
        try:
            for n, seller in enumerate(bar):
                if n > 0:
                    time.sleep(random.uniform(6, 12))
                bar.set_postfix_str(seller["seller_id"])
                try:
                    status, text = fetch_seller_text(page, seller["seller_id"], args.timeout * 1000)
                except Blocked as e:
                    store.log(seller, "blockiert")
                    tqdm.write(f"\nAmazon blockiert ({e}) bei {seller['seller_id']}. "
                               "Fortschritt gespeichert – später mit --resume fortsetzen.")
                    exit_code = 2
                    break
                except Exception as e:
                    consecutive_errors += 1
                    stats["Fehler"] += 1
                    store.log(seller, f"Fehler: {type(e).__name__}")
                    store.mark_done(seller["seller_id"])
                    if consecutive_errors >= args.max_errors:
                        tqdm.write(f"\n{consecutive_errors} Fehler in Folge (zuletzt: {e}). "
                                   "Fortschritt gespeichert – später mit --resume fortsetzen.")
                        exit_code = 3
                        break
                    continue

                if status == 404:
                    consecutive_errors += 1
                    stats["Fehler"] += 1
                    store.log(seller, "Fehler: HTTP 404")
                    store.mark_done(seller["seller_id"])
                    continue

                consecutive_errors = 0
                emails = extract_emails(text)
                address_country = extract_address_country(text)
                languages = []
                for email in emails:
                    lang = language_for(email, seller["country"], address_country)
                    languages.append(lang)
                    if store.add_email(email, lang):
                        stats["neue E-Mails"] += 1
                status_text = "ok" if emails else "keine E-Mail"
                stats[status_text] += 1
                store.log(seller, status_text, emails, languages, address_country)
                store.mark_done(seller["seller_id"])
        except KeyboardInterrupt:
            tqdm.write("\nAbgebrochen. Fortschritt gespeichert – später mit --resume fortsetzen.")
            exit_code = 130
        finally:
            bar.close()
            store.close()
            browser.close()

    print(f"Fertig: {stats['ok']} mit E-Mail, {stats['keine E-Mail']} ohne E-Mail, "
          f"{stats['Fehler']} Fehler, {stats['neue E-Mails']} neue Adressen.")
    print(f"Ergebnisse: {store.paths['de']}, {store.paths['en']}, {store.log_path}")
    return exit_code


if __name__ == "__main__":
    sys.exit(run(parse_args()))
