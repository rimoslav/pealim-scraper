import { NextRequest, NextResponse } from "next/server"
import * as cheerio from "cheerio"
import { extractFormData, extractVariations, extractVerbVariations, applyTransliterationReplacement, removeExclamationMarks } from "@/app/lib/parse-html-to-json"
import { generateHTML, saveHTMLFile } from "@/app/lib/parse-json-to-html"
import { NOUN_REGEX, ADJECTIVE_REGEX, VERB_REGEX, BINYAN_REGEX, ROOT_REGEX, HYPHEN_TO_ENDASH_REGEX } from "@/app/constants/regex"
import { ParseResult, HebrewFormData } from "@/app/types"


export async function POST(request: NextRequest) {
  try {
    const { url, partOfSpeech, useChToKh = true, useTzToC = true } = await request.json()

    // Fetch the page
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`)
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // Parse common data using selectors
    // Pattern is in the <p> tag immediately after h2.page-header
    let gender: "male" | "female" | null = null
    let pattern = ""
    let binyan = ""
    let detectedPartOfSpeech: "noun" | "adjective" | "verb" | null = null

    // Use selector to find the p tag right after h2.page-header
    const posPTag = $("h2.page-header + p").first()
    const posText = posPTag.text()
    const posTextLower = posText.toLowerCase()

    // Look for "masculine" or "feminine" in the text (for nouns)
    if (posTextLower.includes("masculine")) {
      gender = "male"
    } else if (posTextLower.includes("feminine")) {
      gender = "female"
    }

    // Extract pattern if it exists (for both nouns and adjectives)
    // Also use this to auto-detect part of speech if not provided
    let patternMatch = posText.match(NOUN_REGEX)
    if (patternMatch) {
      detectedPartOfSpeech = "noun"
    } else {
      patternMatch = posText.match(ADJECTIVE_REGEX)
      if (patternMatch) {
        detectedPartOfSpeech = "adjective"
      } else if (posText.match(VERB_REGEX)) {
        detectedPartOfSpeech = "verb"
        // Extract binyan from "Verb – HITPA'EL"
        const binyanMatch = posText.match(BINYAN_REGEX)
        if (binyanMatch && binyanMatch[1]) {
          binyan = binyanMatch[1].trim()
        }
      }
    }

    if (patternMatch && patternMatch[1]) {
      pattern = patternMatch[1].trim()
    }

    // Determine the part of speech to use
    const partOfSpeechToUse = partOfSpeech || detectedPartOfSpeech

    // If part of speech couldn't be determined, return an error
    if (!partOfSpeechToUse || (partOfSpeechToUse !== "noun" && partOfSpeechToUse !== "adjective" && partOfSpeechToUse !== "verb")) {
      return NextResponse.json(
        { error: "Could not determine part of speech. The page does not appear to be a noun, adjective, or verb." },
        { status: 400 }
      )
    }

    // Extract root from the p tag after the pattern p tag
    let root = ""
    const rootPTag = posPTag.next("p").first()
    const rootText = rootPTag.text().trim()
    if (rootText.startsWith("Root:")) {
      // Extract root letters (e.g., "Root: פ - ת - ר")
      const rootMatch = rootText.match(ROOT_REGEX)
      if (rootMatch && rootMatch[1]) {
        // Replace hyphens with en dashes
        root = rootMatch[1].trim().replace(HYPHEN_TO_ENDASH_REGEX, " – ")
      }
    }

    // Extract meaning from div.lead after h3.page-header containing "Meaning"
    let meaning = ""
    $("h3.page-header").each((_, el) => {
      const headingText = $(el).text().trim()
      if (headingText === "Meaning") {
        const meaningDiv = $(el).next("div.lead").first()
        meaning = meaningDiv.text().trim()
        return false // break
      }
    })

    // Find the table with conjugation-table class
    const table = $("table.conjugation-table").first()

    let result: ParseResult
    let htmlContent: string | null = null

    if (partOfSpeechToUse === "noun") {
      // Parse noun data
      let singular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let plural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }

      // Find the row with "Absolute state" in the th
      table.find("tr").each((_, row) => {
        const th = $(row).find("th").first()
        if (th.text().trim() === "Absolute state") {
          // Get the first td (singular column)
          const singularTd = $(row).find("td.conj-td").first()
          const singularDiv = singularTd.find('div[id="s"]').first()
          const singularData = extractFormData(singularDiv, $)
          singular = { ...singularData }

          // Extract singular variations
          const singularVariations = extractVariations(singularTd, $)
          if (singularVariations.length > 0) {
            singular.variations = singularVariations
          }

          // Get the second td (plural column)
          const pluralTd = $(row).find("td.conj-td").eq(1)
          const pluralDiv = pluralTd.find('div[id="p"]').first()
          const pluralData = extractFormData(pluralDiv, $)
          plural = { ...pluralData }

          // Extract plural variations
          const pluralVariations = extractVariations(pluralTd, $)
          if (pluralVariations.length > 0) {
            plural.variations = pluralVariations
          }

          return false // break
        }
      })

      // Apply transliteration replacement if enabled
      const processedSingular = applyTransliterationReplacement(singular, useChToKh, useTzToC)
      const processedPlural = applyTransliterationReplacement(plural, useChToKh, useTzToC)

      result = {
        pos: "noun",
        gender: gender || "unknown",
        pattern: pattern || "",
        meaning: meaning || "",
        url: url,
        root: root || "",
        singular: processedSingular,
        plural: processedPlural
      }

      // Generate and save HTML file
      try {
        const html = generateHTML(result)
        const filePath = saveHTMLFile(html, url)
        console.log(`HTML file saved to: ${filePath}`)
        htmlContent = html
      } catch (error) {
        console.error("Error generating HTML file:", error)
      }
    } else if (partOfSpeechToUse === "adjective") {
      // Parse adjective data - extract all 4 forms
      let mSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let fSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let mPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let fPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }

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
        let td: cheerio.Cheerio<any> = table.find(`td[id="${formId}"]`).first()
        if (td.length === 0) {
          // Try div with id and get its parent td
          const div = table.find(`div[id="${formId}"]`).first()
          if (div.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            td = div.closest("td.conj-td") as cheerio.Cheerio<any>
          }
        }
        if (td.length > 0) {
          const div = td.find(`div[id="${formId}"]`).first()
          return { td, div }
        }
        return null
      }

      // Find masculine singular
      const msForm = findFormData("ms-a")
      if (msForm) {
        if (msForm.div.length > 0) {
          const msData = extractFormData(msForm.div, $)
          mSingular = { ...msData }
        } else {
          const msData = extractFormData(msForm.td, $)
          mSingular = { ...msData }
        }
        const msVariations = extractVariations(msForm.td, $)
        if (msVariations.length > 0) {
          mSingular.variations = msVariations
        }
      }

      // Find feminine singular
      const fsForm = findFormData("fs-a")
      if (fsForm) {
        if (fsForm.div.length > 0) {
          const fsData = extractFormData(fsForm.div, $)
          fSingular = { ...fsData }
        } else {
          const fsData = extractFormData(fsForm.td, $)
          fSingular = { ...fsData }
        }
        const fsVariations = extractVariations(fsForm.td, $)
        if (fsVariations.length > 0) {
          fSingular.variations = fsVariations
        }
      }

      // Find masculine plural
      const mpForm = findFormData("mp-a")
      if (mpForm) {
        if (mpForm.div.length > 0) {
          const mpData = extractFormData(mpForm.div, $)
          mPlural = { ...mpData }
        } else {
          const mpData = extractFormData(mpForm.td, $)
          mPlural = { ...mpData }
        }
        const mpVariations = extractVariations(mpForm.td, $)
        if (mpVariations.length > 0) {
          mPlural.variations = mpVariations
        }
      }

      // Find feminine plural
      const fpForm = findFormData("fp-a")
      if (fpForm) {
        if (fpForm.div.length > 0) {
          const fpData = extractFormData(fpForm.div, $)
          fPlural = { ...fpData }
        } else {
          const fpData = extractFormData(fpForm.td, $)
          fPlural = { ...fpData }
        }
        const fpVariations = extractVariations(fpForm.td, $)
        if (fpVariations.length > 0) {
          fPlural.variations = fpVariations
        }
      }

      // Apply transliteration replacement if enabled
      const processedMSingular = applyTransliterationReplacement(mSingular, useChToKh, useTzToC)
      const processedFSingular = applyTransliterationReplacement(fSingular, useChToKh, useTzToC)
      const processedMPlural = applyTransliterationReplacement(mPlural, useChToKh, useTzToC)
      const processedFPlural = applyTransliterationReplacement(fPlural, useChToKh, useTzToC)

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
      }

      // Generate and save HTML file
      try {
        const html = generateHTML(result)
        const filePath = saveHTMLFile(html, url)
        console.log(`HTML file saved to: ${filePath}`)
        htmlContent = html
      } catch (error) {
        console.error("Error generating HTML file:", error)
      }
    } else if (partOfSpeechToUse === "verb") {
      // Parse verb data - extract infinitive and present tense forms
      let infinitive: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let mSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let fSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let mPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let fPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }

      // Helper function to find form data by ID (similar to adjectives)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const findFormDataAndTd = (formId: string): { td: cheerio.Cheerio<any>; div: cheerio.Cheerio<any> } | null => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let td: cheerio.Cheerio<any> = table.find(`td[id="${formId}"]`).first()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let div: cheerio.Cheerio<any> = table.find(`div[id="${formId}"]`).first()

        if (td.length > 0) {
          if (div.length === 0) {
            div = td // Treat the td itself as the formDiv for extractFormData
          }
          return { td, div }
        } else if (div.length > 0) {
          td = div.closest("td.conj-td")
          if (td.length > 0) {
            return { td, div }
          }
        }
        return null
      }

      // Find infinitive (ID is "INF-L" not "INF")
      const infForm = findFormDataAndTd("INF-L")
      if (infForm) {
        const infData = extractFormData(infForm.div, $)
        infinitive = { ...infData }
        // Extract variations: check both direct child divs AND aux-forms (for hidden variations)
        const infVariationsDirect = extractVerbVariations(infForm.div, $)
        const infVariationsAux = extractVariations(infForm.td, $)
        // Combine both types of variations
        const allInfVariations = [...infVariationsDirect, ...infVariationsAux]
        if (allInfVariations.length > 0) {
          infinitive.variations = allInfVariations
        }
      }

      // Find present tense forms - search for row containing "Present tense"
      table.find("tr").each((_, row) => {
        const th = $(row).find("th").first()
        const thText = th.text().trim()
        if (thText.includes("Present tense")) {
          // Find present tense forms: AP-ms, AP-fs, AP-mp, AP-fp
          const msForm = findFormDataAndTd("AP-ms")
          if (msForm) {
            const msData = extractFormData(msForm.div, $)
            mSingular = { ...msData }
            // Extract variations: check both direct child divs AND aux-forms (for hidden variations)
            const msVariationsDirect = extractVerbVariations(msForm.div, $)
            const msVariationsAux = extractVariations(msForm.td, $)
            const allMsVariations = [...msVariationsDirect, ...msVariationsAux]
            if (allMsVariations.length > 0) {
              mSingular.variations = allMsVariations
            }
          }

          const fsForm = findFormDataAndTd("AP-fs")
          if (fsForm) {
            const fsData = extractFormData(fsForm.div, $)
            fSingular = { ...fsData }
            // Extract variations: check both direct child divs AND aux-forms (for hidden variations)
            const fsVariationsDirect = extractVerbVariations(fsForm.div, $)
            const fsVariationsAux = extractVariations(fsForm.td, $)
            const allFsVariations = [...fsVariationsDirect, ...fsVariationsAux]
            if (allFsVariations.length > 0) {
              fSingular.variations = allFsVariations
            }
          }

          const mpForm = findFormDataAndTd("AP-mp")
          if (mpForm) {
            const mpData = extractFormData(mpForm.div, $)
            mPlural = { ...mpData }
            // Extract variations: check both direct child divs AND aux-forms (for hidden variations)
            const mpVariationsDirect = extractVerbVariations(mpForm.div, $)
            const mpVariationsAux = extractVariations(mpForm.td, $)
            const allMpVariations = [...mpVariationsDirect, ...mpVariationsAux]
            if (allMpVariations.length > 0) {
              mPlural.variations = allMpVariations
            }
          }

          const fpForm = findFormDataAndTd("AP-fp")
          if (fpForm) {
            const fpData = extractFormData(fpForm.div, $)
            fPlural = { ...fpData }
            // Extract variations: check both direct child divs AND aux-forms (for hidden variations)
            const fpVariationsDirect = extractVerbVariations(fpForm.div, $)
            const fpVariationsAux = extractVariations(fpForm.td, $)
            const allFpVariations = [...fpVariationsDirect, ...fpVariationsAux]
            if (allFpVariations.length > 0) {
              fPlural.variations = allFpVariations
            }
          }

          return false // break
        }
      })

      // Parse imperative forms - search for row containing "Imperative"
      let imperativeMSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let imperativeFSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let imperativeMPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let imperativeFPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }

      table.find("tr").each((_, row) => {
        const th = $(row).find("th").first()
        const thText = th.text().trim()
        if (thText.includes("Imperative")) {
          // Find imperative forms: IMP-2ms, IMP-2fs, IMP-2mp, IMP-2fp
          const impMsForm = findFormDataAndTd("IMP-2ms")
          if (impMsForm) {
            const impMsData = extractFormData(impMsForm.div, $)
            imperativeMSingular = { ...impMsData }
            // Extract variations: check both direct child divs AND aux-forms (for hidden variations)
            const impMsVariationsDirect = extractVerbVariations(impMsForm.div, $)
            const impMsVariationsAux = extractVariations(impMsForm.td, $)
            const allImpMsVariations = [...impMsVariationsDirect, ...impMsVariationsAux]
            if (allImpMsVariations.length > 0) {
              imperativeMSingular.variations = allImpMsVariations
            }
          }

          const impFsForm = findFormDataAndTd("IMP-2fs")
          if (impFsForm) {
            const impFsData = extractFormData(impFsForm.div, $)
            imperativeFSingular = { ...impFsData }
            // Extract variations: check both direct child divs AND aux-forms (for hidden variations)
            const impFsVariationsDirect = extractVerbVariations(impFsForm.div, $)
            const impFsVariationsAux = extractVariations(impFsForm.td, $)
            const allImpFsVariations = [...impFsVariationsDirect, ...impFsVariationsAux]
            if (allImpFsVariations.length > 0) {
              imperativeFSingular.variations = allImpFsVariations
            }
          }

          const impMpForm = findFormDataAndTd("IMP-2mp")
          if (impMpForm) {
            const impMpData = extractFormData(impMpForm.div, $)
            imperativeMPlural = { ...impMpData }
            // Extract variations: check both direct child divs AND aux-forms (for hidden variations)
            const impMpVariationsDirect = extractVerbVariations(impMpForm.div, $)
            const impMpVariationsAux = extractVariations(impMpForm.td, $)
            const allImpMpVariations = [...impMpVariationsDirect, ...impMpVariationsAux]
            if (allImpMpVariations.length > 0) {
              imperativeMPlural.variations = allImpMpVariations
            }
          }

          const impFpForm = findFormDataAndTd("IMP-2fp")
          if (impFpForm) {
            const impFpData = extractFormData(impFpForm.div, $)
            imperativeFPlural = { ...impFpData }
            // Extract variations: check both direct child divs AND aux-forms (for hidden variations)
            const impFpVariationsDirect = extractVerbVariations(impFpForm.div, $)
            // Filter out "In modern language, the masculine form is generally used" for imperative feminine plural
            const impFpVariationsAux = extractVariations(impFpForm.td, $, false, true)
            const allImpFpVariations = [...impFpVariationsDirect, ...impFpVariationsAux]
            if (allImpFpVariations.length > 0) {
              imperativeFPlural.variations = allImpFpVariations
            }
          }

          return false // break
        }
      })

      // Remove exclamation marks from imperative forms
      imperativeMSingular = removeExclamationMarks(imperativeMSingular)
      imperativeFSingular = removeExclamationMarks(imperativeFSingular)
      imperativeMPlural = removeExclamationMarks(imperativeMPlural)
      imperativeFPlural = removeExclamationMarks(imperativeFPlural)

      // Parse future tense forms - search for row containing "Future tense"
      // Note: 1st person has only 2 forms: IMPF-1s (singular, used for both m and f) and IMPF-1p (plural, used for both m and f)
      let future1stSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let future1stPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let future2ndMSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let future2ndFSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let future2ndMPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let future2ndFPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let future3rdMSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let future3rdFSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let future3rdMPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let future3rdFPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }

      table.find("tr").each((_, row) => {
        const th = $(row).find("th").first()
        const thText = th.text().trim()
        if (thText.includes("Future tense")) {
          // 1st person - only 2 forms (singular and plural, used for both m and f)
          const fut1sForm = findFormDataAndTd("IMPF-1s")
          if (fut1sForm) {
            const fut1sData = extractFormData(fut1sForm.div, $)
            future1stSingular = { ...fut1sData }
            const fut1sVariationsDirect = extractVerbVariations(fut1sForm.div, $)
            const fut1sVariationsAux = extractVariations(fut1sForm.td, $)
            const allFut1sVariations = [...fut1sVariationsDirect, ...fut1sVariationsAux]
            if (allFut1sVariations.length > 0) {
              future1stSingular.variations = allFut1sVariations
            }
          }

          const fut1pForm = findFormDataAndTd("IMPF-1p")
          if (fut1pForm) {
            const fut1pData = extractFormData(fut1pForm.div, $)
            future1stPlural = { ...fut1pData }
            const fut1pVariationsDirect = extractVerbVariations(fut1pForm.div, $)
            const fut1pVariationsAux = extractVariations(fut1pForm.td, $)
            const allFut1pVariations = [...fut1pVariationsDirect, ...fut1pVariationsAux]
            if (allFut1pVariations.length > 0) {
              future1stPlural.variations = allFut1pVariations
            }
          }

          // 2nd person
          const fut2MsForm = findFormDataAndTd("IMPF-2ms")
          if (fut2MsForm) {
            const fut2MsData = extractFormData(fut2MsForm.div, $)
            future2ndMSingular = { ...fut2MsData }
            const fut2MsVariationsDirect = extractVerbVariations(fut2MsForm.div, $)
            const fut2MsVariationsAux = extractVariations(fut2MsForm.td, $)
            const allFut2MsVariations = [...fut2MsVariationsDirect, ...fut2MsVariationsAux]
            if (allFut2MsVariations.length > 0) {
              future2ndMSingular.variations = allFut2MsVariations
            }
          }

          const fut2FsForm = findFormDataAndTd("IMPF-2fs")
          if (fut2FsForm) {
            const fut2FsData = extractFormData(fut2FsForm.div, $)
            future2ndFSingular = { ...fut2FsData }
            const fut2FsVariationsDirect = extractVerbVariations(fut2FsForm.div, $)
            const fut2FsVariationsAux = extractVariations(fut2FsForm.td, $)
            const allFut2FsVariations = [...fut2FsVariationsDirect, ...fut2FsVariationsAux]
            if (allFut2FsVariations.length > 0) {
              future2ndFSingular.variations = allFut2FsVariations
            }
          }

          const fut2MpForm = findFormDataAndTd("IMPF-2mp")
          if (fut2MpForm) {
            const fut2MpData = extractFormData(fut2MpForm.div, $)
            future2ndMPlural = { ...fut2MpData }
            const fut2MpVariationsDirect = extractVerbVariations(fut2MpForm.div, $)
            const fut2MpVariationsAux = extractVariations(fut2MpForm.td, $)
            const allFut2MpVariations = [...fut2MpVariationsDirect, ...fut2MpVariationsAux]
            if (allFut2MpVariations.length > 0) {
              future2ndMPlural.variations = allFut2MpVariations
            }
          }

          const fut2FpForm = findFormDataAndTd("IMPF-2fp")
          if (fut2FpForm) {
            const fut2FpData = extractFormData(fut2FpForm.div, $)
            future2ndFPlural = { ...fut2FpData }
            const fut2FpVariationsDirect = extractVerbVariations(fut2FpForm.div, $)
            // Filter out "In modern language, the masculine form is generally used" for 2nd person feminine plural
            const fut2FpVariationsAux = extractVariations(fut2FpForm.td, $, false, true)
            const allFut2FpVariations = [...fut2FpVariationsDirect, ...fut2FpVariationsAux]
            if (allFut2FpVariations.length > 0) {
              future2ndFPlural.variations = allFut2FpVariations
            }
          }

          // 3rd person
          const fut3MsForm = findFormDataAndTd("IMPF-3ms")
          if (fut3MsForm) {
            const fut3MsData = extractFormData(fut3MsForm.div, $)
            future3rdMSingular = { ...fut3MsData }
            const fut3MsVariationsDirect = extractVerbVariations(fut3MsForm.div, $)
            const fut3MsVariationsAux = extractVariations(fut3MsForm.td, $)
            const allFut3MsVariations = [...fut3MsVariationsDirect, ...fut3MsVariationsAux]
            if (allFut3MsVariations.length > 0) {
              future3rdMSingular.variations = allFut3MsVariations
            }
          }

          const fut3FsForm = findFormDataAndTd("IMPF-3fs")
          if (fut3FsForm) {
            const fut3FsData = extractFormData(fut3FsForm.div, $)
            future3rdFSingular = { ...fut3FsData }
            const fut3FsVariationsDirect = extractVerbVariations(fut3FsForm.div, $)
            const fut3FsVariationsAux = extractVariations(fut3FsForm.td, $)
            const allFut3FsVariations = [...fut3FsVariationsDirect, ...fut3FsVariationsAux]
            if (allFut3FsVariations.length > 0) {
              future3rdFSingular.variations = allFut3FsVariations
            }
          }

          const fut3MpForm = findFormDataAndTd("IMPF-3mp")
          if (fut3MpForm) {
            const fut3MpData = extractFormData(fut3MpForm.div, $)
            future3rdMPlural = { ...fut3MpData }
            const fut3MpVariationsDirect = extractVerbVariations(fut3MpForm.div, $)
            const fut3MpVariationsAux = extractVariations(fut3MpForm.td, $)
            const allFut3MpVariations = [...fut3MpVariationsDirect, ...fut3MpVariationsAux]
            if (allFut3MpVariations.length > 0) {
              future3rdMPlural.variations = allFut3MpVariations
            }
          }

          const fut3FpForm = findFormDataAndTd("IMPF-3fp")
          if (fut3FpForm) {
            const fut3FpData = extractFormData(fut3FpForm.div, $)
            future3rdFPlural = { ...fut3FpData }
            const fut3FpVariationsDirect = extractVerbVariations(fut3FpForm.div, $)
            // Filter out "In modern language, the masculine form is generally used" for 3rd person feminine plural
            const fut3FpVariationsAux = extractVariations(fut3FpForm.td, $, false, true)
            const allFut3FpVariations = [...fut3FpVariationsDirect, ...fut3FpVariationsAux]
            if (allFut3FpVariations.length > 0) {
              future3rdFPlural.variations = allFut3FpVariations
            }
          }

          return false // break
        }
      })

      // Parse past tense forms - search for row containing "Past tense"
      // Note: 1st person has only 2 forms: PERF-1s (singular, used for both m and f) and PERF-1p (plural, used for both m and f)
      // 3rd person plural has only 1 form: PERF-3p (used for both m and f)
      let past1stSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let past1stPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let past2ndMSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let past2ndFSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let past2ndMPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let past2ndFPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let past3rdMSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let past3rdFSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let past3rdPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }

      table.find("tr").each((_, row) => {
        const th = $(row).find("th").first()
        const thText = th.text().trim()
        if (thText.includes("Past tense")) {
          // 1st person - only 2 forms (singular and plural, used for both m and f)
          const past1sForm = findFormDataAndTd("PERF-1s")
          if (past1sForm) {
            const past1sData = extractFormData(past1sForm.div, $)
            past1stSingular = { ...past1sData }
            const past1sVariationsDirect = extractVerbVariations(past1sForm.div, $)
            const past1sVariationsAux = extractVariations(past1sForm.td, $)
            const allPast1sVariations = [...past1sVariationsDirect, ...past1sVariationsAux]
            if (allPast1sVariations.length > 0) {
              past1stSingular.variations = allPast1sVariations
            }
          }

          const past1pForm = findFormDataAndTd("PERF-1p")
          if (past1pForm) {
            const past1pData = extractFormData(past1pForm.div, $)
            past1stPlural = { ...past1pData }
            const past1pVariationsDirect = extractVerbVariations(past1pForm.div, $)
            const past1pVariationsAux = extractVariations(past1pForm.td, $)
            const allPast1pVariations = [...past1pVariationsDirect, ...past1pVariationsAux]
            if (allPast1pVariations.length > 0) {
              past1stPlural.variations = allPast1pVariations
            }
          }

          // 2nd person
          const past2MsForm = findFormDataAndTd("PERF-2ms")
          if (past2MsForm) {
            const past2MsData = extractFormData(past2MsForm.div, $)
            past2ndMSingular = { ...past2MsData }
            const past2MsVariationsDirect = extractVerbVariations(past2MsForm.div, $)
            const past2MsVariationsAux = extractVariations(past2MsForm.td, $)
            const allPast2MsVariations = [...past2MsVariationsDirect, ...past2MsVariationsAux]
            if (allPast2MsVariations.length > 0) {
              past2ndMSingular.variations = allPast2MsVariations
            }
          }

          const past2FsForm = findFormDataAndTd("PERF-2fs")
          if (past2FsForm) {
            const past2FsData = extractFormData(past2FsForm.div, $)
            past2ndFSingular = { ...past2FsData }
            const past2FsVariationsDirect = extractVerbVariations(past2FsForm.div, $)
            const past2FsVariationsAux = extractVariations(past2FsForm.td, $)
            const allPast2FsVariations = [...past2FsVariationsDirect, ...past2FsVariationsAux]
            if (allPast2FsVariations.length > 0) {
              past2ndFSingular.variations = allPast2FsVariations
            }
          }

          const past2MpForm = findFormDataAndTd("PERF-2mp")
          if (past2MpForm) {
            const past2MpData = extractFormData(past2MpForm.div, $)
            past2ndMPlural = { ...past2MpData }
            const past2MpVariationsDirect = extractVerbVariations(past2MpForm.div, $)
            // Filter out "The ending is usually unstressed in spoken language" for 2nd person masculine plural
            const past2MpVariationsAux = extractVariations(past2MpForm.td, $, true, false)
            const allPast2MpVariations = [...past2MpVariationsDirect, ...past2MpVariationsAux]
            if (allPast2MpVariations.length > 0) {
              past2ndMPlural.variations = allPast2MpVariations
            }
          }

          const past2FpForm = findFormDataAndTd("PERF-2fp")
          if (past2FpForm) {
            const past2FpData = extractFormData(past2FpForm.div, $)
            past2ndFPlural = { ...past2FpData }
            const past2FpVariationsDirect = extractVerbVariations(past2FpForm.div, $)
            // Filter out "The ending is usually unstressed in spoken language" for 2nd person feminine plural
            const past2FpVariationsAux = extractVariations(past2FpForm.td, $, true, false)
            const allPast2FpVariations = [...past2FpVariationsDirect, ...past2FpVariationsAux]
            if (allPast2FpVariations.length > 0) {
              past2ndFPlural.variations = allPast2FpVariations
            }
          }

          // 3rd person
          const past3MsForm = findFormDataAndTd("PERF-3ms")
          if (past3MsForm) {
            const past3MsData = extractFormData(past3MsForm.div, $)
            past3rdMSingular = { ...past3MsData }
            const past3MsVariationsDirect = extractVerbVariations(past3MsForm.div, $)
            const past3MsVariationsAux = extractVariations(past3MsForm.td, $)
            const allPast3MsVariations = [...past3MsVariationsDirect, ...past3MsVariationsAux]
            if (allPast3MsVariations.length > 0) {
              past3rdMSingular.variations = allPast3MsVariations
            }
          }

          const past3FsForm = findFormDataAndTd("PERF-3fs")
          if (past3FsForm) {
            const past3FsData = extractFormData(past3FsForm.div, $)
            past3rdFSingular = { ...past3FsData }
            const past3FsVariationsDirect = extractVerbVariations(past3FsForm.div, $)
            const past3FsVariationsAux = extractVariations(past3FsForm.td, $)
            const allPast3FsVariations = [...past3FsVariationsDirect, ...past3FsVariationsAux]
            if (allPast3FsVariations.length > 0) {
              past3rdFSingular.variations = allPast3FsVariations
            }
          }

          const past3pForm = findFormDataAndTd("PERF-3p")
          if (past3pForm) {
            const past3pData = extractFormData(past3pForm.div, $)
            past3rdPlural = { ...past3pData }
            const past3pVariationsDirect = extractVerbVariations(past3pForm.div, $)
            const past3pVariationsAux = extractVariations(past3pForm.td, $)
            const allPast3pVariations = [...past3pVariationsDirect, ...past3pVariationsAux]
            if (allPast3pVariations.length > 0) {
              past3rdPlural.variations = allPast3pVariations
            }
          }

          return false // break
        }
      })

      // Apply transliteration replacement if enabled
      const processedInfinitive = applyTransliterationReplacement(infinitive, useChToKh, useTzToC)
      const processedMSingular = applyTransliterationReplacement(mSingular, useChToKh, useTzToC)
      const processedFSingular = applyTransliterationReplacement(fSingular, useChToKh, useTzToC)
      const processedMPlural = applyTransliterationReplacement(mPlural, useChToKh, useTzToC)
      const processedFPlural = applyTransliterationReplacement(fPlural, useChToKh, useTzToC)

      const processedImperativeMSingular = applyTransliterationReplacement(imperativeMSingular, useChToKh, useTzToC)
      const processedImperativeFSingular = applyTransliterationReplacement(imperativeFSingular, useChToKh, useTzToC)
      const processedImperativeMPlural = applyTransliterationReplacement(imperativeMPlural, useChToKh, useTzToC)
      const processedImperativeFPlural = applyTransliterationReplacement(imperativeFPlural, useChToKh, useTzToC)

      // For 1st person, use the same form for both m and f (singular and plural)
      const processedFuture1stSingular = applyTransliterationReplacement(future1stSingular, useChToKh, useTzToC)
      const processedFuture1stPlural = applyTransliterationReplacement(future1stPlural, useChToKh, useTzToC)
      const processedFuture1stMSingular = processedFuture1stSingular
      const processedFuture1stMPlural = processedFuture1stPlural
      const processedFuture2ndMSingular = applyTransliterationReplacement(future2ndMSingular, useChToKh, useTzToC)
      const processedFuture2ndFSingular = applyTransliterationReplacement(future2ndFSingular, useChToKh, useTzToC)
      const processedFuture2ndMPlural = applyTransliterationReplacement(future2ndMPlural, useChToKh, useTzToC)
      const processedFuture2ndFPlural = applyTransliterationReplacement(future2ndFPlural, useChToKh, useTzToC)
      const processedFuture3rdMSingular = applyTransliterationReplacement(future3rdMSingular, useChToKh, useTzToC)
      const processedFuture3rdFSingular = applyTransliterationReplacement(future3rdFSingular, useChToKh, useTzToC)
      const processedFuture3rdMPlural = applyTransliterationReplacement(future3rdMPlural, useChToKh, useTzToC)
      const processedFuture3rdFPlural = applyTransliterationReplacement(future3rdFPlural, useChToKh, useTzToC)

      // For 1st person past tense, use the same form for both m and f (singular and plural)
      const processedPast1stSingular = applyTransliterationReplacement(past1stSingular, useChToKh, useTzToC)
      const processedPast1stPlural = applyTransliterationReplacement(past1stPlural, useChToKh, useTzToC)
      const processedPast1stMSingular = processedPast1stSingular
      const processedPast1stMPlural = processedPast1stPlural
      const processedPast2ndMSingular = applyTransliterationReplacement(past2ndMSingular, useChToKh, useTzToC)
      const processedPast2ndFSingular = applyTransliterationReplacement(past2ndFSingular, useChToKh, useTzToC)
      const processedPast2ndMPlural = applyTransliterationReplacement(past2ndMPlural, useChToKh, useTzToC)
      const processedPast2ndFPlural = applyTransliterationReplacement(past2ndFPlural, useChToKh, useTzToC)
      const processedPast3rdMSingular = applyTransliterationReplacement(past3rdMSingular, useChToKh, useTzToC)
      const processedPast3rdFSingular = applyTransliterationReplacement(past3rdFSingular, useChToKh, useTzToC)
      // For 3rd person past tense plural, use the same form for both m and f
      const processedPast3rdPlural = applyTransliterationReplacement(past3rdPlural, useChToKh, useTzToC)
      const processedPast3rdMPlural = processedPast3rdPlural

      // Remove "to " from meaning for imperative only
      // Change "to " to "will " for future tense only
      const imperativeMeaning = (meaning || "").replaceAll("to ", "")
      const futureMeaning = (meaning || "").replaceAll("to ", "will ")

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
        fPlural: processedFPlural,

        imperativeMSingular: processedImperativeMSingular,
        imperativeFSingular: processedImperativeFSingular,
        imperativeMPlural: processedImperativeMPlural,
        imperativeFPlural: processedImperativeFPlural,
        imperativeMeaning: imperativeMeaning,

        past1stMSingular: processedPast1stMSingular,
        past1stMPlural: processedPast1stMPlural,
        past2ndMSingular: processedPast2ndMSingular,
        past2ndFSingular: processedPast2ndFSingular,
        past2ndMPlural: processedPast2ndMPlural,
        past2ndFPlural: processedPast2ndFPlural,
        past3rdMSingular: processedPast3rdMSingular,
        past3rdFSingular: processedPast3rdFSingular,
        past3rdMPlural: processedPast3rdMPlural,

        future1stMSingular: processedFuture1stMSingular,
        future1stMPlural: processedFuture1stMPlural,
        future2ndMSingular: processedFuture2ndMSingular,
        future2ndFSingular: processedFuture2ndFSingular,
        future2ndMPlural: processedFuture2ndMPlural,
        future2ndFPlural: processedFuture2ndFPlural,
        future3rdMSingular: processedFuture3rdMSingular,
        future3rdFSingular: processedFuture3rdFSingular,
        future3rdMPlural: processedFuture3rdMPlural,
        future3rdFPlural: processedFuture3rdFPlural,
        futureMeaning: futureMeaning
      }

      // Generate and save HTML file
      try {
        const html = generateHTML(result)
        const filePath = saveHTMLFile(html, url)
        console.log(`HTML file saved to: ${filePath}`)
        htmlContent = html
      } catch (error) {
        console.error("Error generating HTML file:", error)
      }
    } else {
      // This should never happen due to early return, but TypeScript needs it
      throw new Error(`Unsupported part of speech: ${partOfSpeechToUse}`)
    }

    console.log(JSON.stringify(result, null, 2))

    return NextResponse.json({ ...result, htmlContent })
  } catch (error) {
    console.error("Error parsing page:", error)
    return NextResponse.json(
      { error: "Failed to parse page" },
      { status: 500 }
    )
  }
}

