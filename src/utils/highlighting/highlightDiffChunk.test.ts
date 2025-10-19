import { highlightDiffChunk } from './highlightDiffChunk';
import type { DiffChunk } from './diffChunking';

// Mock Shiki module to avoid ESM/WASM issues in Jest
// This mock simulates REAL Shiki v3 output with nested spans
jest.mock('./shikiHighlighter', () => ({
  // eslint-disable-next-line @typescript-eslint/require-await
  getShikiHighlighter: async () => ({
    getLoadedLanguages: () => ['typescript', 'javascript', 'tsx', 'jsx'],
    codeToHtml: (code: string) => {
      // Simulate real Shiki HTML with nested token spans inside line spans
      const lines = code.split('\n').map(line => {
        if (line === '') return '<span class="line"></span>';
        const tokens = line.split(' ').map(token => 
          `<span style="color:#DCDCAA">${token}</span>`
        ).join(' ');
        return `<span class="line">${tokens}</span>`;
      }).join('\n');
      return `<pre class="shiki dark-plus" style="background-color:#1E1E1E;color:#D4D4D4" tabindex="0"><code>${lines}</code></pre>`;
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

  // Tests with realistic Shiki output (nested spans)
  describe('with syntax highlighting', () => {
    it('should correctly extract lines from nested span structure', async () => {
      const chunk: DiffChunk = {
        type: 'add',
        lines: ['const x = 1;', 'const y = 2;'],
        startIndex: 0,
        lineNumbers: [1, 2],
      };

      const result = await highlightDiffChunk(chunk, 'typescript');

      expect(result.lines).toHaveLength(2);
      expect(result.lines[0].html).toContain('<span style="color:#DCDCAA">');
      expect(result.lines[0].html).toContain('const');
      expect(result.lines[0].html).toContain('x');
      // Should not have the line wrapper in extracted content
      expect(result.lines[0].html).not.toMatch(/^<span class="line">/);
    });

    it('should handle incomplete syntax (unclosed string)', async () => {
      const chunk: DiffChunk = {
        type: 'add',
        lines: ['const str = "unclosed'],
        startIndex: 0,
        lineNumbers: [1],
      };

      const result = await highlightDiffChunk(chunk, 'typescript');

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].html.length).toBeGreaterThan(0);
    });

    it('should handle empty lines with highlighting', async () => {
      const chunk: DiffChunk = {
        type: 'context',
        lines: ['', 'non-empty', ''],
        startIndex: 0,
        lineNumbers: [1, 2, 3],
      };

      const result = await highlightDiffChunk(chunk, 'typescript');

      expect(result.lines).toHaveLength(3);
      expect(result.lines[0].html.length).toBeGreaterThanOrEqual(0);
      expect(result.lines[1].html).toContain('non-empty');
      expect(result.lines[2].html.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle lines with special characters', async () => {
      const chunk: DiffChunk = {
        type: 'add',
        lines: ['<div>&nbsp;</div>', 'if (x && y) { }'],
        startIndex: 0,
        lineNumbers: [1, 2],
      };

      const result = await highlightDiffChunk(chunk, 'typescript');

      expect(result.lines).toHaveLength(2);
      expect(result.lines[0].html).toContain('<span');
    });

    it('should handle deeply nested spans', async () => {
      const chunk: DiffChunk = {
        type: 'add',
        lines: ['const obj = { nested: { value: 1 } };'],
        startIndex: 0,
        lineNumbers: [1],
      };

      const result = await highlightDiffChunk(chunk, 'typescript');

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].html).toContain('const');
      expect(result.lines[0].html).toContain('obj');
      expect(result.lines[0].html).toContain('nested');
    });

    it('should preserve line numbers correctly with highlighting', async () => {
      const chunk: DiffChunk = {
        type: 'remove',
        lines: ['line1', 'line2', 'line3'],
        startIndex: 10,
        lineNumbers: [15, 16, 17],
      };

      const result = await highlightDiffChunk(chunk, 'typescript');

      expect(result.lines[0].lineNumber).toBe(15);
      expect(result.lines[1].lineNumber).toBe(16);
      expect(result.lines[2].lineNumber).toBe(17);
      expect(result.lines[0].originalIndex).toBe(10);
      expect(result.lines[1].originalIndex).toBe(11);
      expect(result.lines[2].originalIndex).toBe(12);
    });
  });
});
