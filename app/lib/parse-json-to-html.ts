import * as fs from "fs";
import * as path from "path";
import { homedir } from "os";
import { URL_LAST_PATH_SEGMENT_REGEX } from "@/app/constants/regex";
import { MEANING_CELL, HEBREW_FIRST_ROW, TRANSLITERATION_ROW, ROOT_CELL, BINYAN_CELL, PATTERN_CELL } from "@/app/constants/css";
import { HebrewFormData, NounHTMLRowData, AdjectiveHTMLRowData, VerbHTMLRowData, GenerateHTMLData } from "@/app/types";



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
function formatHebrewCell(form: HebrewFormData): { firstRow: string; secondRow: string } {
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
export function generateNounHTMLRow(data: NounHTMLRowData): string {
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
      <td rowspan="2" style="${MEANING_CELL}">${meaning}</td>
      <td style="${HEBREW_FIRST_ROW}">${mSingularCell.firstRow}</td>
      <td style="${HEBREW_FIRST_ROW}">${fSingularCell.firstRow}</td>
      <td style="${HEBREW_FIRST_ROW}">${mPluralCell.firstRow}</td>
      <td style="${HEBREW_FIRST_ROW}">${fPluralCell.firstRow}</td>
      <td style="${ROOT_CELL}">
        <a href="${url}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">${root || "link"}</a>
      </td>
    </tr>
    <tr>
      <td style="${TRANSLITERATION_ROW}">${mSingularCell.secondRow}</td>
      <td style="${TRANSLITERATION_ROW}">${fSingularCell.secondRow}</td>
      <td style="${TRANSLITERATION_ROW}">${mPluralCell.secondRow}</td>
      <td style="${TRANSLITERATION_ROW}">${fPluralCell.secondRow}</td>
      <td style="${PATTERN_CELL}">${pattern || ""}</td>
    </tr>
  `;
}

// Generate HTML row for verbs
export function generateVerbHTMLRow(data: VerbHTMLRowData): string {
  const { meaning, infinitive, mSingular, fSingular, mPlural, fPlural, root, binyan, url } = data;
  
  const infinitiveCell = formatHebrewCell(infinitive);
  const mSingularCell = formatHebrewCell(mSingular);
  const fSingularCell = formatHebrewCell(fSingular);
  const mPluralCell = formatHebrewCell(mPlural);
  const fPluralCell = formatHebrewCell(fPlural);
  
  return `
    <tr>
      <td rowspan="2" style="${MEANING_CELL}">${meaning}</td>
      <td style="${HEBREW_FIRST_ROW}">${infinitiveCell.firstRow}</td>
      <td style="${HEBREW_FIRST_ROW}">${mSingularCell.firstRow}</td>
      <td style="${HEBREW_FIRST_ROW}">${fSingularCell.firstRow}</td>
      <td style="${HEBREW_FIRST_ROW}">${mPluralCell.firstRow}</td>
      <td style="${HEBREW_FIRST_ROW}">${fPluralCell.firstRow}</td>
      <td rowspan="2" style="${BINYAN_CELL}">${binyan || ""}</td>
      <td rowspan="2" style="${ROOT_CELL}">
        <a href="${url}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">${root || "link"}</a>
      </td>
    </tr>
    <tr>
      <td style="${TRANSLITERATION_ROW}">${infinitiveCell.secondRow}</td>
      <td style="${TRANSLITERATION_ROW}">${mSingularCell.secondRow}</td>
      <td style="${TRANSLITERATION_ROW}">${fSingularCell.secondRow}</td>
      <td style="${TRANSLITERATION_ROW}">${mPluralCell.secondRow}</td>
      <td style="${TRANSLITERATION_ROW}">${fPluralCell.secondRow}</td>
    </tr>
  `;
}

// Generate HTML row for imperative verbs
export function generateImperativeHTMLRow(data: VerbHTMLRowData): string {
  const { meaning, infinitive, mSingular, fSingular, mPlural, fPlural, root, binyan, url } = data;
  
  const infinitiveCell = formatHebrewCell(infinitive);
  const mSingularCell = formatHebrewCell(mSingular);
  const fSingularCell = formatHebrewCell(fSingular);
  const mPluralCell = formatHebrewCell(mPlural);
  const fPluralCell = formatHebrewCell(fPlural);
  
  return `
    <tr>
      <td rowspan="2" style="${MEANING_CELL}">${meaning}</td>
      <td style="${HEBREW_FIRST_ROW}">${infinitiveCell.firstRow}</td>
      <td style="${HEBREW_FIRST_ROW}">${mSingularCell.firstRow}</td>
      <td style="${HEBREW_FIRST_ROW}">${fSingularCell.firstRow}</td>
      <td style="${HEBREW_FIRST_ROW}">${mPluralCell.firstRow}</td>
      <td style="${HEBREW_FIRST_ROW}">${fPluralCell.firstRow}</td>
      <td rowspan="2" style="${BINYAN_CELL}">${binyan || ""}</td>
      <td rowspan="2" style="${ROOT_CELL}">
        <a href="${url}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">${root || "link"}</a>
      </td>
    </tr>
    <tr>
      <td style="${TRANSLITERATION_ROW}">${infinitiveCell.secondRow}</td>
      <td style="${TRANSLITERATION_ROW}">${mSingularCell.secondRow}</td>
      <td style="${TRANSLITERATION_ROW}">${fSingularCell.secondRow}</td>
      <td style="${TRANSLITERATION_ROW}">${mPluralCell.secondRow}</td>
      <td style="${TRANSLITERATION_ROW}">${fPluralCell.secondRow}</td>
    </tr>
  `;
}

// Generate HTML row for adjectives
export function generateAdjectiveHTMLRow(data: AdjectiveHTMLRowData): string {
  const { meaning, mSingular, fSingular, mPlural, fPlural, root, pattern, url } = data;
  
  const mSingularCell = formatHebrewCell(mSingular);
  const fSingularCell = formatHebrewCell(fSingular);
  const mPluralCell = formatHebrewCell(mPlural);
  const fPluralCell = formatHebrewCell(fPlural);
  
  return `
    <tr>
      <td rowspan="2" style="${MEANING_CELL}">${meaning}</td>
      <td style="${HEBREW_FIRST_ROW}">${mSingularCell.firstRow}</td>
      <td style="${HEBREW_FIRST_ROW}">${fSingularCell.firstRow}</td>
      <td style="${HEBREW_FIRST_ROW}">${mPluralCell.firstRow}</td>
      <td style="${HEBREW_FIRST_ROW}">${fPluralCell.firstRow}</td>
      <td style="${ROOT_CELL}">
        <a href="${url}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">${root || "link"}</a>
      </td>
    </tr>
    <tr>
      <td style="${TRANSLITERATION_ROW}">${mSingularCell.secondRow}</td>
      <td style="${TRANSLITERATION_ROW}">${fSingularCell.secondRow}</td>
      <td style="${TRANSLITERATION_ROW}">${mPluralCell.secondRow}</td>
      <td style="${TRANSLITERATION_ROW}">${fPluralCell.secondRow}</td>
      <td style="${PATTERN_CELL}">${pattern || ""}</td>
    </tr>
  `;
}

// Helper function to generate a table container with copy button
function generateTableContainer(tableId: string, rowHTML: string, buttonLabel: string = "Copy Table"): string {
  return `
  <div class="table-container">
    <div class="copy-button-container">
      <button class="copy-button" onclick="copyTable('${tableId}')">${buttonLabel}</button>
    </div>
    <table id="${tableId}">
      <tbody>
        ${rowHTML}
      </tbody>
    </table>
  </div>`;
}

// Helper function to generate complete HTML file
export function generateHTML(data: GenerateHTMLData): string {
  const tables: string[] = [];
  const baseId = Date.now();
  
  if (data.pos === "noun" && data.singular && data.plural && data.gender) {
    const rowHTML = generateNounHTMLRow({
      meaning: data.meaning,
      gender: data.gender,
      singular: data.singular,
      plural: data.plural,
      root: data.root,
      pattern: data.pattern || "",
      url: data.url
    });
    const tableId = `table-${baseId}`;
    tables.push(generateTableContainer(tableId, rowHTML));
  } else if (data.pos === "adjective" && data.mSingular && data.fSingular && data.mPlural && data.fPlural) {
    const rowHTML = generateAdjectiveHTMLRow({
      meaning: data.meaning,
      mSingular: data.mSingular,
      fSingular: data.fSingular,
      mPlural: data.mPlural,
      fPlural: data.fPlural,
      root: data.root,
      pattern: data.pattern || "",
      url: data.url
    });
    const tableId = `table-${baseId}`;
    tables.push(generateTableContainer(tableId, rowHTML));
  } else if (data.pos === "verb" && data.infinitive && data.mSingular && data.fSingular && data.mPlural && data.fPlural) {
    // Present tense table
    const presentRowHTML = generateVerbHTMLRow({
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
    const presentTableId = `table-${baseId}-present`;
    tables.push(generateTableContainer(presentTableId, presentRowHTML, "Copy Present Tense Table"));
    
    // Imperative table (if imperative data exists)
    if (data.imperativeMSingular && data.imperativeFSingular && data.imperativeMPlural && data.imperativeFPlural) {
      const imperativeRowHTML = generateImperativeHTMLRow({
        meaning: data.imperativeMeaning || data.meaning,
        infinitive: data.infinitive,
        mSingular: data.imperativeMSingular,
        fSingular: data.imperativeFSingular,
        mPlural: data.imperativeMPlural,
        fPlural: data.imperativeFPlural,
        root: data.root,
        binyan: data.binyan || "",
        url: data.url
      });
      const imperativeTableId = `table-${baseId}-imperative`;
      tables.push(generateTableContainer(imperativeTableId, imperativeRowHTML, "Copy Imperative Table"));
    }
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
      margin: 100px auto 0;
      max-width: 1200px;
      padding: 0 20px;
    }
    .table-container {
      margin-bottom: 40px;
    }
    .copy-button-container {
      display: flex;
      justify-content: center;
      margin-bottom: 16px;
    }
    .copy-button {
      padding: 12px 24px;
      font-size: 16px;
      font-weight: 500;
      color: white;
      background: #0066cc;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: background-color 0.2s;
      font-family: 'Helvetica Neue', Arial, sans-serif;
    }
    .copy-button:hover {
      background: #0052a3;
    }
    .copy-button:active {
      background: #003d7a;
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
    @media (prefers-color-scheme: dark) {
      .copy-button {
        background: #4d9fff;
      }
      .copy-button:hover {
        background: #3385ff;
      }
      .copy-button:active {
        background: #1a6fff;
      }
    }
  </style>
</head>
<body>
  ${tables.join("\n")}
  <script>
    function copyTable(tableId) {
      const table = document.getElementById(tableId);
      if (!table) return;
      
      // Select the table
      const range = document.createRange();
      range.selectNode(table);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      
      try {
        // Copy to clipboard
        document.execCommand('copy');
        selection.removeAllRanges();
        
        // Visual feedback
        const button = event.target;
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.style.background = '#28a745';
        setTimeout(() => {
          button.textContent = originalText;
          button.style.background = '';
        }, 1000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  </script>
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

