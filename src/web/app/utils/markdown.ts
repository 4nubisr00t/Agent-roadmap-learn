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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Setup Marked instance with custom code renderer
const markedInstance = new Marked({
  gfm: true,
  breaks: false,
});

markedInstance.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      if (lang === 'mermaid') {
        const id = 'mermaid_' + Math.random().toString(36).slice(2, 9);
        const normalizedMermaid = repairCollapsedMermaid(text);
        return `<div class="mermaid-container my-3 overflow-x-auto rounded-xl bg-obsidian-900/80 p-3 border border-amber-500/20 shadow-inner text-center"><div class="mermaid" id="${id}">${escapeHtml(normalizedMermaid)}</div></div>`;
      }

      const validLang = lang && hljs.getLanguage(lang) ? lang : '';
      let highlighted = '';
      try {
        highlighted = validLang
          ? hljs.highlight(text, { language: validLang }).value
          : hljs.highlightAuto(text).value;
      } catch {
        highlighted = escapeHtml(text);
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
 * Repair single-line collapsed Mermaid diagrams (e.g. `flowchart TD A[...] -->|...| B[...] C[...]`)
 */
function repairCollapsedMermaid(raw: string): string {
  const trimmed = raw.trim();
  const lines = trimmed.split('\n');
  if (lines.length > 2) return trimmed;

  // Separate header like `flowchart TD` or `graph LR` from trailing node definitions
  let fixed = trimmed.replace(
    /^((?:flowchart|graph)\s+(?:TD|TB|BT|RL|LR)|sequenceDiagram|stateDiagram(?:-v2)?|classDiagram|erDiagram)\s+(?=\S)/,
    '$1\n  '
  );
  // Split subsequent node-edge chains that got glued with a space onto one line
  fixed = fixed.replace(
    /(\]|\)|\}|"|`)\s+([A-Za-z0-9_]+(?:\[|\(|\{|<|--|==|-\.))/g,
    '$1\n  $2'
  );
  return fixed;
}

/**
 * Gently restore collapsed Markdown block boundaries (headings, HRs, fenced code blocks,
 * tables, callouts, and bullets) caused by whitespace-collapsing or tight AI streams,
 * while leaving valid multi-line code blocks and math untouched.
 */
