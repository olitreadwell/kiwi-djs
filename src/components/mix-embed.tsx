import type { MixRow } from '@/lib/queries';

function embedUrl(mix: MixRow): string | null {
  if (mix.platform === 'soundcloud') {
    return `https://w.soundcloud.com/player/?url=${encodeURIComponent(mix.url)}&color=%23f59e0b&auto_play=false&hide_related=true&show_comments=false`;
  }
  if (mix.platform === 'mixcloud') {
    return `https://www.mixcloud.com/widget/iframe/?hide_cover=1&feed=${encodeURIComponent(mix.url)}`;
  }
  return null;
}

export function MixEmbed({ mixes }: { mixes: MixRow[] }) {
  const embeds = mixes.slice(0, 3).map((mix) => ({ mix, url: embedUrl(mix) })).filter((entry) => entry.url);
  if (embeds.length === 0) return null;
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {embeds.map(({ mix, url }) => (
        <iframe
          key={mix.id}
          src={url!}
          title={mix.title}
          height="120"
          className="w-full rounded-lg border border-stone-800"
          allow="autoplay"
          loading="lazy"
        />
      ))}
    </div>
  );
}
