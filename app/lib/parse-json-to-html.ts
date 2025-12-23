import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { URL_LAST_PATH_SEGMENT_REGEX } from "@/app/constants/regex";

// Helper to create transliteration with bolded accented vowel
function formatTransliteration(t: string, ti: number): string {
  if (!t || ti < 0 || ti >= t.length) return t;
  const before = t.substring(0, ti);
  const accented = t[ti];
  const after = t.substring(ti + 1);
  return `${before}<b>${accented}</b>${after}`;
}

// Format Hebrew cell: first row has Hebrew with/without niqqud, second row has transliteration
// Includes variations if present
// If Hebrew (both with and without niqqud) is identical between variations, show it only once
function formatHebrewCell(form: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> }): { firstRow: string; secondRow: string } {
  const parts: string[] = [];
  const transliterationParts: string[] = [];
  const seenHebrew = new Set<string>(); // Track which Hebrew combinations we've already added
  
  // Add primary form
  if (form.hn || form.h) {
    let hebrewKey = "";
    if (form.hn && form.h) {
      hebrewKey = `${form.hn} — ${form.h}`;
      parts.push(hebrewKey);
    } else if (form.hn) {
      hebrewKey = form.hn;
      parts.push(form.hn);
    } else if (form.h) {
      hebrewKey = form.h;
      parts.push(form.h);
    }
    
    if (hebrewKey) {
      seenHebrew.add(hebrewKey);
    }
    
    if (form.t) {
      transliterationParts.push(formatTransliteration(form.t, form.ti));
    }
  }
  
  // Add variations if present
  if (form.variations && form.variations.length > 0) {
    form.variations.forEach(variation => {
      // Always add transliteration if it exists
      if (variation.t) {
        transliterationParts.push(formatTransliteration(variation.t, variation.ti));
      }
      
      // Only add Hebrew if it's different from what we've already seen
      if (variation.hn || variation.h) {
        let hebrewKey = "";
        if (variation.hn && variation.h) {
          hebrewKey = `${variation.hn} — ${variation.h}`;
        } else if (variation.hn) {
          hebrewKey = variation.hn;
        } else if (variation.h) {
          hebrewKey = variation.h;
        }
        
        // Only add Hebrew if we haven't seen this exact combination before
        if (hebrewKey && !seenHebrew.has(hebrewKey)) {
          parts.push(hebrewKey);
          seenHebrew.add(hebrewKey);
        }
      }
    });
  }
  
  const firstRow = parts.join("<br>");
  const secondRow = transliterationParts.join("<br>");
  
  return { firstRow, secondRow };
}

// Generate HTML row for nouns
export function generateNounHTMLRow(data: {
  meaning: string;
  gender: string;
  singular: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
  plural: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
  root: string;
  pattern: string;
  url: string;
}): string {
  const { meaning, gender, singular, plural, root, pattern, url } = data;
  
  // Determine which columns to populate based on gender
  const isMasculine = gender === "male";
  const mSingular = isMasculine ? singular : { h: "", hn: "", t: "", ti: 0, variations: undefined };
  const fSingular = !isMasculine ? singular : { h: "", hn: "", t: "", ti: 0, variations: undefined };
  const mPlural = isMasculine ? plural : { h: "", hn: "", t: "", ti: 0, variations: undefined };
  const fPlural = !isMasculine ? plural : { h: "", hn: "", t: "", ti: 0, variations: undefined };
  
  const mSingularCell = formatHebrewCell(mSingular);
  const fSingularCell = formatHebrewCell(fSingular);
  const mPluralCell = formatHebrewCell(mPlural);
  const fPluralCell = formatHebrewCell(fPlural);
  
  return `
    <tr>
      <td rowspan="2" style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9pt; vertical-align: middle; text-align: left; padding: 0px 4px;">${meaning}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.75pt; direction: rtl; text-align: center; vertical-align: middle;">${mSingularCell.firstRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.75pt; direction: rtl; text-align: center; vertical-align: middle;">${fSingularCell.firstRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.75pt; direction: rtl; text-align: center; vertical-align: middle;">${mPluralCell.firstRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.75pt; direction: rtl; text-align: center; vertical-align: middle;">${fPluralCell.firstRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9pt; font-weight: bold; vertical-align: middle; text-align: center;">
        <a href="${url}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">${root || "link"}</a>
      </td>
    </tr>
    <tr>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8.25pt; text-align: center; vertical-align: middle;">${mSingularCell.secondRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8.25pt; text-align: center; vertical-align: middle;">${fSingularCell.secondRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8.25pt; text-align: center; vertical-align: middle;">${mPluralCell.secondRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8.25pt; text-align: center; vertical-align: middle;">${fPluralCell.secondRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8.25pt; text-align: center; vertical-align: middle;">${pattern || ""}</td>
    </tr>
  `;
}

