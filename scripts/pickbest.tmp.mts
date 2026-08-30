import { getDjById, getDjLinks, pickBestLinks } from '../src/lib/queries';
const dj = await getDjById('the-journey');
const links = await getDjLinks('the-journey');
const best = pickBestLinks(dj!, links);
console.log('all:', links.length, 'best:', best.length);
console.log(best.map((l) => `${l.type} ${l.url}`).join('\n'));
