// Common types for Pealim scraper

// Form data structure for Hebrew words (with/without niqqud, transliteration, accent index)
export type HebrewFormData = {
  h: string; // Hebrew without niqqud
  hn: string; // Hebrew with niqqud
  t: string; // Transliteration
  ti: number; // Transliteration index (accented vowel position)
  variations?: Array<HebrewFormData>; // Optional variations of the form
};

// Result types for different parts of speech
export type NounResult = {
  pos: string;
  gender: string;
  pattern: string;
  meaning: string;
  url: string;
  root: string;
  singular: HebrewFormData;
  plural: HebrewFormData;
};

export type AdjectiveResult = {
  pos: string;
  pattern: string;
  meaning: string;
  url: string;
  root: string;
  mSingular: HebrewFormData;
  fSingular: HebrewFormData;
  mPlural: HebrewFormData;
  fPlural: HebrewFormData;
};

export type VerbResult = {
  pos: string;
  binyan: string;
  meaning: string;
  url: string;
  root: string;
  infinitive: HebrewFormData;
  mSingular: HebrewFormData;
  fSingular: HebrewFormData;
  mPlural: HebrewFormData;
  fPlural: HebrewFormData;
  imperativeMSingular?: HebrewFormData;
  imperativeFSingular?: HebrewFormData;
  imperativeMPlural?: HebrewFormData;
  imperativeFPlural?: HebrewFormData;
  imperativeMeaning?: string;
};

// Union type for all result types
export type ParseResult = NounResult | AdjectiveResult | VerbResult;

// Types for HTML generation function parameters
export type NounHTMLRowData = {
  meaning: string;
  gender: string;
  singular: HebrewFormData;
  plural: HebrewFormData;
  root: string;
  pattern: string;
  url: string;
};

export type AdjectiveHTMLRowData = {
  meaning: string;
  mSingular: HebrewFormData;
  fSingular: HebrewFormData;
  mPlural: HebrewFormData;
  fPlural: HebrewFormData;
  root: string;
  pattern: string;
  url: string;
};

export type VerbHTMLRowData = {
  meaning: string;
  infinitive: HebrewFormData;
  mSingular: HebrewFormData;
  fSingular: HebrewFormData;
  mPlural: HebrewFormData;
  fPlural: HebrewFormData;
  root: string;
  binyan: string;
  url: string;
};

export type GenerateHTMLData = {
  pos: string;
  meaning: string;
  url: string;
  root: string;
  pattern?: string;
  binyan?: string;
  gender?: string;
  singular?: HebrewFormData;
  plural?: HebrewFormData;
  infinitive?: HebrewFormData;
  mSingular?: HebrewFormData;
  fSingular?: HebrewFormData;
  mPlural?: HebrewFormData;
  fPlural?: HebrewFormData;
  imperativeMSingular?: HebrewFormData;
  imperativeFSingular?: HebrewFormData;
  imperativeMPlural?: HebrewFormData;
  imperativeFPlural?: HebrewFormData;
  imperativeMeaning?: string;
};