// Generate HTML row for verbs
export function generateVerbHTMLRow(data: {
  meaning: string;
  infinitive: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
  mSingular: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
  fSingular: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
  mPlural: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
  fPlural: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
  root: string;
  binyan: string;
  url: string;
}): string {
  const { meaning, infinitive, mSingular, fSingular, mPlural, fPlural, root, binyan, url } = data;
  
  const infinitiveCell = formatHebrewCell(infinitive);
  const mSingularCell = formatHebrewCell(mSingular);
  const fSingularCell = formatHebrewCell(fSingular);
  const mPluralCell = formatHebrewCell(mPlural);
  const fPluralCell = formatHebrewCell(fPlural);
  
  return `
    <tr>
      <td rowspan="2" style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9pt; vertical-align: middle; text-align: left; padding: 0px 4px;">${meaning}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.75pt; direction: rtl; text-align: center; vertical-align: middle; padding: 2px; 0px;">${infinitiveCell.firstRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.75pt; direction: rtl; text-align: center; vertical-align: middle; padding: 2px; 0px;">${mSingularCell.firstRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.75pt; direction: rtl; text-align: center; vertical-align: middle; padding: 2px; 0px;">${fSingularCell.firstRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.75pt; direction: rtl; text-align: center; vertical-align: middle; padding: 2px; 0px;">${mPluralCell.firstRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.75pt; direction: rtl; text-align: center; vertical-align: middle; padding: 2px; 0px;">${fPluralCell.firstRow}</td>
      <td rowspan="2" style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9pt; font-weight: bold; vertical-align: middle; text-align: center; padding: 0px;">${binyan || ""}</td>
      <td rowspan="2" style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9pt; font-weight: bold; vertical-align: middle; text-align: center; padding: 0px;">
        <a href="${url}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">${root || "link"}</a>
      </td>
    </tr>
    <tr>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8.25pt; text-align: center; vertical-align: middle;">${infinitiveCell.secondRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8.25pt; text-align: center; vertical-align: middle;">${mSingularCell.secondRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8.25pt; text-align: center; vertical-align: middle;">${fSingularCell.secondRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8.25pt; text-align: center; vertical-align: middle;">${mPluralCell.secondRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8.25pt; text-align: center; vertical-align: middle;">${fPluralCell.secondRow}</td>
    </tr>
  `;
}

