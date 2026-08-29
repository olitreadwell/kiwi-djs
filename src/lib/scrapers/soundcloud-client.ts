// SoundCloud API v2 needs a public web client id. Prefer SOUNDCLOUD_CLIENT_ID
// env, else probe known-good public ids, else scrape one from the web app JS.
const KNOWN_IDS = ['Pb72ranhoyt6gw7hM7TkzUItXlMWSNSo', 'iZIs9mchVcX5lhVRyQGGAYlNtmpld4pT'];

let cached: string | null | undefined;

async function probe(clientId: string): Promise<boolean> {
  try {
    const url = `https://api-v2.soundcloud.com/search/users?q=wellington&client_id=${clientId}&limit=1`;
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function scrapeClientId(): Promise<string | null> {
  try {
    const res = await fetch('https://soundcloud.com', {
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36' },
      signal: AbortSignal.timeout(15000),
    });
    const html = await res.text();
    const assets = [...html.matchAll(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js/g)].map((m) => m[0]);
    for (const asset of assets.slice(0, 10)) {
      const jsRes = await fetch(asset, {
        headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36' },
        signal: AbortSignal.timeout(15000),
      });
      const js = await jsRes.text();
      const match = js.match(/client_id["']?\s*[:=]\s*["']([A-Za-z0-9]{20,40})["']/);
      if (match && (await probe(match[1]))) return match[1];
    }
  } catch {
    // fall through
  }
  return null;
}

export async function getSoundcloudClientId(): Promise<string | null> {
  if (cached !== undefined) return cached;
  const fromEnv = process.env.SOUNDCLOUD_CLIENT_ID;
  if (fromEnv && (await probe(fromEnv))) {
    cached = fromEnv;
    return cached;
  }
  for (const id of KNOWN_IDS) {
    if (await probe(id)) {
      cached = id;
      return cached;
    }
  }
  cached = await scrapeClientId();
  return cached;
}
