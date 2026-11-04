'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useApi } from './api';

/** Sends a signed-out visitor to login and back here afterwards. */
export function useSignedIn(next: string) {
  const { user, ready } = useApi();
  const router = useRouter();
  useEffect(() => {
    if (ready && !user) router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [ready, user, router, next]);
  return user;
}
