import InstallAppButton from 'components/InstallAppButton';
import AccentPicker from 'components/AccentPicker';
import { cn } from 'lib/utils';

export default function TopPanelTools({ className = '' }) {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <AccentPicker />
      <InstallAppButton />
    </div>
  );
}
