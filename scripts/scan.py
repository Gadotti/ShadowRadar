#!/usr/bin/env python3
"""ShadowRadar CVE scanner — queries NIST NVD and optionally enriches via Claude AI.

Usage:
  python scan.py --db <path_to_db> [--asset-id <id>]
"""

import argparse
import datetime
import json
import sqlite3
import sys
import time

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package required. Run: pip install requests>=2.31", file=sys.stderr)
    sys.exit(1)


# ── Logging ───────────────────────────────────────────────────────────────────

def _log(level, msg):
    ts = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).strftime('%Y-%m-%dT%H:%M:%SZ')
    print(f"[{ts}] [{level}] {msg}", flush=True)

def info(msg):  _log('INFO',  msg)
def warn(msg):  _log('WARN',  msg)
def err(msg):   _log('ERROR', msg)


# ── Database helpers ──────────────────────────────────────────────────────────

def open_db(path):
    try:
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn
    except sqlite3.Error as e:
        print(f"FATAL: Cannot open database '{path}': {e}", file=sys.stderr)
        sys.exit(1)


def now_str():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).strftime('%Y-%m-%d %H:%M:%S')


def load_config(db):
    rows = db.execute("SELECT key, value FROM config").fetchall()
    cfg = {r['key']: r['value'] for r in rows}
    return {
        'nist': {
            'page_size': int(cfg.get('nist.page_size') or '50'),
            'api_key':   cfg.get('nist.api_key') or '',
        },
        'ai': {
            'enabled':     (cfg.get('ai.enabled') or 'false') == 'true',
            'api_url':     cfg.get('ai.api_url') or 'https://api.anthropic.com',
            'api_key':     cfg.get('ai.api_key') or '',
            'model':       cfg.get('ai.model') or 'claude-sonnet-4-6',
            'max_tokens':  int(cfg.get('ai.max_tokens') or '16000'),
            'temperature': float(cfg.get('ai.temperature') or '0'),
            'batch_size':  int(cfg.get('ai.batch_size') or '20'),
        },
    }


def get_assets(db, asset_id=None):
    if asset_id is not None:
        rows = db.execute(
            "SELECT id, name, tag, url, current_version, cve_start_date "
            "FROM assets WHERE id = ? AND active = 1",
            (asset_id,)
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT id, name, tag, url, current_version, cve_start_date "
            "FROM assets WHERE active = 1"
        ).fetchall()
    return [dict(r) for r in rows]


def update_scan_run(db, run_id, **kwargs):
    allowed = {'assets_scanned', 'cves_found', 'error_message'}
    fields = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
    if not fields:
        return
    sets = ', '.join(f"{k}=?" for k in fields)
    db.execute(f"UPDATE scan_runs SET {sets} WHERE id=?", (*fields.values(), run_id))
    db.commit()


def finalize_scan_run(db, run_id, status, error_message=None):
    db.execute(
        "UPDATE scan_runs SET status=?, finished_at=?, error_message=COALESCE(?, error_message) WHERE id=?",
        (status, now_str(), error_message, run_id)
    )
    db.commit()


# ── NIST NVD API ──────────────────────────────────────────────────────────────

NIST_URL   = 'https://services.nvd.nist.gov/rest/json/cves/2.0'
MAX_RETRIES = 3


def _extract_severity(metrics):
    """Priority: cvssMetricV31 > cvssMetricV30 > cvssMetricV2."""
    for key in ('cvssMetricV31', 'cvssMetricV30'):
        items = metrics.get(key, [])
        if items:
            data = items[0].get('cvssData', {})
            sev   = data.get('baseSeverity', 'NONE').upper()
            score = float(data.get('baseScore', 0.0))
            return sev, score

    items = metrics.get('cvssMetricV2', [])
    if items:
        score = float(items[0].get('cvssData', {}).get('baseScore', 0.0))
        if score >= 7.0:   sev = 'HIGH'
        elif score >= 4.0: sev = 'MEDIUM'
        elif score > 0.0:  sev = 'LOW'
        else:              sev = 'NONE'
        return sev, score

    return 'NONE', 0.0


def _get_description(descriptions):
    for d in descriptions:
        if d.get('lang') == 'en':
            return d.get('value', '')
    return descriptions[0].get('value', '') if descriptions else ''


