import React from 'react';

interface TaskCardSkeletonProps {
  count?: number;
}

export function TaskCardSkeleton({ count = 1 }: TaskCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-surface-raised rounded-xl border border-border-default p-3 space-y-2.5">
          <div className="h-3.5 skeleton w-3/4" />
          <div className="flex gap-2">
            <div className="h-5 w-5 skeleton rounded-full" />
            <div className="h-5 w-5 skeleton rounded-full" />
          </div>
          <div className="flex justify-between">
            <div className="h-2.5 skeleton w-16" />
            <div className="h-4 w-10 skeleton rounded-full" />
          </div>
        </div>
      ))}
    </>
  );
}

export function PageLoading() {
  return (
    <div className="flex items-center justify-center h-dvh bg-surface-base">
      <div className="w-8 h-8 animate-spin text-bridge-accent">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4m-3.93 7.07l-2.83-2.83M7.76 7.76L4.93 4.93" />
        </svg>
      </div>
    </div>
  );
}
