# web-plugin

웹 프론트엔드 개발용 Claude Code 플러그인입니다. Next.js, React 프로젝트에서 테스트 코드 자동 생성 등의 기능을 제공합니다.

## 설치

```bash
/plugin install web-plugin@ezar-plugins
```

## 포함 항목

| 구분 | 이름 | 설명 |
|------|------|------|
| Skill | `nextjs-api-test-generator` | Next.js API Route에 대한 Jest 테스트 코드 자동 생성 |
| Skill | `nextjs-component-test-generator` | React 컴포넌트에 대한 Jest + RTL 테스트 코드 자동 생성 |

## 사용법

### API Route 테스트 생성

```
"app/api/users/route.ts에 대한 테스트를 작성해줘"
```

Claude가 API Route 파일을 분석하여 `route.test.ts` 파일을 자동 생성합니다.

### 컴포넌트 테스트 생성

```
"components/Button.tsx에 대한 테스트를 작성해줘"
```

Claude가 컴포넌트를 분석하여 `Button.test.tsx` 파일을 자동 생성합니다.

## 요구사항

테스트 생성 스킬을 사용하려면 프로젝트에 다음 패키지가 설치되어 있어야 합니다:

```bash
npm install -D jest @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Next.js 프로젝트의 경우:
```bash
npm install -D jest-environment-jsdom
```
