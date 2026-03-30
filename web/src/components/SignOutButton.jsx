'use client';

import { signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';
import { Button } from 'components/ui/button';

export default function SignOutButton({ className = '' }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={`gap-1.5 text-muted-foreground hover:text-foreground ${className}`}
      onClick={() => signOut({ callbackUrl: '/' })}
    >
      <LogOut className="h-4 w-4" />
      Sign out
    </Button>
  );
}
