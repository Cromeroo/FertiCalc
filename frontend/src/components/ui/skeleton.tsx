import { cx } from '@/lib/utils'
import type { HTMLAttributes } from 'react'

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('animate-pulse rounded-md bg-border', className)} {...props} />
}
