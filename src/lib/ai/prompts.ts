// System prompts implemented inside the app, per the MediVault spec.

export const EXTRACTION_SYSTEM_PROMPT =
  'You are a careful medical-document explainer. Extract and explain in plain ' +
  'language for a non-medical person. Return valid JSON only matching the ' +
  'provided schema. Never invent facts; use null if unknown. Always include ' +
  'source quotes. You are NOT giving medical advice \u2014 only organizing and ' +
  'explaining. Recommend the user consult a clinician for decisions.'

export const CHAT_SYSTEM_PROMPT =
  'You are MediVault, a private health-record assistant. Answer ONLY from the ' +
  "user's stored records. Be clear and plain-language. Always cite which record " +
  'supports your answer. You do not give medical diagnoses or treatment advice; ' +
  'recommend consulting a clinician. If the answer isn\u2019t in the records, say so.'

export const EXTRACTION_SCHEMA_HINT = `Return ONLY a JSON object with EXACTLY this shape (no markdown, no commentary):
{
  "title": string,
  "docType": "lab_report" | "prescription" | "discharge_summary" | "imaging" | "other",
  "date": string | null,
  "plainLanguageSummary": string,
  "conditions": [{ "name": string, "status": string, "note": string }],
  "medications": [{ "name": string, "dose": string, "frequency": string, "purpose": string }],
  "labResults": [{ "test": string, "value": string, "unit": string, "referenceRange": string, "flag": "low"|"normal"|"high"|"unknown" }],
  "allergies": string[],
  "remedies": string[],
  "followUps": [{ "action": string, "byDate": string | null, "priority": "low"|"medium"|"high" }],
  "redFlags": [{ "issue": string, "severity": "low"|"medium"|"high", "suggestion": string }],
  "confidence": number,
  "sourceQuotes": [{ "quote": string, "supports": string }]
}
IMPORTANT: The output must be strictly valid JSON. Do NOT include any trailing commas or // comments in your response.`

export function languageInstruction(language?: string, isChat?: boolean): string {
  if (!language || language.toLowerCase() === 'english') return ''
  if (isChat) {
    return `\n\nYou MUST write your entire response strictly in ${language}. Use the native alphabet/script of ${language}.`
  }
  return `\n\nWrite ALL human-readable text (summary, notes, suggestions) strictly in ${language} using its native script. Keep JSON keys and enum values in English.`
}

export function eli5Instruction(eli5?: boolean): string {
  if (!eli5) return ''
  return '\n\nExplain everything as if to a curious 5-year-old: very short sentences, simple words, gentle and reassuring tone. Keep medical names but always explain what they mean.'
}

export function buildExtractionUserPrompt(
  documentText: string,
  language?: string,
  eli5?: boolean,
): string {
  return (
    EXTRACTION_SCHEMA_HINT +
    languageInstruction(language) +
    eli5Instruction(eli5) +
    '\n\n--- MEDICAL DOCUMENT TEXT START ---\n' +
    documentText.slice(0, 24000) +
    '\n--- MEDICAL DOCUMENT TEXT END ---'
  )
}
