# common-plugin

eZar 사내 공용 Claude Code 플러그인입니다.

## 설치

```bash
/plugin install common-plugin@ezar-plugins
```

## 초기 설정

설치 후 환경변수 셋업 스크립트를 실행하세요:

```bash
bash ~/.claude/plugins/marketplaces/ezar-plugins/plugins/common-plugin/setup.sh
```

필요한 환경변수 목록은 `.env.example`을 참고하세요.

## 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `SEC_USER_AGENT` | O | SEC.gov API User-Agent (`"회사명 이메일"` 형식) |
| `LANGFUSE_AUTH_TOKEN` | O | Langfuse API 인증 토큰 (Base64 인코딩) |

## 포함 항목

| 구분 | 이름 | 설명 |
|------|------|------|
| Skill | `sec-gov` | SEC.gov/EDGAR 데이터를 올바른 User-Agent로 Fetch |
| Skill | `research-note` | 국가 R&D 과제용 전자연구노트 작성 |
| MCP | `langfuse` | Langfuse Prompt 관리 (인증 필요) |
| MCP | `langfuse-docs` | Langfuse 문서 조회 (공개) |
| Command | `/hello` | 인사 예시 명령어 |
| Agent | `code-reviewer` | 코드 리뷰 에이전트 |
