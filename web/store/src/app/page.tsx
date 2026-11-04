import Link from 'next/link';
import { BrandLockup } from '@/components/BrandLockup';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ProductGrid } from '@/components/ProductGrid';

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
      <section className="home-banner" aria-label="Welcome">
        {packs.length > 0 ? (
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
        ) : null}
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
        <header className="home-mobile-brand">
          <BrandLockup size={26} />
        </header>

        {data.categories.length > 0 ? (
          <section className="home-section cat-section" aria-label="Categories">
            <div className="section">
              <h2>Categories</h2>
              <Link href="/search">See all</Link>
            </div>
            <div className="cat-rail" role="list">
              {data.categories.map((c) => (
                <Link key={c.id} href={`/search?category=${c.slug}`} className="cat-tile" role="listitem">
                  <span className="cat-glyph">
                    <CategoryIcon slug={c.slug} />
                  </span>
                  <strong>{c.name}</strong>
                  <span className="muted small mono">{(c.count ?? 0).toLocaleString()}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="home-section meds-section" aria-label="Medicines">
          <div className="section">
            <h2>Medicines</h2>
            <Link href="/search">Search</Link>
          </div>
          <ProductGrid />
        </section>
      </div>
    </div>
  );
}
