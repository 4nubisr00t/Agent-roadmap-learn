import katex from 'katex';
import hljs from 'highlight.js';
import { Marked } from 'marked';
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

// Setup Marked instance with custom code renderer
const markedInstance = new Marked();

markedInstance.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      if (lang === 'mermaid') {
        const id = 'mermaid_' + Math.random().toString(36).slice(2, 9);
        return `<div class="mermaid-container my-3 overflow-x-auto rounded-xl bg-obsidian-900/80 p-3 border border-amber-500/20 shadow-inner text-center"><div class="mermaid" id="${id}">${text}</div></div>`;
      }

      const validLang = lang && hljs.getLanguage(lang) ? lang : '';
      let highlighted = '';
      try {
        highlighted = validLang
          ? hljs.highlight(text, { language: validLang }).value
          : hljs.highlightAuto(text).value;
      } catch {
        highlighted = text;
      }

      const langDisplay = (validLang || 'CODE').toUpperCase();

      return `<div class="code-block-wrapper my-3 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950/90 shadow-md">
        <div class="code-block-header flex items-center justify-between px-3.5 py-1.5 bg-zinc-900/90 border-b border-zinc-800/80 text-[11px] font-mono text-zinc-400">
          <span class="flex items-center gap-1.5 font-bold tracking-wider text-amber-400/90">${langDisplay}</span>
          <button type="button" class="copy-code-btn text-xs text-zinc-400 hover:text-amber-300 transition-colors cursor-pointer select-none" data-code="${encodeURIComponent(text)}">复制</button>
        </div>
        <pre class="p-3.5 overflow-x-auto text-xs leading-relaxed font-mono"><code class="hljs ${validLang}">${highlighted}</code></pre>
      </div>`;
    },
  },
});

// Attach copy code listener in browser environment
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target?.closest('.copy-code-btn') as HTMLButtonElement | null;
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      const code = decodeURIComponent(btn.getAttribute('data-code') || '');
      navigator.clipboard.writeText(code).then(() => {
        const originalText = btn.textContent;
        btn.textContent = '已复制!';
        btn.classList.add('text-emerald-400');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('text-emerald-400');
        }, 1800);
      }).catch(err => {
        console.warn('Clipboard write failed:', err);
      });
    }
  });
}

/**
 * High-fidelity Markdown renderer with Math Shielding, Obsidian Callouts, WikiLinks, and Code Highlighting
 */