// Generate HTML row for adjectives
export function generateAdjectiveHTMLRow(data: {
  meaning: string;
  mSingular: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
  fSingular: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
  mPlural: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
  fPlural: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
  root: string;
  pattern: string;
  url: string;
}): string {
  const { meaning, mSingular, fSingular, mPlural, fPlural, root, pattern, url } = data;
  
  const mSingularCell = formatHebrewCell(mSingular);
  const fSingularCell = formatHebrewCell(fSingular);
  const mPluralCell = formatHebrewCell(mPlural);
  const fPluralCell = formatHebrewCell(fPlural);
  
  return `
    <tr>
      <td rowspan="2" style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9pt; vertical-align: middle; text-align: left; padding: 0px 4px;">${meaning}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.75pt; direction: rtl; text-align: center; vertical-align: middle;">${mSingularCell.firstRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.75pt; direction: rtl; text-align: center; vertical-align: middle;">${fSingularCell.firstRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.75pt; direction: rtl; text-align: center; vertical-align: middle;">${mPluralCell.firstRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.75pt; direction: rtl; text-align: center; vertical-align: middle;">${fPluralCell.firstRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9pt; font-weight: bold; vertical-align: middle; text-align: center;">
        <a href="${url}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">${root || "link"}</a>
      </td>
    </tr>
    <tr>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8.25pt; text-align: center; vertical-align: middle;">${mSingularCell.secondRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8.25pt; text-align: center; vertical-align: middle;">${fSingularCell.secondRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8.25pt; text-align: center; vertical-align: middle;">${mPluralCell.secondRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8.25pt; text-align: center; vertical-align: middle;">${fPluralCell.secondRow}</td>
      <td style="font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8.25pt; text-align: center; vertical-align: middle;">${pattern || ""}</td>
    </tr>
  `;
}

// Helper function to generate complete HTML file
export function generateHTML(data: {
  pos: string;
  meaning: string;
  url: string;
  root: string;
  pattern?: string;
  binyan?: string;
  gender?: string;
  singular?: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
  plural?: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
  infinitive?: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
  mSingular?: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
  fSingular?: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
  mPlural?: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
  fPlural?: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> };
}): string {
  let rowHTML = "";
  
  if (data.pos === "noun" && data.singular && data.plural && data.gender) {
    rowHTML = generateNounHTMLRow({
      meaning: data.meaning,
      gender: data.gender,
      singular: data.singular,
      plural: data.plural,
      root: data.root,
      pattern: data.pattern || "",
      url: data.url
    });
  } else if (data.pos === "adjective" && data.mSingular && data.fSingular && data.mPlural && data.fPlural) {
    rowHTML = generateAdjectiveHTMLRow({
      meaning: data.meaning,
      mSingular: data.mSingular,
      fSingular: data.fSingular,
      mPlural: data.mPlural,
      fPlural: data.fPlural,
      root: data.root,
      pattern: data.pattern || "",
      url: data.url
    });
  } else if (data.pos === "verb" && data.infinitive && data.mSingular && data.fSingular && data.mPlural && data.fPlural) {
    rowHTML = generateVerbHTMLRow({
      meaning: data.meaning,
      infinitive: data.infinitive,
      mSingular: data.mSingular,
      fSingular: data.fSingular,
      mPlural: data.mPlural,
      fPlural: data.fPlural,
      root: data.root,
      binyan: data.binyan || "",
      url: data.url
    });
  }
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pealim Data</title>
  <style>
    body {
      margin-top: 100px;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      font-family: 'Helvetica Neue', Arial, sans-serif;
    }
    td {
      border: 1px solid #d0d0d0;
      padding: 2px 8px;
    }
  </style>
</head>
<body>
  <table>
    <tbody>
      ${rowHTML}
    </tbody>
  </table>
</body>
</html>`;
}

// Helper function to save HTML file
export function saveHTMLFile(html: string, url: string): string {
  try {
    // Extract filename from URL (last path segment)
    const urlMatch = url.match(URL_LAST_PATH_SEGMENT_REGEX);
    const filename = urlMatch ? `${urlMatch[1]}.html` : `pealim-${Date.now()}.html`;
    
    // Create directory path
    const desktopPath = path.join(homedir(), "Desktop", "Pealim HTML");
    
    // Ensure directory exists
    if (!fs.existsSync(desktopPath)) {
      fs.mkdirSync(desktopPath, { recursive: true });
    }
    
    // Full file path
    const filePath = path.join(desktopPath, filename);
    
    // Delete file if it already exists
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    // Write file
    fs.writeFileSync(filePath, html, "utf-8");
    
    return filePath;
  } catch (error) {
    console.error("Error saving HTML file:", error);
    throw error;
  }
}

