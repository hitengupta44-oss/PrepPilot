// Site-wide settings used by the landing and legal pages.
// Set NEXT_PUBLIC_CONTACT_EMAIL in Vercel to show a contact address on the legal pages.

export const SITE = {
  name: 'PrepPilot',
  tagline: 'AI mock interviews that find and fix your weak spots.',
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || '',
  jurisdiction: process.env.NEXT_PUBLIC_LEGAL_JURISDICTION || 'India',
  minimumAge: 16,
  legalUpdated: '25 November 2026',
};

/** localStorage key holding when the user ticked "I agree" on the login page (saved to their profile later). */
export const TERMS_KEY = 'pp_terms_accepted_at';
