import { BAMS_SERVER, headers } from '@/lib/server-config'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

/** Defensively decode percent-encoded slug. Handles double-encoding. */
function safeDecodeSlug(raw: string): string {
  try {
    let decoded = raw
    for (let i = 0; i < 2; i++) {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    }
    return decoded
  } catch {
    return raw
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; pipelineSlug: string }> }
) {
  const route = 'workunits/slug/pipelines/pipelineSlug:PATCH'
  const { slug: rawSlug, pipelineSlug: rawPipelineSlug } = await params
  const slug = safeDecodeSlug(rawSlug)
  const pipelineSlug = safeDecodeSlug(rawPipelineSlug)
  try {
    const body = await request.text()
    const res = await fetch(
      `${BAMS_SERVER}/api/workunits/${encodeURIComponent(slug)}/pipelines/${encodeURIComponent(pipelineSlug)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(5000),
      }
    )
    if (res.ok) {
      return new Response(await res.text(), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', ...headers() },
      })
    }
    // M-3: upstream 본문 중계 금지.
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server PATCH ${res.status} for ${slug}/${pipelineSlug}`,
      { route }
    )
  } catch (error) {
    return errorResponse(502, 'NETWORK_ERROR', toInternalMessage(error), { route })
  }
}
