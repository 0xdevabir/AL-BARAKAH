import Link from 'next/link';
import { BrandLockup } from '@/components/BrandLockup';
import { CategoryIcon } from '@/components/CategoryIcon';
import { HomeDoctor } from '@/components/HomeDoctor';
import { ProductGrid } from '@/components/ProductGrid';
import { SearchBox } from '@/components/SearchBox';
import type { Doctor } from '@/lib/doctors';

const API = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Category = { id: string; name: string; slug: string; count?: number };
type Medicine = { id: string; name: string; imageUrl?: string | null; form?: string };

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API}${path}`, { next: { revalidate: 30 } });
    return res.ok ? ((await res.json()) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function loadHome() {
  const [categories, medicinesPayload, doctors] = await Promise.all([
    getJson<Category[]>('/categories', []),
    getJson<Medicine[] | { items?: Medicine[] } | null>('/medicines', null),
    getJson<Doctor[]>('/doctors', []),
  ]);
  const medicines = Array.isArray(medicinesPayload) ? medicinesPayload : (medicinesPayload?.items ?? []);
  return { categories, medicines, doctors: Array.isArray(doctors) ? doctors : [] };
}

const facts = [
  {
    label: 'Delivered across Bangladesh',
    icon: <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7.5 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17.5 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />,
  },
  {
    label: 'Pay with bKash or cash on delivery',
    icon: <path d="M3 6h18v12H3zM3 10h18M7 15h3" />,
  },
  {
    label: 'Doctors on video or WhatsApp',
    icon: <path d="M15 10l5-3v10l-5-3M3 7h12v10H3z" />,
  },
];

export default async function HomePage() {
  const data = await loadHome();
  // Empty categories lead to an empty search, so they stay off the home page.
  const categories = data.categories.filter((c) => c.count === undefined || c.count > 0);
  const total = categories.reduce((n, c) => n + (c.count ?? 0), 0);
  const popular = [...categories].sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).slice(0, 4);
  const packs = data.medicines
    .filter((m, i, all) => m.imageUrl && all.findIndex((o) => (o.form || o.id) === (m.form || m.id)) === i)
    .slice(0, 3);

  return (
    <div className="home-bleed">
      <section className="home-banner" aria-label="Welcome">
        <div className="hero-copy">
          <BrandLockup size={34} tone="light" />
          <h1>Medicine at your door</h1>
          <p className="hero-bn" lang="bn">
            ঘরে বসেই ওষুধ
          </p>
          <p className="hero-lede">
            {total > 0
              ? `${total.toLocaleString()} medicines, searchable by brand or generic name.`
              : 'Trusted pharmacy delivery, with doctors a tap away.'}
          </p>
          <div className="hero-search">
            <SearchBox />
          </div>
          {popular.length > 0 ? (
            <div className="hero-popular">
              <span>Popular</span>
              {popular.map((c) => (
                <Link key={c.id} href={`/search?category=${c.slug}`}>
                  {c.name}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        {packs.length > 0 ? (
          <div className="hero-shelf" aria-hidden="true">
            <div className="hero-packs">
              {packs.map((med) => (
                <span key={med.id} className="hero-pack">
                  <img src={med.imageUrl!} alt="" width={200} height={200} decoding="async" referrerPolicy="no-referrer" />
                </span>
              ))}
            </div>
            <span className="hero-ledge" />
          </div>
        ) : null}

        <ul className="hero-facts">
          {facts.map((f) => (
            <li key={f.label}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {f.icon}
              </svg>
              {f.label}
            </li>
          ))}
        </ul>
      </section>

      <div className="home-body">
        <div className="home-layout">
          {categories.length > 0 ? (
            <aside className="home-side">
              <section className="home-section cat-section" aria-label="Categories">
                <div className="section">
                  <h2>Shop by need</h2>
                  <Link href="/search">See all</Link>
                </div>
                <nav className="cat-rail" aria-label="Categories">
                  {categories.map((c) => (
                    <Link key={c.id} href={`/search?category=${c.slug}`} className="cat-tile">
                      <span className="cat-glyph">
                        <CategoryIcon slug={c.slug} />
                      </span>
                      <strong>{c.name}</strong>
                    </Link>
                  ))}
                </nav>
              </section>
            </aside>
          ) : null}

          <div className="home-main">
            <div className="home-promos">
              <HomeDoctor doctors={data.doctors} />
              <Link href="/orders" className="home-orders">
                <span className="home-orders-glyph" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" />
                    <path d="M4 7.5 12 12l8-4.5M12 12v9" />
                  </svg>
                </span>
                <strong>Running low?</strong>
                <span>Reorder last month’s medicines or follow a delivery live.</span>
                <span className="home-orders-cta">Your orders</span>
              </Link>
            </div>

            <section className="home-section meds-section" aria-label="Medicines">
              <div className="section">
                <h2>All medicines</h2>
                <Link href="/search">Search</Link>
              </div>
              <ProductGrid />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
