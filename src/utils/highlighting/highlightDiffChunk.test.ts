import { highlightDiffChunk } from './highlightDiffChunk';
import type { DiffChunk } from './diffChunking';

/**
 * Tests use REAL Shiki highlighter (no mocks)
 * This ensures we test actual behavior and catch changes in Shiki's HTML structure
 * WASM loads on first test (~100ms), then cached for subsequent tests
 */

describe('highlightDiffChunk', () => {
  const mockChunk: DiffChunk = {
    type: 'add',
    lines: ['const x = 1;', 'const y = 2;'],
    startIndex: 0,
    lineNumbers: [1, 2],
  };

  describe('plain text files', () => {
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

  describe('with real Shiki syntax highlighting', () => {
    it('should correctly extract lines from nested span structure', async () => {
      const chunk: DiffChunk = {
        type: 'add',
        lines: ['const x = 1;', 'const y = 2;'],
        startIndex: 0,
        lineNumbers: [1, 2],
      };

      const result = await highlightDiffChunk(chunk, 'typescript');

      expect(result.lines).toHaveLength(2);
      // Should contain actual Shiki styling
      expect(result.lines[0].html).toContain('<span style=');
      expect(result.lines[0].html).toContain('const');
      expect(result.lines[0].html).toContain('x');
      // Should not have the line wrapper in extracted content
      expect(result.lines[0].html).not.toMatch(/^<span class="line">/);
      expect(result.usedFallback).toBe(false);
    });

    it('should handle incomplete syntax (unclosed string)', async () => {
      const chunk: DiffChunk = {
        type: 'add',
        lines: ['const str = "unclosed'],
        startIndex: 0,
        lineNumbers: [1],
      };

      const result = await highlightDiffChunk(chunk, 'typescript');

      // Real Shiki handles incomplete syntax gracefully
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].html.length).toBeGreaterThan(0);
      expect(result.lines[0].html).toContain('const');
    });

    it('should handle empty lines with highlighting', async () => {
      const chunk: DiffChunk = {
        type: 'context',
        lines: ['', 'const y = 2;', ''],
        startIndex: 0,
        lineNumbers: [1, 2, 3],
      };

      const result = await highlightDiffChunk(chunk, 'typescript');

      expect(result.lines).toHaveLength(3);
      // Empty lines might have empty content
      expect(result.lines[0].html.length).toBeGreaterThanOrEqual(0);
      // Non-empty line should be highlighted
      expect(result.lines[1].html).toContain('const');
      expect(result.lines[1].html).toContain('<span style=');
      expect(result.lines[2].html.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle lines with special characters', async () => {
      const chunk: DiffChunk = {
        type: 'add',
        lines: ['if (x && y) { return true; }'],
        startIndex: 0,
        lineNumbers: [1],
      };

      const result = await highlightDiffChunk(chunk, 'typescript');

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].html).toContain('<span');
      // Shiki HTML-encodes special chars: && becomes &#x26;&#x26;
      expect(result.lines[0].html).toContain('&#x26;&#x26;');
    });

    it('should handle complex nested structures', async () => {
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
      // Should have multiple spans for different tokens
      const spanCount = (result.lines[0].html.match(/<span/g) ?? []).length;
      expect(spanCount).toBeGreaterThan(3);
    });

    it('should preserve line numbers correctly with highlighting', async () => {
      const chunk: DiffChunk = {
        type: 'remove',
        lines: ['const a = 1;', 'const b = 2;', 'const c = 3;'],
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

    it('should handle multiline code with proper separation', async () => {
      const chunk: DiffChunk = {
        type: 'add',
        lines: [
          'function test() {',
          '  return 42;',
          '}',
        ],
        startIndex: 0,
        lineNumbers: [1, 2, 3],
      };

      const result = await highlightDiffChunk(chunk, 'typescript');

      expect(result.lines).toHaveLength(3);
      // Each line should be independently highlighted
      expect(result.lines[0].html).toContain('function');
      expect(result.lines[1].html).toContain('return');
      expect(result.lines[2].html).toContain('}');
      // No line should contain content from another line
      expect(result.lines[0].html).not.toContain('return');
      expect(result.lines[2].html).not.toContain('function');
    });
  });
});
