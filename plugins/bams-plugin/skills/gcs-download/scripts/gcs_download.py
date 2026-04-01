#!/usr/bin/env python3
# /// script
# dependencies = ["pymysql", "google-cloud-storage", "zstandard"]
# ///
"""
GCS Download Script

Accession number를 기반으로 MySQL에서 메타데이터를 조회하고,
GCS에서 SEC 공시 원본 파일을 다운로드합니다.
"""

import argparse
import gzip
import json
import os
import sys
from pathlib import Path

import pymysql
import zstandard as zstd
from google.cloud import storage

# GCS configuration
GCS_BUCKET_NAME = "lucy-data"

# MySQL configuration (환경변수 필수)
DB_HOST = os.environ.get("DATAMART_HOST", "")
DB_USER = os.environ.get("DATAMART_USER", "")
DB_PASSWORD = os.environ.get("DATAMART_PASSWORD", "")
DB_NAME = os.environ.get("DATAMART_DB", "datamart")


def get_document_by_accession(accession_number: str) -> dict | None:
    """MySQL에서 accession number로 문서 메타데이터 조회."""
    conn = pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
    )
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT cik, form, period_date, accession_number "
                "FROM sec_documents "
                "WHERE accession_number = %s LIMIT 1",
                (accession_number,),
            )
            row = cursor.fetchone()
            if row is None:
                return None
            return {
                "cik": str(row[0]),
                "form": row[1],
                "period_date": row[2].strftime("%Y-%m-%d") if hasattr(row[2], "strftime") else str(row[2])[:10],
                "accession_number": row[3],
            }
    finally:
        conn.close()


def sanitize_partition_value(value: str) -> str:
    """GCS 경로용 파티션 값 정규화."""
    trimmed = value.strip()
    if not trimmed:
        return "unknown"
    return trimmed.replace("/", "-").replace(" ", "_")


def build_gcs_prefix(doc: dict) -> str:
    """문서 메타데이터로 GCS prefix 생성."""
    form = sanitize_partition_value(doc["form"])
    date = sanitize_partition_value(doc["period_date"])
    accession = sanitize_partition_value(doc["accession_number"])
    return f"sec/form={form}/code=main/date={date}/is_original=true/accession_number={accession}/"


def beautify_json(data: bytes) -> bytes:
    """JSON 데이터를 보기 좋게 포맷팅."""
    parsed = json.loads(data)
    return json.dumps(parsed, indent=2, ensure_ascii=False).encode("utf-8")


def download_file(
    client: storage.Client,
    bucket_name: str,
    key: str,
    download_dir: Path,
    prefix: str,
) -> None:
    """GCS에서 파일 다운로드. .zst/.gz 자동 해제, JSON 자동 beautify."""
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(key)
    content = blob.download_as_bytes()

    relative_path = key.removeprefix(prefix)
    local_path = download_dir / relative_path

    local_path.parent.mkdir(parents=True, exist_ok=True)

    is_zstd = key.endswith(".zst")
    is_gzip = key.endswith(".gz")

    if is_zstd:
        decompressor = zstd.ZstdDecompressor()
        content = decompressor.decompress(content)
        local_path = local_path.with_suffix("")  # .zst 확장자 제거
        print(f"Downloaded and decompressed (zstd): {key} -> {local_path}")
    elif is_gzip:
        content = gzip.decompress(content)
        local_path = local_path.with_suffix("")  # .gz 확장자 제거
        print(f"Downloaded and decompressed (gzip): {key} -> {local_path}")
    else:
        print(f"Downloaded: {key} -> {local_path}")

    # JSON beautify
    if local_path.suffix == ".json":
        try:
            content = beautify_json(content)
        except (json.JSONDecodeError, UnicodeDecodeError) as e:
            print(f"Warning: Failed to beautify JSON {local_path}: {e}", file=sys.stderr)

    local_path.write_bytes(content)


def process_accession_number(
    client: storage.Client,
    accession_number: str,
    output_dir: Path,
) -> bool:
    """단일 accession number 처리: DB 조회 -> GCS 다운로드."""
    doc = get_document_by_accession(accession_number)
    if doc is None:
        print(f"Error: No document found with accession number: {accession_number}", file=sys.stderr)
        return False

    print(f"Found document: form={doc['form']}, cik={doc['cik']}, period_date={doc['period_date']}")

    prefix = build_gcs_prefix(doc)
    print(f"GCS prefix: {prefix}")

    download_dir = output_dir / doc["accession_number"]
    download_dir.mkdir(parents=True, exist_ok=True)

    # GCS에서 prefix 하위 파일 목록 조회
    bucket = client.bucket(GCS_BUCKET_NAME)
    blobs = list(bucket.list_blobs(prefix=prefix))

    print(f"Found {len(blobs)} files to download")

    for blob in blobs:
        try:
            download_file(client, GCS_BUCKET_NAME, blob.name, download_dir, prefix)
        except Exception as e:
            print(f"Failed to download {blob.name}: {e}", file=sys.stderr)

    print(f"Download completed! Files saved to: {download_dir}")
    return True


def parse_accession_numbers(text: str) -> list[str]:
    """쉼표 구분 accession number 파싱."""
    return [s.strip() for s in text.split(",") if s.strip()]


def read_accession_numbers_from_file(file_path: str) -> list[str]:
    """파일에서 accession number 목록 읽기 (한 줄에 하나, # 주석 지원)."""
    result = []
    with open(file_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                result.append(line)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download SEC filing files from GCS by accession number",
    )
    parser.add_argument(
        "--accession",
        help="Accession number(s), comma-separated",
    )
    parser.add_argument(
        "--file",
        help="Path to file containing accession numbers (one per line)",
    )
    parser.add_argument(
        "--output-dir",
        default="data/downloads",
        help="Output directory (default: data/downloads/)",
    )
    args = parser.parse_args()

    missing = [name for name, val in [
        ("DATAMART_HOST", DB_HOST),
        ("DATAMART_USER", DB_USER),
        ("DATAMART_PASSWORD", DB_PASSWORD),
    ] if not val]
    if missing:
        print(f"Error: 필수 환경변수가 설정되지 않았습니다: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    # Accession number 수집
    accession_numbers: list[str] = []
    if args.file:
        accession_numbers = read_accession_numbers_from_file(args.file)
        print(f"Read {len(accession_numbers)} accession number(s) from file: {args.file}\n")
    elif args.accession:
        accession_numbers = parse_accession_numbers(args.accession)
        print(f"Processing {len(accession_numbers)} accession number(s)\n")
    else:
        print("Error: --accession 또는 --file 인자를 지정하세요.", file=sys.stderr)
        sys.exit(1)

    if not accession_numbers:
        print("Error: No accession numbers to process", file=sys.stderr)
        sys.exit(1)

    # GCS 클라이언트 생성 (ADC 사용)
    client = storage.Client()
    output_dir = Path(args.output_dir)

    success_count = 0
    fail_count = 0

    for i, accession_number in enumerate(accession_numbers, 1):
        print(f"=== [{i}/{len(accession_numbers)}] Processing: {accession_number} ===")
        if process_accession_number(client, accession_number, output_dir):
            success_count += 1
        else:
            fail_count += 1
        print()

    print(f"=== Summary ===")
    print(f"Total: {len(accession_numbers)}, Success: {success_count}, Failed: {fail_count}")


if __name__ == "__main__":
    main()
