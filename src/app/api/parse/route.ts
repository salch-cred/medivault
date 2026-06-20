import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/server/auth'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_PDF_BYTES = 10 * 1024 * 1024 // 10 MB

// Server-side PDF text extraction with pdf-parse. TXT/MD are handled in the
// browser; images are OCR'd in the browser with tesseract.js. PDFs come here
// because pdf-parse depends on Node built-ins.
export async function POST(req: NextRequest) {
  try {
    const auth = verifyAuth(req)
    if (!auth.ok) return auth.response

    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 })
    }

    // Validate type and size before touching pdf-parse with untrusted input.
    const typeOk =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!typeOk) {
      return NextResponse.json({ error: 'Only PDF files are accepted.' }, { status: 400 })
    }
    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: 'PDF is too large (max 10 MB).' }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    // Lazy import keeps pdf-parse out of the edge/runtime bundle.
    const pdfParse = (await import('pdf-parse')).default
    const parsed = await pdfParse(buffer)
    return NextResponse.json({ text: parsed.text ?? '' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PDF parsing failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
