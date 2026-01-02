import * as cheerio from "cheerio"
import { TILDE } from "@/app/constants"
import { NIQQUD_REGEX, CH_REGEX, TZ_REGEX } from "@/app/constants/regex"

// Helper function to extract form data (h, hn, t, ti) from a div element
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractFormData(formDiv: cheerio.Cheerio<any>, $: cheerio.CheerioAPI) {
  let h = ""
  let hn = ""
  let t = ""
  let ti = 0

  // Extract Hebrew with niqqud from span.menukad
  const menukadSpan = formDiv.find("span.menukad").first()
  hn = menukadSpan.text().trim()

  // Check if there's a tilde pattern (with and without niqqud)
  const hebrewText = menukadSpan.parent().text().trim()
  if (hebrewText.includes(TILDE)) {
    // Split by tilde, first part is with niqqud, second is without
    const parts = hebrewText.split(TILDE).map((p: string) => p.trim())
    hn = parts[0] || hn
    h = parts[1] || ""
  } else {
    // No tilde, need to strip niqqud from hn
    h = hn.replace(NIQQUD_REGEX, "")
  }

  // Extract transliteration from div.transcription
  const transcriptionDiv = formDiv.find("div.transcription").first()
  t = transcriptionDiv.text().trim()

  // Find the index of bolded character (accented vowel)
  const boldElement = transcriptionDiv.find("b").first()
  if (boldElement.length > 0) {
    let textBeforeBold = ""
    transcriptionDiv.contents().each((_: number, node) => {
      if (node === boldElement[0]) {
        return false // stop when we reach the bold element
      }
      if (node.type === 'text') {
        textBeforeBold += node.data
      } else if (node.type === 'tag') {
        textBeforeBold += $(node).text()
      }
    })
    ti = textBeforeBold.length
  }

  return { h, hn, t, ti }
}

