// YouTube mix discovery: search "<DJ name> mix" for existing DJs and add
// matching videos to dj_mixes (platform youtube). When the video's channel
// name matches the DJ, the channel is also added as a YouTube link. Runs
// only when YOUTUBE_API_KEY is set; otherwise errors cleanly so the loop
// surfaces the credential gap.
import type { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { sleep } from './http';
import { upsertDjLink } from './links';
import { normalizeArtistName } from './discover';
import type { ScrapeResult } from './types';

const API = 'https://www.googleapis.com/youtube/v3';

const MIX_KEYWORDS = /\b(mix|set|live|dj set|studio mix|guest mix|boiler room|radio show|podcast|mashup|remix)\b/i;

interface YoutubeItem {
  id?: { videoId?: string; channelId?: string };
  snippet?: { title?: string; channelTitle?: string; channelId?: string; publishedAt?: string };
}

export async function discoverYoutubeMixes(pool: Pool): Promise<ScrapeResult> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return { status: 'error', items_found: 0, items_new: 0, error: 'no YouTube credentials (set YOUTUBE_API_KEY)' };
  }
  const djs = await pool.query(
    `SELECT id, name FROM djs WHERE active = TRUE AND opt_out = FALSE ORDER BY popularity DESC LIMIT 10`,
  );
  let found = 0;
  let newCount = 0;
  for (const row of djs.rows) {
    const djId = row.id as string;
    const djName = row.name as string;
    try {
      const query = new URLSearchParams({
        part: 'snippet',
        type: 'video',
        q: `"${djName}" mix`,
        maxResults: '5',
        key,
      });
      const res = await fetch(`${API}/search?${query}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        console.log(`  discover-youtube: ${djName} → HTTP ${res.status}`);
        await sleep(500);
        continue;
      }
      const body = (await res.json()) as { items?: YoutubeItem[] };
      for (const item of body.items ?? []) {
        const videoId = item.id?.videoId;
        const title = item.snippet?.title ?? '';
        if (!videoId || !title) continue;
        if (!title.toLowerCase().includes(djName.toLowerCase()) || !MIX_KEYWORDS.test(title)) continue;
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const id = `${djId}-youtube-${createHash('sha1').update(url).digest('hex').slice(0, 12)}`;
        const inserted = await pool.query(
          `INSERT INTO dj_mixes (id, dj_id, platform, title, url, kind)
           VALUES ($1, $2, 'youtube', $3, $4, 'mix')
           ON CONFLICT (id) DO NOTHING RETURNING id`,
          [id, djId, title, url],
        );
        if (inserted.rows.length > 0) newCount += 1;
        found += 1;

      }
      // One videos.list call per DJ: the search response doesn't carry the
      // channel id, and a matching channel name is a strong YouTube link.
      const firstVideo = body.items?.find((item) => item.id?.videoId);
      if (firstVideo?.id?.videoId) {
        const videoQuery = new URLSearchParams({ part: 'snippet', id: firstVideo.id.videoId, key });
        const videoRes = await fetch(`${API}/videos?${videoQuery}`, { signal: AbortSignal.timeout(15000) });
        if (videoRes.ok) {
          const videoBody = (await videoRes.json()) as { items?: YoutubeItem[] };
          const channelId = videoBody.items?.[0]?.snippet?.channelId;
          const channelTitle = videoBody.items?.[0]?.snippet?.channelTitle ?? '';
          if (channelId && channelTitle && normalizeArtistName(channelTitle) === normalizeArtistName(djName)) {
            await upsertDjLink(pool, djId, 'youtube', `https://www.youtube.com/channel/${channelId}`, `YouTube: ${channelTitle}`);
          }
        }
      }
    } catch (err) {
      console.log(`  discover-youtube: ${djName} → error (${err instanceof Error ? err.message : String(err)})`);
    }
    await sleep(500);
  }
  return {
    status: found > 0 ? 'ok' : 'partial',
    items_found: found,
    items_new: newCount,
    error: found === 0 ? 'No YouTube mixes found' : undefined,
  };
}
