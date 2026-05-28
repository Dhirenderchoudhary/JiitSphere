import { cn } from 'lib/utils';
import { buttonVariants } from './button.utils';

export function Button({ className, variant, size, asChild = false, ...props }) {
  const Comp = asChild ? 'span' : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
