'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  fetchSidebarInspectionCounts,
  type SidebarInspectionCounts,
} from '@/lib/sidebar-inspection-counts'

const emptyCounts: SidebarInspectionCounts = { dailyPending: 0, periodicPending: 0 }

export function useSidebarInspectionCounts(): SidebarInspectionCounts {
  const supabase = useMemo(() => createClient(), [])
  const [counts, setCounts] = useState<SidebarInspectionCounts>(emptyCounts)

  const fetchCounts = useCallback(async () => {
    const next = await fetchSidebarInspectionCounts(supabase)
    setCounts(next)
  }, [supabase])

  useEffect(() => {
    void fetchCounts()
    const channel = supabase
      .channel('sidebar-inspection-counts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_records' },
        () => void fetchCounts(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'devices' },
        () => void fetchCounts(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_model_masters' },
        () => void fetchCounts(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchCounts, supabase])

  return counts
}

export function SidebarInspectionBadge({
  count,
  kind,
  active,
}: {
  count: number
  kind: 'daily' | 'periodic'
  active?: boolean
}) {
  if (count <= 0) return null

  return (
    <span
      className={cn(
        'ml-auto shrink-0 min-w-[1.375rem] h-5 px-1.5 rounded-full text-[10px] font-semibold tabular-nums inline-flex items-center justify-center',
        active
          ? 'bg-blue-600 text-white'
          : kind === 'daily'
            ? 'bg-teal-100 text-teal-800'
            : 'bg-amber-100 text-amber-900',
      )}
      title={kind === 'daily' ? `本日未点検 ${count} 件` : `未点検 ${count} 件`}
    >
      {count}
    </span>
  )
}
