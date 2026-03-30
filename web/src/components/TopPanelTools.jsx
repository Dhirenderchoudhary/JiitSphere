import InstallAppButton from 'components/InstallAppButton';
import ThemeToggleButton from 'components/ThemeToggleButton';
import { cn } from 'lib/utils';

export default function TopPanelTools({ className = '' }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <InstallAppButton />
      <ThemeToggleButton />
    </div>
  );
}
