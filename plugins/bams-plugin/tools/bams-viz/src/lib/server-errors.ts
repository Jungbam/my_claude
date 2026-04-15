/**
 * bams-viz/src/lib/server-errors.ts
 *
 * 공통 에러 응답 헬퍼 — 클라이언트에는 일반화된 메시지만, 서버 로그에는 상세 기록.
 *
 * 목적:
 *   1. `error.message`/내부 stack/경로를 클라이언트로 직접 노출하지 않는다.
 *   2. API route 간 에러 응답 구조를 통일한다:
 *      { error: { code: ErrorCode, message: string } }
 *   3. bams-server의 에러 본문을 클라이언트로 그대로 중계(passthrough)하지 않는다.
 *
 * 사용 예:
 *   // upstream 에러 중계 (body는 버리고 status만 유지)
 *   return errorResponse(res.status, 'UPSTREAM_ERROR', `bams-server ${res.status}`)
 *
 *   // 네트워크 실패
 *   return errorResponse(502, 'NETWORK_ERROR', err.message)
 *
 *   // 잘못된 요청
 *   return errorResponse(400, 'BAD_REQUEST', 'missing since')
 */
import { NextResponse } from 'next/server'
import { headers as corsAndSourceHeaders } from '@/lib/server-config'

export type ErrorCode =
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'UPSTREAM_ERROR'
  | 'NETWORK_ERROR'
  | 'INTERNAL_ERROR'
  | 'UNAVAILABLE'
  | 'NOT_IMPLEMENTED'

/**
 * 사용자에게 반환되는 안전한 공개 메시지. 내부 경로/스택/메시지 원문을 절대 포함하지 않는다.
 */
export function getPublicMessage(code: ErrorCode): string {
  switch (code) {
    case 'NOT_FOUND':
      return 'Resource not found'
    case 'BAD_REQUEST':
      return 'Invalid request'
    case 'UPSTREAM_ERROR':
      return 'Upstream service error'
    case 'NETWORK_ERROR':
      return 'Service unavailable'
    case 'UNAVAILABLE':
      return 'Service unavailable'
    case 'NOT_IMPLEMENTED':
      return 'Not implemented'
    case 'INTERNAL_ERROR':
    default:
      return 'Internal server error'
  }
}

/**
 * 표준 에러 응답. internalMessage는 서버 로그에만 기록되고 응답 본문에는 포함되지 않는다.
 */
export function errorResponse(
  status: number,
  code: ErrorCode,
  internalMessage?: unknown,
  opts?: { source?: string; route?: string }
) {
  if (internalMessage !== undefined) {
    const source = opts?.route ?? 'api'
    // 서버 로그에는 상세 기록
    console.error(`[${source}] ${code}:`, internalMessage)
  }
  return NextResponse.json(
    { error: { code, message: getPublicMessage(code) } },
    { status, headers: corsAndSourceHeaders(opts?.source ?? 'error') }
  )
}

/**
 * unknown 타입 에러 → 내부 로그용 문자열. 외부 노출 금지.
 */
export function toInternalMessage(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  try {
    return String(error)
  } catch {
    return 'unknown error'
  }
}
