'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { message } from '@/lib/app';

interface Slot {
  weekday: number;
  startMinute: number;
  endMinute: number;
  slotMinutes: number;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AvailabilityPage() {
  const [rows, setRows] = useState<Slot[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void api
      .get<{ availability: Slot[] }>('/doctor/me')
      .then((r) => setRows(r.availability ?? []))
      .catch((err) => setError(message(err)));
  }, []);

  return (
    <div className="page stack">
      <h1 className="title">Availability</h1>
      {error ? <p className="error">{error}</p> : null}
      <div className="group">
        {rows.map((r) => (
          <div key={`${r.weekday}-${r.startMinute}`}>
            <strong>{DAYS[r.weekday] ?? r.weekday}</strong>
            <span className="muted">
              {' '}
              {Math.floor(r.startMinute / 60)}:{String(r.startMinute % 60).padStart(2, '0')} – {Math.floor(r.endMinute / 60)}:
              {String(r.endMinute % 60).padStart(2, '0')} · {r.slotMinutes} min
            </span>
          </div>
        ))}
      </div>
      {rows.length === 0 && !error ? <p className="muted">No availability set yet. Ask an admin to configure your schedule.</p> : null}
    </div>
  );
}
