"""
Export CVE report from ShadowRadar API to a JSON file.

Usage:
    python scripts/export.py --url http://localhost:3500 --api-key-env MY_API_KEY --output report.json
    python scripts/export.py --url http://localhost:3500 --api-key-env MY_API_KEY --output report.json --asset-id 42
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error


def parse_args():
    parser = argparse.ArgumentParser(description='Export ShadowRadar CVE report to JSON')
    parser.add_argument('--url',         required=True,  help='Base URL of the ShadowRadar server (e.g. http://localhost:3500)')
    parser.add_argument('--api-key-env', required=True,  help='Name of the environment variable holding the API key')
    parser.add_argument('--output',      required=True,  help='Destination file path for the JSON report')
    parser.add_argument('--asset-id',    required=False, type=int, default=None, help='Filter report to a single asset by ID')
    return parser.parse_args()


def build_url(base_url, asset_id):
    url = base_url.rstrip('/') + '/api/v1/export?active_only=true'
    if asset_id is not None:
        url += f'&asset_id={asset_id}'
    return url


def fetch_report(url, api_key):
    req = urllib.request.Request(url, headers={'X-API-Key': api_key})
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode('utf-8')
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        print(f'HTTP error {exc.code}: {exc.reason}', file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as exc:
        print(f'Connection error: {exc.reason}', file=sys.stderr)
        sys.exit(1)


def write_report(path, report):
    content = json.dumps(report, indent=2, ensure_ascii=False)
    if os.path.exists(path):
        with open(path, 'r+', encoding='utf-8') as fh:
            fh.seek(0)
            fh.write(content)
            fh.truncate()
    else:
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(content)


def main():
    args = parse_args()

    api_key = os.environ.get(args.api_key_env)
    if not api_key:
        print(f'Error: environment variable "{args.api_key_env}" is not set or empty.', file=sys.stderr)
        sys.exit(1)

    url = build_url(args.url, args.asset_id)
    print(f'Fetching report from {url} ...', file=sys.stderr)

    report = fetch_report(url, api_key)
    write_report(args.output, report)

    item_count = len(report.get('report_items', []))
    print(f'Report saved to {args.output} ({item_count} asset(s)).', file=sys.stderr)


if __name__ == '__main__':
    main()
