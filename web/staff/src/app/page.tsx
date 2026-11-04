'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useApi } from '@/lib/api';
import { homeFor } from '@/lib/app';

/** Staff land straight in their own portal; there is nothing to browse here. */
export default function StaffHome() {
  const { user, ready } = useApi();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    router.replace(user && !(user.role === 'ADMIN' && !user.mfa) ? homeFor(user.role) : '/login');
  }, [ready, user, router]);
  return (
    <div className="boot" aria-busy="true">
      <span className="boot-mark">+</span>
    </div>
  );
}
