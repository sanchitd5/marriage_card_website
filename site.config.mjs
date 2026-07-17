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

// Absolute site origins, no trailing slash. Used to build absolute OG/Twitter
// share URLs and the canonical link (WhatsApp/Facebook require an absolute URL).
// Each side deploys to its own domain; build.js picks by FROM_GROOM_SIDE.
export const siteUrls = {
  groom: 'https://sanchitkiriya.netlify.app', // FROM_GROOM_SIDE=true  (default)
  bride: 'https://riyakasanchit.netlify.app', // FROM_GROOM_SIDE=false
};

// Back-compat single export (groom origin).
export const siteUrl = siteUrls.groom;
