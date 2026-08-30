import Link from 'next/link';

export const metadata = { title: 'About | Kiwi DJs' };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-black text-foreground">About</h1>
      <p className="mt-4 leading-relaxed text-muted">
        Kiwi DJs is an open directory of DJs across Aotearoa New Zealand. Bios, mixes, socials, gigs and news,
        pulled from public sources and updated daily by a self-improving scraper loop.
      </p>
      <p className="mt-3 leading-relaxed text-muted">
        Public data only. If you are a DJ and would rather not be listed, use the opt-out page.
      </p>

      <h2 className="mt-10 text-xl font-bold text-foreground">Access the data yourself</h2>
      <p className="mt-2 leading-relaxed text-muted">
        The dataset is a standalone product. Everything the site shows is available through the API:
      </p>
      <ul className="mt-4 space-y-2 font-mono text-sm text-muted">
        <li><Link href="/docs" className="text-accent hover:underline">/docs</Link> — Swagger UI</li>
        <li><Link href="/api/openapi.json" className="text-accent hover:underline">/api/openapi.json</Link> — OpenAPI 3.1 spec</li>
        <li><Link href="/api/v1/djs" className="text-accent hover:underline">/api/v1/djs</Link> — DJs</li>
        <li><Link href="/api/v1/events" className="text-accent hover:underline">/api/v1/events</Link> — events</li>
        <li><Link href="/api/v1/venues" className="text-accent hover:underline">/api/v1/venues</Link> — venues</li>
        <li><Link href="/api/v1/search" className="text-accent hover:underline">/api/v1/search</Link> — search</li>
        <li><Link href="/api/v1/dataset" className="text-accent hover:underline">/api/v1/dataset</Link> — full dataset (JSON)</li>
        <li><Link href="/api/v1/dataset.csv" className="text-accent hover:underline">/api/v1/dataset.csv</Link> — full dataset (CSV)</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-foreground">Source</h2>
      <p className="mt-2 leading-relaxed text-muted">
        Open source on GitHub. Scrapers, schema and the loop are all in the repo.
      </p>
      <p className="mt-3">
        <a
          href="https://github.com/olitreadwell/nz-djs"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-accent/60 px-4 py-1.5 font-mono text-xs text-accent transition-colors hover:bg-accent/10"
        >
          github.com/olitreadwell/nz-djs ↗
        </a>
      </p>
    </div>
  );
}
