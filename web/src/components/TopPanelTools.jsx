import InstallAppButton from 'components/InstallAppButton';
import { cn } from 'lib/utils';

export default function TopPanelTools({ className = '' }) {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <InstallAppButton />
    </div>
  );
}
