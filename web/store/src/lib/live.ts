'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from './api';

/**
 * Subscribes to a server-sent event stream. Each connect gets a fresh one-use ticket,
 * and a dropped stream reconnects with backoff, so the board stays live on flaky networks.
 */
export function useLive(ticketPath: string | null, onMessage: (data: { orderId: string; status: string }) => void) {
  const cb = useRef(onMessage);
  cb.current = onMessage;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!ticketPath) return;
    let es: EventSource | null = null;
    let stopped = false;
    let retry = 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function connect() {
      try {
        const { ticket } = await api.post<{ ticket: string }>(ticketPath!);
        if (stopped) return;
        es = new EventSource(`${api.base}/orders/events/stream?ticket=${encodeURIComponent(ticket)}`);
        es.onopen = () => {
          retry = 1000;
          setConnected(true);
        };
        es.onmessage = (e) => {
          try {
            cb.current(JSON.parse(e.data));
          } catch {
            /* ping or malformed */
          }
        };
        es.onerror = () => {
          es?.close();
          setConnected(false);
          schedule();
        };
      } catch {
        schedule();
      }
    }
    function schedule() {
      if (stopped) return;
      timer = setTimeout(() => void connect(), retry);
      retry = Math.min(retry * 2, 30_000);
    }
    void connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      es?.close();
    };
  }, [ticketPath]);

  return connected;
}
