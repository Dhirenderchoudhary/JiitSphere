import { useEffect, useState } from 'react';
import InstallAppButton from 'components/InstallAppButton';
import SignOutButton from 'components/SignOutButton';
import { cn } from 'lib/utils';

const TOKEN_KEY = 'jaypee_buddy_token';

export default function TopPanelTools({ className = '' }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check session on mount
    const checkSession = () => {
      const token = window.localStorage.getItem(TOKEN_KEY);
      setIsLoggedIn(!!token);
    };

    checkSession();
    
    // Listen for custom identity updates
    window.addEventListener('jaypee-buddy-identity-updated', checkSession);
    return () => window.removeEventListener('jaypee-buddy-identity-updated', checkSession);
  }, []);

  return (
    <div className={cn('flex items-center gap-2 sm:gap-4', className)}>
      <InstallAppButton />
      {isLoggedIn && <SignOutButton />}
    </div>
  );
}
