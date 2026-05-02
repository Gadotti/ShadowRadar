"""Stub scan.py for testing — sleeps 4s, updates scan_run, then exits."""
import sys
import time
import sqlite3
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--db', required=True)
parser.add_argument('--asset-id', type=int, default=None)
args = parser.parse_args()

db = sqlite3.connect(args.db)

# Find the current running scan_run
row = db.execute("SELECT id FROM scan_runs WHERE status='running' ORDER BY id DESC LIMIT 1").fetchone()
if not row:
    print("No running scan_run found", flush=True)
    sys.exit(1)

run_id = row[0]
print(f"Stub scan started for run_id={run_id}", flush=True)

# Simulate work
for i in range(1, 4):
    time.sleep(1)
    db.execute("UPDATE scan_runs SET assets_scanned=?, cves_found=? WHERE id=?", (i, i * 3, run_id))
    db.commit()
    print(f"Progress: {i} assets, {i*3} CVEs", flush=True)

db.execute(
    "UPDATE scan_runs SET assets_scanned=3, cves_found=9, finished_at=datetime('now'), status='completed' WHERE id=?",
    (run_id,)
)
db.commit()
db.close()
print("Stub scan complete.", flush=True)
