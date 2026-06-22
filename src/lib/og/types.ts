export type DocType =
  | 'lab_report'
  | 'prescription'
  | 'discharge_summary'
  | 'imaging'
  | 'other'

export const DOC_TYPES: DocType[] = [
  'lab_report',
  'prescription',
  'discharge_summary',
  'imaging',
  'other',
]

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  lab_report: 'Lab report',
  prescription: 'Prescription',
  discharge_summary: 'Discharge summary',
  imaging: 'Imaging report',
  other: 'Other',
}

/** Metadata stored in the decentralized 0G-KV index. */
export type RecordMeta = {
  id: string
  owner: string // wallet address
  title: string
  docType: DocType
  date: string | null
  rootHash: string // 0G merkle root of the encrypted document
  summaryRootHash?: string // 0G merkle root of the encrypted AI summary JSON
  // Hex-encoded HKDF salt used to derive a per-record AES key. Absent on
  // records written before per-record keys existed; those decrypt with the
  // wallet master key directly (see recordKey()).
  recordKeySalt?: string
  // Original uploaded file's name + MIME type, so the exact file (PDF, image,
  // etc.) can be re-downloaded with the correct extension and opened natively.
  // Absent on records uploaded before this was tracked (fall back to .txt).
  fileName?: string
  mimeType?: string
  // Keccak-256 of the original (pre-encryption) file bytes, used to detect and
  // skip duplicate uploads of the same document. Absent on records uploaded
  // before content-addressing existed.
  contentHash?: string
  createdAt: string
}

export type LabFlag = 'low' | 'normal' | 'high' | 'unknown'
export type Severity = 'low' | 'medium' | 'high'

export type Condition = { name: string; status: string; note: string }
export type Medication = {
  name: string
  dose: string
  frequency: string
  purpose: string
}
export type LabResult = {
  test: string
  value: string
  unit: string
  referenceRange: string
  flag: LabFlag
}
export type FollowUp = {
  action: string
  byDate: string | null
  priority: Severity
}
export type RedFlag = { issue: string; severity: Severity; suggestion: string }
export type SourceQuote = { quote: string; supports: string }

/** The exact AI output JSON contract. */
export type ExtractionResult = {
  title: string
  docType: DocType
  date: string | null
  plainLanguageSummary: string
  conditions: Condition[]
  medications: Medication[]
  labResults: LabResult[]
  allergies: string[]
  remedies: string[]
  followUps: FollowUp[]
  redFlags: RedFlag[]
  confidence: number
  sourceQuotes: SourceQuote[]
}

/** A fully-hydrated record = index metadata + decrypted summary. */
export type VaultRecord = {
  meta: RecordMeta
  summary?: ExtractionResult
}

export const EMPTY_EXTRACTION: ExtractionResult = {
  title: 'Untitled record',
  docType: 'other',
  date: null,
  plainLanguageSummary: '',
  conditions: [],
  medications: [],
  labResults: [],
  allergies: [],
  remedies: [],
  followUps: [],
  redFlags: [],
  confidence: 0,
  sourceQuotes: [],
}

export type ReceivedRecord = {
  id: string
  rootHash: string
  senderName: string
  senderAddress: string
  docType: DocType
  title: string
  date: string | null
  sharedAt: string
}

