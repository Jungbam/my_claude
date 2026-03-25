#!/usr/bin/env python3
"""
SEC.gov Fetch Script

SEC.gov에서 데이터를 가져올 때 필수 User-Agent를 포함하여 요청합니다.
SEC는 User-Agent 없이 요청 시 403 Forbidden을 반환합니다.
"""

import argparse
import gzip
import json
import os
import sys
import urllib.request
import urllib.error
from urllib.parse import urlparse

# SEC 요구사항에 따른 User-Agent (환경변수에서 읽어옴)
USER_AGENT = os.environ.get("SEC_USER_AGENT", "")

if not USER_AGENT:
    print("Error: SEC_USER_AGENT 환경변수가 설정되지 않았습니다.", file=sys.stderr)
    print("예시: export SEC_USER_AGENT='Company Name email@example.com'", file=sys.stderr)
    sys.exit(1)

# 지원하는 SEC 도메인
SEC_DOMAINS = [
    "sec.gov",
    "www.sec.gov",
    "data.sec.gov",
    "efts.sec.gov",
]


def is_sec_url(url: str) -> bool:
    """URL이 SEC 도메인인지 확인"""
    parsed = urlparse(url)
    return any(parsed.netloc.endswith(domain) for domain in SEC_DOMAINS)


def fetch_url(url: str, timeout: int = 30) -> bytes:
    """SEC.gov URL에서 데이터 가져오기"""
    if not is_sec_url(url):
        print(f"Warning: {url} is not a SEC.gov URL", file=sys.stderr)

    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "*/*",
        "Accept-Encoding": "gzip, deflate",
    }

    request = urllib.request.Request(url, headers=headers)

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = response.read()
            # gzip 압축된 응답 처리
            content_encoding = response.headers.get("Content-Encoding", "")
            if content_encoding == "gzip" or data[:2] == b'\x1f\x8b':
                try:
                    data = gzip.decompress(data)
                except gzip.BadGzipFile:
                    pass  # 압축되지 않은 데이터
            return data
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.reason}", file=sys.stderr)
        if e.code == 403:
            print("Note: SEC may be rate limiting. Try again later.", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"URL Error: {e.reason}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Fetch data from SEC.gov with required User-Agent"
    )
    parser.add_argument("url", help="URL to fetch")
    parser.add_argument(
        "--json", "-j",
        action="store_true",
        help="Parse response as JSON and pretty print"
    )
    parser.add_argument(
        "--output", "-o",
        help="Save response to file"
    )
    parser.add_argument(
        "--timeout", "-t",
        type=int,
        default=30,
        help="Request timeout in seconds (default: 30)"
    )

    args = parser.parse_args()

    # URL fetch
    data = fetch_url(args.url, timeout=args.timeout)

    # 출력 처리
    if args.output:
        with open(args.output, "wb") as f:
            f.write(data)
        print(f"Saved to {args.output}", file=sys.stderr)
    elif args.json:
        try:
            parsed = json.loads(data.decode("utf-8"))
            print(json.dumps(parsed, indent=2, ensure_ascii=False))
        except json.JSONDecodeError as e:
            print(f"JSON parse error: {e}", file=sys.stderr)
            print(data.decode("utf-8", errors="replace"))
    else:
        print(data.decode("utf-8", errors="replace"))


if __name__ == "__main__":
    main()
