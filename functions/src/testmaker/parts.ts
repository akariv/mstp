import { PDFDocument } from 'pdf-lib';
import mammoth from 'mammoth';
import type { Part } from '../llm/client';

export const PDF_PAGES_PER_CHUNK = 20;

export interface MaterialChunk {
  label?: string; // e.g. "pages 1-20 of 45"
  parts: Part[];
}

/** Turns an uploaded file into one or more model inputs. Large PDFs are split into page chunks. */
export async function materialToChunks(buf: Buffer, mimeType: string, fileName: string): Promise<MaterialChunk[]> {
  const lower = fileName.toLowerCase();

  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) {
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const total = src.getPageCount();
    if (total <= PDF_PAGES_PER_CHUNK) return [{ parts: [pdfPart(buf, fileName)] }];
    const chunks: MaterialChunk[] = [];
    for (let start = 0; start < total; start += PDF_PAGES_PER_CHUNK) {
      const end = Math.min(total, start + PDF_PAGES_PER_CHUNK);
      const out = await PDFDocument.create();
      const pages = await out.copyPages(src, Array.from({ length: end - start }, (_, i) => start + i));
      pages.forEach((p) => out.addPage(p));
      chunks.push({
        label: `pages ${start + 1}-${end} of ${total}`,
        parts: [pdfPart(Buffer.from(await out.save()), fileName.replace(/\.pdf$/i, `-p${start + 1}.pdf`))],
      });
    }
    return chunks;
  }

  if (mimeType.startsWith('image/')) {
    return [{ parts: [{ type: 'input_image', detail: 'high', image_url: `data:${mimeType};base64,${buf.toString('base64')}` }] }];
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return textChunks(value, fileName);
  }

  if (mimeType.startsWith('text/') || /\.(txt|md|csv|json|html?)$/.test(lower)) {
    return textChunks(buf.toString('utf8'), fileName);
  }

  throw new Error(`Unsupported file type: ${mimeType} (${fileName})`);
}

function pdfPart(buf: Buffer, filename: string): Part {
  return { type: 'input_file', filename, file_data: `data:application/pdf;base64,${buf.toString('base64')}` };
}

const TEXT_CHUNK_CHARS = 150_000;
function textChunks(t: string, fileName: string): MaterialChunk[] {
  const chunks: MaterialChunk[] = [];
  for (let i = 0; i < t.length; i += TEXT_CHUNK_CHARS) {
    chunks.push({
      label: t.length > TEXT_CHUNK_CHARS ? `part ${chunks.length + 1}` : undefined,
      parts: [{ type: 'input_text', text: `FILE: ${fileName}\n\n${t.slice(i, i + TEXT_CHUNK_CHARS)}` }],
    });
  }
  return chunks.length ? chunks : [{ parts: [{ type: 'input_text', text: `FILE: ${fileName}\n\n(empty)` }] }];
}
