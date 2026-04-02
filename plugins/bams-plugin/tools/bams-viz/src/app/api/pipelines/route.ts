import { NextRequest, NextResponse } from 'next/server'
import { EventStore } from '@/lib/event-store'

const corsHeaders = { 'Access-Control-Allow-Origin': '*' }

export async function GET() {
  try {
    const store = EventStore.getInstance()
    const pipelines = store.getPipelines()
    return NextResponse.json(pipelines, { headers: corsHeaders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const slug = request.nextUrl.searchParams.get('slug')
    const store = EventStore.getInstance()

    if (slug) {
      // Delete single pipeline
      const deleted = store.deletePipeline(slug)
      if (!deleted) {
        return NextResponse.json({ error: 'Not found' }, { status: 404, headers: corsHeaders })
      }
      return NextResponse.json({ deleted: slug }, { headers: corsHeaders })
    } else {
      // Delete all pipelines
      const count = store.deleteAllPipelines()
      return NextResponse.json({ deleted: 'all', count }, { headers: corsHeaders })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders })
  }
}
