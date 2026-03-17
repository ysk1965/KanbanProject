const JOB_GROUP_COLORS = [
  'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  'bg-teal-500/15 text-teal-600 dark:text-teal-400',
  'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
  'bg-orange-500/15 text-orange-600 dark:text-orange-400',
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

export function getJobGroupBadgeClass(name: string): string {
  return JOB_GROUP_COLORS[hashName(name) % JOB_GROUP_COLORS.length];
}
