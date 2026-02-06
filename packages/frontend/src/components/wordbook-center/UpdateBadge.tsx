import { ArrowUp } from '@phosphor-icons/react';

interface UpdateBadgeProps {
  currentVersion: string | null;
  newVersion: string;
}

export function UpdateBadge({ currentVersion, newVersion }: UpdateBadgeProps) {
  return (
    <span className="inline-flex max-w-[120px] items-center gap-1 truncate rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400">
      <ArrowUp aria-hidden="true" className="h-3 w-3 flex-shrink-0" />
      <span className="truncate font-mono">
        {currentVersion ? `${currentVersion} → ${newVersion}` : `v${newVersion}`}
      </span>
    </span>
  );
}
