import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { chunkText, extractDocument, validateUpload } from '../src/modules/materials/document-processing.js';

describe('document processing', () => {
  it('accepts and normalizes a UTF-8 text upload', async () => {
    const buffer = Buffer.from('\uFEFFFirst paragraph.\r\n\r\n\r\nSecond\tparagraph.');

    await expect(validateUpload({ originalName: 'notes.TXT', mimeType: 'text/plain', buffer })).resolves.toEqual({ extension: 'txt' });
    await expect(extractDocument(buffer, 'txt')).resolves.toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('rejects an executable disguised as a PDF', async () => {
    await expect(validateUpload({
      originalName: 'lecture.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('MZ dangerous executable'),
    })).rejects.toMatchObject({ code: 'MATERIAL_SIGNATURE_INVALID' });
  });

  it('extracts slide text from a PPTX archive without executing embedded content', async () => {
    const buffer = Buffer.from(zipSync({
      '[Content_Types].xml': strToU8('<Types/>'),
      'ppt/presentation.xml': strToU8('<p:presentation/>'),
      'ppt/slides/slide1.xml': strToU8('<a:t>Binary Search</a:t><a:t>O(log n)</a:t>'),
    }));

    await expect(validateUpload({
      originalName: 'algorithms.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      buffer,
    })).resolves.toEqual({ extension: 'pptx' });
    await expect(extractDocument(buffer, 'pptx')).resolves.toContain('Binary Search');
  });

  it('creates bounded overlapping chunks while preserving every paragraph', () => {
    const text = 'one two three four five\n\nsix seven eight nine ten\n\neleven twelve thirteen';
    const chunks = chunkText(text, { maxWords: 7, overlapWords: 2 });

    expect(chunks.every((chunk) => chunk.split(/\s+/).length <= 7)).toBe(true);
    expect(chunks.join(' ')).toContain('eleven twelve thirteen');
    expect(chunks[1]).toContain('six seven');
  });

  it('bounds Chinese text that does not contain whitespace', () => {
    const chunks = chunkText('学习记忆'.repeat(300));

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => (chunk.match(/[\p{Script=Han}]/gu) ?? []).length <= 420)).toBe(true);
  });
});