// Helper function to extract variations from a td.conj-td
// filterUnstressedEnding: if true, filter out "The ending is usually unstressed in spoken language" variations
// filterModernLanguage: if true, filter out "In modern language, the masculine form is generally used" variations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractVariations(td: cheerio.Cheerio<any>, $: cheerio.CheerioAPI, filterUnstressedEnding: boolean = false, filterModernLanguage: boolean = false): Array<{ h: string; hn: string; t: string; ti: number }> {
  const variations: Array<{ h: string; hn: string; t: string; ti: number }> = []

  // Look for .popover-host or .aux-forms within the td.conj-td (including hidden ones)
  const popoverHost = td.find("div.popover-host").first()
  // Find aux-forms (Cheerio finds elements regardless of CSS classes like .hidden)
  const auxForms = td.find("div.aux-forms").first()

  // Check if variation exists (either popover-host or aux-forms)
  const hasVariation = popoverHost.length > 0 || auxForms.length > 0

  if (hasVariation) {
    // Try to find variation data in aux-forms first
    let variationContainer = auxForms
    if (auxForms.length === 0 && popoverHost.length > 0) {
      // Look for aux-forms inside popover-host (including hidden ones)
      variationContainer = popoverHost.find("div.aux-forms").first()
    }

    if (variationContainer.length > 0) {
      const containerText = variationContainer.text().trim()
      const shouldFilterModernLanguage = filterModernLanguage && containerText.includes("In modern language, the masculine form is generally used")
      const shouldFilterUnstressedEnding = filterUnstressedEnding && containerText.includes("The ending is usually unstressed in spoken language")

      // Helper function to process a div and extract variation
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const processDiv = (childDiv: any) => {
        const currentDiv = $(childDiv)
        // Look for structured form data (div[id="s"] or div[id="p"] or div[id="ms-a"], etc., or verb forms)
        const varDiv = currentDiv.find('div[id="s"], div[id="p"], div[id="ms-a"], div[id="fs-a"], div[id="mp-a"], div[id="fp-a"], div[id="AP-ms"], div[id="AP-fs"], div[id="AP-mp"], div[id="AP-fp"], div[id="INF-L"], div[id="IMP-2ms"], div[id="IMP-2fs"], div[id="IMP-2mp"], div[id="IMP-2fp"], div[id="IMPF-1s"], div[id="IMPF-1p"], div[id="IMPF-2ms"], div[id="IMPF-2fs"], div[id="IMPF-2mp"], div[id="IMPF-2fp"], div[id="IMPF-3ms"], div[id="IMPF-3fs"], div[id="IMPF-3mp"], div[id="IMPF-3fp"], div[id="PERF-1s"], div[id="PERF-1p"], div[id="PERF-2ms"], div[id="PERF-2fs"], div[id="PERF-2mp"], div[id="PERF-2fp"], div[id="PERF-3ms"], div[id="PERF-3fs"], div[id="PERF-3p"]').first()
        if (varDiv.length > 0) {
          const varForm = extractFormData(varDiv, $)
          variations.push(varForm)
        } else {
          // Fallback: try to find span.menukad and div.transcription directly within the current childDiv
          const varMenukad = currentDiv.find("span.menukad").first()
          const varTranscription = currentDiv.find("span.transcription, div.transcription").first()

          if (varMenukad.length > 0) {
            let varHN = varMenukad.text().trim()
            let varH = ""

            // Check parent for tilde pattern
            const menukadParent = varMenukad.parent()
            const parentText = menukadParent.text().trim()
            if (parentText.includes(TILDE)) {
              const parts = parentText.split(TILDE).map((p: string) => p.trim())
              varHN = parts[0] || varHN
              varH = parts[1] || ""
            } else {
              varH = varHN.replace(NIQQUD_REGEX, "")
            }

            let varT = ""
            let varTI = 0

            if (varTranscription.length > 0) {
              varT = varTranscription.text().trim()
              const varBold = varTranscription.find("b").first()
              if (varBold.length > 0) {
                let textBeforeBold = ""
                varTranscription.contents().each((_: number, node) => {
                  if (node === varBold[0]) {
                    return false
                  }
                  if (node.type === 'text') {
                    textBeforeBold += node.data
                  } else if (node.type === 'tag') {
                    textBeforeBold += $(node).text()
                  }
                })
                varTI = textBeforeBold.length
              }
            }

            variations.push({
              h: varH,
              hn: varHN,
              t: varT,
              ti: varTI
            })
          }
        }
      }

      // If no filtering needed, process all direct child divs
      if (!shouldFilterModernLanguage && !shouldFilterUnstressedEnding) {
        variationContainer.children("div").each((_, childDiv) => {
          processDiv(childDiv)
        })
      } else {
        // Need to filter: iterate through contents and skip from filter text until next text node
        let skipUntilNextText = false
        const filterText = shouldFilterModernLanguage
          ? "In modern language, the masculine form is generally used"
          : "The ending is usually unstressed in spoken language"

        variationContainer.contents().each((_, node) => {
          if (node.type === 'text') {
            const text = $(node).text().trim()
            if (text.includes(filterText)) {
              skipUntilNextText = true
            } else if (skipUntilNextText && text) {
              // Found next text node after filter text, start processing again
              skipUntilNextText = false
            }
          } else if (node.type === 'tag' && node.name === 'div') {
            if (!skipUntilNextText) {
              processDiv(node)
            }
          }
        })
      }
    }
  }

  return variations
}

// Helper function to extract verb variations directly from the form div
// Verb variations are nested directly within the same div (e.g., div[id="AP-fs"] contains multiple divs)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractVerbVariations(formDiv: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): Array<{ h: string; hn: string; t: string; ti: number }> {
  const variations: Array<{ h: string; hn: string; t: string; ti: number }> = []

  // Find all direct child divs that contain span.menukad (these are the variations)
  // Skip the first one as it's the primary form, and skip divs with class "meaning" or "aux-forms"
  formDiv.children("div").each((index, childDiv) => {
    if (index === 0) return // Skip the first div (primary form)

    const variationDiv = $(childDiv)
    // Skip meaning and aux-forms divs (aux-forms are handled by extractVariations)
    if (variationDiv.hasClass("meaning") || variationDiv.hasClass("aux-forms")) {
      return
    }

    const menukadSpan = variationDiv.find("span.menukad").first()
    const transcriptionDiv = variationDiv.find("div.transcription").first()

    if (menukadSpan.length > 0) {
      let varHN = menukadSpan.text().trim()
      let varH = ""

      // Check parent for tilde pattern
      const menukadParent = menukadSpan.parent()
      const parentText = menukadParent.text().trim()
      if (parentText.includes(TILDE)) {
        const parts = parentText.split(TILDE).map((p: string) => p.trim())
        varHN = parts[0] || varHN
        varH = parts[1] || ""
      } else {
        varH = varHN.replace(NIQQUD_REGEX, "")
      }

      let varT = ""
      let varTI = 0

      if (transcriptionDiv.length > 0) {
        varT = transcriptionDiv.text().trim()
        const varBold = transcriptionDiv.find("b").first()
        if (varBold.length > 0) {
          let textBeforeBold = ""
          transcriptionDiv.contents().each((_: number, node) => {
            if (node === varBold[0]) {
              return false
            }
            if (node.type === 'text') {
              textBeforeBold += node.data
            } else if (node.type === 'tag') {
              textBeforeBold += $(node).text()
            }
          })
          varTI = textBeforeBold.length
        }
      }

      variations.push({
        h: varH,
        hn: varHN,
        t: varT,
        ti: varTI
      })
    }
  })

  return variations
}

