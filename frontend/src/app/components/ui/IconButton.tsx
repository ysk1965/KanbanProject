import React from 'react';
import { cn } from './utils';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required for accessibility — describes the button action */
  'aria-label': string;
  /** Button size variant (all meet 44x44px minimum touch target) */
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'min-w-[44px] min-h-[44px] [&_svg]:w-4 [&_svg]:h-4',
  md: 'min-w-[44px] min-h-[44px] [&_svg]:w-5 [&_svg]:h-5',
  lg: 'min-w-[48px] min-h-[48px] [&_svg]:w-6 [&_svg]:h-6',
} as const;

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size = 'sm', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'inline-flex items-center justify-center rounded-lg',
          'text-slate-500 hover:text-foreground hover:bg-foreground/5',
          'transition-colors shrink-0',
          'focus:outline-none focus:ring-2 focus:ring-bridge-accent/50',
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

IconButton.displayName = 'IconButton';
