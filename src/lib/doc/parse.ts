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
 * Images are OCR'd entirely in the browser with tesseract.js so the AI explainer
 * receives real text instead of an empty stub (which previously produced a 0%
 * confidence "basic record summary"). OCR runs client-side; the image is only
 * encrypted and uploaded to 0G after. If OCR fails for any reason it is
 * non-fatal: we fall back to a small metadata summary so the encrypted original
 * still uploads to 0G.
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
    return extractImageText(file, onProgress)
  }

  throw new Error(
    'Unsupported file type. Upload a TXT, MD, PDF, or an image (PNG/JPG).',
  )
}

function imageMetadataSummary(file: File, reason: string): string {
  return [
    `Image file uploaded: ${file.name}`,
    file.type ? `MIME type: ${file.type}` : '',
    `Size: ${file.size} bytes`,
    reason,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * OCR an image entirely in the browser using tesseract.js.
 *
 * We pin the worker / core / language assets to a versioned CDN. tesseract.js
 * otherwise guesses asset URLs that can change between releases and 404, which
 * previously broke uploads. Any failure here is non-fatal: we return a metadata
 * summary so the encrypted original still uploads to 0G.
 */
async function extractImageText(
  file: File,
  onProgress?: ParseProgress,
): Promise<string> {
  onProgress?.('Reading image (OCR)', 10)
  try {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('eng', 1, {
      workerPath:
        'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5',
      langPath: 'https://tessdata.projectnaptha.com/4.0.0',
      logger: (m: { status?: string; progress?: number }) => {
        if (m?.status === 'recognizing text') {
          const pct = 10 + Math.round((m.progress ?? 0) * 85)
          onProgress?.('Reading image (OCR)', Math.min(95, pct))
        }
      },
    })

    try {
      const {
        data: { text },
      } = await worker.recognize(file)
      onProgress?.('Reading image (OCR)', 100)
      const trimmed = (text ?? '').replace(/[ \t]+\n/g, '\n').trim()
      if (trimmed.length >= 12) {
        return [
          `Image document: ${file.name}`,
          file.type ? `MIME type: ${file.type}` : '',
          '',
          'Text recognized from the image via on-device OCR:',
          '',
          trimmed,
        ]
          .filter(Boolean)
          .join('\n')
      }
      // OCR ran but found little/no legible text (e.g. a non-document photo).
      return imageMetadataSummary(
        file,
        'On-device OCR did not find readable text in this image, so MediVault saved a basic record summary instead. The encrypted original is still stored on 0G.',
      )
    } finally {
      await worker.terminate()
    }
  } catch (err) {
    console.warn('Image OCR failed; falling back to a metadata summary:', err)
    return imageMetadataSummary(
      file,
      'Automatic image text recognition was unavailable, so MediVault saved a basic record summary instead. The encrypted original is still stored on 0G.',
    )
  }
}
