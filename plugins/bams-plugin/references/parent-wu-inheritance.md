# Parent Pipeline WU 자동 상속

> 이 파일은 hotfix, deep-review 등 parent pipeline을 선택하는 커맨드에서 WU를 자동 상속하는 공통 로직을 정의합니다.
> 각 커맨드의 Step 0.6(또는 0.5)에서 이 파일을 Read하여 지시를 따릅니다.

## 전제 조건

- `PARENT_PIPELINE_SLUG` 변수가 이전 단계(AskUserQuestion)에서 설정되어 있어야 합니다.
- "없음" 선택 시 `PARENT_PIPELINE_SLUG=""`로 설정합니다 (빈 문자열).

## WU 상속 로직

Parent Pipeline이 선택된 경우("없음" 제외), 해당 파이프라인의 WU를 자동 상속하여 `_shared_common.md` &sect;WU 선택 단계를 스킵한다.

```bash
# Parent pipeline의 WU 자동 상속
# slug sanitize — SQL injection 방지 (작은따옴표 이스케이프)
_SAFE_SLUG=$(echo "${PARENT_PIPELINE_SLUG}" | sed "s/'/''/g")

if [ -n "${PARENT_PIPELINE_SLUG}" ] && [ "${PARENT_PIPELINE_SLUG}" != "없음" ]; then
  _PARENT_WU=""

  # URL-safe 인코딩 (jq 우선, 없으면 python3 fallback)
  if command -v jq &>/dev/null; then
    _ENCODED_SLUG=$(printf '%s' "${PARENT_PIPELINE_SLUG}" | jq -sRr @uri)
  else
    _ENCODED_SLUG=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "${PARENT_PIPELINE_SLUG}")
  fi

  # API 우선 조회 — 단건 조회로 효율화 (URL-encoded slug 사용)
  _P_JSON=$(curl -sf "http://localhost:3099/api/pipelines/${_ENCODED_SLUG}" 2>/dev/null)
  if [ -n "$_P_JSON" ]; then
    _PARENT_WU=$(echo "$_P_JSON" | jq -r '.pipeline.work_unit_slug // empty' 2>/dev/null)
  fi

  # API 실패 시 DB fallback — slug 화이트리스트 검증 후 sanitized slug 사용
  if [ -z "$_PARENT_WU" ] && [ -f "$HOME/.claude/plugins/marketplaces/my-claude/bams.db" ]; then
    # slug 화이트리스트 검증 — 한글, 영숫자, 하이픈, 언더스코어만 허용
    if printf '%s' "${PARENT_PIPELINE_SLUG}" | grep -qP '^[\w가-힣\-]+$'; then
      _PARENT_WU=$(sqlite3 "$HOME/.claude/plugins/marketplaces/my-claude/bams.db" "SELECT wu.slug FROM pipelines p JOIN work_units wu ON p.work_unit_id = wu.id WHERE p.slug = '${_SAFE_SLUG}'" 2>/dev/null)
    fi
  fi

  if [ -n "$_PARENT_WU" ]; then
    SELECTED_WU_SLUG="$_PARENT_WU"
    _WU_SOURCE="inherited"
    echo "Parent pipeline '${PARENT_PIPELINE_SLUG}'의 WU 자동 상속: ${SELECTED_WU_SLUG}"
  fi
fi
```

**`SELECTED_WU_SLUG`가 설정되면 `_shared_common.md` &sect;WU 선택 단계를 스킵한다.**

## 주의사항

- API 단건 조회(`/api/pipelines/${_ENCODED_SLUG}`)를 우선 사용하여 전체 목록 조회를 피합니다. 한글 slug는 URL-encode 처리됩니다.
- DB fallback에서는 slug 화이트리스트 검증(한글/영숫자/하이픈/언더스코어만 허용)을 통과한 경우에만 실행합니다.
- WU 상속 성공 시 `_WU_SOURCE="inherited"` 플래그가 설정됩니다. `_shared_common.md`의 WU 선택 섹션은 이 플래그로 스킵 여부를 판단합니다.
