import Link from 'next/link';
import { BrandLockup } from '@/components/BrandLockup';

const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Category = { id: string; name: string; slug: string; count: number };
type Medicine = { id: string; name: string; imageUrl?: string | null; form?: string };

async function loadHome() {
  try {
    const [categoriesRes, medicinesRes] = await Promise.all([
      fetch(`${API}/categories`, { next: { revalidate: 30 } }),
      fetch(`${API}/medicines`, { next: { revalidate: 30 } }),
    ]);
    const categories = categoriesRes.ok ? ((await categoriesRes.json()) as Category[]) : [];
    const medicinesPayload = medicinesRes.ok ? await medicinesRes.json() : null;
    const medicines: Medicine[] = Array.isArray(medicinesPayload)
      ? medicinesPayload
      : Array.isArray(medicinesPayload?.items)
        ? medicinesPayload.items
        : [];
    return { categories, medicines };
  } catch {
    return { categories: [] as Category[], medicines: [] as Medicine[] };
  }
}

export default async function HomePage() {
  const data = await loadHome();
  const total = data.categories.reduce((n, c) => n + (c.count ?? 0), 0);
  const packs = data.medicines
    .filter((m, i, all) => m.imageUrl && all.findIndex((o) => (o.form || o.id) === (m.form || m.id)) === i)
    .slice(0, 3);

  return (
    <div className="home-bleed">
      <section className="hero-plane">
        {packs.length > 0 && (
          <div className="hero-packs" aria-hidden="true">
            {packs.map((med) => (
              <img
                key={med.id}
                src={med.imageUrl!}
                alt=""
                width={180}
                height={180}
                decoding="async"
                referrerPolicy="no-referrer"
              />
            ))}
          </div>
        )}
        <div className="hero-copy">
          <BrandLockup size={34} tone="light" />
          <h1>Medicine at your door</h1>
          <p>
            {total > 0
              ? `${total.toLocaleString()} medicines ready for delivery across Bangladesh.`
              : 'Trusted pharmacy delivery, with doctors a tap away.'}
          </p>
          <Link className="cta" href="/search">
            Browse medicines
          </Link>
        </div>
      </section>

      <div className="home-body">
        <div className="action-row">
          <Link className="action" href="/search">
            <strong>Emergency delivery</strong>
            <span>As fast as one hour when the counter is open.</span>
          </Link>
          <Link className="action" href="/doctors">
            <strong>Talk to a doctor</strong>
            <span>Video or WhatsApp consultations.</span>
          </Link>
        </div>

        {data.categories.length > 0 ? (
          <section className="home-section">
            <div className="section">
              <h2>Categories</h2>
              <Link href="/search">See all</Link>
            </div>
            <div className="group">
              {data.categories.slice(0, 8).map((c) => (
                <Link key={c.id} href={`/search?category=${c.slug}`} className="chev">
                  <span className="grow">{c.name}</span>
                  <span className="cat-count mono small">{(c.count ?? 0).toLocaleString()}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
