import { cn } from 'lib/utils';

const badgeVariants = {
  default: 'border-border bg-secondary text-secondary-foreground',
  outline: 'border-border bg-transparent text-foreground',
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
