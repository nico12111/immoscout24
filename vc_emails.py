#!/usr/bin/env python3
"""Sucht auf den Websites von VC-Fonds nach Kontakt-E-Mail-Adressen.

Eingabe: OpenVC-Export (Spalten "Investor name", "Website") und optional die
Liste "New VC Funds" (Spalte "Firm", ohne Website; Fonds werden über den Namen
mit der OpenVC-Liste abgeglichen).

Pro Fonds: Startseite laden, Links zu Kontakt/Impressum/About/Team auf derselben
Domain folgen (max. 4 Unterseiten), E-Mails per Regex und mailto: einsammeln.
Mehrere Websites werden parallel abgerufen, pro Website aber nur ein Aufruf
nach dem anderen.
"""

import argparse
import csv
import html
import re
import sys
import queue
import threading
import time
import urllib.request
from pathlib import Path
from urllib.parse import urljoin, urlparse

from openpyxl import load_workbook
from tqdm import tqdm

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,24}")
# einfache Verschleierungen: name [at] domain [dot] com
OBFUSCATED_RE = re.compile(
    r"([A-Za-z0-9._%+\-]+)\s*[\[\(\{]\s*(?:at|@)\s*[\]\)\}]\s*([A-Za-z0-9\-]+)\s*[\[\(\{]\s*(?:dot|\.)\s*[\]\)\}]\s*([A-Za-z]{2,24})",
    re.I)
LINK_RE = re.compile(r"""href\s*=\s*["']([^"'#]+)["']""", re.I)
CONTACT_HINTS = ("contact", "kontakt", "impressum", "imprint", "legal", "about", "team", "pitch", "apply")
FILE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico", "css", "js", "avif", "pdf"}
IGNORED_DOMAINS = ("example.com", "sentry.io", "wixpress.com", "sentry-next.wixpress.com", "domain.com",
                   "email.com", "yourdomain.com", "godaddy.com", "squarespace.com")
MAX_SUBPAGES = 4

OUT_FIELDS = ["firm", "website", "source", "emails", "status"]


def norm_name(name):
    name = re.sub(r"\b(ventures?|capital|partners|fund|vc|management|investments?|group|llc|ltd|gmbh)\b",
                  "", str(name).lower())
    return re.sub(r"[^a-z0-9]", "", name)


def read_firms(openvc_path, newfunds_path=None):
    ws = load_workbook(openvc_path, read_only=True).worksheets[0]
    rows = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h else "" for h in next(rows)]
    i_name, i_web = header.index("Investor name"), header.index("Website")
    firms, by_name = [], {}
    for r in rows:
        name = r[i_name] if i_name < len(r) else None
        if not name:
            continue
        web = (r[i_web] or "").strip() if i_web < len(r) and r[i_web] else ""
        firms.append({"firm": str(name).strip(), "website": web, "source": "OpenVC"})
        by_name.setdefault(norm_name(name), web)

    if newfunds_path:
        ws = load_workbook(newfunds_path, read_only=True).worksheets[0]
        rows = ws.iter_rows(values_only=True)
        header = [str(h).strip() if h else "" for h in next(rows)]
        i_firm = header.index("Firm")
        seen = {norm_name(f["firm"]) for f in firms}
        for r in rows:
            name = r[i_firm] if i_firm < len(r) else None
            if not name or norm_name(name) in seen:
                continue
            seen.add(norm_name(name))
            firms.append({"firm": str(name).strip(), "website": by_name.get(norm_name(name), ""),
                          "source": "New VC Funds 2026"})
    return firms


def fetch(url, timeout):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "en,de;q=0.8"})
    deadline = time.monotonic() + timeout * 2
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        ctype = resp.headers.get("Content-Type", "")
        if "html" not in ctype and "text" not in ctype:
            return resp.geturl(), ""
        # In Stücken lesen und nach spätestens 2 × timeout abbrechen, damit eine Seite,
        # die nur tröpfchenweise sendet, nicht ewig hängt.
        chunks, size = [], 0
        while size < 2_000_000:
            if time.monotonic() > deadline:
                raise TimeoutError("Seite zu langsam")
            chunk = resp.read1(65536)
            if not chunk:
                break
            chunks.append(chunk)
            size += len(chunk)
        raw = b"".join(chunks)
        charset = resp.headers.get_content_charset() or "utf-8"
        return resp.geturl(), raw.decode(charset, errors="replace")


def extract_emails(page):
    text = html.unescape(page)
    found = EMAIL_RE.findall(text)
    found += [f"{a}@{b}.{c}" for a, b, c in OBFUSCATED_RE.findall(text)]
    result = []
    for e in found:
        e = e.strip(".-").lower()
        local, _, domain = e.partition("@")
        if not local or ".." in e or domain.rsplit(".", 1)[-1] in FILE_EXTENSIONS:
            continue
        if re.fullmatch(r"\d+x", local) or any(domain.endswith(d) for d in IGNORED_DOMAINS):
            continue
        if e not in result:
            result.append(e)
    return result