// Helper function to replace 'ch' with 'kh' in transliterations
export function replaceChWithKh(text: string): string {
  return text.replace(CH_REGEX, 'kh')
}

// Helper function to replace 'tz' with 'c' in transliterations
export function replaceTzWithC(text: string): string {
  return text.replace(TZ_REGEX, 'c')
}

// Helper function to replace 'tz' with 'c' and adjust accent index
// Returns the replaced text and the adjusted index
export function replaceTzWithCAndAdjustIndex(text: string, accentIndex: number): { text: string; accentIndex: number } {
  // Find all positions where 'tz' appears
  const tzPositions: number[] = []
  let searchIndex = 0
  while (true) {
    const index = text.indexOf('tz', searchIndex)
    if (index === -1) break
    tzPositions.push(index)
    searchIndex = index + 1
  }

  // Count how many 'tz' occurrences are before the accent index
  // Each 'tz' becomes 'c' (1 char instead of 2), so we subtract 1 for each 'tz' before the accent
  let adjustedIndex = accentIndex
  for (const tzPos of tzPositions) {
    if (tzPos < accentIndex) {
      adjustedIndex -= 1
    }
  }

  // Replace 'tz' with 'c'
  const replacedText = text.replace(TZ_REGEX, 'c')

  return { text: replacedText, accentIndex: adjustedIndex }
}

// Helper function to remove exclamation marks from imperative forms
export function removeExclamationMarks(form: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> }) {
  const processedH = form.h.replace(/!/g, "").trim()
  const processedHN = form.hn.replace(/!/g, "").trim()
  const processedT = form.t.replace(/!/g, "").trim()
  const processedVariations = form.variations?.map(variation => ({
    ...variation,
    h: variation.h.replace(/!/g, "").trim(),
    hn: variation.hn.replace(/!/g, "").trim(),
    t: variation.t.replace(/!/g, "").trim()
  }))

  return {
    ...form,
    h: processedH,
    hn: processedHN,
    t: processedT,
    variations: processedVariations
  }
}

// Helper function to apply transliteration replacement to a form object
export function applyTransliterationReplacement(form: { h: string; hn: string; t: string; ti: number; variations?: Array<{ h: string; hn: string; t: string; ti: number }> }, useChToKh: boolean, useTzToC: boolean) {
  let processedT = form.t
  let processedTI = form.ti
  let processedVariations = form.variations

  if (useChToKh) {
    processedT = replaceChWithKh(processedT)
    if (processedVariations) {
      processedVariations = processedVariations.map(variation => ({
        ...variation,
        t: replaceChWithKh(variation.t)
      }))
    }
  }

  if (useTzToC) {
    const result = replaceTzWithCAndAdjustIndex(processedT, processedTI)
    processedT = result.text
    processedTI = result.accentIndex
    if (processedVariations) {
      processedVariations = processedVariations.map(variation => {
        const varResult = replaceTzWithCAndAdjustIndex(variation.t, variation.ti)
        return {
          ...variation,
          t: varResult.text,
          ti: varResult.accentIndex
        }
      })
    }
  }

  return {
    ...form,
    t: processedT,
    ti: processedTI,
    variations: processedVariations
  }
}

