#!/usr/bin/env bash
# ezar-infra-tool-diff.sh — ezar-infra MCP 서버 도구 목록 vs references/ezar-infra-deploy.md 드리프트 점검
#
# 서버(tools/list)의 도구 이름과 문서에 backtick으로 적힌 도구 이름을 비교한다.
# 문서가 서버보다 뒤처지면(신규 도구 누락, 사라진 도구 잔존) 구조적으로 잡아내기 위한 스크립트.
#
# 사용: bash scripts/ezar-infra-tool-diff.sh [DOC_PATH]
#   EZAR_INFRA_MCP_NAME  ~/.claude.json mcpServers 키 (기본 ezar-infra)
#   EZAR_INFRA_TIMEOUT   요청 타임아웃 초 (기본 15)
#
# 접속 정보: ~/.claude.json 의 user mcpServers → (없으면) 현재 디렉터리 project → 아무 project 순.
# Authorization 헤더는 런타임에만 읽고 출력·파일·argv·env 어디에도 남기지 않는다.
#
# exit 0 = 일치, 1 = 드리프트, 2 = 미설정/접속 불가/응답 오류 (CI·hook에서 skip 처리 가능)
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOC="${1:-$SCRIPT_DIR/../references/ezar-infra-deploy.md}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "SKIP: python3 없음" >&2
  exit 2
fi
if [ ! -f "$DOC" ]; then
  echo "SKIP: 문서 없음: $DOC" >&2
  exit 2
fi

exec python3 -I - "$DOC" <<'PY'
import json, os, re, sys, urllib.request, urllib.error
from urllib.parse import urlparse

DOC = sys.argv[1]
NAME = os.environ.get("EZAR_INFRA_MCP_NAME", "ezar-infra")
TIMEOUT = float(os.environ.get("EZAR_INFRA_TIMEOUT", "15"))
PROTO = "2025-06-18"


def skip(msg):
    print(f"SKIP: {msg}", file=sys.stderr)
    sys.exit(2)


# ── 1. 접속 정보 (값은 출력하지 않는다) ─────────────────────────────
cfg_path = os.path.expanduser("~/.claude.json")
try:
    with open(cfg_path) as f:
        cfg = json.load(f)
except (OSError, ValueError):
    skip("~/.claude.json 을 읽을 수 없음")

server = (cfg.get("mcpServers") or {}).get(NAME)
source = "user"
if not server:
    projects = cfg.get("projects") or {}
    cwd = os.getcwd()
    ordered = sorted(projects.items(), key=lambda kv: 0 if cwd.startswith(kv[0]) else 1)
    for path, pv in ordered:
        s = (pv.get("mcpServers") or {}).get(NAME)
        if s and s.get("url"):
            server, source = s, "project"
            break
if not server or not server.get("url"):
    skip(f"mcpServers.{NAME} (url) 미설정")

url = server["url"]
headers = {k: v for k, v in (server.get("headers") or {}).items() if isinstance(v, str)}
host = urlparse(url).netloc or "?"
session = {}


def rpc(method, params=None, rid=None):
    body = {"jsonrpc": "2.0", "method": method}
    if params is not None:
        body["params"] = params
    if rid is not None:
        body["id"] = rid
    h = dict(headers)
    h.update({
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": PROTO,
    })
    if session.get("sid"):
        h["Mcp-Session-Id"] = session["sid"]
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=h, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            sid = r.headers.get("Mcp-Session-Id")
            if sid:
                session["sid"] = sid
            ctype = r.headers.get("Content-Type", "")
            raw = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        skip(f"{host} {method}: HTTP {e.code}")
    except (urllib.error.URLError, OSError) as e:
        skip(f"{host} {method}: 접속 불가 ({type(e).__name__})")
    if rid is None:
        return None
    # SSE(`data:` 프레이밍) 또는 단일 JSON 둘 다 처리
    msgs = []
    if "text/event-stream" in ctype or raw.lstrip().startswith(("event:", "data:", ":")):
        for block in re.split(r"\r?\n\r?\n", raw):
            data = "\n".join(l[5:].lstrip() for l in block.splitlines() if l.startswith("data:"))
            if data:
                try:
                    msgs.append(json.loads(data))
                except ValueError:
                    pass
    else:
        try:
            msgs.append(json.loads(raw))
        except ValueError:
            pass
    for m in msgs:
        if isinstance(m, dict) and m.get("id") == rid:
            if "error" in m:
                skip(f"{method}: JSON-RPC error {m['error'].get('code')} {str(m['error'].get('message'))[:120]}")
            return m.get("result") or {}
    skip(f"{method}: 응답 해석 실패 (content-type={ctype or '?'})")


# ── 2. initialize + tools/list (페이지네이션) ─────────────────────
init = rpc("initialize", {
    "protocolVersion": PROTO,
    "capabilities": {},
    "clientInfo": {"name": "tool-diff", "version": "1.0"},
}, rid=1)
info = init.get("serverInfo") or {}
rpc("notifications/initialized")

server_tools, cursor, rid = set(), None, 2
while True:
    res = rpc("tools/list", {"cursor": cursor} if cursor else {}, rid=rid)
    server_tools.update(t["name"] for t in res.get("tools", []) if t.get("name"))
    cursor, rid = res.get("nextCursor"), rid + 1
    if not cursor or rid > 50:
        break

# ── 3. 문서의 backtick 도구 이름 ──────────────────────────────────
with open(DOC, encoding="utf-8") as f:
    text = f.read()
TOOL_RE = re.compile(r"(?<![A-Za-z0-9])((?:common|dev|local|deploy)_[a-z0-9_]*[a-z0-9])")
doc_tools = set()
for span in re.findall(r"`([^`\n]+)`", text):
    doc_tools.update(TOOL_RE.findall(span))

missing_in_doc = sorted(server_tools - doc_tools)
missing_on_server = sorted(doc_tools - server_tools)

print(f"server: {info.get('name', '?')} v{info.get('version', '?')} ({host}, config={source})")
rel = os.path.relpath(DOC)
print(f"tools: server={len(server_tools)} doc={len(doc_tools)} ({DOC if rel.startswith('..') else rel})")
print(f"missing-in-doc ({len(missing_in_doc)}):" + ("" if missing_in_doc else " -"))
for n in missing_in_doc:
    print(f"  + {n}")
print(f"missing-on-server ({len(missing_on_server)}):" + ("" if missing_on_server else " -"))
for n in missing_on_server:
    print(f"  - {n}")

if missing_in_doc or missing_on_server:
    print("DRIFT: references/ezar-infra-deploy.md 갱신 필요 (Last synced 줄 포함)")
    sys.exit(1)
print("OK: 문서와 서버 도구 목록 일치")
sys.exit(0)
PY