def contact_links(base_url, page):
    host = urlparse(base_url).netloc.removeprefix("www.")
    links = []
    for href in LINK_RE.findall(page):
        url = urljoin(base_url, html.unescape(href.strip()))
        p = urlparse(url)
        if p.scheme not in ("http", "https") or p.netloc.removeprefix("www.") != host:
            continue
        if any(h in p.path.lower() for h in CONTACT_HINTS) and url not in links:
            links.append(url)
    return links[:MAX_SUBPAGES]


def scan(firm, timeout):
    url = firm["website"]
    if not url:
        return [], "keine Website"
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        final_url, page = fetch(url, timeout)
    except Exception as e:
        return [], f"Fehler: {type(e).__name__}"
    emails = extract_emails(page)
    for mailto in re.findall(r"mailto:([^\"'?>\s]+)", page, re.I):
        emails += [m for m in extract_emails(mailto) if m not in emails]
    for link in contact_links(final_url, page):
        try:
            _, sub = fetch(link, timeout)
        except Exception:
            continue
        emails += [m for m in extract_emails(sub) if m not in emails]
    return emails, ("ok" if emails else "keine E-Mail")


def main(argv=None):
    p = argparse.ArgumentParser(description="E-Mails von VC-Websites sammeln.")
    p.add_argument("openvc", help="OpenVC-Export (.xlsx)")
    p.add_argument("--new-funds", help="Liste 'New VC Funds' (.xlsx), optional")
    p.add_argument("--out", default="vc_emails.csv", help="Ausgabe (Standard: vc_emails.csv)")
    p.add_argument("--workers", type=int, default=8, help="Websites parallel (Standard: 8)")
    p.add_argument("--timeout", type=int, default=15, help="Timeout pro Seite in Sekunden (Standard: 15)")
    p.add_argument("--max-seconds", type=int, default=120,
                   help="Fonds aufgeben, wenn er insgesamt länger braucht (Standard: 120)")
    args = p.parse_args(argv)

    firms = read_firms(args.openvc, args.new_funds)
    out = Path(args.out)
    done = set()
    if out.exists():
        with out.open(newline="", encoding="utf-8") as f:
            done = {r["firm"] for r in csv.DictReader(f)}
    todo = [f for f in firms if f["firm"] not in done]
    print(f"{len(firms)} Fonds, {len(done)} bereits erledigt, {len(todo)} offen.")
    print("Läuft – bitte nicht ins Fenster klicken. Fertig ist es erst, wenn unten 'Fertig.' steht.")

    new = not out.exists()
    results = queue.Queue()

    def worker(firm):
        try:
            emails, status = scan(firm, args.timeout)
        except Exception as e:
            emails, status = [], f"Fehler: {type(e).__name__}"
        results.put((id(firm), emails, status))

    # Eigene Daemon-Threads statt ThreadPoolExecutor: Ein Fonds, der länger als
    # --max-seconds hängt (egal wo), wird aufgegeben und blockiert keinen Platz.
    with out.open("a", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=OUT_FIELDS)
        if new:
            writer.writeheader()

        def write(firm, emails, status):
            writer.writerow({**firm, "emails": ";".join(emails), "status": status})
            fh.flush()
            bar.update(1)

        pending, active = list(todo), {}
        bar = tqdm(total=len(todo), unit="Fonds")
        last_status = time.monotonic()
        try:
            while pending or active:
                if time.monotonic() - last_status >= 15:
                    # Lebenszeichen, damit man sieht, dass das Skript noch arbeitet
                    waiting = ", ".join(f["firm"] for f, _ in list(active.values())[:3])
                    tqdm.write(f"… läuft noch, {len(active)} Websites in Arbeit (z. B. {waiting})")
                    last_status = time.monotonic()
                while pending and len(active) < args.workers:
                    firm = pending.pop(0)
                    active[id(firm)] = (firm, time.monotonic())
                    threading.Thread(target=worker, args=(firm,), daemon=True).start()
                try:
                    key, emails, status = results.get(timeout=1)
                    if key in active:  # Ergebnis eines aufgegebenen Fonds ignorieren
                        write(active.pop(key)[0], emails, status)
                except queue.Empty:
                    pass
                now = time.monotonic()
                for key, (firm, started) in list(active.items()):
                    if now - started > args.max_seconds:
                        del active[key]
                        write(firm, [], "Fehler: hängt")
                        tqdm.write(f"Aufgegeben (hängt): {firm['firm']} – {firm['website']}")
        except KeyboardInterrupt:
            bar.close()
            print("\nAbgebrochen – gespeichert. Gleicher Befehl setzt fort.")
            return 130
        bar.close()

    # Zusätzlich: eine Spalte, jede Adresse nur einmal
    seen = []
    with out.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            seen += [e for e in r["emails"].split(";") if e and e not in seen]
    only = out.with_name(out.stem + "_nur_emails.csv")
    with only.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["email"])
        w.writerows([e] for e in seen)
    print(f"Fertig. {len(seen)} Adressen → {only}, Details → {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
