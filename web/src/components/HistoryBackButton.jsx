'use client';

import { useRouter } from 'next/navigation';
import { Button } from 'components/ui/button';

export default function HistoryBackButton({
  fallbackHref = '/',
  children = 'Back',
  className = '',
  variant = 'ghost',
  size = 'sm'
}) {
  const router = useRouter();

  const handleClick = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }

    router.replace(fallbackHref);
  };

  return (
    <Button type="button" variant={variant} size={size} onClick={handleClick} className={className}>
      {children}
    </Button>
  );
}