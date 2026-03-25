---
name: api-test-generator
description: |
  Next.js API Route 파일에 대한 Jest 테스트 코드를 자동 생성합니다.
  사용 시점: (1) API Route 테스트 작성 요청, (2) "route.ts 테스트 만들어줘" 요청,
  (3) 백엔드 API 테스트 코드 필요 시
---

# API Route 테스트 생성 스킬

## 개요

Next.js App Router의 API Route 파일을 분석하여 Jest 테스트 코드를 자동 생성합니다.

## 사용법

사용자가 API Route 파일 경로를 제공하면:

```
"app/api/users/route.ts에 대한 테스트를 작성해줘"
"api/auth/login/route.ts 테스트 코드 만들어줘"
```

## 워크플로우

### 1단계: 대상 파일 분석

1. 지정된 API Route 파일 읽기
2. export된 HTTP 메서드 함수 파악 (GET, POST, PUT, PATCH, DELETE)
3. Request body 타입/스키마 분석
4. Response 구조 파악
5. 에러 핸들링 로직 확인
6. 인증/권한 로직 확인 (있는 경우)
7. 외부 의존성 파악 (DB, 외부 API 등)

### 2단계: 테스트 파일 생성

- **파일 위치**: 원본 파일과 동일한 디렉토리 (co-location)
- **파일명**: `{원본파일명}.test.ts`
  - 예: `route.ts` → `route.test.ts`

## 테스트 작성 규칙

### 필수 import

```typescript
import { NextRequest } from 'next/server';
// 테스트 대상 핸들러 import
import { GET, POST, PUT, DELETE } from './route';
```

### NextRequest 생성 헬퍼

```typescript
function createMockRequest(
  method: string,
  body?: object,
  searchParams?: Record<string, string>
): NextRequest {
  const url = new URL('http://localhost:3000/api/test');
  
  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
```

### 테스트 구조

```typescript
describe('API Route: /api/[경로]', () => {
  // 각 HTTP 메서드별 describe 블록
  describe('GET', () => {
    it('성공 케이스를 처리한다', async () => {
      // Arrange
      const request = createMockRequest('GET');
      
      // Act
      const response = await GET(request);
      const data = await response.json();
      
      // Assert
      expect(response.status).toBe(200);
      expect(data).toMatchObject({ /* 예상 응답 */ });
    });

    it('에러 케이스를 처리한다', async () => {
      // 에러 시나리오 테스트
    });
  });

  describe('POST', () => {
    it('유효한 데이터로 생성에 성공한다', async () => {
      // ...
    });

    it('유효하지 않은 데이터에 대해 400을 반환한다', async () => {
      // ...
    });
  });
});
```

### 테스트 케이스 체크리스트

각 HTTP 메서드에 대해 다음 케이스를 고려:

#### 성공 케이스
- [ ] 정상적인 요청에 대한 성공 응답
- [ ] 올바른 응답 상태 코드 (200, 201 등)
- [ ] 응답 데이터 구조 검증

#### 에러 케이스
- [ ] 잘못된 요청 데이터 (400 Bad Request)
- [ ] 인증 실패 (401 Unauthorized)
- [ ] 권한 없음 (403 Forbidden)
- [ ] 리소스 없음 (404 Not Found)
- [ ] 서버 에러 (500 Internal Server Error)

#### Query Parameters (GET)
- [ ] 필수 파라미터 누락 시 에러
- [ ] 파라미터 타입 검증
- [ ] 페이지네이션 파라미터 (있는 경우)

#### Request Body (POST, PUT, PATCH)
- [ ] 필수 필드 누락 시 에러
- [ ] 필드 타입 검증
- [ ] 유효성 검사 규칙 검증

## Mocking 전략

### 데이터베이스 (Prisma 예시)

```typescript
import { prismaMock } from '@/test/mocks/prisma';

// jest.setup.ts에서 설정
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
}));

// 테스트에서 사용
prismaMock.user.findMany.mockResolvedValue([
  { id: '1', name: 'Test User', email: 'test@example.com' },
]);
```

### 외부 API

```typescript
// fetch 모킹
global.fetch = jest.fn();

beforeEach(() => {
  (fetch as jest.Mock).mockReset();
});

it('외부 API 호출을 처리한다', async () => {
  (fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: 'mocked' }),
  });
  
  // 테스트 실행
});
```

### 인증 (NextAuth 예시)

```typescript
import { getServerSession } from 'next-auth';

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

// 인증된 사용자
(getServerSession as jest.Mock).mockResolvedValue({
  user: { id: '1', email: 'test@example.com' },
});

// 미인증 사용자
(getServerSession as jest.Mock).mockResolvedValue(null);
```

### 환경변수

```typescript
// 테스트 전에 설정
const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv, API_KEY: 'test-key' };
});

afterEach(() => {
  process.env = originalEnv;
});
```

## 동적 라우트 파라미터

동적 라우트 (`[id]`, `[slug]` 등)의 경우:

```typescript
// app/api/users/[id]/route.ts 테스트

describe('GET /api/users/[id]', () => {
  it('특정 사용자를 조회한다', async () => {
    const request = createMockRequest('GET');
    const params = { id: '123' };
    
    const response = await GET(request, { params });
    
    expect(response.status).toBe(200);
  });

  it('존재하지 않는 사용자에 대해 404를 반환한다', async () => {
    const request = createMockRequest('GET');
    const params = { id: 'non-existent' };
    
    const response = await GET(request, { params });
    
    expect(response.status).toBe(404);
  });
});
```

## 네이밍 컨벤션

### describe 블록
- `'API Route: /api/[전체경로]'` 형식 사용

### it 블록 (한글 권장)
- 성공: `'~를 성공적으로 처리한다'`, `'~를 반환한다'`
- 실패: `'~일 때 에러를 반환한다'`, `'~가 없으면 400을 반환한다'`

## 주의사항

1. **실제 DB 연결 금지**: 모든 DB 호출은 반드시 모킹
2. **실제 외부 API 호출 금지**: fetch, axios 등 모킹 필수
3. **환경변수 의존성**: 테스트에 필요한 환경변수는 모킹하거나 설정
4. **비동기 처리**: 모든 핸들러는 async이므로 await 사용 필수
5. **Response 파싱**: `response.json()`도 async이므로 await 필요
