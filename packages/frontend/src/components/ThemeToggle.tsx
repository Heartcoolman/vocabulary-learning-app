import { motion } from 'framer-motion';
import { Sun, Moon } from './Icon';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from './ui/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        'relative flex h-10 w-10 items-center justify-center rounded-button',
        'border border-gray-200/50 bg-white/50 dark:border-slate-700/50 dark:bg-slate-800/50',
        'text-gray-600 dark:text-gray-300',
        'transition-colors hover:bg-gray-100 dark:hover:bg-slate-700/50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        className,
      )}
      aria-label="Toggle theme"
    >
      <div className="relative h-5 w-5">
        <motion.div
          initial={false}
          animate={{
            scale: isDark ? 0 : 1,
            opacity: isDark ? 0 : 1,
            rotate: isDark ? 90 : 0,
          }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <Sun size={20} weight="fill" className="text-amber-500" />
        </motion.div>

        <motion.div
          initial={false}
          animate={{
            scale: isDark ? 1 : 0,
            opacity: isDark ? 1 : 0,
            rotate: isDark ? 0 : -90,
          }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <Moon size={20} weight="fill" className="text-blue-400" />
        </motion.div>
      </div>
    </button>
  );
}
