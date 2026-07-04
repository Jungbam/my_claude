/**
 * @deprecated Use ProjectCard from '@/components/landing/ProjectCard'.
 *
 * design-fe.md §1-2 결정: WorkCard*는 프로젝트 도메인으로 리네이밍.
 * 기존 참조를 깨지 않기 위해 legacy alias로 남긴다. WorkUnit 기반 카드가 필요한
 * 신규 코드에서는 사용하지 말 것 (props shape 상이 — WorkUnit vs Project).
 *
 * NOTE: 기존 WorkCard 구현체는 삭제되었다. `/work/[slug]` 페이지는 이 컴포넌트를
 * 직접 참조하지 않으므로 하위 호환 영향 없음(호출부: `WorkCardGrid` 내부만 사용).
 * `WorkCardGrid` 역시 legacy alias로 재정의되었다.
 */
export { ProjectCard as WorkCard } from './ProjectCard'
