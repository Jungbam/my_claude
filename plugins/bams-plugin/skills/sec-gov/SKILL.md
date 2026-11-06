---
name: sec-gov
description: SEC.gov에서 데이터를 Fetch할 때 사용합니다. sec.gov URL을 가져오거나, SEC EDGAR 데이터를 조회하거나, SEC 공시 파일을 다운로드할 때 반드시 이 스킬을 사용합니다.
allowed-tools: Bash(uv run scripts/sec_fetch.py:*)
---

# SEC.gov Fetch

SEC.gov에서 데이터를 가져올 때 사용하는 스킬입니다. SEC는 User-Agent 헤더 없이 요청하면 403 Forbidden을 반환하므로, 이 스킬을 통해 올바른 User-Agent를 포함하여 요청합니다.

## 중요

**sec.gov 또는 SEC EDGAR 관련 URL을 fetch할 때는 반드시 이 스킬의 스크립트를 사용해야 합니다.**

WebFetch 도구 대신 아래 스크립트를 사용하세요.

## 사용법

```bash
# URL 내용 가져오기 (텍스트)
uv run scripts/sec_fetch.py "<URL>"

# JSON 응답 파싱
uv run scripts/sec_fetch.py --json "<URL>"

# 파일로 저장
uv run scripts/sec_fetch.py --output <filename> "<URL>"
```

## User-Agent

SEC.gov는 연락처가 포함된 User-Agent가 없으면 403 Forbidden을 반환합니다.
스크립트에 회사 대표 주소(`Lucy help@lucydata.ai`)가 고정되어 있어 별도 설정이 필요 없습니다.

## 예시

### SEC EDGAR 검색
```bash
# 회사 CIK 조회
uv run scripts/sec_fetch.py "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=apple&type=10-K&output=atom"

# 특정 공시 파일 가져오기
uv run scripts/sec_fetch.py "https://www.sec.gov/Archives/edgar/data/320193/000032019323000077/aapl-20230930.htm"
```

### 펀드 데이터
```bash
# 펀드 목록
uv run scripts/sec_fetch.py "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=485BPOS&output=atom"

# N-PORT 데이터
uv run scripts/sec_fetch.py --json "https://data.sec.gov/submissions/CIK0000036377.json"
```

### 파일 다운로드
```bash
# XML 파일 저장
uv run scripts/sec_fetch.py --output filing.xml "https://www.sec.gov/Archives/edgar/data/..."
```

## 지원하는 도메인

- `sec.gov`
- `www.sec.gov`
- `data.sec.gov`
- `efts.sec.gov`
