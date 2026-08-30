import path from 'node:path';

import { fileTypeFromBuffer } from 'file-type';
import { unzipSync } from 'fflate';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

import { AppError } from '../../shared/app-error.js';

export type SupportedExtension = 'pdf' | 'docx' | 'pptx' | 'txt';

const mimeTypes: Record<SupportedExtension, Set<string>> = {
  pdf: new Set(['application/pdf']),
  docx: new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  pptx: new Set(['application/vnd.openxmlformats-officedocument.presentationml.presentation']),
  txt: new Set(['text/plain']),
};

const MAX_ARCHIVE_EXPANDED_BYTES = 100 * 1024 * 1024;

function assertArchiveExpansionBounded(buffer: Uint8Array): void {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let totalSize = 0;
  for (let offset = 0; offset + 46 <= buffer.byteLength; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    totalSize += view.getUint32(offset + 24, true);
    if (totalSize > MAX_ARCHIVE_EXPANDED_BYTES) {
      throw new AppError(413, 'MATERIAL_ARCHIVE_TOO_LARGE', 'The expanded document is too large to process safely.');
    }
  }
}

function archiveEntries(buffer: Uint8Array): Record<string, Uint8Array> {
  assertArchiveExpansionBounded(buffer);
  try {
    return unzipSync(buffer);
  } catch {
    throw new AppError(400, 'MATERIAL_SIGNATURE_INVALID', 'The file content does not match its extension.');
  }
}

export async function validateUpload(input: {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{ extension: SupportedExtension }> {
  const extension = path.extname(input.originalName).slice(1).toLowerCase();
  if (!['pdf', 'docx', 'pptx', 'txt'].includes(extension)) {
    throw new AppError(400, 'MATERIAL_TYPE_UNSUPPORTED', 'Upload a PDF, DOCX, PPTX, or TXT file.');
  }
  const typedExtension = extension as SupportedExtension;
  if (!mimeTypes[typedExtension].has(input.mimeType)) {
    throw new AppError(400, 'MATERIAL_MIME_INVALID', 'The declared file type is not allowed.');
  }

  if (typedExtension === 'txt') {
    if (input.buffer.includes(0)) {
      throw new AppError(400, 'MATERIAL_SIGNATURE_INVALID', 'The text file is not valid UTF-8 text.');
    }
    return { extension: typedExtension };
  }

  const detected = await fileTypeFromBuffer(input.buffer);
  if (typedExtension === 'pdf' && detected?.ext !== 'pdf') {
    throw new AppError(400, 'MATERIAL_SIGNATURE_INVALID', 'The file content does not match its extension.');
  }
  if (typedExtension === 'docx' || typedExtension === 'pptx') {
    const entries = archiveEntries(input.buffer);
    const requiredEntry = typedExtension === 'docx' ? 'word/document.xml' : 'ppt/presentation.xml';
    if (!entries['[Content_Types].xml'] || !entries[requiredEntry]) {
      throw new AppError(400, 'MATERIAL_SIGNATURE_INVALID', 'The file content does not match its extension.');
    }
  }
  return { extension: typedExtension };
}

function normalizeText(text: string): string {
  const normalized = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return [...normalized]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
    })
    .join('');
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export async function extractDocument(buffer: Buffer, extension: SupportedExtension): Promise<string> {
  let text: string;
  if (extension === 'txt') {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } else if (extension === 'docx') {
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (extension === 'pptx') {
    const entries = archiveEntries(buffer);
    const decoder = new TextDecoder();
    text = Object.entries(entries)
      .filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
      .flatMap(([, bytes]) => [...decoder.decode(bytes).matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((match) => decodeXmlText(match[1] ?? '')))
      .join('\n');
  } else {
    const parser = new PDFParse({ data: buffer });
    try {
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }
  const normalized = normalizeText(text);
  if (!normalized) {
    throw new AppError(422, 'MATERIAL_TEXT_EMPTY', 'No readable text was found in this file.');
  }
  return normalized;
}

export function chunkText(
  text: string,
  options: { maxWords?: number; overlapWords?: number } = {},
): string[] {
  const maxWords = options.maxWords ?? 420;
  const overlapWords = Math.min(options.overlapWords ?? 60, maxWords - 1);
  const words = normalizeText(text).match(/[\p{Script=Han}]|[\p{L}\p{N}]+|[^\s]/gu) ?? [];
  const chunks: string[] = [];
  for (let start = 0; start < words.length; start += maxWords - overlapWords) {
    const chunk = words.slice(start, start + maxWords).join(' ');
    if (chunk) chunks.push(chunk);
    if (start + maxWords >= words.length) break;
  }
  return chunks;
}