def fetch_nist_cves(asset, config):
    """Return list of normalised CVE dicts for the given asset."""
    nist_cfg  = config['nist']
    api_key   = nist_cfg['api_key']
    page_size = nist_cfg['page_size']
    delay     = 0.6 if api_key else 6.0
    headers   = {'apiKey': api_key} if api_key else {}

    start_date = asset.get('cve_start_date') or '2020-01-01'
    offset  = 0
    results = []

    while True:
        params = {
            'keywordSearch':  asset['name'],
            'pubStartDate':   f"{start_date}T00:00:00.000Z",
            'resultsPerPage': page_size,
            'startIndex':     offset,
        }

        resp = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                resp = requests.get(NIST_URL, params=params, headers=headers, timeout=30)
                if resp.status_code in (429, 503):
                    wait = 10 * attempt
                    warn(f"NIST HTTP {resp.status_code}, backing off {wait}s (attempt {attempt}/{MAX_RETRIES})")
                    time.sleep(wait)
                    resp = None
                    continue
                resp.raise_for_status()
                break
            except requests.exceptions.RequestException as e:
                if attempt == MAX_RETRIES:
                    raise RuntimeError(f"NIST request failed after {MAX_RETRIES} attempts: {e}") from e
                warn(f"NIST request error: {e} (attempt {attempt}/{MAX_RETRIES}), retrying in {5*attempt}s")
                time.sleep(5 * attempt)

        if resp is None:
            raise RuntimeError(f"NIST unavailable after {MAX_RETRIES} attempts (rate limited)")

        data  = resp.json()
        total = data.get('totalResults', 0)

        for item in data.get('vulnerabilities', []):
            cve_data = item.get('cve', {})
            cve_id   = cve_data.get('id', '')
            desc     = _get_description(cve_data.get('descriptions', []))
            sev, score = _extract_severity(cve_data.get('metrics', {}))
            published  = (cve_data.get('published') or '')[:10]
            results.append({
                'cve_id':       cve_id,
                'description':  desc,
                'severity':     sev,
                'cvss_score':   score,
                'published_at': published,
            })

        offset += len(data.get('vulnerabilities', []))
        if offset >= total:
            break

        time.sleep(delay)

    return results


# ── CVE upsert ────────────────────────────────────────────────────────────────

def upsert_cve(db, asset_id, cve):
    scanned = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).strftime('%Y-%m-%dT%H:%M:%SZ')
    existing = db.execute(
        "SELECT id FROM asset_cves WHERE asset_id=? AND cve_id=?",
        (asset_id, cve['cve_id'])
    ).fetchone()

    if existing:
        # Update only NIST-owned fields; preserve user assessment and AI fields
        db.execute(
            "UPDATE asset_cves SET description=?, severity=?, cvss_score=?, scanned_at=? "
            "WHERE asset_id=? AND cve_id=?",
            (cve['description'], cve['severity'], cve['cvss_score'], scanned,
             asset_id, cve['cve_id'])
        )
    else:
        db.execute(
            "INSERT INTO asset_cves (asset_id, cve_id, description, severity, cvss_score, published_at, scanned_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (asset_id, cve['cve_id'], cve['description'], cve['severity'],
             cve['cvss_score'], cve.get('published_at'), scanned)
        )
    db.commit()


# ── Asset scan ────────────────────────────────────────────────────────────────

def scan_asset(db, asset, config):
    """Fetch CVEs from NIST and upsert them. Returns count of CVEs processed."""
    tag_suffix = f" [{asset['tag']}]" if asset.get('tag') else ''
    info(f"Scanning: {asset['name']}{tag_suffix} v{asset['current_version']} (id={asset['id']})")

    cves = fetch_nist_cves(asset, config)
    info(f"  -> {len(cves)} CVE(s) found")

    for cve in cves:
        upsert_cve(db, asset['id'], cve)

    return len(cves)


# ── AI assessment ─────────────────────────────────────────────────────────────

def _build_prompt(batch):
    items_json = json.dumps([{
        'cve_id':        c['cve_id'],
        'asset_name':    c['asset_name'],
        'asset_version': c['asset_version'],
        'description':   c['description'],
        'severity':      c['severity'],
        'cvss_score':    c['cvss_score'],
    } for c in batch], ensure_ascii=False, indent=2)

    return (
        "Você é um analista de segurança. Para cada CVE abaixo, forneça uma análise "
        "contextual em uma ou duas frases sobre se a versão específica do ativo é "
        "afetada, com base nas informações disponíveis.\n\n"
        "Formato de resposta: JSON array com objetos { \"cve_id\": \"...\", \"assessment\": \"...\" }\n\n"
        f"CVEs para análise:\n{items_json}"
    )


def send_batch_to_claude(batch, config):
    """Call Claude API with a batch of CVEs. Returns list of {cve_id, assessment}."""
    ai_cfg = config['ai']
    url = f"{ai_cfg['api_url'].rstrip('/')}/v1/messages"
    headers = {
        'x-api-key':         ai_cfg['api_key'],
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
    }
    body = {
        'model':       ai_cfg['model'],
        'max_tokens':  ai_cfg['max_tokens'],
        'temperature': ai_cfg['temperature'],
        'messages':    [{'role': 'user', 'content': _build_prompt(batch)}],
    }

    resp = requests.post(url, headers=headers, json=body, timeout=120)
    resp.raise_for_status()

    text = resp.json()['content'][0]['text']
    # Extract JSON array, tolerating markdown code fences
    start = text.find('[')
    end   = text.rfind(']') + 1
    if start == -1 or end == 0:
        raise ValueError(f"No JSON array in Claude response: {text[:300]}")
    return json.loads(text[start:end])


