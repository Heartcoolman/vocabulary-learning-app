import { cn } from '../ui/utils';

type MaxWidth =
  | 'xs'
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | '2xl'
  | '3xl'
  | '4xl'
  | '5xl'
  | '6xl'
  | '7xl'
  | 'full'
  | 'prose'
  | 'screen';

interface PageLayoutProps {
  children: React.ReactNode;
  maxWidth?: MaxWidth;
  className?: string;
  animate?: boolean;
}

const maxWidthClasses: Record<MaxWidth, string> = {
  xs: 'max-w-xs',
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-full',
  prose: 'max-w-prose',
  screen: 'max-w-screen-xl',
};

export function PageLayout({
  children,
  maxWidth = '7xl',
  className,
  animate = true,
}: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div
        className={cn(
          'mx-auto px-4 py-8',
          maxWidthClasses[maxWidth],
          animate && 'animate-g3-fade-in',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export default PageLayout;
