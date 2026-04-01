---
name: gcs-download
description: GCS에서 SEC 공시 원본 파일을 다운로드할 때 사용합니다. Accession number를 입력하면 MySQL에서 메타데이터를 조회하고, GCS 버킷에서 관련 파일을 자동으로 다운로드합니다.
allowed-tools: Bash(uv run scripts/gcs_download.py:*)
---

# GCS Download

Accession number를 기반으로 GCS(`lucy-data` 버킷)에서 SEC 공시 원본 파일을 다운로드하는 스킬입니다.
MySQL `datamart.sec_documents` 테이블에서 메타데이터를 조회한 뒤, GCS prefix를 조합하여 파일을 다운로드합니다.

## 사용법

```bash
# 단일 accession number
uv run scripts/gcs_download.py --accession "0000320193-23-000077"

# 복수 accession number (쉼표 구분)
uv run scripts/gcs_download.py --accession "0000320193-23-000077,0000320193-23-000106"

# 파일에서 accession number 목록 읽기
uv run scripts/gcs_download.py --file accession_numbers.txt

# 저장 경로 지정
uv run scripts/gcs_download.py --accession "0000320193-23-000077" --output-dir ./my_downloads
```

## 기능

- MySQL에서 `cik`, `form`, `period_date` 메타데이터 조회
- GCS prefix 조합: `sec/form=<form>/code=main/date=<date>/is_original=true/accession_number=<accession>/`
- 해당 prefix 하위 파일 모두 다운로드
- `.zst`, `.gz` 압축 자동 해제
- JSON 파일 자동 beautify (pretty print)

## 환경변수 (필수)

MySQL 접속 정보:
- `DATAMART_HOST` — MySQL 호스트
- `DATAMART_USER` — MySQL 사용자
- `DATAMART_PASSWORD` — MySQL 비밀번호
- `DATAMART_DB` — MySQL 데이터베이스명 (기본: `datamart`)

GCS 인증 — ADC (Application Default Credentials) 사용:
```bash
gcloud auth application-default login
```
또는 서비스 계정 키:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"
```

## 예시

### 단일 다운로드
```bash
uv run scripts/gcs_download.py --accession "0000320193-23-000077"
# -> data/downloads/0000320193-23-000077/ 에 파일 저장
```

### 파일 기반 대량 다운로드
```bash
# accession_numbers.txt (한 줄에 하나, # 주석 지원)
# Apple 10-K
0000320193-23-000077
0000320193-23-000106

uv run scripts/gcs_download.py --file accession_numbers.txt
```
