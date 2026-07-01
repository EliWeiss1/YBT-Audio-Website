import { categories } from '@/lib/lectures'
import type { TreeNode } from '@/lib/lectures'
import { logApiCall } from '@/lib/api-logger'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

type SlimNode = {
  id: string
  label: string
  icon?: string
  children?: SlimNode[]
}

function stripLectures(node: TreeNode): SlimNode {
  const slim: SlimNode = { id: node.id, label: node.label }
  if (node.icon) slim.icon = node.icon
  if (node.children?.length) slim.children = node.children.map(stripLectures)
  return slim
}

export async function GET(request: NextRequest) {
  const start = Date.now()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  const result = categories.map(stripLectures)

  logApiCall({
    endpoint: '/api/v1/categories',
    result_count: result.length,
    response_ms: Date.now() - start,
    ip,
  })

  return NextResponse.json(
    { categories: result },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' } }
  )
}
