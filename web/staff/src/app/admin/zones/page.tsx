'use client';

import { formatTk } from '@albarakah/domain';
import { EmptyState, invalidate, LargeTitle, promptText, SkeletonList, Switch, toast } from '@albarakah/ui';
import { Icon } from '@/components/Icon';
import { api, useGet } from '@/lib/api';
import { message, poishaToTk, tkToPoisha } from '@/lib/app';

interface Zone { id: string; name: string; deliveryFeePoisha: number; isActive: boolean }

export default function ZonesPage() {
  const { data: zones, pending } = useGet<Zone[]>('/admin/zones');

  async function save(z: Zone | null, patch?: Partial<Zone>) {
    let next: Omit<Zone, 'id'> = z ? { name: z.name, deliveryFeePoisha: z.deliveryFeePoisha, isActive: z.isActive, ...patch } : { name: '', deliveryFeePoisha: 0, isActive: true };
    if (!patch) {
      const name = await promptText({ title: z ? 'Rename zone' : 'New delivery zone', placeholder: 'e.g. Dhanmondi', initial: z?.name, confirm: 'Next', required: true });
      if (name === null) return;
      const fee = await promptText({ title: `Delivery fee for ${name}`, message: 'In taka.', placeholder: '60', initial: z ? poishaToTk(z.deliveryFeePoisha) : '', confirm: z ? 'Save' : 'Add zone', required: true });
      if (fee === null) return;
      const p = tkToPoisha(fee);
      if (p === null) return toast('Enter a fee like 60', 'bad');
      next = { ...next, name, deliveryFeePoisha: p };
    }
    try {
      if (z) await api.patch(`/admin/zones/${z.id}`, next);
      else await api.post('/admin/zones', next);
      toast(z ? 'Zone updated' : 'Zone added');
      invalidate('/admin/zones');
      invalidate('/zones');
    } catch (err) {
      toast(message(err), 'bad');
    }
  }

  return (
    <>
      <LargeTitle
        sub="Where you deliver, and what it costs"
        action={<button className="btn small primary" onClick={() => void save(null)}><Icon name="plus" size={16} /> Zone</button>}
      >
        Zones
      </LargeTitle>
      {pending ? <SkeletonList rows={5} /> : null}
      {zones && !zones.length ? <EmptyState icon="📍" title="No zones yet">Customers cannot check out until you add one.</EmptyState> : null}
      {zones?.length ? (
        <>
          <div className="group">
            {zones.map((z) => (
              <div key={z.id}>
                <button className="row grow bare-btn" onClick={() => void save(z)}>
                  <span className="cell-icon"><Icon name="map" size={18} /></span>
                  <span className="cell-main">
                    <strong>{z.name}</strong>
                    <span className="cell-sub">Delivery {formatTk(z.deliveryFeePoisha)}{z.isActive ? '' : ' · paused'}</span>
                  </span>
                </button>
                <Switch label={`${z.name} active`} checked={z.isActive} onChange={(v) => void save(z, { isActive: v })} />
              </div>
            ))}
          </div>
          <p className="group-foot">Tap a zone to rename it or change its fee. Paused zones disappear from checkout but keep their history.</p>
        </>
      ) : null}
    </>
  );
}
