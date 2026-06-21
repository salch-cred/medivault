'use client'

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

/**
 * Extract raw text from a medical document.
 *
 * Important reliability rule: this function must never depend on browser-side
 * CDN workers. The previous Tesseract path tried to load worker scripts from
 * cdn.jsdelivr.net and broke uploads when those workers failed. Image OCR is now
 * a safe metadata fallback so the encrypted original still uploads to 0G.
 */
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
    onProgress?.('Preparing image', 100)
    return [
      `Image file uploaded: ${file.name}`,
      file.type ? `MIME type: ${file.type}` : '',
      `Size: ${file.size} bytes`,
      'Browser OCR is unavailable in this deployment, so the original image will be encrypted and stored on 0G with a basic record summary.',
    ].filter(Boolean).join('\n')
  }

  throw new Error(
    'Unsupported file type. Upload a TXT, MD, PDF, or an image (PNG/JPG).',
  )
}
