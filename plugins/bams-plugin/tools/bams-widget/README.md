# bams-widget

bams 파이프라인 현황을 macOS 트레이에서 확인하는 Tauri 기반 위젯 앱.

## 구조

```
bams-widget/
├── tauri/              # Tauri 앱 루트
│   ├── src/            # React 프론트엔드
│   ├── src-tauri/      # Rust 백엔드 (트레이, 단축키, sidecar)
│   ├── dist/           # 빌드 산출물 (git 추적 안 함 — 실행 전 빌드 필요)
│   └── scripts/
│       ├── start-widget.sh          # 안전 실행 래퍼 (dist 자동 빌드 포함)
│       ├── verify-widget-bundle.sh  # 빌드 산출물 점검
│       ├── build.sh                 # 전체 빌드 (sidecar + FE + Tauri)
│       └── build-sidecar.sh         # sidecar(bams-server) 빌드
└── README.md
```

## 빠른 시작

```bash
cd tauri

# 권장: 래퍼 스크립트 사용 (dist 없으면 자동 빌드 후 실행)
bun run start
# 또는
bash scripts/start-widget.sh
```

## 실행 방법

### 개발 모드 (권장)

```bash
cd tauri
bun run start          # dist 점검 후 tauri dev 실행 (HMR 지원)
```

내부적으로 `scripts/start-widget.sh`를 실행하며:
1. `dist/index.html` 존재 여부 점검
2. 없으면 `vite build` 자동 실행
3. `bunx tauri dev` 실행 (`bun run dev` Vite dev server 자동 기동)

### 빌드 후 직접 실행

```bash
cd tauri
bun run tauri:build:dist   # dist/ 생성 (= vite build)
bash scripts/start-widget.sh --prod  # debug 바이너리 직접 실행
```

### 전체 릴리스 빌드 (.dmg)

```bash
cd tauri
bun run build:full   # sidecar + FE + Tauri 전체 빌드
```

## 빌드 스크립트 안내

| 명령 | 설명 |
|------|------|
| `bun run start` | dist 점검 + tauri dev 실행 (권장 진입점) |
| `bun run tauri:dev` | start와 동일 |
| `bun run tauri:build:dist` | dist/ 빌드만 (= `vite build`) |
| `bun run verify` | dist 산출물 존재 여부 점검 (CI/preflight용) |
| `bun run build` | tsc + vite build (테스트 환경에서 tsc 오류 가능) |
| `bun run build:vite` | vite build만 (tsc 생략 — 빠른 빌드) |
| `bun run build:full` | sidecar + FE + Tauri 전체 빌드 |

## 트러블슈팅

### 빈 화면 (Webview에 아무것도 표시 안 됨)

**증상**: 트레이 아이콘 클릭 시 창은 열리지만 내용이 없음.

**원인**: `dist/index.html`이 없어서 Webview가 콘텐츠를 로드하지 못함.  
Tauri debug 바이너리는 `custom-protocol` feature로 컴파일되어 `tauri://localhost` → `dist/index.html` 직접 로드 방식을 사용.

**해결 (30초)**:
```bash
cd tauri

# 1. 진단
ls dist/index.html  # "No such file or directory" → 빌드 필요

# 2. 빌드 (권장)
bash scripts/start-widget.sh      # dist 자동 생성 후 실행
# 또는 빌드만:
bash scripts/start-widget.sh --build-only

# 3. 검증
bun run verify
```

**주의**: `bun run build`(= `tsc && vite build`)는 테스트 파일 타입 오류로 실패할 수 있음.  
대신 `bun run build:vite` 또는 `bash scripts/start-widget.sh`를 사용.

### sidecar API 오류 (데이터 미표시)

**증상**: 앱이 표시되지만 파이프라인 데이터가 없음.

**진단**:
```bash
curl localhost:3099/health           # {"ok":true,...} → sidecar 정상
curl localhost:3099/api/agents/data  # 404 → sidecar stale
```

**해결**: sidecar stale 시 `bash scripts/build-sidecar.sh` 실행 후 재시작.  
자세한 내용은 `.crew/gotchas.md` [G-SIDECAR] 참조.

### 단축키 미동작 (Cmd+Shift+B)

```bash
# 시스템 환경설정 → 개인 정보 보호 및 보안 → 손쉬운 사용
# bams-widget 에 접근 권한 부여
```

## 개발 참고

- 프론트엔드 소스: `src/` (React 19 + Tailwind v4)
- Rust 소스: `src-tauri/src/` (트레이, 단축키, sidecar 관리)
- sidecar: `../server/` (bams-server — HTTP API 제공)
- API 엔드포인트: `http://localhost:3099`
- CSP: `connect-src 'self' http://localhost:3099` (API 연결 허용)