export function renderMarkdown(content: string): string {
  if (!content) return '';

  try {
    // Step 1: Shield code blocks and inline code so math symbols ($ / _) inside code are not touched
    const codeTokens: string[] = [];
    let text = content.replace(/(```[\s\S]*?```|`[^`\n]+?`)/g, (match) => {
      const idx = codeTokens.length;
      codeTokens.push(match);
      return `%%CODE_TOKEN_${idx}%%`;
    });

    // Step 2: Shield math expressions and render directly via KaTeX (Math Shield)
    const mathTokens: string[] = [];

    // Block math: $$ ... $$
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_match, math) => {
      const idx = mathTokens.length;
      try {
        const rendered = katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
        mathTokens.push(`<div class="katex-block-wrapper my-3 overflow-x-auto text-center py-2 px-3 bg-zinc-900/40 rounded-xl border border-zinc-800/50">${rendered}</div>`);
      } catch {
        mathTokens.push(`<div class="katex-error text-rose-400 text-xs font-mono my-2">${math}</div>`);
      }
      return `%%KATEX_TOKEN_${idx}%%`;
    });

    // Block math: \[ ... \]
    text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_match, math) => {
      const idx = mathTokens.length;
      try {
        const rendered = katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
        mathTokens.push(`<div class="katex-block-wrapper my-3 overflow-x-auto text-center py-2 px-3 bg-zinc-900/40 rounded-xl border border-zinc-800/50">${rendered}</div>`);
      } catch {
        mathTokens.push(`<div class="katex-error text-rose-400 text-xs font-mono my-2">${math}</div>`);
      }
      return `%%KATEX_TOKEN_${idx}%%`;
    });

    // Inline math: \( ... \)
    text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_match, math) => {
      const idx = mathTokens.length;
      try {
        const rendered = katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
        mathTokens.push(rendered);
      } catch {
        mathTokens.push(math);
      }
      return `%%KATEX_TOKEN_${idx}%%`;
    });

    // Inline math: $ ... $ (ensuring not matched across empty lines or double $$)
    text = text.replace(/(?<!\\)\$([^\$\n\r]+?)(?<!\\)\$/g, (_match, math) => {
      if (!math.trim()) return _match;
      const idx = mathTokens.length;
      try {
        const rendered = katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
        mathTokens.push(rendered);
      } catch {
        mathTokens.push(math);
      }
      return `%%KATEX_TOKEN_${idx}%%`;
    });

    // Step 3: Restore code tokens
    text = text.replace(/%%CODE_TOKEN_(\d+)%%/g, (_match, idx) => {
      return codeTokens[Number(idx)] || '';
    });

    // Step 4: Obsidian Callouts transform
    // e.g. > [!NOTE] Optional Title
    // > Body text
    text = text.replace(/^>[ \t]*\[!([A-Za-z]+)\][ \t]*(.*)$((?:\n>[ \t]*.*$)*)/gm, (_match, type, title, body) => {
      const calloutType = type.toLowerCase();
      const cleanBody = body
        ? body.split('\n').map(l => l.replace(/^>[ \t]?/, '')).join('\n')
        : '';
      const displayTitle = title.trim() || type.toUpperCase();

      let colorClass = 'border-amber-500/40 bg-amber-500/5 text-amber-200';
      let iconSvg = '<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>';
      if (['tip', 'hint'].includes(calloutType)) {
        colorClass = 'border-emerald-500/40 bg-emerald-500/5 text-emerald-200';
        iconSvg = '<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5L12 2z"/></svg>';
      } else if (['warning', 'caution', 'danger', 'bug'].includes(calloutType)) {
        colorClass = 'border-rose-500/40 bg-rose-500/5 text-rose-200';
        iconSvg = '<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      } else if (['important', 'info', 'note'].includes(calloutType)) {
        colorClass = 'border-sky-500/40 bg-sky-500/5 text-sky-200';
        iconSvg = '<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
      } else if (['example', 'code'].includes(calloutType)) {
        colorClass = 'border-purple-500/40 bg-purple-500/5 text-purple-200';
        iconSvg = '<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>';
      }

      return `<div class="obsidian-callout my-4 rounded-xl border-l-4 p-3.5 shadow-sm ${colorClass}">
        <div class="callout-header flex items-center gap-2 font-bold text-xs uppercase tracking-wider mb-1.5">
          ${iconSvg}
          <span>${displayTitle}</span>
        </div>
        <div class="callout-content text-xs opacity-90 leading-relaxed">${cleanBody.trim()}</div>
      </div>\n`;
    });

    // Step 5: Obsidian WikiLinks: [[Target Page|Alias]] or [[Target Page]]
    text = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => {
      const label = alias || target;
      return `<span class="obsidian-wikilink inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold border border-amber-500/30 cursor-pointer" data-wikilink="${encodeURIComponent(target.trim())}"><svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>${label.trim()}</span>`;
    });

    // Step 6: Obsidian Highlights: ==Highlighted Text==
    text = text.replace(/==([^=\n]+)==/g, '<mark class="bg-amber-400/25 text-amber-200 px-1 py-0.5 rounded font-semibold border-b border-amber-400/50">$1</mark>');

    // Step 7: Parse Markdown
    let html = markedInstance.parse(text) as string;

    // Step 8: Restore KaTeX tokens
    html = html.replace(/%%KATEX_TOKEN_(\d+)%%/g, (_match, idx) => {
      return mathTokens[Number(idx)] || '';
    });

    return html;
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
