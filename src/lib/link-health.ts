import { checkRobots, UA } from './scrapers/http';

/**
 * Health of a link we publish. `dead` means the resource is gone (404/410)
 * and the row is hidden from every public read. `blocked` means the probe was
 * refused (401/403): a private track, or a host that turns bots away
 * (rateyourmusic, allmusic, ra.co). Those rows stay visible — the link works
 * in a real browser — and are only reported.
 */
export type LinkStatus = 'live' | 'dead' | 'blocked' | 'unknown';

/** How long to wait between probes on one origin. */
export const LINK_CHECK_DELAY_MS = 500;

function statusFromHttp(code: number): LinkStatus {
  if (code >= 200 && code < 400) return 'live';
  if (code === 404 || code === 410) return 'dead';
  if (code === 401 || code === 403) return 'blocked';
  return 'unknown';
}

/**
 * SoundCloud profile, track and playlist URLs resolve through the public
 * oEmbed endpoint: 200 when the resource exists, 404 once it is deleted,
 * 403 when the owner made it private. SoundCloud serves 503 to plain page
 * fetches from a server, so oEmbed is the only reliable probe.
 */
export async function checkSoundCloudUrl(url: string): Promise<LinkStatus> {
  try {
    const target = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    const res = await fetch(target, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    return statusFromHttp(res.status);
  } catch {
    return 'unknown';
  }
}

/**
 * Probe one URL with the checker that fits its host. SoundCloud needs oEmbed
 * (its pages answer 503 to server fetches); everything else is a plain GET,
 * because many CDNs answer 405/501 to HEAD and that is not a dead link.
 */
export async function checkLinkHealth(url: string): Promise<LinkStatus> {
  if (/^https?:\/\/(?:www\.)?soundcloud\.com\//i.test(url)) {
    if (!(await checkRobots(url))) return 'unknown';
    return checkSoundCloudUrl(url);
  }
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    // Mixcloud and friends rate-limit bursts with 429 — that says nothing
    // about whether the link is gone.
    if (res.status === 429) return 'unknown';
    return statusFromHttp(res.status);
  } catch {
    return 'unknown';
  }
}

/**
 * Probe a list of URLs serially with a polite delay, returning the status
 * per URL. Serial because each host rate-limits bursts.
 */
export async function sweepLinkHealth(
  urls: string[],
  options: { delayMs?: number; onResult?: (url: string, status: LinkStatus) => void } = {},
): Promise<Map<string, LinkStatus>> {
  const delayMs = options.delayMs ?? LINK_CHECK_DELAY_MS;
  const results = new Map<string, LinkStatus>();
  for (const url of urls) {
    const status = await checkLinkHealth(url);
    results.set(url, status);
    options.onResult?.(url, status);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return results;
}
