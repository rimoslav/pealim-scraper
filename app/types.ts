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

  past1stMSingular?: HebrewFormData;
  past1stMPlural?: HebrewFormData;
  past2ndMSingular?: HebrewFormData;
  past2ndFSingular?: HebrewFormData;
  past2ndMPlural?: HebrewFormData;
  past2ndFPlural?: HebrewFormData;
  past3rdMSingular?: HebrewFormData;
  past3rdFSingular?: HebrewFormData;
  past3rdMPlural?: HebrewFormData;

  future1stMSingular?: HebrewFormData;
  future1stMPlural?: HebrewFormData;
  future2ndMSingular?: HebrewFormData;
  future2ndFSingular?: HebrewFormData;
  future2ndMPlural?: HebrewFormData;
  future2ndFPlural?: HebrewFormData;
  future3rdMSingular?: HebrewFormData;
  future3rdFSingular?: HebrewFormData;
  future3rdMPlural?: HebrewFormData;
  future3rdFPlural?: HebrewFormData;
  futureMeaning?: string;
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

export type ImperativeHTMLRowData = {
  meaning: string;
  mSingular: HebrewFormData;
  fSingular: HebrewFormData;
  mPlural: HebrewFormData;
  fPlural: HebrewFormData;
  root: string;
  binyan: string;
  url: string;
};

export type PastTenseHTMLRowData = {
  meaning: string;
  past1stMSingular: HebrewFormData;
  past1stMPlural: HebrewFormData;
  past2ndMSingular: HebrewFormData;
  past2ndFSingular: HebrewFormData;
  past2ndMPlural: HebrewFormData;
  past2ndFPlural: HebrewFormData;
  past3rdMSingular: HebrewFormData;
  past3rdFSingular: HebrewFormData;
  past3rdMPlural: HebrewFormData;
  root: string;
  binyan: string;
  url: string;
};

export type FutureTenseHTMLRowData = {
  meaning: string;
  future1stMSingular: HebrewFormData;
  future1stMPlural: HebrewFormData;
  future2ndMSingular: HebrewFormData;
  future2ndFSingular: HebrewFormData;
  future2ndMPlural: HebrewFormData;
  future2ndFPlural: HebrewFormData;
  future3rdMSingular: HebrewFormData;
  future3rdFSingular: HebrewFormData;
  future3rdMPlural: HebrewFormData;
  future3rdFPlural: HebrewFormData;
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

  past1stMSingular?: HebrewFormData;
  past1stMPlural?: HebrewFormData;
  past2ndMSingular?: HebrewFormData;
  past2ndFSingular?: HebrewFormData;
  past2ndMPlural?: HebrewFormData;
  past2ndFPlural?: HebrewFormData;
  past3rdMSingular?: HebrewFormData;
  past3rdFSingular?: HebrewFormData;
  past3rdMPlural?: HebrewFormData;

  future1stMSingular?: HebrewFormData;
  future1stMPlural?: HebrewFormData;
  future2ndMSingular?: HebrewFormData;
  future2ndFSingular?: HebrewFormData;
  future2ndMPlural?: HebrewFormData;
  future2ndFPlural?: HebrewFormData;
  future3rdMSingular?: HebrewFormData;
  future3rdFSingular?: HebrewFormData;
  future3rdMPlural?: HebrewFormData;
  future3rdFPlural?: HebrewFormData;
  futureMeaning?: string;
};

