import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { extractFormData, extractVariations, extractVerbVariations, applyTransliterationReplacement } from "@/app/lib/parse-html-to-json";
import { generateHTML, saveHTMLFile } from "@/app/lib/parse-json-to-html";
import { NOUN_REGEX, ADJECTIVE_REGEX, VERB_REGEX, BINYAN_REGEX, ROOT_REGEX, HYPHEN_TO_ENDASH_REGEX } from "@/app/constants/regex";


export async function POST(request: NextRequest) {
  try {
    const { url, partOfSpeech, useChToKh = true, useTzToC = true } = await request.json();

    // Fetch the page
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Parse common data using selectors
    // Pattern is in the <p> tag immediately after h2.page-header
    let gender: "male" | "female" | null = null;
    let pattern = "";
    let binyan = "";
    let detectedPartOfSpeech: "noun" | "adjective" | "verb" | null = null;
    
    // Use selector to find the p tag right after h2.page-header
    const posPTag = $("h2.page-header + p").first();
    const posText = posPTag.text();
    const posTextLower = posText.toLowerCase();
    
    // Look for "masculine" or "feminine" in the text (for nouns)
    if (posTextLower.includes("masculine")) {
      gender = "male";
    } else if (posTextLower.includes("feminine")) {
      gender = "female";
    }
    
    // Extract pattern if it exists (for both nouns and adjectives)
    // Also use this to auto-detect part of speech if not provided
    let patternMatch = posText.match(NOUN_REGEX);
    if (patternMatch) {
      detectedPartOfSpeech = "noun";
    } else {
      patternMatch = posText.match(ADJECTIVE_REGEX);
      if (patternMatch) {
        detectedPartOfSpeech = "adjective";
      } else if (posText.match(VERB_REGEX)) {
        detectedPartOfSpeech = "verb";
        // Extract binyan from "Verb – HITPA'EL"
        const binyanMatch = posText.match(BINYAN_REGEX);
        if (binyanMatch && binyanMatch[1]) {
          binyan = binyanMatch[1].trim();
        }
      }
    }
    
    if (patternMatch && patternMatch[1]) {
      pattern = patternMatch[1].trim();
    }
    
    // Determine the part of speech to use
    const partOfSpeechToUse = partOfSpeech || detectedPartOfSpeech;
    
    // If part of speech couldn't be determined, return an error
    if (!partOfSpeechToUse || (partOfSpeechToUse !== "noun" && partOfSpeechToUse !== "adjective" && partOfSpeechToUse !== "verb")) {
      return NextResponse.json(
        { error: "Could not determine part of speech. The page does not appear to be a noun, adjective, or verb." },
        { status: 400 }
      );
    }

    // Extract root from the p tag after the pattern p tag
    let root = "";
    const rootPTag = posPTag.next("p").first();
    const rootText = rootPTag.text().trim();
    if (rootText.startsWith("Root:")) {
      // Extract root letters (e.g., "Root: פ - ת - ר")
      const rootMatch = rootText.match(ROOT_REGEX);
      if (rootMatch && rootMatch[1]) {
        // Replace hyphens with en dashes
        root = rootMatch[1].trim().replace(HYPHEN_TO_ENDASH_REGEX, " – ");
      }
    }

    // Extract meaning from div.lead after h3.page-header containing "Meaning"
    let meaning = "";
    $("h3.page-header").each((_, el) => {
      const headingText = $(el).text().trim();
      if (headingText === "Meaning") {
        const meaningDiv = $(el).next("div.lead").first();
        meaning = meaningDiv.text().trim();
        return false; // break
      }
    });

    // Find the table with conjugation-table class
    const table = $("table.conjugation-table").first();
    
    type FormData = { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
    type NounResult = {
      pos: string;
      gender: string;
      pattern: string;
      meaning: string;
      url: string;
      root: string;
      singular: FormData;
      plural: FormData;
    };
    type AdjectiveResult = {
      pos: string;
      pattern: string;
      meaning: string;
      url: string;
      root: string;
      mSingular: FormData;
      fSingular: FormData;
      mPlural: FormData;
      fPlural: FormData;
    };
    type VerbResult = {
      pos: string;
      binyan: string;
      meaning: string;
      url: string;
      root: string;
      infinitive: FormData;
      mSingular: FormData;
      fSingular: FormData;
      mPlural: FormData;
      fPlural: FormData;
    };
    
    let result: NounResult | AdjectiveResult | VerbResult;
    let htmlContent: string | null = null;

    if (partOfSpeechToUse === "noun") {
      // Parse noun data
      let singular: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> } = { h: "", hn: "", t: "", ti: 0 };
      let plural: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> } = { h: "", hn: "", t: "", ti: 0 };
      
      // Find the row with "Absolute state" in the th
      table.find("tr").each((_, row) => {
        const th = $(row).find("th").first();
        if (th.text().trim() === "Absolute state") {
          // Get the first td (singular column)
          const singularTd = $(row).find("td.conj-td").first();
          const singularDiv = singularTd.find('div[id="s"]').first();
          const singularData = extractFormData(singularDiv, $);
          singular = { ...singularData };
          
          // Extract singular variations
          const singularVariations = extractVariations(singularTd, $);
          if (singularVariations.length > 0) {
            singular.variations = singularVariations;
          }
          
          // Get the second td (plural column)
          const pluralTd = $(row).find("td.conj-td").eq(1);
          const pluralDiv = pluralTd.find('div[id="p"]').first();
          const pluralData = extractFormData(pluralDiv, $);
          plural = { ...pluralData };
          
          // Extract plural variations
          const pluralVariations = extractVariations(pluralTd, $);
          if (pluralVariations.length > 0) {
            plural.variations = pluralVariations;
          }
          
          return false; // break
        }
      });

      // Apply transliteration replacement if enabled
      const processedSingular = applyTransliterationReplacement(singular, useChToKh, useTzToC);
      const processedPlural = applyTransliterationReplacement(plural, useChToKh, useTzToC);

      result = {
        pos: "noun",
        gender: gender || "unknown",
        pattern: pattern || "",
        meaning: meaning || "",
        url: url,
        root: root || "",
        singular: processedSingular,
        plural: processedPlural
      };

      // Generate and save HTML file
      try {
        const html = generateHTML(result);
        const filePath = saveHTMLFile(html, url);
        console.log(`HTML file saved to: ${filePath}`);
        htmlContent = html;
      } catch (error) {
        console.error("Error generating HTML file:", error);
      }
    } else if (partOfSpeechToUse === "adjective") {
      // Parse adjective data - extract all 4 forms
      let mSingular: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> } = { h: "", hn: "", t: "", ti: 0 };
      let fSingular: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> } = { h: "", hn: "", t: "", ti: 0 };
      let mPlural: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> } = { h: "", hn: "", t: "", ti: 0 };
      let fPlural: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> } = { h: "", hn: "", t: "", ti: 0 };
      
      // Find adjective forms - look for td elements with IDs or divs with IDs
      // Adjectives have IDs: ms-a (masculine singular), fs-a (feminine singular), mp-a (masculine plural), fp-a (feminine plural)
      // Try both: td with id, and div with id inside td.conj-td
      
      // Find adjective forms - look for td elements with IDs or divs with IDs
      // Adjectives have IDs: ms-a (masculine singular), fs-a (feminine singular), mp-a (masculine plural), fp-a (feminine plural)
      const findFormData = (formId: string): { 
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        td: cheerio.Cheerio<any>; 
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        div: cheerio.Cheerio<any> 
      } | null => {
        // Try td with id first
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let td: cheerio.Cheerio<any> = table.find(`td[id="${formId}"]`).first();
        if (td.length === 0) {
          // Try div with id and get its parent td
          const div = table.find(`div[id="${formId}"]`).first();
          if (div.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            td = div.closest("td.conj-td") as cheerio.Cheerio<any>;
          }
        }
        if (td.length > 0) {
          const div = td.find(`div[id="${formId}"]`).first();
          return { td, div };
        }
        return null;
      };
      
      // Find masculine singular
      const msForm = findFormData("ms-a");
      if (msForm) {
        if (msForm.div.length > 0) {
          const msData = extractFormData(msForm.div, $);
          mSingular = { ...msData };
        } else {
          const msData = extractFormData(msForm.td, $);
          mSingular = { ...msData };
        }
        const msVariations = extractVariations(msForm.td, $);
        if (msVariations.length > 0) {
          mSingular.variations = msVariations;
        }
      }
      
      // Find feminine singular
      const fsForm = findFormData("fs-a");
      if (fsForm) {
        if (fsForm.div.length > 0) {
          const fsData = extractFormData(fsForm.div, $);
          fSingular = { ...fsData };
        } else {
          const fsData = extractFormData(fsForm.td, $);
          fSingular = { ...fsData };
        }
        const fsVariations = extractVariations(fsForm.td, $);
        if (fsVariations.length > 0) {
          fSingular.variations = fsVariations;
        }
      }
      
      // Find masculine plural
      const mpForm = findFormData("mp-a");
      if (mpForm) {
        if (mpForm.div.length > 0) {
          const mpData = extractFormData(mpForm.div, $);
          mPlural = { ...mpData };
        } else {
          const mpData = extractFormData(mpForm.td, $);
          mPlural = { ...mpData };
        }
        const mpVariations = extractVariations(mpForm.td, $);
        if (mpVariations.length > 0) {
          mPlural.variations = mpVariations;
        }
      }
      
      // Find feminine plural
      const fpForm = findFormData("fp-a");
      if (fpForm) {
        if (fpForm.div.length > 0) {
          const fpData = extractFormData(fpForm.div, $);
          fPlural = { ...fpData };
        } else {
          const fpData = extractFormData(fpForm.td, $);
          fPlural = { ...fpData };
        }
        const fpVariations = extractVariations(fpForm.td, $);
        if (fpVariations.length > 0) {
          fPlural.variations = fpVariations;
        }
      }

      // Apply transliteration replacement if enabled
      const processedMSingular = applyTransliterationReplacement(mSingular, useChToKh, useTzToC);
      const processedFSingular = applyTransliterationReplacement(fSingular, useChToKh, useTzToC);
      const processedMPlural = applyTransliterationReplacement(mPlural, useChToKh, useTzToC);
      const processedFPlural = applyTransliterationReplacement(fPlural, useChToKh, useTzToC);

      result = {
        pos: "adjective",
        pattern: pattern || "",
        meaning: meaning || "",
        url: url,
        root: root || "",
        mSingular: processedMSingular,
        fSingular: processedFSingular,
        mPlural: processedMPlural,
        fPlural: processedFPlural
      };

      // Generate and save HTML file
      try {
        const html = generateHTML(result);
        const filePath = saveHTMLFile(html, url);
        console.log(`HTML file saved to: ${filePath}`);
        htmlContent = html;
      } catch (error) {
        console.error("Error generating HTML file:", error);
      }
    } else if (partOfSpeechToUse === "verb") {
      // Parse verb data - extract infinitive and present tense forms
      let infinitive: FormData = { h: "", hn: "", t: "", ti: 0 };
      let mSingular: FormData = { h: "", hn: "", t: "", ti: 0 };
      let fSingular: FormData = { h: "", hn: "", t: "", ti: 0 };
      let mPlural: FormData = { h: "", hn: "", t: "", ti: 0 };
      let fPlural: FormData = { h: "", hn: "", t: "", ti: 0 };

      // Helper function to find form data by ID (similar to adjectives)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const findFormDataAndTd = (formId: string): { td: cheerio.Cheerio<any>; div: cheerio.Cheerio<any> } | null => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let td: cheerio.Cheerio<any> = table.find(`td[id="${formId}"]`).first();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let div: cheerio.Cheerio<any> = table.find(`div[id="${formId}"]`).first();

        if (td.length > 0) {
          if (div.length === 0) {
            div = td; // Treat the td itself as the formDiv for extractFormData
          }
          return { td, div };
        } else if (div.length > 0) {
          td = div.closest("td.conj-td");
          if (td.length > 0) {
            return { td, div };
          }
        }
        return null;
      };

      // Find infinitive (ID is "INF-L" not "INF")
      const infForm = findFormDataAndTd("INF-L");
      if (infForm) {
        const infData = extractFormData(infForm.div, $);
        infinitive = { ...infData };
        // Extract variations: check both direct child divs AND aux-forms (for hidden variations)
        const infVariationsDirect = extractVerbVariations(infForm.div, $);
        const infVariationsAux = extractVariations(infForm.td, $);
        // Combine both types of variations
        const allInfVariations = [...infVariationsDirect, ...infVariationsAux];
        if (allInfVariations.length > 0) {
          infinitive.variations = allInfVariations;
        }
      }

      // Find present tense forms - search for row containing "Present tense"
      table.find("tr").each((_, row) => {
        const th = $(row).find("th").first();
        const thText = th.text().trim();
        if (thText.includes("Present tense")) {
          // Find present tense forms: AP-ms, AP-fs, AP-mp, AP-fp
          const msForm = findFormDataAndTd("AP-ms");
          if (msForm) {
            const msData = extractFormData(msForm.div, $);
            mSingular = { ...msData };
            // Extract variations: check both direct child divs AND aux-forms (for hidden variations)
            const msVariationsDirect = extractVerbVariations(msForm.div, $);
            const msVariationsAux = extractVariations(msForm.td, $);
            const allMsVariations = [...msVariationsDirect, ...msVariationsAux];
            if (allMsVariations.length > 0) {
              mSingular.variations = allMsVariations;
            }
          }

          const fsForm = findFormDataAndTd("AP-fs");
          if (fsForm) {
            const fsData = extractFormData(fsForm.div, $);
            fSingular = { ...fsData };
            // Extract variations: check both direct child divs AND aux-forms (for hidden variations)
            const fsVariationsDirect = extractVerbVariations(fsForm.div, $);
            const fsVariationsAux = extractVariations(fsForm.td, $);
            const allFsVariations = [...fsVariationsDirect, ...fsVariationsAux];
            if (allFsVariations.length > 0) {
              fSingular.variations = allFsVariations;
            }
          }

          const mpForm = findFormDataAndTd("AP-mp");
          if (mpForm) {
            const mpData = extractFormData(mpForm.div, $);
            mPlural = { ...mpData };
            // Extract variations: check both direct child divs AND aux-forms (for hidden variations)
            const mpVariationsDirect = extractVerbVariations(mpForm.div, $);
            const mpVariationsAux = extractVariations(mpForm.td, $);
            const allMpVariations = [...mpVariationsDirect, ...mpVariationsAux];
            if (allMpVariations.length > 0) {
              mPlural.variations = allMpVariations;
            }
          }

          const fpForm = findFormDataAndTd("AP-fp");
          if (fpForm) {
            const fpData = extractFormData(fpForm.div, $);
            fPlural = { ...fpData };
            // Extract variations: check both direct child divs AND aux-forms (for hidden variations)
            const fpVariationsDirect = extractVerbVariations(fpForm.div, $);
            const fpVariationsAux = extractVariations(fpForm.td, $);
            const allFpVariations = [...fpVariationsDirect, ...fpVariationsAux];
            if (allFpVariations.length > 0) {
              fPlural.variations = allFpVariations;
            }
          }

          return false; // break
        }
      });

      // Apply transliteration replacement if enabled
      const processedInfinitive = applyTransliterationReplacement(infinitive, useChToKh, useTzToC);
      const processedMSingular = applyTransliterationReplacement(mSingular, useChToKh, useTzToC);
      const processedFSingular = applyTransliterationReplacement(fSingular, useChToKh, useTzToC);
      const processedMPlural = applyTransliterationReplacement(mPlural, useChToKh, useTzToC);
      const processedFPlural = applyTransliterationReplacement(fPlural, useChToKh, useTzToC);

      result = {
        pos: "verb",
        binyan: binyan || "",
        meaning: meaning || "",
        url: url,
        root: root || "",
        infinitive: processedInfinitive,
        mSingular: processedMSingular,
        fSingular: processedFSingular,
        mPlural: processedMPlural,
        fPlural: processedFPlural
      };

      // Generate and save HTML file
      try {
        const html = generateHTML(result);
        const filePath = saveHTMLFile(html, url);
        console.log(`HTML file saved to: ${filePath}`);
        htmlContent = html;
      } catch (error) {
        console.error("Error generating HTML file:", error);
      }
    } else {
      // This should never happen due to early return, but TypeScript needs it
      throw new Error(`Unsupported part of speech: ${partOfSpeechToUse}`);
    }

    console.log(JSON.stringify(result, null, 2));
    
    return NextResponse.json({ ...result, htmlContent });
  } catch (error) {
    console.error("Error parsing page:", error);
    return NextResponse.json(
      { error: "Failed to parse page" },
      { status: 500 }
    );
  }
}

