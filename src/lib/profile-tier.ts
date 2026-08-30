// Profile build-out tiers (#297): rank DJs by how much of the full dossier
// we can already render, so the site surfaces the most complete profiles
// first and the enrichment loop knows which gaps to close next.
import type { DjRow } from './queries';
import { hasSpecificGenre } from './genres';

export type ProfileTier = 'tier1' | 'tier2' | 'tier3';

const GENERIC_ONLY = new Set([
  'Dance', 'Electronic', 'Alternative', 'Pop', 'Rock', 'Country', 'Eclectic', 'World',
  'Experimental', 'Indie', 'Metal', 'Punk', 'Folk', 'Classical', 'Lounge', 'Chillout',
]);

export function profileTier(dj: DjRow): ProfileTier {
  const hasMixes = (dj.mix_count ?? 0) > 0;
  const hasGigs = dj.upcoming_events > 0 || (dj.past_gig_count ?? 0) > 0;
  const hasPhoto = Boolean(dj.image_url);
  const hasNarrative = Boolean(dj.bio || dj.summary);
  const hasSpecific = dj.genres.some((genre) => hasSpecificGenre([genre]));
  if (dj.data_completeness >= 65 && hasMixes && hasPhoto && hasNarrative && (hasSpecific || dj.genres.length >= 2)) return 'tier1';
  if (dj.data_completeness >= 35 && (hasMixes || hasGigs) && hasPhoto) return 'tier2';
  return 'tier3';
}

export const TIER_LABELS: Record<ProfileTier, string> = {
  tier1: 'full profile',
  tier2: 'profile in progress',
  tier3: 'starter',
};

// What's still missing for this DJ, human-readable, most valuable first.
// The loop files data-gap issues for the same signals; this shows a visitor
// what a completed page would add and links to the suggest-an-update form.
export function profileGaps(dj: DjRow): string[] {
  const gaps: string[] = [];
  if (!dj.image_url) gaps.push('photo');
  if (!dj.bio && !dj.summary) gaps.push('short bio');
  if (dj.mix_count === 0) gaps.push('mixes');
  if (!dj.genres.some((genre) => hasSpecificGenre([genre]))) {
    gaps.push(dj.genres.length === 0 ? 'genres' : 'specific subgenres');
  }
  if (dj.upcoming_events === 0 && (dj.past_gig_count ?? 0) === 0) gaps.push('gigs');
  return gaps.slice(0, 5);
}

export function isGenericGenreOnly(genres: string[]): boolean {
  return genres.length > 0 && genres.every((genre) => GENERIC_ONLY.has(genre));
}
