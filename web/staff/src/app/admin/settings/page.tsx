'use client';

import { formatTk } from '@albarakah/domain';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { message, poishaToTk } from '@/lib/app';

interface Settings {
  emergencyFeePoisha: number;
  doctorFeePoisha: number;
  emergencyOpenMinute: number;
  emergencyCloseMinute: number;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    void api
      .get<Settings>('/admin/settings')
      .then(setSettings)
      .catch((err) => setError(message(err)));
  }, []);

  return (
    <div className="page stack">
      <h1 className="title">Settings</h1>
      {error ? <p className="error">{error}</p> : null}
      {settings ? (
        <div className="group">
          <div className="row between">
            <span>Emergency fee</span>
            <span className="price">{formatTk(settings.emergencyFeePoisha)}</span>
          </div>
          <div className="row between">
            <span>Doctor fee</span>
            <span className="price">{formatTk(settings.doctorFeePoisha)}</span>
          </div>
          <div className="row between">
            <span>Emergency window</span>
            <span className="mono">
              {poishaToTk(settings.emergencyOpenMinute)} – {poishaToTk(settings.emergencyCloseMinute)} min-of-day
            </span>
          </div>
        </div>
      ) : !error ? (
        <p className="muted">Loading…</p>
      ) : null}
    </div>
  );
}
