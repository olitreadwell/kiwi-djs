import * as cheerio from 'cheerio';
import type { Pool } from 'pg';
import { fetchHtml, sleep } from './http';
import { upsertEvent, linkDjToEvent } from './upsert';
import type { Scraper, ScrapeResult } from './types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseUtrDate(dayText: string, timeText: string): Date | null {
  const match = dayText.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = MONTHS.findIndex((m) => m.toLowerCase().startsWith(match[2].toLowerCase())) + 1;
  if (month === 0) return null;
  let year = new Date().getFullYear();
  let date = new Date(Date.UTC(year, month - 1, day));
  if (date.getTime() < Date.now() - 86400000) {
    year += 1;
    date = new Date(Date.UTC(year, month - 1, day));
  }
  const timeMatch = timeText.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    if (timeMatch[3].toLowerCase() === 'pm' && hours < 12) hours += 12;
    if (timeMatch[3].toLowerCase() === 'am' && hours === 12) hours = 0;
    date = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  }
  return date;
}

export function parseUtrHtml(html: string, source: string, venue?: string): Array<{ id: string; name: string; startsAt: Date | null; url?: string }> {
  const $ = cheerio.load(html);
  const events: Array<{ id: string; name: string; startsAt: Date | null; url?: string }> = [];
  $('.vevent').each((_, el) => {
    const link = $(el).find('a.summary, a.gig-title, h3.gig-title a').first();
    const href = link.attr('href') ?? '';
    const idMatch = href.match(/\/gig\/(\d+)\//);
    if (!idMatch) return;
    const name = link.text().trim();
    if (!name) return;
    const dayText = $(el).find('.info-header h4').first().text().trim();
    const timeText = $(el).find('.info-header .lite, .info-header span').first().text().trim();
    events.push({
      id: `${source}-${idMatch[1]}`,
      name,
      startsAt: parseUtrDate(dayText, timeText),
      url: href.startsWith('http') ? href : `https://www.undertheradar.co.nz${href}`,
    });
  });
  if (events.length === 0) {
    // Fallback: standalone gig rows (region listing pages)
    $('.gigguide-row').each((_, el) => {
      const link = $(el).find('a').first();
      const href = link.attr('href') ?? '';
      const idMatch = href.match(/\/gig\/(\d+)\//);
      if (!idMatch) return;
      const name = link.text().trim();
      if (!name) return;
      const dayText = $(el).find('.info-header h4').first().text().trim();
      const timeText = $(el).find('.info-header .lite, .info-header span').first().text().trim();
      events.push({
        id: `${source}-${idMatch[1]}`,
        name,
        startsAt: parseUtrDate(dayText, timeText),
        url: href.startsWith('http') ? href : `https://www.undertheradar.co.nz${href}`,
      });
    });
  }
  if (events.length === 0) {
    // Region listing pages use compact .vitem rows: "Sat 29th Aug: Event Name"
    $('.vitem a[href*="/gig/"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      const idMatch = href.match(/\/gig\/(\d+)\//);
      if (!idMatch) return;
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      const colon = text.indexOf(':');
      const datePart = colon > -1 ? text.slice(0, colon) : '';
      const name = colon > -1 ? text.slice(colon + 1).trim() : text;
      if (!name) return;
      events.push({
        id: `${source}-${idMatch[1]}`,
        name,
        startsAt: parseUtrDate(datePart, ''),
        url: href.startsWith('http') ? href : `https://www.undertheradar.co.nz${href}`,
      });
    });
  }
  void venue;
  return events;
}

export const undertheradarScraper: Scraper = {
  source: 'undertheradar',
  async run(pool: Pool): Promise<ScrapeResult> {
    const url = 'https://www.undertheradar.co.nz/gig/venue/region/Wellington';
    const html = await fetchHtml(url);
    await sleep(500);
    const events = parseUtrHtml(html, this.source);
    let newCount = 0;
    for (const event of events) {
      const isNew = await upsertEvent(pool, { ...event, source: this.source });
      if (isNew) newCount += 1;
      await linkDjToEvent(pool, event.id, event.name);
    }
    return { status: events.length > 0 ? 'ok' : 'error', items_found: events.length, items_new: newCount, error: events.length === 0 ? 'No events parsed' : undefined };
  },
};
