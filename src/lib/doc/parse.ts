'use client'

import Tesseract from 'tesseract.js'

export type ParseProgress = (stage: string, pct?: number) => void

export function detectKind(file: File): 'text' | 'pdf' | 'image' | 'unsupported' {
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff?)$/.test(name)) return 'image'
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (
    type.startsWith('text/') ||
    /\.(txt|md|markdown|csv|json|rtf)$/.test(name)
  )
    return 'text'
  return 'unsupported'
}

/** Extract raw text from a medical document (TXT/MD client, PDF server, image OCR). */
export async function extractText(
  file: File,
  onProgress?: ParseProgress,
  authHeader?: string | null,
): Promise<string> {
  const kind = detectKind(file)

  if (kind === 'text') {
    onProgress?.('Reading text', 50)
    const text = await file.text()
    onProgress?.('Reading text', 100)
    return text
  }

  if (kind === 'pdf') {
    onProgress?.('Extracting PDF text', 30)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/parse', {
      method: 'POST',
      body: form,
      headers: authHeader ? { 'x-medivault-auth': authHeader } : {},
    })
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({ error: 'PDF parse failed' }))
      throw new Error(error)
    }
    const { text } = (await res.json()) as { text: string }
    onProgress?.('Extracting PDF text', 100)
    return text
  }

  if (kind === 'image') {
    onProgress?.('Running OCR', 5)
    const result = await Tesseract.recognize(file, 'eng', {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') {
          onProgress?.('Running OCR', Math.round(m.progress * 100))
        }
      },
    })
    return result.data.text
  }

  throw new Error(
    'Unsupported file type. Upload a TXT, MD, PDF, or an image (PNG/JPG).',
  )
}
