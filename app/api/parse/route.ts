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

    // Remove audio speaker icons (🔊) before parsing to prevent them from leaking into extracted text
    $("span.audio-play").remove()

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

    // Check for passive forms header and extract passive binyan
    let passiveBinyan = ""
    let hasPassiveForms = false
    $("h3.page-header").each((_, el) => {
      const headingText = $(el).text().trim()
      if (headingText.startsWith("Passive forms")) {
        hasPassiveForms = true
        const smallSpan = $(el).find("span.small").first()
        if (smallSpan.length > 0) {
          const binyanText = smallSpan.text().trim()
          // Extract binyan name (e.g., "Binyan Pu'al" -> "PU'AL")
          const binyanMatch = binyanText.match(/Binyan\s+(.+)/i)
          if (binyanMatch && binyanMatch[1]) {
            passiveBinyan = binyanMatch[1].trim().toUpperCase()
          }
        }
        return false // break
      }
    })

    // Find the table with conjugation-table class
    const table = $("table.conjugation-table").first()

    // Find passive forms table if it exists

    let passiveTable: cheerio.Cheerio<any> | undefined = undefined
    if (hasPassiveForms) {
      // Find the h3 with "Passive forms" and get the next table
      $("h3.page-header").each((_, el) => {
        const headingText = $(el).text().trim()
        if (headingText.startsWith("Passive forms")) {
          // Find the next table.conjugation-table after this h3
          let nextElement = $(el).next()
          while (nextElement.length > 0) {
            if (nextElement.is("table.conjugation-table")) {
              passiveTable = nextElement
              return false // break outer loop
            }
            nextElement = nextElement.next()
          }
          return false // break
        }
      })
    }

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

      // Check if the page is actually a verb - if so, extract adjective forms from passive participle
      const isVerbPage = detectedPartOfSpeech === "verb"

      if (isVerbPage && hasPassiveForms && passiveTable) {
        // Extract adjective forms from the passive "Present tense / Participle" section
        const findPassiveFormData = (formId: string): { td: cheerio.Cheerio<any>; div: cheerio.Cheerio<any> } | null => {
          const passiveTableRef: cheerio.Cheerio<any> = passiveTable!
          let td: cheerio.Cheerio<any> = passiveTableRef.find(`td[id="${formId}"]`).first()
          let div: cheerio.Cheerio<any> = passiveTableRef.find(`div[id="${formId}"]`).first()

          if (td.length > 0) {
            if (div.length === 0) {
              div = td
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

        // Parse passive present tense forms as adjective forms
        const msForm = findPassiveFormData("passive-AP-ms")
        if (msForm) {
          const msData = extractFormData(msForm.div, $)
          mSingular = { ...msData }
          const msVariations = extractVariations(msForm.td, $)
          if (msVariations.length > 0) {
            mSingular.variations = msVariations
          }
        }

        const fsForm = findPassiveFormData("passive-AP-fs")
        if (fsForm) {
          const fsData = extractFormData(fsForm.div, $)
          fSingular = { ...fsData }
          const fsVariations = extractVariations(fsForm.td, $)
          if (fsVariations.length > 0) {
            fSingular.variations = fsVariations
          }
        }

        const mpForm = findPassiveFormData("passive-AP-mp")
        if (mpForm) {
          const mpData = extractFormData(mpForm.div, $)
          mPlural = { ...mpData }
          const mpVariations = extractVariations(mpForm.td, $)
          if (mpVariations.length > 0) {
            mPlural.variations = mpVariations
          }
        }

        const fpForm = findPassiveFormData("passive-AP-fp")
        if (fpForm) {
          const fpData = extractFormData(fpForm.div, $)
          fPlural = { ...fpData }
          const fpVariations = extractVariations(fpForm.td, $)
          if (fpVariations.length > 0) {
            fPlural.variations = fpVariations
          }
        }

        // Set pattern to "—" for verb-derived adjectives
        pattern = "—"
      } else {
        // Regular adjective parsing
        // Find adjective forms - look for td elements with IDs or divs with IDs
        // Adjectives have IDs: ms-a (masculine singular), fs-a (feminine singular), mp-a (masculine plural), fp-a (feminine plural)
        const findFormData = (formId: string): {

          td: cheerio.Cheerio<any>;

          div: cheerio.Cheerio<any>
        } | null => {
          // Try td with id first

          let td: cheerio.Cheerio<any> = table.find(`td[id="${formId}"]`).first()
          if (td.length === 0) {
            // Try div with id and get its parent td
            const div = table.find(`div[id="${formId}"]`).first()
            if (div.length > 0) {

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
      const findFormDataAndTd = (formId: string, targetTable: cheerio.Cheerio<any> = table): { td: cheerio.Cheerio<any>; div: cheerio.Cheerio<any> } | null => {
        let td: cheerio.Cheerio<any> = targetTable.find(`td[id="${formId}"]`).first()
        let div: cheerio.Cheerio<any> = targetTable.find(`div[id="${formId}"]`).first()

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

      // Helper function to parse all verb forms from a table
      const parseVerbForms = (
        targetTable: cheerio.Cheerio<any>,
        idPrefix: string = "",
        includeInfinitive: boolean = true,
        includeImperative: boolean = true
      ) => {
        const prefixId = (id: string) => idPrefix ? `${idPrefix}${id}` : id

        const result: {
          infinitive?: HebrewFormData
          mSingular?: HebrewFormData
          fSingular?: HebrewFormData
          mPlural?: HebrewFormData
          fPlural?: HebrewFormData
          imperativeMSingular?: HebrewFormData
          imperativeFSingular?: HebrewFormData
          imperativeMPlural?: HebrewFormData
          imperativeFPlural?: HebrewFormData
          past1stMSingular?: HebrewFormData
          past1stMPlural?: HebrewFormData
          past2ndMSingular?: HebrewFormData
          past2ndFSingular?: HebrewFormData
          past2ndMPlural?: HebrewFormData
          past2ndFPlural?: HebrewFormData
          past3rdMSingular?: HebrewFormData
          past3rdFSingular?: HebrewFormData
          past3rdMPlural?: HebrewFormData
          future1stMSingular?: HebrewFormData
          future1stMPlural?: HebrewFormData
          future2ndMSingular?: HebrewFormData
          future2ndFSingular?: HebrewFormData
          future2ndMPlural?: HebrewFormData
          future2ndFPlural?: HebrewFormData
          future3rdMSingular?: HebrewFormData
          future3rdFSingular?: HebrewFormData
          future3rdMPlural?: HebrewFormData
          future3rdFPlural?: HebrewFormData
        } = {}

        // Parse infinitive if needed
        if (includeInfinitive) {
          const infForm = findFormDataAndTd(prefixId("INF-L"), targetTable)
          if (infForm) {
            const infData = extractFormData(infForm.div, $)
            const infVariationsDirect = extractVerbVariations(infForm.div, $)
            const infVariationsAux = extractVariations(infForm.td, $)
            const allInfVariations = [...infVariationsDirect, ...infVariationsAux]
            result.infinitive = { ...infData }
            if (allInfVariations.length > 0) {
              result.infinitive.variations = allInfVariations
            }
          }
        }

        // Parse present tense
        targetTable.find("tr").each((_, row) => {
          const th = $(row).find("th").first()
          const thText = th.text().trim()
          if (thText.includes("Present tense")) {
            const parseForm = (formId: string, key: keyof typeof result) => {
              const form = findFormDataAndTd(prefixId(formId), targetTable)
              if (form) {
                const formData = extractFormData(form.div, $)
                const variationsDirect = extractVerbVariations(form.div, $)
                const variationsAux = extractVariations(form.td, $)
                const allVariations = [...variationsDirect, ...variationsAux]
                result[key] = { ...formData }
                if (allVariations.length > 0) {
                  result[key]!.variations = allVariations
                }
              }
            }

            parseForm("AP-ms", "mSingular")
            parseForm("AP-fs", "fSingular")
            parseForm("AP-mp", "mPlural")
            parseForm("AP-fp", "fPlural")
            return false
          }
        })

        // Parse imperative if needed
        if (includeImperative) {
          targetTable.find("tr").each((_, row) => {
            const th = $(row).find("th").first()
            const thText = th.text().trim()
            if (thText.includes("Imperative")) {
              const parseForm = (formId: string, key: keyof typeof result, filterModernLanguage: boolean = false) => {
                const form = findFormDataAndTd(prefixId(formId), targetTable)
                if (form) {
                  const formData = extractFormData(form.div, $)
                  const variationsDirect = extractVerbVariations(form.div, $)
                  const variationsAux = extractVariations(form.td, $, false, filterModernLanguage)
                  const allVariations = [...variationsDirect, ...variationsAux]
                  let processedData = { ...formData }
                  processedData = removeExclamationMarks(processedData)
                  result[key] = processedData
                  if (allVariations.length > 0) {
                    result[key]!.variations = allVariations
                  }
                }
              }

              parseForm("IMP-2ms", "imperativeMSingular")
              parseForm("IMP-2fs", "imperativeFSingular")
              parseForm("IMP-2mp", "imperativeMPlural")
              parseForm("IMP-2fp", "imperativeFPlural", true)
              return false
            }
          })
        }

        // Parse future tense
        targetTable.find("tr").each((_, row) => {
          const th = $(row).find("th").first()
          const thText = th.text().trim()
          if (thText.includes("Future tense")) {
            const parseForm = (formId: string, key: keyof typeof result, filterModernLanguage: boolean = false) => {
              const form = findFormDataAndTd(prefixId(formId), targetTable)
              if (form) {
                const formData = extractFormData(form.div, $)
                const variationsDirect = extractVerbVariations(form.div, $)
                const variationsAux = extractVariations(form.td, $, false, filterModernLanguage)
                const allVariations = [...variationsDirect, ...variationsAux]
                result[key] = { ...formData }
                if (allVariations.length > 0) {
                  result[key]!.variations = allVariations
                }
              }
            }

            parseForm("IMPF-1s", "future1stMSingular")
            parseForm("IMPF-1p", "future1stMPlural")
            parseForm("IMPF-2ms", "future2ndMSingular")
            parseForm("IMPF-2fs", "future2ndFSingular")
            parseForm("IMPF-2mp", "future2ndMPlural")
            parseForm("IMPF-2fp", "future2ndFPlural", true)
            parseForm("IMPF-3ms", "future3rdMSingular")
            parseForm("IMPF-3fs", "future3rdFSingular")
            parseForm("IMPF-3mp", "future3rdMPlural")
            parseForm("IMPF-3fp", "future3rdFPlural", true)
            return false
          }
        })

        // Parse past tense
        targetTable.find("tr").each((_, row) => {
          const th = $(row).find("th").first()
          const thText = th.text().trim()
          if (thText.includes("Past tense")) {
            const parseForm = (formId: string, key: keyof typeof result, filterUnstressed: boolean = false) => {
              const form = findFormDataAndTd(prefixId(formId), targetTable)
              if (form) {
                const formData = extractFormData(form.div, $)
                const variationsDirect = extractVerbVariations(form.div, $)
                const variationsAux = extractVariations(form.td, $, filterUnstressed, false)
                const allVariations = [...variationsDirect, ...variationsAux]
                result[key] = { ...formData }
                if (allVariations.length > 0) {
                  result[key]!.variations = allVariations
                }
              }
            }

            parseForm("PERF-1s", "past1stMSingular")
            parseForm("PERF-1p", "past1stMPlural")
            parseForm("PERF-2ms", "past2ndMSingular")
            parseForm("PERF-2fs", "past2ndFSingular")
            parseForm("PERF-2mp", "past2ndMPlural", true)
            parseForm("PERF-2fp", "past2ndFPlural", true)
            parseForm("PERF-3ms", "past3rdMSingular")
            parseForm("PERF-3fs", "past3rdFSingular")
            parseForm("PERF-3p", "past3rdMPlural")
            return false
          }
        })

        return result
      }

      // Parse active forms using helper function
      const activeForms = parseVerbForms(table, "", true, true)
      infinitive = activeForms.infinitive || infinitive
      mSingular = activeForms.mSingular || mSingular
      fSingular = activeForms.fSingular || fSingular
      mPlural = activeForms.mPlural || mPlural
      fPlural = activeForms.fPlural || fPlural

      const imperativeMSingular: HebrewFormData = activeForms.imperativeMSingular || { h: "", hn: "", t: "", ti: 0 }
      const imperativeFSingular: HebrewFormData = activeForms.imperativeFSingular || { h: "", hn: "", t: "", ti: 0 }
      const imperativeMPlural: HebrewFormData = activeForms.imperativeMPlural || { h: "", hn: "", t: "", ti: 0 }
      const imperativeFPlural: HebrewFormData = activeForms.imperativeFPlural || { h: "", hn: "", t: "", ti: 0 }

      const future1stSingular: HebrewFormData = activeForms.future1stMSingular || { h: "", hn: "", t: "", ti: 0 }
      const future1stPlural: HebrewFormData = activeForms.future1stMPlural || { h: "", hn: "", t: "", ti: 0 }
      const future2ndMSingular: HebrewFormData = activeForms.future2ndMSingular || { h: "", hn: "", t: "", ti: 0 }
      const future2ndFSingular: HebrewFormData = activeForms.future2ndFSingular || { h: "", hn: "", t: "", ti: 0 }
      const future2ndMPlural: HebrewFormData = activeForms.future2ndMPlural || { h: "", hn: "", t: "", ti: 0 }
      const future2ndFPlural: HebrewFormData = activeForms.future2ndFPlural || { h: "", hn: "", t: "", ti: 0 }
      const future3rdMSingular: HebrewFormData = activeForms.future3rdMSingular || { h: "", hn: "", t: "", ti: 0 }
      const future3rdFSingular: HebrewFormData = activeForms.future3rdFSingular || { h: "", hn: "", t: "", ti: 0 }
      const future3rdMPlural: HebrewFormData = activeForms.future3rdMPlural || { h: "", hn: "", t: "", ti: 0 }
      const future3rdFPlural: HebrewFormData = activeForms.future3rdFPlural || { h: "", hn: "", t: "", ti: 0 }

      const past1stSingular: HebrewFormData = activeForms.past1stMSingular || { h: "", hn: "", t: "", ti: 0 }
      const past1stPlural: HebrewFormData = activeForms.past1stMPlural || { h: "", hn: "", t: "", ti: 0 }
      const past2ndMSingular: HebrewFormData = activeForms.past2ndMSingular || { h: "", hn: "", t: "", ti: 0 }
      const past2ndFSingular: HebrewFormData = activeForms.past2ndFSingular || { h: "", hn: "", t: "", ti: 0 }
      const past2ndMPlural: HebrewFormData = activeForms.past2ndMPlural || { h: "", hn: "", t: "", ti: 0 }
      const past2ndFPlural: HebrewFormData = activeForms.past2ndFPlural || { h: "", hn: "", t: "", ti: 0 }
      const past3rdMSingular: HebrewFormData = activeForms.past3rdMSingular || { h: "", hn: "", t: "", ti: 0 }
      const past3rdFSingular: HebrewFormData = activeForms.past3rdFSingular || { h: "", hn: "", t: "", ti: 0 }
      const past3rdPlural: HebrewFormData = activeForms.past3rdMPlural || { h: "", hn: "", t: "", ti: 0 }

      // Parse passive forms if they exist
      let passiveMSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passiveFSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passiveMPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passiveFPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passivePast1stSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passivePast1stPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passivePast2ndMSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passivePast2ndFSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passivePast2ndMPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passivePast2ndFPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passivePast3rdMSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passivePast3rdFSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passivePast3rdPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passiveFuture1stSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passiveFuture1stPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passiveFuture2ndMSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passiveFuture2ndFSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passiveFuture2ndMPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passiveFuture2ndFPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passiveFuture3rdMSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passiveFuture3rdFSingular: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passiveFuture3rdMPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }
      let passiveFuture3rdFPlural: HebrewFormData = { h: "", hn: "", t: "", ti: 0 }

      if (hasPassiveForms && passiveTable) {
        const passiveTableRef: cheerio.Cheerio<any> = passiveTable
        const passiveForms = parseVerbForms(passiveTableRef, "passive-", false, false)

        passiveMSingular = passiveForms.mSingular || passiveMSingular
        passiveFSingular = passiveForms.fSingular || passiveFSingular
        passiveMPlural = passiveForms.mPlural || passiveMPlural
        passiveFPlural = passiveForms.fPlural || passiveFPlural
        passivePast1stSingular = passiveForms.past1stMSingular || passivePast1stSingular
        passivePast1stPlural = passiveForms.past1stMPlural || passivePast1stPlural
        passivePast2ndMSingular = passiveForms.past2ndMSingular || passivePast2ndMSingular
        passivePast2ndFSingular = passiveForms.past2ndFSingular || passivePast2ndFSingular
        passivePast2ndMPlural = passiveForms.past2ndMPlural || passivePast2ndMPlural
        passivePast2ndFPlural = passiveForms.past2ndFPlural || passivePast2ndFPlural
        passivePast3rdMSingular = passiveForms.past3rdMSingular || passivePast3rdMSingular
        passivePast3rdFSingular = passiveForms.past3rdFSingular || passivePast3rdFSingular
        passivePast3rdPlural = passiveForms.past3rdMPlural || passivePast3rdPlural
        passiveFuture1stSingular = passiveForms.future1stMSingular || passiveFuture1stSingular
        passiveFuture1stPlural = passiveForms.future1stMPlural || passiveFuture1stPlural
        passiveFuture2ndMSingular = passiveForms.future2ndMSingular || passiveFuture2ndMSingular
        passiveFuture2ndFSingular = passiveForms.future2ndFSingular || passiveFuture2ndFSingular
        passiveFuture2ndMPlural = passiveForms.future2ndMPlural || passiveFuture2ndMPlural
        passiveFuture2ndFPlural = passiveForms.future2ndFPlural || passiveFuture2ndFPlural
        passiveFuture3rdMSingular = passiveForms.future3rdMSingular || passiveFuture3rdMSingular
        passiveFuture3rdFSingular = passiveForms.future3rdFSingular || passiveFuture3rdFSingular
        passiveFuture3rdMPlural = passiveForms.future3rdMPlural || passiveFuture3rdMPlural
        passiveFuture3rdFPlural = passiveForms.future3rdFPlural || passiveFuture3rdFPlural
      }

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

      // Process passive forms if they exist
      const processedPassiveMSingular = applyTransliterationReplacement(passiveMSingular, useChToKh, useTzToC)
      const processedPassiveFSingular = applyTransliterationReplacement(passiveFSingular, useChToKh, useTzToC)
      const processedPassiveMPlural = applyTransliterationReplacement(passiveMPlural, useChToKh, useTzToC)
      const processedPassiveFPlural = applyTransliterationReplacement(passiveFPlural, useChToKh, useTzToC)

      const processedPassivePast1stMSingular = applyTransliterationReplacement(passivePast1stSingular, useChToKh, useTzToC)
      const processedPassivePast1stMPlural = applyTransliterationReplacement(passivePast1stPlural, useChToKh, useTzToC)
      const processedPassivePast2ndMSingular = applyTransliterationReplacement(passivePast2ndMSingular, useChToKh, useTzToC)
      const processedPassivePast2ndFSingular = applyTransliterationReplacement(passivePast2ndFSingular, useChToKh, useTzToC)
      const processedPassivePast2ndMPlural = applyTransliterationReplacement(passivePast2ndMPlural, useChToKh, useTzToC)
      const processedPassivePast2ndFPlural = applyTransliterationReplacement(passivePast2ndFPlural, useChToKh, useTzToC)
      const processedPassivePast3rdMSingular = applyTransliterationReplacement(passivePast3rdMSingular, useChToKh, useTzToC)
      const processedPassivePast3rdFSingular = applyTransliterationReplacement(passivePast3rdFSingular, useChToKh, useTzToC)
      const processedPassivePast3rdMPlural = applyTransliterationReplacement(passivePast3rdPlural, useChToKh, useTzToC)

      const processedPassiveFuture1stMSingular = applyTransliterationReplacement(passiveFuture1stSingular, useChToKh, useTzToC)
      const processedPassiveFuture1stMPlural = applyTransliterationReplacement(passiveFuture1stPlural, useChToKh, useTzToC)
      const processedPassiveFuture2ndMSingular = applyTransliterationReplacement(passiveFuture2ndMSingular, useChToKh, useTzToC)
      const processedPassiveFuture2ndFSingular = applyTransliterationReplacement(passiveFuture2ndFSingular, useChToKh, useTzToC)
      const processedPassiveFuture2ndMPlural = applyTransliterationReplacement(passiveFuture2ndMPlural, useChToKh, useTzToC)
      const processedPassiveFuture2ndFPlural = applyTransliterationReplacement(passiveFuture2ndFPlural, useChToKh, useTzToC)
      const processedPassiveFuture3rdMSingular = applyTransliterationReplacement(passiveFuture3rdMSingular, useChToKh, useTzToC)
      const processedPassiveFuture3rdFSingular = applyTransliterationReplacement(passiveFuture3rdFSingular, useChToKh, useTzToC)
      const processedPassiveFuture3rdMPlural = applyTransliterationReplacement(passiveFuture3rdMPlural, useChToKh, useTzToC)
      const processedPassiveFuture3rdFPlural = applyTransliterationReplacement(passiveFuture3rdFPlural, useChToKh, useTzToC)

      // Remove "to " from meaning for imperative only
      // Change "to " to "will " for future tense only
      const imperativeMeaning = (meaning || "").replaceAll("to ", "")
      const futureMeaning = (meaning || "").replaceAll("to ", "will ")
      const passiveFutureMeaning = hasPassiveForms ? (meaning || "").replaceAll("to ", "will be ") : undefined

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
        futureMeaning: futureMeaning,

        // Passive forms
        passiveBinyan: passiveBinyan || undefined,
        passiveMSingular: processedPassiveMSingular.h || processedPassiveMSingular.hn ? processedPassiveMSingular : undefined,
        passiveFSingular: processedPassiveFSingular.h || processedPassiveFSingular.hn ? processedPassiveFSingular : undefined,
        passiveMPlural: processedPassiveMPlural.h || processedPassiveMPlural.hn ? processedPassiveMPlural : undefined,
        passiveFPlural: processedPassiveFPlural.h || processedPassiveFPlural.hn ? processedPassiveFPlural : undefined,
        passivePast1stMSingular: processedPassivePast1stMSingular.h || processedPassivePast1stMSingular.hn ? processedPassivePast1stMSingular : undefined,
        passivePast1stMPlural: processedPassivePast1stMPlural.h || processedPassivePast1stMPlural.hn ? processedPassivePast1stMPlural : undefined,
        passivePast2ndMSingular: processedPassivePast2ndMSingular.h || processedPassivePast2ndMSingular.hn ? processedPassivePast2ndMSingular : undefined,
        passivePast2ndFSingular: processedPassivePast2ndFSingular.h || processedPassivePast2ndFSingular.hn ? processedPassivePast2ndFSingular : undefined,
        passivePast2ndMPlural: processedPassivePast2ndMPlural.h || processedPassivePast2ndMPlural.hn ? processedPassivePast2ndMPlural : undefined,
        passivePast2ndFPlural: processedPassivePast2ndFPlural.h || processedPassivePast2ndFPlural.hn ? processedPassivePast2ndFPlural : undefined,
        passivePast3rdMSingular: processedPassivePast3rdMSingular.h || processedPassivePast3rdMSingular.hn ? processedPassivePast3rdMSingular : undefined,
        passivePast3rdFSingular: processedPassivePast3rdFSingular.h || processedPassivePast3rdFSingular.hn ? processedPassivePast3rdFSingular : undefined,
        passivePast3rdMPlural: processedPassivePast3rdMPlural.h || processedPassivePast3rdMPlural.hn ? processedPassivePast3rdMPlural : undefined,
        passiveFuture1stMSingular: processedPassiveFuture1stMSingular.h || processedPassiveFuture1stMSingular.hn ? processedPassiveFuture1stMSingular : undefined,
        passiveFuture1stMPlural: processedPassiveFuture1stMPlural.h || processedPassiveFuture1stMPlural.hn ? processedPassiveFuture1stMPlural : undefined,
        passiveFuture2ndMSingular: processedPassiveFuture2ndMSingular.h || processedPassiveFuture2ndMSingular.hn ? processedPassiveFuture2ndMSingular : undefined,
        passiveFuture2ndFSingular: processedPassiveFuture2ndFSingular.h || processedPassiveFuture2ndFSingular.hn ? processedPassiveFuture2ndFSingular : undefined,
        passiveFuture2ndMPlural: processedPassiveFuture2ndMPlural.h || processedPassiveFuture2ndMPlural.hn ? processedPassiveFuture2ndMPlural : undefined,
        passiveFuture2ndFPlural: processedPassiveFuture2ndFPlural.h || processedPassiveFuture2ndFPlural.hn ? processedPassiveFuture2ndFPlural : undefined,
        passiveFuture3rdMSingular: processedPassiveFuture3rdMSingular.h || processedPassiveFuture3rdMSingular.hn ? processedPassiveFuture3rdMSingular : undefined,
        passiveFuture3rdFSingular: processedPassiveFuture3rdFSingular.h || processedPassiveFuture3rdFSingular.hn ? processedPassiveFuture3rdFSingular : undefined,
        passiveFuture3rdMPlural: processedPassiveFuture3rdMPlural.h || processedPassiveFuture3rdMPlural.hn ? processedPassiveFuture3rdMPlural : undefined,
        passiveFuture3rdFPlural: processedPassiveFuture3rdFPlural.h || processedPassiveFuture3rdFPlural.hn ? processedPassiveFuture3rdFPlural : undefined,
        passiveFutureMeaning: passiveFutureMeaning
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

