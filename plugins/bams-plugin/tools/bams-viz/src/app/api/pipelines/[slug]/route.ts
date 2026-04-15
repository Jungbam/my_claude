import { NextResponse } from 'next/server'
import { BAMS_SERVER, headers } from '@/lib/server-config'
import { safeDecodeSlug } from '@/lib/slug-utils'
import { errorResponse, toInternalMessage } from '@/lib/server-errors'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const route = 'pipelines/slug'
  const { slug: rawSlug } = await params
  const slug = safeDecodeSlug(rawSlug)
  try {
    const res = await fetch(
      `${BAMS_SERVER}/api/pipelines/${encodeURIComponent(slug)}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data, { headers: headers('bams-server') })
    }
    // M-3: upstream 본문 노출 금지.
    return errorResponse(
      res.status,
      res.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `bams-server ${res.status} for ${slug}`,
      { route }
    )
  } catch (error) {
    return errorResponse(500, 'INTERNAL_ERROR', toInternalMessage(error), { route })
  }
}
