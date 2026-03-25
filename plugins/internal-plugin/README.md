# internal-plugin

eZar 사내 내부 전용 Claude Code 플러그인입니다. Datamart(MySQL), GCS 등 내부 인프라에 접근하는 기능을 포함합니다.

## 설치

```bash
/plugin install internal-plugin@ezar-plugins
```

## 초기 설정

설치 후 환경변수 셋업 스크립트를 실행하세요:

```bash
bash ~/.claude/plugins/marketplaces/ezar-plugins/plugins/internal-plugin/setup.sh
```

## 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `DATAMART_HOST` | O | Datamart MySQL 호스트 |
| `DATAMART_USER` | O | Datamart MySQL 사용자 |
| `DATAMART_PASSWORD` | O | Datamart MySQL 비밀번호 |
| `DATAMART_DB` | - | Datamart MySQL 데이터베이스명 (기본: `datamart`) |

GCS 접근 시 ADC 인증이 필요합니다:

```bash
gcloud auth application-default login
```

## 포함 항목

| 구분 | 이름 | 설명 |
|------|------|------|
| Skill | `gcs-download` | Accession number 기반 GCS에서 SEC 공시 원본 파일 다운로드 |
