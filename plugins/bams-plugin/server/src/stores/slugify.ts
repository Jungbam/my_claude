/**
 * stores/slugify.ts
 *
 * 프로젝트/워크프로파일 slug 생성 유틸.
 * spec F-P1: `slugify(name || basename(realpath))`, 충돌 시 -2, -3 접미사.
 */

/**
 * 문자열을 URL-safe slug로 변환한다.
 * - 소문자화, ASCII 이외/공백은 하이픈으로 치환.
 * - 연속 하이픈 축약, 앞뒤 하이픈 트림.
 * - 최대 60자 클램프.
 * - 빈 결과면 "project".
 */
export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s.length > 0 ? s : "project";
}

/**
 * exists(slug)가 true이면 -2, -3 ... 접미사를 붙여 사용 가능한 slug를 찾는다.
 * 최대 1000회 시도.
 */
export function findUniqueSlug(
  base: string,
  exists: (candidate: string) => boolean,
): string {
  if (!exists(base)) return base;
  for (let i = 2; i < 1002; i++) {
    const candidate = `${base}-${i}`;
    if (!exists(candidate)) return candidate;
  }
  // 극단적 fallback — 시간 접미사
  return `${base}-${Date.now()}`;
}
