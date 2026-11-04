'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { message } from '@/lib/app';

interface Person {
  id: string;
  name: string;
  phone: string;
  role: string;
  isActive: boolean;
}

export default function AdminPeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void api
      .get<Person[]>('/admin/staff')
      .then(setPeople)
      .catch((err) => setError(message(err)));
  }, []);

  return (
    <div className="page stack">
      <h1 className="title">People</h1>
      {error ? <p className="error">{error}</p> : null}
      <div className="group">
        {people.map((p) => (
          <div key={p.id} className="row between">
            <span className="grow">
              <strong>{p.name}</strong>
              <span className="muted small" style={{ display: 'block' }}>
                {p.phone} · {p.role}
              </span>
            </span>
            <span className={`chip${p.isActive ? '' : ' off'}`}>{p.isActive ? 'Active' : 'Off'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
