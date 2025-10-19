import { highlightDiffChunk } from './highlightDiffChunk';
import type { DiffChunk } from './diffChunking';

// Mock Shiki module to avoid ESM/WASM issues in Jest
jest.mock('./shikiHighlighter', () => ({
  // eslint-disable-next-line @typescript-eslint/require-await
  getShikiHighlighter: async () => ({
    getLoadedLanguages: () => ['typescript', 'javascript', 'tsx', 'jsx'],
    codeToHtml: (code: string) => {
      return `<pre><code><span class="line">${code.split('\n').join('</span>\n<span class="line">')}</span></code></pre>`;
    },
  }),
  mapToShikiLang: (lang: string) => lang,
}));

describe('highlightDiffChunk', () => {
  const mockChunk: DiffChunk = {
    type: 'add',
    lines: ['const x = 1;', 'const y = 2;'],
    startIndex: 0,
    lineNumbers: [1, 2],
  };

  it('should return plain text for text/plaintext language', async () => {
    const result = await highlightDiffChunk(mockChunk, 'text');

    expect(result.type).toBe('add');
    expect(result.usedFallback).toBe(false);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].html).toBe('const x = 1;');
    expect(result.lines[0].lineNumber).toBe(1);
  });

  it('should escape HTML in plain text fallback', async () => {
    const htmlChunk: DiffChunk = {
      type: 'add',
      lines: ['<script>alert("xss")</script>'],
      startIndex: 0,
      lineNumbers: [1],
    };

    const result = await highlightDiffChunk(htmlChunk, 'text');

    expect(result.lines[0].html).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('should preserve line numbers and original indices for text files', async () => {
    const result = await highlightDiffChunk(mockChunk, 'text');

    expect(result.lines[0].lineNumber).toBe(1);
    expect(result.lines[0].originalIndex).toBe(0);
    expect(result.lines[1].lineNumber).toBe(2);
    expect(result.lines[1].originalIndex).toBe(1);
  });

  it('should handle empty lines', async () => {
    const emptyChunk: DiffChunk = {
      type: 'context',
      lines: [''],
      startIndex: 0,
      lineNumbers: [1],
    };

    const result = await highlightDiffChunk(emptyChunk, 'text');

    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].lineNumber).toBe(1);
  });

  it('should handle multiple line types', async () => {
    const removeChunk: DiffChunk = {
      type: 'remove',
      lines: ['old code'],
      startIndex: 5,
      lineNumbers: [10],
    };

    const result = await highlightDiffChunk(removeChunk, 'text');

    expect(result.type).toBe('remove');
    expect(result.lines[0].originalIndex).toBe(5);
  });
});

