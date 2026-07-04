/**
 * stores/http-helpers.ts
 *
 * 라우트 파일이 공통으로 사용하는 CORS-aware Response 생성 헬퍼.
 * app.ts의 jsonResponse/errorResponse는 라우트에서 재사용하기 어려운 위치(내부)에
 * 있어, 순환 import 없이 동일 CORS 헤더를 붙일 수 있도록 별도로 노출한다.
 *
 * 응답 규약(F-P9): `{ error: CODE, ...detail }` — 코드는 대문자 스네이크.
 */

const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "*";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export function jsonResp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

/**
 * 오류 응답 표준 형식: { error: CODE, ...extra }
 * @param code 대문자 스네이크 코드 (예: "NOT_A_DIRECTORY")
 * @param extra 추가 정보(예: existing_slug, path)
 * @param status HTTP 상태 코드(기본 400)
 */
export function jsonErr(
  code: string,
  extra: Record<string, unknown> = {},
  status = 400,
): Response {
  return jsonResp({ error: code, ...extra }, status);
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

/**
 * body를 안전하게 JSON 파싱한다. 실패 시 null 반환.
 */
export async function readJsonBody<T = Record<string, unknown>>(
  req: Request,
): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
