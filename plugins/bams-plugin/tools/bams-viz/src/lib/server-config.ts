/** bams-server URL — 서버 사이드 전용 */
export const BAMS_SERVER = process.env.BAMS_SERVER_URL ?? 'http://localhost:3099'

/** CORS 허용 origin */
export const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3333'

/** 공통 CORS 헤더 (단순 응답용) */
export const corsHeaders = { 'Access-Control-Allow-Origin': CORS_ORIGIN }

/** CORS + X-Data-Source 헤더 (데이터 출처 추적용) */
export function headers(source: string = 'bams-server') {
  return { 'Access-Control-Allow-Origin': CORS_ORIGIN, 'X-Data-Source': source }
}
