// Single source of truth for couple identifiers used by build.js.
// Node + browser friendly ESM (no imports).
//
// FROM_GROOM_SIDE flips which side renders first everywhere on the page.
// See build.js for how these fields fan out into HTML/manifest/JS tokens.

export const groom = {
  first: 'Sanchit',
  last: 'Dang',
  full: 'Sanchit Dang',
  initial: 'S',
  surname: 'Dang',
  hashtag: '#SanchitKiRiya',
  role: 'groom',
  parents: 'Ajay & Geeta Dang',
  grandparents: 'Late Shri Subhash Chander & Mrs. Raj Rani Dang',
};

export const bride = {
  first: 'Riya',
  last: 'Verma',
  full: 'Riya Verma',
  initial: 'R',
  surname: 'Verma',
  hashtag: '#RiyaKaSanchit',
  role: 'bride', 
  parents: 'Vishal & Renu Verma',
  grandparents: 'Late Shri Vijay Prakash & Mrs. Sushma Verma',
};

// Absolute site origin, no trailing slash. Used to build absolute OG/Twitter
// share URLs and the canonical link. UPDATE THIS to the real deployed domain
// before sharing invitation links (WhatsApp/Facebook require an absolute URL).
export const siteUrl = 'https://sanchitkiriya.netlify.app';
