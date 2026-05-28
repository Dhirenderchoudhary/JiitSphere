import { cn } from 'lib/utils';

const badgeVariants = {
  default: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
  secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
  destructive:
    'border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80',
  outline: 'text-foreground',
  success: 'border-transparent bg-emerald-500 text-primary-foreground hover:bg-emerald-500/80',
  warning: 'border-transparent bg-amber-500 text-primary-foreground hover:bg-amber-500/80',
};

export function Badge({ className, variant = 'default', ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium',
        badgeVariants[variant] || badgeVariants.default,
        className
      )}
      {...props}
    />
  );
}
