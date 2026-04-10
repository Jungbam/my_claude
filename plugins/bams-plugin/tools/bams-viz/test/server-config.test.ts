import { describe, test, expect } from 'bun:test'

/**
 * server-config.ts 테스트
 * Phase 1에서 추가된 CORS/서버 설정 모듈을 검증한다.
 * 주의: 환경변수 오염을 막기 위해 dynamic import 대신 직접 import 후
 *       기본값(fallback) 동작만 검증한다.
 */

// 환경변수가 세팅되지 않은 상태를 보장하기 위해 테스트 전에 unset
const originalBamsServerUrl = process.env.BAMS_SERVER_URL
const originalCorsOrigin = process.env.CORS_ORIGIN

describe('server-config — 기본값 확인', () => {
  test('BAMS_SERVER_URL 미설정 시 localhost:3099 사용', async () => {
    delete process.env.BAMS_SERVER_URL
    delete process.env.CORS_ORIGIN
    // 모듈을 동적으로 가져와 환경변수 상태 반영
    const mod = await import('../src/lib/server-config.ts?t=' + Date.now())
    // 값 자체를 직접 검증: 기본값이 localhost:3099를 포함해야 함
    expect(mod.BAMS_SERVER).toContain('3099')
  })

  test('CORS_ORIGIN 미설정 시 localhost:3333 사용', async () => {
    delete process.env.BAMS_SERVER_URL
    delete process.env.CORS_ORIGIN
    const mod = await import('../src/lib/server-config.ts?t=' + Date.now() + '1')
    expect(mod.CORS_ORIGIN).toContain('3333')
  })

  test('corsHeaders 객체에 Access-Control-Allow-Origin 키가 존재한다', async () => {
    const { corsHeaders } = await import('../src/lib/server-config.ts?t=' + Date.now() + '2')
    expect(corsHeaders).toBeDefined()
    expect(typeof corsHeaders).toBe('object')
    expect('Access-Control-Allow-Origin' in corsHeaders).toBe(true)
  })

  test('corsHeaders의 Access-Control-Allow-Origin 값은 문자열이다', async () => {
    const { corsHeaders } = await import('../src/lib/server-config.ts?t=' + Date.now() + '3')
    expect(typeof corsHeaders['Access-Control-Allow-Origin']).toBe('string')
  })

  test('headers() 함수는 Access-Control-Allow-Origin과 X-Data-Source를 반환한다', async () => {
    const { headers } = await import('../src/lib/server-config.ts?t=' + Date.now() + '4')
    const result = headers('test-source')
    expect(result).toBeDefined()
    expect('Access-Control-Allow-Origin' in result).toBe(true)
    expect('X-Data-Source' in result).toBe(true)
    expect(result['X-Data-Source']).toBe('test-source')
  })

  test('headers() 함수는 인자 없이 호출 시 기본 source로 bams-server를 사용한다', async () => {
    const { headers } = await import('../src/lib/server-config.ts?t=' + Date.now() + '5')
    const result = headers()
    expect(result['X-Data-Source']).toBe('bams-server')
  })

  test('headers()와 corsHeaders의 CORS origin 값이 일치한다', async () => {
    const mod = await import('../src/lib/server-config.ts?t=' + Date.now() + '6')
    const h = mod.headers()
    expect(h['Access-Control-Allow-Origin']).toBe(mod.corsHeaders['Access-Control-Allow-Origin'])
  })
})

// 환경변수 복원 (다른 테스트에 영향 없도록)
process.env.BAMS_SERVER_URL = originalBamsServerUrl ?? ''
process.env.CORS_ORIGIN = originalCorsOrigin ?? ''
if (!originalBamsServerUrl) delete process.env.BAMS_SERVER_URL
if (!originalCorsOrigin) delete process.env.CORS_ORIGIN
