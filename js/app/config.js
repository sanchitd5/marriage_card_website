import { NAMES } from './couple.mjs';

export { NAMES };

export const WEDDING_TS = Date.UTC(2026, 11, 12, 13, 30, 0); // 12 Dec 2026, 19:00 IST (edit here)

// couple's approved pool (assets/audio/*.mp3); one is drawn at random each visit
export const SONGS = ['theme-1', 'theme-2', 'theme-3', 'theme-4', 'theme-5'];

export const MAPS = {
  radisson: 'https://maps.app.goo.gl/fQhBFytYAZKu4qBB7',
  devansh: 'https://maps.app.goo.gl/RdueUZ2XfNiAnbD18',
};

export const EVENTS = {
  haldi: {
    title: `Haldi — ${NAMES.pairTitle}`,
    start: '20261211T053000Z', end: '20261211T083000Z',
    location: 'Radisson Hotel Chandigarh Zirakpur',
    description: 'The first affair of the celebrations. Dress code: shades of yellow. Directions: ' + MAPS.radisson,
  },
  cocktail: {
    title: `Cocktail & Engagement — ${NAMES.pairTitle}`,
    start: '20261211T143000Z', end: '20261211T183000Z',
    location: 'Radisson Hotel Chandigarh Zirakpur',
    description: 'An evening of toasts and rings. Dress code: dazzling as you dare. Directions: ' + MAPS.radisson,
  },
  wedding: {
    title: `Wedding of ${NAMES.pairTitle}`,
    start: '20261212T133000Z', end: '20261212T183000Z',
    location: "De'vansh Resort, Ambala Cantt",
    description: 'The grand affair: baraat, pheras and forever. Directions: ' + MAPS.devansh,
  },
};

export const GALLERY = [
  { src: 'photo-01', alt: 'A quiet forehead kiss before the floral arch', cls: 'gframe--tall' },
  { src: 'photo-02', alt: 'A twirl beneath the spiral staircase' },
  { src: 'photo-04', alt: 'Sanchit on one knee, asking the question' },
  { src: 'photo-05', alt: 'Laughing together at the engagement' },
  { src: 'photo-06', alt: 'A playful moment with the groom’s stole' },
  { src: 'photo-08', alt: 'Poolside, in ivory and gold', cls: 'gframe--tall' },
  { src: 'photo-10', alt: 'A rooftop embrace at golden hour' },
  { src: 'photo-12', alt: 'Nose to nose, mid-laugh' },
  { src: 'photo-14', alt: 'Dancing at the engagement celebration', cls: 'gframe--wide' },
  { src: 'photo-16', alt: 'Beneath the grand ceiling, holding close' },
  { src: 'photo-17', alt: 'Roses in hand, on the morning walk' },
];