function normalizeCollapsedMarkdown(raw: string): string {
  let text = raw.replace(/\r\n/g, '\n');

  // 1. Separate inline opening/closing code fences glued to surrounding text
  text = text.replace(
    /([^\n`])[ \t]+(```[a-zA-Z0-9_+-]*)(?=[ \t]+\S|\n|$)/g,
    '$1\n\n$2'
  );
  // If code language tag has inline code on the same line (` ```text 第1参数: ...`), break after lang
  text = text.replace(
    /(^|\n)(```[a-zA-Z0-9_+-]+)[ \t]+([^\n]+)/g,
    '$1$2\n$3'
  );
  // Separate closing ``` glued after code or followed inline by --- / heading
  text = text.replace(/([^\n`])[ \t]+(```)(?=[ \t]*(?:\n|$|---|#{1,6}[ \t]))/g, '$1\n$2\n\n');
  text = text.replace(/(^|\n)(```)[ \t]+(?=(?:---|#{1,6}[ \t]))/g, '$1$2\n\n');

  // 2. Protect fenced code blocks so '#' comments or '--' inside code are never touched
  const fenceShields: string[] = [];
  text = text.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, (m) => {
    const idx = fenceShields.length;
    fenceShields.push(m);
    return `ZZNORMFENCE${idx}ZZ`;
  });

  // 3. Separate inline horizontal rules (` ... --- ### ... ` or ` ...。 --- 正文`)
  text = text.replace(
    /([^\n-])[ \t]+---[ \t]+(?=(?:#{1,6}[ \t]|\*\*|>|[\u4e00-\u9fffA-Za-z0-9ZZ]))/g,
    '$1\n\n---\n\n'
  );

  // 4. Separate inline headings (`...。 ### 二、...` or `--- ## 1. ...` or chained `# H1 ## H2`)
  text = text.replace(
    /([。！？：；;)\]）】”`*$]|---)[ \t]+(#{1,6}[ \t]+\S)/g,
    '$1\n\n$2'
  );
  // Split chained headings on the same line (run twice to catch `# A ## B ### C`)
  for (let i = 0; i < 2; i++) {
    text = text.replace(
      /(^|\n)(#{1,6}[ \t]+[^\n]+?)[ \t]+(#{1,6}[ \t]+\S)/g,
      '$1$2\n\n$3'
    );
  }

  // 5. Separate inline table headers glued to preceding prose (`初中代数！ | col1 | col2 |\n| :--- |`)
  text = text.replace(
    /^([^\n|]*?[^\n|\s])[ \t]+(\|(?:[^|\n]+\|)+)[ \t]*\n([ \t]*\|(?:\s*:?-{2,}:?\s*\|)+)/gm,
    '$1\n\n$2\n$3'
  );

  // 6. Separate inline blockquote right after heading / HR
  text = text.replace(/(^|\n)(#{1,6}[ \t][^\n]+?|---)[ \t]+(>)/g, '$1$2\n\n$3');

  // 7. Separate inline bullet items (`* **Label**` or `- **Label**`) collapsed after punctuation
  text = text.replace(/([。！？：；;）)])[ \t]+([*-][ \t]+\*\*[^*\n]+\*\*)/g, '$1\n\n$2');

  // Restore fenced code blocks
  text = text.replace(/ZZNORMFENCE(\d+)ZZ/g, (_, idx) => fenceShields[Number(idx)] || '');
  return text;
}

/**
 * Fix accidentally unescaped JSON control sequences inside LaTeX math
 * (e.g. `\t` + `o` from `"$\to$"` -> `\\to`, `\f` + `rac` -> `\\frac`, `\b` + `eta` -> `\\beta`).
 */
function fixBrokenLatexControls(math: string): string {
  return math
    .replace(/\t(?=[a-zA-Z])/g, '\\t')
    .replace(/\u000c(?=[a-zA-Z])/g, '\\f')
    .replace(/\u0008(?=[a-zA-Z])/g, '\\b')
    .replace(/√/g, '\\surd ');
}

/**
 * Check whether an inline `$ ... $` slice is genuine LaTeX math rather than assembly registers
 * (`$t0`, `$sp`, `$gp`, `$0`), shell vars (`$HOME`), or currency (`$50 ... $100`).
 */
function isLikelyInlineMath(inner: string, charAfterClose: string): boolean {
  if (!inner || !inner.trim()) return false;
  // Never end inline math immediately before an ASCII alphanumeric (`$t0,$t1`, `$50-$100`)
  if (charAfterClose && /[0-9A-Za-z]/.test(charAfterClose)) return false;
  // Never end with dangling punctuation right before `$` (`$t0,$`, `$0恒为0；$`)
  if (/[,;，；。！？：]$/.test(inner.trim())) return false;

  // Reject bare CJK prose swallowed between two `$` tokens (outside \text{} / \mathrm{} etc.)
  const withoutTextCmd = inner.replace(
    /\\(?:text|mathrm|mathbf|textbf|textit|mbox|operatorname)\{[^}]*\}/g,
    ''
  );
  if (/[\u4e00-\u9fff]/.test(withoutTextCmd)) return false;

  // If padded by whitespace at start/end, require explicit LaTeX/math signal
  if (/^\s|\s$/.test(inner) && !/[\\=^_{}∫∑∏∮√±×÷·∈∉⊂⊆∪∩≤≥≠≈∞→←↔]/.test(inner)) {
    return false;
  }

  return true;
}

/**
 * Scan a text line-by-line for genuine inline `$ ... $` math without allowing unclosed
 * register names like `$t0` or `$gp` to poison subsequent valid `$math$` on the same line.
 */
function shieldInlineDollarMath(
  input: string,
  renderInlineMath: (math: string) => string
): string {
  return input
    .split('\n')
    .map((line) => {
      if (!line.includes('$')) return line;

      const dollarPositions: number[] = [];
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '$' && (i === 0 || line[i - 1] !== '\\')) {
          dollarPositions.push(i);
        }
      }
      if (dollarPositions.length < 2) return line;

      let result = '';
      let cursor = 0;
      let p = 0;

      while (p < dollarPositions.length - 1) {
        const openIdx = dollarPositions[p];
        const closeIdx = dollarPositions[p + 1];
        const rawInner = line.slice(openIdx + 1, closeIdx);
        const fixedInner = fixBrokenLatexControls(rawInner);
        const charAfter = closeIdx + 1 < line.length ? line[closeIdx + 1] : '';

        if (isLikelyInlineMath(fixedInner, charAfter)) {
          result += line.slice(cursor, openIdx) + renderInlineMath(fixedInner);
          cursor = closeIdx + 1;
          p += 2;
        } else {
          // Skip only this stray `$` so `closeIdx` remains available as an opening `$`
          p += 1;
        }
      }

      result += line.slice(cursor);
      return result;
    })
    .join('\n');
}

/**
 * Work around CommonMark flanking delimiter rules where `**` sits between CJK characters
 * and CJK/typographic punctuation (e.g. `了**“场（Field）”**的` or `用**栈（Stack）**存`),
 * which `marked` otherwise leaves as literal `**`.
 */
function fixCjkFlankingBold(text: string): string {
  return text.replace(
    /(?<!\\)(?<!\*)\*\*([^\n*]+?(?:\*(?!\*)[^\n*]*?)*)\*\*(?!\*)/g,
    (full, inner: string, offset: number, source: string) => {
      if (!inner || !inner.trim() || /^\s|\s$/.test(inner)) return full;
      const prevChar = offset > 0 ? source[offset - 1] : '';
      const nextIdx = offset + full.length;
      const nextChar = nextIdx < source.length ? source[nextIdx] : '';
      const firstInner = inner[0];
      const lastInner = inner[inner.length - 1];

      const isWordOrCjk = (c: string) => !!c && /[\p{L}\p{N}]/u.test(c);
      const isPunct = (c: string) => !!c && /[\p{P}\p{S}]/u.test(c);

      const leftBroken = isWordOrCjk(prevChar) && isPunct(firstInner);
      const rightBroken = isPunct(lastInner) && isWordOrCjk(nextChar);

      if (leftBroken || rightBroken) {
        return `<strong>${inner}</strong>`;
      }
      return full;
    }
  );
}

/**
 * High-fidelity Markdown renderer with Math Shielding, Obsidian Callouts, WikiLinks, and Code Highlighting
 */
export function renderMarkdown(content: string): string {
  if (!content) return '';

  try {
    // Step 0: Recover collapsed markdown block delimiters safely
    let text = normalizeCollapsedMarkdown(content);

    // Step 1: Shield code blocks (``` / ~~~) and inline code (`` / `) so math/HTML transforms never touch code
    const codeTokens: string[] = [];
    text = text.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~|``[^\n`]+?``|`[^`\n]+?`)/g, (match) => {
      const idx = codeTokens.length;
      codeTokens.push(match);
      return `ZZCODEBLOCK${idx}ZZ`;
    });

    // Step 2: Shield math expressions and render directly via KaTeX (pure alphanumeric placeholders avoid _ bugs)
    const blockMathTokens: string[] = [];
    const inlineMathTokens: string[] = [];

    const pushBlockMath = (rawMath: string) => {
      const idx = blockMathTokens.length;
      const cleanMath = fixBrokenLatexControls(rawMath).trim();
      try {
        const rendered = katex.renderToString(cleanMath, { displayMode: true, throwOnError: false });
        blockMathTokens.push(
          `<div class="katex-block-wrapper my-3 overflow-x-auto text-center py-2 px-3 bg-zinc-900/40 rounded-xl border border-zinc-800/50">${rendered}</div>`
        );
      } catch {
        blockMathTokens.push(
          `<div class="katex-error text-rose-400 text-xs font-mono my-2">${escapeHtml(cleanMath)}</div>`
        );
      }
      return `\n\nZZKATEXBLOCK${idx}ZZ\n\n`;
    };

    const pushInlineMath = (rawMath: string) => {
      const idx = inlineMathTokens.length;
      const cleanMath = fixBrokenLatexControls(rawMath).trim();
      try {
        const rendered = katex.renderToString(cleanMath, { displayMode: false, throwOnError: false });
        inlineMathTokens.push(rendered);
      } catch {
        inlineMathTokens.push(escapeHtml(cleanMath));
      }
      return `ZZKATEXINLINE${idx}ZZ`;
    };

    // Block math: $$ ... $$ and \[ ... \]
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, math) => pushBlockMath(math));
    text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_m, math) => pushBlockMath(math));

    // Inline math: \( ... \) and validated $ ... $
    text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_m, math) => pushInlineMath(math));
    text = shieldInlineDollarMath(text, pushInlineMath);

    const applyInlineExtrasAndParse = (segment: string): string => {
      // WikiLinks: [[Target Page|Alias]] or [[Target Page]]
      let s = segment.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => {
        const label = alias || target;
        return `<span class="obsidian-wikilink inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold border border-amber-500/30 cursor-pointer" data-wikilink="${encodeURIComponent(target.trim())}"><svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>${escapeHtml(label.trim())}</span>`;
      });

      // Highlights: ==Highlighted Text== (skip `==` equality operators or `====`)
      s = s.replace(
        /(?<![=\w])==([^\s=][^=\n]*?[^\s=]|[^\s=])==(?![=\w])/g,
        '<mark class="bg-amber-400/25 text-amber-200 px-1 py-0.5 rounded font-semibold border-b border-amber-400/50">$1</mark>'
      );

      // CJK punctuation-flanking bold fix
      s = fixCjkFlankingBold(s);

      // Restore code tokens right before Marked parses blocks & inline elements
      s = s.replace(/ZZCODEBLOCK(\d+)ZZ/g, (_m, idx) => codeTokens[Number(idx)] || '');

      return markedInstance.parse(s) as string;
    };

    // Step 3: Extract Obsidian Callouts (> [!TYPE] Title) and recursively parse their markdown bodies
    const calloutTokens: string[] = [];
    text = text.replace(
      /^>[ \t]*\[!([A-Za-z]+)\][ \t]*(.*)$((?:\n>[ \t]*.*$)*)/gm,
      (_match, type, title, body) => {
        const calloutType = type.toLowerCase();
        const cleanBody = body
          ? body
              .split('\n')
              .map((l: string) => l.replace(/^>[ \t]?/, ''))
              .join('\n')
              .trim()
          : '';
        const displayTitle = escapeHtml(title.trim() || type.toUpperCase());

        let colorClass = 'border-amber-500/40 bg-amber-500/5 text-amber-200';
        let iconSvg =
          '<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>';
        if (['tip', 'hint'].includes(calloutType)) {
          colorClass = 'border-emerald-500/40 bg-emerald-500/5 text-emerald-200';
          iconSvg =
            '<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.5 6.5L21 11l-6.5 2.5L12 20l-2.5-6.5L3 11l6.5-2.5L12 2z"/></svg>';
        } else if (['warning', 'caution', 'danger', 'bug'].includes(calloutType)) {
          colorClass = 'border-rose-500/40 bg-rose-500/5 text-rose-200';
          iconSvg =
            '<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        } else if (['important', 'info', 'note'].includes(calloutType)) {
          colorClass = 'border-sky-500/40 bg-sky-500/5 text-sky-200';
          iconSvg =
            '<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
        } else if (['example', 'code'].includes(calloutType)) {
          colorClass = 'border-purple-500/40 bg-purple-500/5 text-purple-200';
          iconSvg =
            '<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>';
        }

        const renderedBody = cleanBody ? applyInlineExtrasAndParse(cleanBody) : '';
        const calloutHtml = `<div class="obsidian-callout my-4 rounded-xl border-l-4 p-3.5 shadow-sm ${colorClass}">
          <div class="callout-header flex items-center gap-2 font-bold text-xs uppercase tracking-wider mb-1.5">
            ${iconSvg}
            <span>${displayTitle}</span>
          </div>
          <div class="callout-content text-xs opacity-90 leading-relaxed">${renderedBody}</div>
        </div>`;

        const idx = calloutTokens.length;
        calloutTokens.push(calloutHtml);
        return `\n\nZZCALLOUTBLOCK${idx}ZZ\n\n`;
      }
    );

    // Step 4: Parse main body Markdown
    let html = applyInlineExtrasAndParse(text);

    // Step 5: Restore Callouts, unwrap `<p>ZZKATEXBLOCK...ZZ</p>`, and restore all KaTeX blocks & inline math
    html = html.replace(/<p>\s*ZZCALLOUTBLOCK(\d+)ZZ\s*<\/p>/g, (_m, idx) => calloutTokens[Number(idx)] || '');
    html = html.replace(/ZZCALLOUTBLOCK(\d+)ZZ/g, (_m, idx) => calloutTokens[Number(idx)] || '');

    html = html.replace(/<p>\s*ZZKATEXBLOCK(\d+)ZZ\s*<\/p>/g, (_m, idx) => blockMathTokens[Number(idx)] || '');
    html = html.replace(/ZZKATEXBLOCK(\d+)ZZ/g, (_m, idx) => blockMathTokens[Number(idx)] || '');
    html = html.replace(/ZZKATEXINLINE(\d+)ZZ/g, (_m, idx) => inlineMathTokens[Number(idx)] || '');

    return html;
  } catch (err) {
    console.warn('Markdown parse fallback:', err);
    return content;
  }
}

/**
 * Trigger mermaid re-render for dynamically inserted elements (isolated per node so one error never aborts others)
 */
export async function triggerMermaidRender(): Promise<void> {
  try {
    const elements = document.querySelectorAll('.mermaid:not([data-processed="true"])');
    for (const el of Array.from(elements)) {
      try {
        await mermaid.run({
          nodes: [el as HTMLElement],
        });
      } catch (nodeErr) {
        console.debug('Mermaid node render skipped:', nodeErr);
      }
    }
  } catch (err) {
    console.debug('Mermaid render notice:', err);
  }
}
