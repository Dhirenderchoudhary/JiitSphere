"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SuperaminAliasPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/superadmin');
  }, [router]);

  return null;
}
