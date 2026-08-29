import Link from 'next/link';

export const metadata = { title: 'About | NZ DJs' };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-black text-stone-100">About</h1>
      <p className="mt-4 leading-relaxed text-stone-300">
        NZ DJs is an open directory of DJs across Aotearoa New Zealand. Bios, mixes, socials, gigs and news,
        pulled from public sources and updated daily by a self-improving scraper loop.
      </p>
      <p className="mt-3 leading-relaxed text-stone-300">
        Public data only. If you are a DJ and would rather not be listed, use the opt-out page.
      </p>

      <h2 className="mt-10 text-xl font-bold text-stone-100">Access the data yourself</h2>
      <p className="mt-2 leading-relaxed text-stone-300">
        The dataset is a standalone product. Everything the site shows is available through the API:
      </p>
      <ul className="mt-4 space-y-2 font-mono text-sm text-stone-400">
        <li><Link href="/docs" className="text-amber-400 hover:underline">/docs</Link> — Swagger UI</li>
        <li><Link href="/api/openapi.json" className="text-amber-400 hover:underline">/api/openapi.json</Link> — OpenAPI 3.1 spec</li>
        <li><Link href="/api/v1/djs" className="text-amber-400 hover:underline">/api/v1/djs</Link> — DJs</li>
        <li><Link href="/api/v1/events" className="text-amber-400 hover:underline">/api/v1/events</Link> — events</li>
        <li><Link href="/api/v1/venues" className="text-amber-400 hover:underline">/api/v1/venues</Link> — venues</li>
        <li><Link href="/api/v1/search" className="text-amber-400 hover:underline">/api/v1/search</Link> — search</li>
        <li><Link href="/api/v1/dataset" className="text-amber-400 hover:underline">/api/v1/dataset</Link> — full dataset (JSON)</li>
        <li><Link href="/api/v1/dataset.csv" className="text-amber-400 hover:underline">/api/v1/dataset.csv</Link> — full dataset (CSV)</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-stone-100">Source</h2>
      <p className="mt-2 leading-relaxed text-stone-300">
        Open source on GitHub. Scrapers, schema and the loop are all in the repo.
      </p>
      <p className="mt-3">
        <a
          href="https://github.com/olitreadwell/nz-djs"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-amber-500/60 px-4 py-1.5 font-mono text-xs text-amber-300 transition-colors hover:bg-amber-500/10"
        >
          github.com/olitreadwell/nz-djs ↗
        </a>
      </p>
    </div>
  );
}
