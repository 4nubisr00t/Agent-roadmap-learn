import { Marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import mermaid from 'mermaid';

// Initialize mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    darkMode: true,
    background: '#121215',
    primaryColor: '#f59e0b',
    primaryTextColor: '#fff',
    primaryBorderColor: '#b45309',
    lineColor: '#fbbf24',
    secondaryColor: '#1e1e24',
    tertiaryColor: '#18181b',
  },
  suppressErrorRendering: true,
});

const markedInstance = new Marked();

// Use KaTeX extension for both block $$...$$ and inline $...$
markedInstance.use(
  markedKatex({
    throwOnError: false,
    nonStandard: true, // enables single $ inline math
    output: 'htmlAndMathml',
  })
);

// Custom renderer for mermaid code blocks
const renderer = {
  code({ text, lang }: { text: string; lang?: string }) {
    if (lang === 'mermaid') {
      const id = 'mermaid_' + Math.random().toString(36).slice(2, 9);
      return `<div class="mermaid-container my-3 overflow-x-auto rounded-xl bg-obsidian-900/80 p-3 border border-amber-500/20 shadow-inner text-center"><div class="mermaid" id="${id}">${text}</div></div>`;
    }
    return false; // let marked use default code block
  },
};

markedInstance.use({ renderer });

export function renderMarkdown(content: string): string {
  if (!content) return '';
  try {
    return markedInstance.parse(content) as string;
  } catch (err) {
    console.warn('Markdown parse fallback:', err);
    return content;
  }
}

/**
 * Trigger mermaid re-render for dynamically inserted elements
 */
export async function triggerMermaidRender(): Promise<void> {
  try {
    const elements = document.querySelectorAll('.mermaid:not([data-processed="true"])');
    if (elements.length > 0) {
      await mermaid.run({
        nodes: Array.from(elements) as HTMLElement[],
      });
    }
  } catch (err) {
    console.debug('Mermaid render notice:', err);
  }
}
