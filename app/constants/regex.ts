export const NIQQUD_REGEX = /[\u0591-\u05C7]/g;

// Pattern extraction regexes
export const NOUN_REGEX = /Noun\s*–\s*([^,]+?)\s+pattern/i;
export const ADJECTIVE_REGEX = /Adjective\s*–\s*([^,]+?)\s+pattern/i;
export const VERB_REGEX = /Verb\s*–/i;
export const BINYAN_REGEX = /Verb\s*–\s*(.+)/i;

// Root extraction regex
export const ROOT_REGEX = /Root:\s*(.+)/;

// Root formatting regex (replaces hyphens with en dashes)
export const HYPHEN_TO_ENDASH_REGEX = /\s*-\s*/g;

// URL parsing regex
export const URL_LAST_PATH_SEGMENT_REGEX = /\/([^\/]+)\/?$/;

// Transliteration replacement regexes
export const CH_REGEX = /ch/g;
export const TZ_REGEX = /tz/g;

