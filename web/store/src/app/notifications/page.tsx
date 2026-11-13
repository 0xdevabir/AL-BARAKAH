'use client';

import { EmptyState, fmtRelative, invalidate } from '@albarakah/ui';
import Link from 'next/link';
import { useEffect } from 'react';
import { api, useGet } from '@/lib/api';

interface Note { id: string; kind: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }

export default function NotificationsPage() {
  const { data, loading } = useGet<{ items: Note[]; unread: number }>('/notifications', { staleMs: 0 });

  // Opening the inbox counts as reading it, which also clears the badge in the top bar.
  useEffect(() => {
    if (!data?.unread) return;
    void api.post('/notifications/read', {}).then(() => invalidate('/notifications')).catch(() => undefined);
  }, [data?.unread]);

  return (
    <div className="page stack">
      <h1 className="title">Notifications</h1>
      {loading && !data ? <p className="muted">Loading…</p> : null}
      {data && !data.items.length ? <EmptyState icon="🔔" title="Nothing yet">Order updates, prescriptions and replies to your requests appear here.</EmptyState> : null}
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
    </div>
  );
}
