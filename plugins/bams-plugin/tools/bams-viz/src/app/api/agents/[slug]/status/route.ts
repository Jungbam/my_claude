import { NextResponse } from 'next/server'
import { BAMS_SERVER, headers } from '@/lib/server-config'
import { safeDecodeSlug } from '@/lib/slug-utils'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: rawSlug } = await params
  const slug = safeDecodeSlug(rawSlug)
  try {
    const res = await fetch(
      `${BAMS_SERVER}/api/agents/${encodeURIComponent(slug)}/status`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (res.ok) {
      const data = await res.json()
      return NextResponse.json(data, { headers: headers('bams-server') })
    }
    return NextResponse.json(
      { error: 'Not found' },
      { status: res.status, headers: headers('error') }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: message },
      { status: 500, headers: headers('error') }
    )
  }
}
