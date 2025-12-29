// CSS style constants for HTML table generation

// Base styles
export const FF = "font-family: 'Helvetica Neue', Arial, sans-serif;"
export const VA = "vertical-align: middle;"
export const TAL = "text-align: left;"
export const TAC = "text-align: center;"
export const RTL = "direction: rtl;"

// Font sizes
export const FS825 = "font-size: 8.25pt;"
export const FS9 = "font-size: 9pt;"
export const FS975 = "font-size: 9.75pt;"

// Padding
export const P0 = "padding: 0px;"
export const P0_4 = "padding: 0px 4px;"
export const P2_0 = "padding: 2px 0px;"

// Font weight
export const FWB = "font-weight: bold;"

// Combined styles for common cell types
export const MEANING_CELL = `${FF} ${FS9} ${VA} ${TAL} ${P0_4}`
export const PERSON_CELL = `${FF} ${FS9} ${TAC} ${VA}`
export const HEBREW_FIRST_ROW = `${FF} ${FS975} ${RTL} ${TAC} ${VA} ${P2_0}`
export const TRANSLITERATION_ROW = `${FF} ${FS825} ${TAC} ${VA}`
export const ROOT_CELL = `${FF} ${FS9} ${FWB} ${VA} ${TAC} ${P0}`
export const BINYAN_CELL = `${FF} ${FS9} ${FWB} ${VA} ${TAC} ${P0}`
export const PATTERN_CELL = `${FF} ${FS825} ${TAC} ${VA}`
