import type { Pool } from 'pg';
import { ingestFestivalLineup } from './festival';
import type { Scraper, ScrapeResult } from './types';

/**
 * Carlucci Carnival @ Carlucci Land, Saturday 26 September 2026.
 *
 * The festival publishes its stage timetables as poster cards, so there is no
 * markup to scrape: the slots below are curated data, transcribed from the
 * four published cards on 2026-09-23. Re-check the cards before each edition
 * and re-run this source after a republish.
 */
const EVENT = {
  // The Resident Advisor listing already created this event row; reusing the
  // id keeps one event with two sources instead of a duplicate (#16).
  id: 'ra-2468041',
  name: 'Carlucci Carnival',
  venue: 'Carlucci Land',
  url: 'https://ra.co/events/2468041',
};

// 26 September 2026 is still NZST — daylight saving starts the next day.
const NZST_OFFSET = '+12:00';

export interface PosterSlot {
  stage: string;
  /** Local start, HH:MM. */
  start: string;
  /** Local end, HH:MM. */
  end: string;
  /** The act as billed on the card: b2b and support sets stay one line. */
  act: string;
}

export const TIMETABLE: PosterSlot[] = [
  // Steel Circus
  { stage: 'Steel Circus', start: '16:00', end: '17:00', act: 'Bad Tab' },
  { stage: 'Steel Circus', start: '17:10', end: '18:10', act: 'Mokomokai' },
  { stage: 'Steel Circus', start: '18:20', end: '19:20', act: 'Caru & Brandn Shiraz' },
  { stage: 'Steel Circus', start: '19:30', end: '20:20', act: 'Doc Joc w/ Young Gho$t' },
  { stage: 'Steel Circus', start: '20:30', end: '21:30', act: 'Paige Julia' },
  { stage: 'Steel Circus', start: '21:30', end: '23:00', act: 'Alix Perez' },

  // Dragon's Gate
  { stage: "Dragon's Gate", start: '15:00', end: '16:00', act: 'Cee' },
  { stage: "Dragon's Gate", start: '16:00', end: '17:30', act: 'Lamchopz b2b Bari' },
  { stage: "Dragon's Gate", start: '17:30', end: '18:30', act: 'Monday Sucks b2b Cob' },
  { stage: "Dragon's Gate", start: '18:30', end: '20:00', act: 'Cameron Morris' },
  { stage: "Dragon's Gate", start: '20:00', end: '21:30', act: 'Herman Saiz' },
  { stage: "Dragon's Gate", start: '21:30', end: '23:00', act: 'Flatmate' },

  // Forest Grove
  { stage: 'Forest Grove', start: '15:00', end: '16:00', act: "Jamie Doesn't Like Salad" },
  { stage: 'Forest Grove', start: '16:00', end: '17:00', act: 'Gordo & Teej' },
  { stage: 'Forest Grove', start: '17:00', end: '18:00', act: 'Benny Balance b2b Gili' },
  { stage: 'Forest Grove', start: '18:00', end: '19:00', act: 'Clova' },
  { stage: 'Forest Grove', start: '19:00', end: '20:00', act: 'Pearly' },
  { stage: 'Forest Grove', start: '20:00', end: '21:00', act: 'Azifm' },
  { stage: 'Forest Grove', start: '21:00', end: '22:00', act: 'Gos b2b FE b2b Zillah' },
  { stage: 'Forest Grove', start: '22:00', end: '23:00', act: 'Order Up w/ Timmy P' },

  // The Laboratory
  { stage: 'The Laboratory', start: '15:00', end: '16:00', act: 'Dani Kotrotsos' },
  { stage: 'The Laboratory', start: '16:00', end: '18:00', act: 'Ko Rhizo' },
  { stage: 'The Laboratory', start: '18:00', end: '20:00', act: 'Suede' },
  { stage: 'The Laboratory', start: '20:00', end: '22:00', act: 'Manakin b2b J.A.P.R' },
];

export function nzstSetTime(localTime: string): Date {
  return new Date(`2026-09-26T${localTime}:00${NZST_OFFSET}`);
}

export const carlucciCarnivalScraper: Scraper = {
  source: 'carlucci-carnival',
  async run(pool: Pool): Promise<ScrapeResult> {
    return ingestFestivalLineup(pool, this.source, {
      eventIdPrefix: EVENT.id,
      eventName: EVENT.name,
      venue: EVENT.venue,
      startsAt: nzstSetTime('15:00'),
      url: EVENT.url,
      // Every act on all four stages is a DJ or a DJ duo.
      includeAll: true,
      splitB2b: true,
      djSource: this.source,
      artists: TIMETABLE.map((slot) => ({
        name: slot.act,
        stage: slot.stage,
        startsAt: nzstSetTime(slot.start),
        endsAt: nzstSetTime(slot.end),
        actLabel: slot.act,
      })),
    });
  },
};
