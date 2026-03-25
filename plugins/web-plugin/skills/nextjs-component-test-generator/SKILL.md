---
name: component-test-generator
description: |
  React 컴포넌트 파일에 대한 Jest + React Testing Library 테스트 코드를 자동 생성합니다.
  사용 시점: (1) 컴포넌트 테스트 작성 요청, (2) "Button.tsx 테스트 만들어줘" 요청,
  (3) 프론트엔드 컴포넌트 테스트 코드 필요 시
---

# 컴포넌트 테스트 생성 스킬

## 개요

React 컴포넌트 파일을 분석하여 Jest + React Testing Library 테스트 코드를 자동 생성합니다.

## 사용법

사용자가 컴포넌트 파일 경로를 제공하면:

```
"components/Button.tsx에 대한 테스트를 작성해줘"
"app/dashboard/UserCard.tsx 테스트 코드 만들어줘"
```

## 워크플로우

### 1단계: 대상 컴포넌트 분석

1. 지정된 컴포넌트 파일 읽기
2. Props 인터페이스/타입 분석
3. 컴포넌트 내부 상태 (useState) 파악
4. 이벤트 핸들러 파악 (onClick, onChange 등)
5. 조건부 렌더링 로직 확인
6. 자식 컴포넌트 의존성 파악
7. 훅 사용 여부 확인 (useEffect, 커스텀 훅 등)
8. 외부 의존성 파악 (API 호출, 라우터 등)

### 2단계: 테스트 파일 생성

- **파일 위치**: 원본 파일과 동일한 디렉토리 (co-location)
- **파일명**: `{원본파일명}.test.tsx`
  - 예: `Button.tsx` → `Button.test.tsx`

## 테스트 작성 규칙

### 필수 import

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// 테스트 대상 컴포넌트 import
import { Button } from './Button';
```

### 테스트 구조 (AAA 패턴)

```typescript
describe('Button', () => {
  // 렌더링 테스트
  describe('렌더링', () => {
    it('기본 상태로 렌더링된다', () => {
      // Arrange & Act
      render(<Button>Click me</Button>);
      
      // Assert
      expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
    });
  });

  // Props 테스트
  describe('Props', () => {
    it('variant prop에 따라 스타일이 변경된다', () => {
      // Arrange
      render(<Button variant="primary">Primary</Button>);
      
      // Assert
      expect(screen.getByRole('button')).toHaveClass('btn-primary');
    });

    it('disabled prop이 true일 때 비활성화된다', () => {
      render(<Button disabled>Disabled</Button>);
      
      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  // 이벤트 테스트
  describe('이벤트', () => {
    it('클릭 시 onClick 핸들러가 호출된다', async () => {
      // Arrange
      const handleClick = jest.fn();
      const user = userEvent.setup();
      render(<Button onClick={handleClick}>Click</Button>);
      
      // Act
      await user.click(screen.getByRole('button'));
      
      // Assert
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });
});
```

### 쿼리 우선순위

React Testing Library의 권장 쿼리 우선순위를 따릅니다:

1. **접근성 쿼리 (최우선)**
   - `getByRole` - 가장 권장
   - `getByLabelText` - 폼 요소
   - `getByPlaceholderText` - 입력 필드
   - `getByText` - 텍스트 콘텐츠
   - `getByDisplayValue` - 폼 현재 값

2. **시맨틱 쿼리**
   - `getByAltText` - 이미지
   - `getByTitle` - title 속성

3. **테스트 ID (최후의 수단)**
   - `getByTestId` - 다른 방법이 없을 때만 사용

```typescript
// 좋은 예시
screen.getByRole('button', { name: '제출' });
screen.getByLabelText('이메일');
screen.getByRole('heading', { level: 1 });

// 피해야 할 예시
screen.getByTestId('submit-button'); // 최후의 수단으로만
```

### 테스트 케이스 체크리스트

#### 렌더링 테스트
- [ ] 기본 props로 렌더링
- [ ] 필수 요소들이 화면에 표시됨
- [ ] 초기 상태 확인

#### Props 테스트
- [ ] 각 prop 값에 따른 렌더링 변화
- [ ] 선택적 props 기본값
- [ ] prop 타입별 동작 (boolean, string, function 등)

#### 이벤트 테스트
- [ ] 클릭 이벤트
- [ ] 입력 이벤트 (타이핑, 변경)
- [ ] 포커스/블러 이벤트
- [ ] 키보드 이벤트 (있는 경우)

#### 조건부 렌더링 테스트
- [ ] 조건에 따른 요소 표시/숨김
- [ ] 로딩 상태
- [ ] 에러 상태
- [ ] 빈 상태

#### 비동기 동작 테스트
- [ ] 데이터 로딩 후 렌더링
- [ ] 비동기 이벤트 핸들러

## 비동기 테스트

### waitFor 사용

```typescript
it('데이터 로딩 후 사용자 목록을 표시한다', async () => {
  render(<UserList />);
  
  // 로딩 상태 확인
  expect(screen.getByText('로딩 중...')).toBeInTheDocument();
  
  // 데이터 로딩 완료 대기
  await waitFor(() => {
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });
});
```

### findBy 쿼리 사용

```typescript
it('비동기 데이터를 표시한다', async () => {
  render(<AsyncComponent />);
  
  // findBy는 waitFor + getBy의 조합
  const element = await screen.findByText('Loaded Data');
  expect(element).toBeInTheDocument();
});
```

## Mocking 전략

### 자식 컴포넌트 모킹

```typescript
jest.mock('./ChildComponent', () => ({
  ChildComponent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mocked-child">{children}</div>
  ),
}));
```

### 커스텀 훅 모킹

```typescript
import { useUser } from '@/hooks/useUser';

jest.mock('@/hooks/useUser');

const mockUseUser = useUser as jest.MockedFunction<typeof useUser>;

beforeEach(() => {
  mockUseUser.mockReturnValue({
    user: { id: '1', name: 'Test User' },
    isLoading: false,
    error: null,
  });
});
```

### Next.js Router 모킹

```typescript
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(),
  useSearchParams: jest.fn(),
}));

beforeEach(() => {
  (useRouter as jest.Mock).mockReturnValue({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  });
  (usePathname as jest.Mock).mockReturnValue('/dashboard');
  (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams());
});
```

### fetch 모킹

```typescript
global.fetch = jest.fn();

beforeEach(() => {
  (fetch as jest.Mock).mockReset();
});

it('API 데이터를 가져와서 표시한다', async () => {
  (fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ users: [{ id: '1', name: 'John' }] }),
  });

  render(<UserList />);
  
  await screen.findByText('John');
});
```

### Context Provider 래핑

```typescript
import { ThemeProvider } from '@/contexts/ThemeContext';

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <ThemeProvider>
      {ui}
    </ThemeProvider>
  );
};

