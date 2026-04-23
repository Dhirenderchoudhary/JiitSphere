'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from 'components/ui/button';

const TOKEN_KEY = 'jaypee_buddy_token';
const PORTAL_VERIFIED_KEY = 'jaypee_buddy_portal_verified';
const LOGIN_AT_KEY = 'jaypee_buddy_login_at';

export default function SignOutButton({ className = '' }) {
  const router = useRouter();

  const handleSignOut = async () => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(PORTAL_VERIFIED_KEY);
    window.localStorage.removeItem(LOGIN_AT_KEY);
    window.dispatchEvent(new Event('jaypee-buddy-identity-updated'));
    await fetch('/api/auth/signout', { method: 'POST' }).catch(() => null);
    router.replace('/');
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`gap-1.5 text-muted-foreground hover:text-foreground ${className}`}
      onClick={handleSignOut}
      title="Sign out"
    >
      <LogOut className="h-4 w-4" />
      <span className="hidden sm:inline">Sign out</span>
    </Button>
  );
}
