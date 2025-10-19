// Mock shikiHighlighter for tests
// eslint-disable-next-line @typescript-eslint/require-await
export async function getShikiHighlighter() {
  return {
    getLoadedLanguages: () => ['typescript', 'javascript', 'tsx', 'jsx'],
    codeToHtml: (code: string) => {
      // Simple mock that wraps code in spans
      return `<pre><code><span class="line">${code.split('\n').join('</span>\n<span class="line">')}</span></code></pre>`;
    },
  };
}

export function mapToShikiLang(lang: string): string {
  return lang;
}

