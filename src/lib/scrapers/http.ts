import robotsParser from 'robots-parser';

export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 WellingtonDJsBot/1.0';

const robotsCache = new Map<string, ReturnType<typeof robotsParser>>();

export async function checkRobots(url: string): Promise<boolean> {
  const origin = new URL(url).origin;
  if (robotsCache.has(origin)) return robotsCache.get(origin)!.isAllowed(url, UA) ?? true;
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      robotsCache.set(origin, robotsParser(`${origin}/robots.txt`, ''));
      return true;
    }
    const body = await res.text();
    const robots = robotsParser(`${origin}/robots.txt`, body);
    robotsCache.set(origin, robots);
    return robots.isAllowed(url, UA) ?? true;
  } catch {
    return true;
  }
}

export async function fetchHtml(url: string): Promise<string> {
  const allowed = await checkRobots(url);
  if (!allowed) throw new Error(`Blocked by robots.txt: ${url}`);
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