def run_ai_assessment(db, config):
    rows = db.execute("""
        SELECT ac.id, ac.cve_id, ac.description, ac.severity, ac.cvss_score,
               a.name AS asset_name, a.current_version AS asset_version
        FROM asset_cves ac
        JOIN assets a ON a.id = ac.asset_id
        WHERE ac.ai_assessment IS NULL
    """).fetchall()

    if not rows:
        info("AI: no CVEs pending assessment — all already processed")
        return

    rows = [dict(r) for r in rows]
    info(f"AI: {len(rows)} CVE(s) pending assessment")

    batch_size = config['ai']['batch_size']
    total_batches = (len(rows) + batch_size - 1) // batch_size

    for i in range(0, len(rows), batch_size):
        batch      = rows[i:i + batch_size]
        batch_num  = i // batch_size + 1
        info(f"AI: sending batch {batch_num}/{total_batches} ({len(batch)} CVEs)")
        try:
            results = send_batch_to_claude(batch, config)
            id_map  = {r['cve_id']: r['id'] for r in batch}
            saved   = 0
            for item in results:
                row_id = id_map.get(item.get('cve_id'))
                if row_id and item.get('assessment'):
                    db.execute(
                        "UPDATE asset_cves SET ai_assessment=? WHERE id=?",
                        (str(item['assessment']), row_id)
                    )
                    saved += 1
            db.commit()
            info(f"AI: batch {batch_num}/{total_batches} saved ({saved} assessments)")
        except Exception as e:
            err(f"AI: batch {batch_num}/{total_batches} failed — {e}")
            # CVEs in this batch remain with ai_assessment=NULL; scan continues


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='ShadowRadar CVE scanner',
        epilog='Queries NIST NVD and optionally enriches CVEs via Claude AI.'
    )
    parser.add_argument('--db',       required=True, help='Path to SQLite database file')
    parser.add_argument('--asset-id', type=int, default=None, dest='asset_id',
                        help='Scan only this specific asset ID (default: all active assets)')
    args = parser.parse_args()

    db = open_db(args.db)

    # Support both Node.js-managed mode (scan_run pre-created) and standalone mode
    run_row = db.execute(
        "SELECT id FROM scan_runs WHERE status='running' ORDER BY id DESC LIMIT 1"
    ).fetchone()

    standalone = run_row is None
    if standalone:
        cur = db.execute(
            "INSERT INTO scan_runs (started_at, status) VALUES (?, 'running')",
            (now_str(),)
        )
        db.commit()
        run_id = cur.lastrowid
        info(f"Standalone mode: created scan_run id={run_id}")
    else:
        run_id = run_row['id']
        info(f"Attached to existing scan_run id={run_id}")

    config        = load_config(db)
    assets        = get_assets(db, args.asset_id)
    assets_scanned = 0
    total_cves     = 0
    scan_errors    = []

    info(f"Assets to scan: {len(assets)}")

    try:
        for asset in assets:
            try:
                count = scan_asset(db, asset, config)
                total_cves += count
            except Exception as e:
                msg = f"Asset '{asset['name']}' (id={asset['id']}): {e}"
                err(msg)
                scan_errors.append(msg)
            finally:
                assets_scanned += 1
                update_scan_run(db, run_id, assets_scanned=assets_scanned, cves_found=total_cves)

        if config['ai']['enabled']:
            if config['ai']['api_key']:
                info("Running AI assessment...")
                run_ai_assessment(db, config)
            else:
                warn("AI enabled but api_key not configured — skipping AI assessment")

        error_summary = None
        if scan_errors:
            error_summary = '; '.join(scan_errors[:3])
            if len(scan_errors) > 3:
                error_summary += f' (and {len(scan_errors) - 3} more)'
            update_scan_run(db, run_id, error_message=error_summary)

        info(f"Scan complete: {assets_scanned} asset(s) scanned, {total_cves} CVE(s) found")

        if standalone:
            final_status = 'failed' if scan_errors else 'completed'
            finalize_scan_run(db, run_id, final_status)

        db.close()
        sys.exit(0)

    except Exception as e:
        err(f"Fatal error: {e}")
        update_scan_run(db, run_id, error_message=str(e))
        if standalone:
            finalize_scan_run(db, run_id, 'failed', str(e))
        db.close()
        sys.exit(1)


if __name__ == '__main__':
    main()
