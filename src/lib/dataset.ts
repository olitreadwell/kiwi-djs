import { createHash } from 'node:crypto';
import { getVenues, listDjs, getEvents, getDjLinks, getDjMixes, getDjArticles } from '@/lib/queries';
import type { DatasetExport } from '@/lib/api-types';

export async function buildDataset(): Promise<{ dataset: DatasetExport; version: string }> {
  const djs = await listDjs();
  const [events, venues, links, mixes, articles] = await Promise.all([
    getEvents({ upcoming: false, limit: 500 }),
    getVenues(),
    Promise.all(djs.map((dj) => getDjLinks(dj.id))).then((rows) => rows.flat()),
    Promise.all(djs.map((dj) => getDjMixes(dj.id))).then((rows) => rows.flat()),
    Promise.all(djs.map((dj) => getDjArticles(dj.id))).then((rows) => rows.flat()),
  ]);
  const version = createHash('sha1').update(JSON.stringify({ djs, events, venues, links, articles, mixes })).digest('hex').slice(0, 12);
  const dataset: DatasetExport = { exportedAt: new Date().toISOString(), version, djs, events, venues, links, articles, mixes };
  return { dataset, version };
}