it('테마 컨텍스트와 함께 렌더링된다', () => {
  renderWithProviders(<ThemedButton />);
  // ...
});
```

## 사용자 인터랙션

### userEvent 사용 (권장)

```typescript
import userEvent from '@testing-library/user-event';

it('폼을 작성하고 제출한다', async () => {
  const user = userEvent.setup();
  const handleSubmit = jest.fn();
  
  render(<LoginForm onSubmit={handleSubmit} />);
  
  // 타이핑
  await user.type(screen.getByLabelText('이메일'), 'test@example.com');
  await user.type(screen.getByLabelText('비밀번호'), 'password123');
  
  // 클릭
  await user.click(screen.getByRole('button', { name: '로그인' }));
  
  expect(handleSubmit).toHaveBeenCalledWith({
    email: 'test@example.com',
    password: 'password123',
  });
});
```

### fireEvent vs userEvent

```typescript
// fireEvent: 단순 이벤트 발생 (빠름)
fireEvent.click(button);

// userEvent: 실제 사용자 행동 시뮬레이션 (권장)
await user.click(button);

// userEvent는 다음을 포함:
// - 포커스 이동
// - hover 상태
// - 키보드 이벤트 연쇄
// - 실제 타이핑 시뮬레이션
```

## 접근성 테스트

```typescript
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

it('접근성 위반이 없다', async () => {
  const { container } = render(<Button>Accessible Button</Button>);
  const results = await axe(container);
  
  expect(results).toHaveNoViolations();
});
```

## 스냅샷 테스트 (선택적)

```typescript
it('스냅샷과 일치한다', () => {
  const { container } = render(<Button variant="primary">Click</Button>);
  expect(container).toMatchSnapshot();
});
```

> **주의**: 스냅샷 테스트는 보조 수단으로만 사용. 핵심 동작은 명시적 assertion으로 테스트.

## 네이밍 컨벤션

### describe 블록
- 컴포넌트명 또는 기능 그룹명 사용
- 중첩 describe로 카테고리 분류

### it 블록 (한글 권장)
- `'~가 렌더링된다'`
- `'~일 때 ~를 표시한다'`
- `'~하면 ~가 호출된다'`
- `'~상태에서 ~동작을 한다'`

## 주의사항

1. **구현 세부사항 테스트 금지**: 내부 상태, private 메서드 직접 테스트 X
2. **사용자 관점 테스트**: 사용자가 보고 상호작용하는 것을 테스트
3. **과도한 모킹 주의**: 필요한 것만 모킹, 실제 동작 유지
4. **테스트 격리**: 각 테스트는 독립적으로 실행 가능해야 함
5. **cleanup 자동화**: React Testing Library는 자동 cleanup 지원
