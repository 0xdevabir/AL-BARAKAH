'use client';

import { EmptyState, fmtRelative, invalidate, LargeTitle, SkeletonList } from '@albarakah/ui';
import Link from 'next/link';
import { useEffect } from 'react';
import { api, useGet } from '@/lib/api';

interface Note { id: string; kind: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }
export interface Inbox { items: Note[]; unread: number }

/** Unread count for a tab badge. */
export function useUnread(enabled: boolean) {
  const { data } = useGet<Inbox>(enabled ? '/notifications' : null, { pollMs: 60_000 });
  return data?.unread || undefined;
}

/** Prescription copies, requests and alerts sent to this staff member. Opening the inbox marks it read. */
export function InboxPage({ empty }: { empty: string }) {
  const { data, error, pending } = useGet<Inbox>('/notifications', { staleMs: 0 });

  useEffect(() => {
    if (!data?.unread) return;
    void api.post('/notifications/read', {}).then(() => invalidate('/notifications')).catch(() => undefined);
  }, [data?.unread]);

  return (
    <>
      <LargeTitle sub="Prescription copies, requests and alerts">Inbox</LargeTitle>
      {error && !data ? <p className="error">{error.message}</p> : null}
      {pending && !data ? <SkeletonList rows={5} /> : null}
      {data && !data.items.length ? <EmptyState icon="🔔" title="Nothing yet">{empty}</EmptyState> : null}
      {data?.items.length ? (
        <ul className="group note-list">
          {data.items.map((n) => {
            const inner = (
              <>
                <span className={`note-dot${n.readAt ? '' : ' on'}`} aria-hidden="true" />
                <span className="grow">
                  <strong>{n.title}</strong>
                  {n.body ? <span className="muted small note-body">{n.body}</span> : null}
                  <span className="muted small">{fmtRelative(n.createdAt)}</span>
                </span>
              </>
            );
            return <li key={n.id}>{n.link?.startsWith('/') ? <Link href={n.link}>{inner}</Link> : <div>{inner}</div>}</li>;
          })}
        </ul>
      ) : null}
    </>
  );
}
