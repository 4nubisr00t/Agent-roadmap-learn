import * as path from 'path';
import * as fs from 'fs';
import type { UserDocument } from './document-service.js';

export interface ChapterSlice {
  index: number;
  title: string;
  page_range?: string;
  sample_content: string;
  char_count?: number;
}

export interface BookChaptersData {
  title: string;
  format: string;
  total_pages: number;
  chapter_count: number;
  chapters: ChapterSlice[];
}

export interface TaskContextMeta {
  title: string;
  description?: string;
  tags?: string[];
  milestoneTitle?: string;
}

export class RagService {
  /**
   * Extract potential chapter numbers and subject keywords from task
   */
  extractChapterNumber(task: TaskContextMeta): number | null {
    // 1. Check title for patterns like "1.1", "6.2", "第6章", "第 10 章", "Ch 5"
    const title = task.title || '';
    
    // Pattern: "第X章" or "第 X 章"
    const chMatch = title.match(/第\s*(\d+)\s*章/);
    if (chMatch) {
      return parseInt(chMatch[1], 10);
    }

    // Pattern: "1.1", "12.3", "1.1-1.2"
    const dotMatch = title.match(/^(\d+)\.\d+/);
    if (dotMatch) {
      return parseInt(dotMatch[1], 10);
    }

    // 2. Check tags (e.g. "第1章", "第10章")
    if (Array.isArray(task.tags)) {
      for (const tag of task.tags) {
        const tagMatch = tag.match(/第\s*(\d+)\s*章/);
        if (tagMatch) {
          return parseInt(tagMatch[1], 10);
        }
      }
    }

    // 3. Check milestoneTitle if present
    if (task.milestoneTitle) {
      const msMatch = task.milestoneTitle.match(/第\s*(\d+)\s*章/);
      if (msMatch) {
        return parseInt(msMatch[1], 10);
      }
    }

    // 4. Check description
    const descMatch = (task.description || '').match(/第\s*(\d+)\s*章/);
    if (descMatch) {
      return parseInt(descMatch[1], 10);
    }

    return null;
  }

  /**
   * Try loading companion chapters.json file
   */
  private loadCompanionChapters(doc: UserDocument): BookChaptersData | null {
    if (!doc.filePath) return null;

    const candidates = [
      `${doc.filePath}.chapters.json`,
      doc.filePath.replace(/\.pdf$/i, '.pdf.chapters.json'),
      path.join(path.dirname(doc.filePath), `${doc.id}_raw.pdf.chapters.json`),
      path.join(path.dirname(doc.filePath), `${doc.id}.chapters.json`),
    ];

    for (const cp of candidates) {
      try {
        if (fs.existsSync(cp)) {
          const content = fs.readFileSync(cp, 'utf-8');
          const data = JSON.parse(content);
          if (Array.isArray(data.chapters) && data.chapters.length > 0) {
            return data as BookChaptersData;
          }
        }
      } catch {}
    }

    return null;
  }

  /**
   * Extract chapter slices from formatted text content
   */
  private extractSlicesFromText(text: string): ChapterSlice[] {
    const slices: ChapterSlice[] = [];
    const parts = text.split(/={10,}\s*\n/);

    for (const part of parts) {
      const match = part.match(/【(第\s*(\d+)\s*章[^】]*)(?:\s*\(页码:\s*([^)]+)\))?】\n([\s\S]*)/);
      if (match) {
        const title = match[1].trim();
        const chNum = parseInt(match[2], 10);
        const pageRange = match[3] || '';
        const body = match[4].trim();
        slices.push({
          index: chNum,
          title,
          page_range: pageRange,
          sample_content: body,
          char_count: body.length,
        });
      }
    }

    return slices;
  }

  /**
   * Keyword relevance scoring for fallback search
   */
  private searchKeywordSnippets(text: string, keywords: string[], maxChars: number = 8000): string {
    if (!text) return '';
    const cleanKeywords = keywords.filter(k => k && k.length >= 2);
    if (cleanKeywords.length === 0) return text.slice(0, maxChars);

    // Split text into chunks of ~1000 characters
    const chunkSize = 1000;
    const overlap = 200;
    const chunks: { text: string; score: number }[] = [];

    for (let i = 0; i < text.length; i += (chunkSize - overlap)) {
      const chunkText = text.slice(i, i + chunkSize);
      let score = 0;
      for (const kw of cleanKeywords) {
        const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const count = (chunkText.match(regex) || []).length;
        score += count * kw.length;
      }
      if (score > 0) {
        chunks.push({ text: chunkText, score });
      }
    }

    if (chunks.length === 0) {
      return text.slice(0, maxChars);
    }

    // Sort by score descending and take top chunks
    chunks.sort((a, b) => b.score - a.score);
    const selected: string[] = [];
    let totalLen = 0;

    for (const ch of chunks) {
      if (totalLen + ch.text.length > maxChars) break;
      selected.push(ch.text);
      totalLen += ch.text.length;
    }

    return selected.join('\n\n---\n\n');
  }

  /**
   * Get precise chapter-aware context for a specific learning task from document
   */
  async getPreciseContext(doc: UserDocument, task: TaskContextMeta): Promise<string> {
    const chNum = this.extractChapterNumber(task);
    const companion = this.loadCompanionChapters(doc);

    // 1. Try with companion chapters
    if (companion && Array.isArray(companion.chapters)) {
      if (chNum !== null) {
        const matched = companion.chapters.find(c => c.index === chNum);
        if (matched) {
          const parts = [
            `【原书专属知识切片（《${doc.title}》- 第 ${matched.index} 章: ${matched.title}${matched.page_range ? `，页码: ${matched.page_range}` : ''}）】\n${matched.sample_content}`
          ];

          // Also pull adjacent chapter summaries if available for broad perspective
          const prev = companion.chapters.find(c => c.index === chNum - 1);
          const next = companion.chapters.find(c => c.index === chNum + 1);
          if (prev) {
            parts.push(`【前置章节背景（第 ${prev.index} 章: ${prev.title}）】\n${prev.sample_content.slice(0, 1500)}...`);
          }
          if (next) {
            parts.push(`【后置进阶延伸（第 ${next.index} 章: ${next.title}）】\n${next.sample_content.slice(0, 1500)}...`);
          }

          return parts.join('\n\n');
        }
      }

      // If chapter number not directly recognized, try fuzzy matching title in chapters
      for (const ch of companion.chapters) {
        const normalizedChTitle = ch.title.replace(/\s+/g, '');
        const normalizedTaskTitle = task.title.replace(/\s+/g, '');
        if (normalizedChTitle.includes(normalizedTaskTitle) || normalizedTaskTitle.includes(normalizedChTitle.slice(0, 6))) {
          return `【原书专属知识切片（《${doc.title}》- 第 ${ch.index} 章: ${ch.title}）】\n${ch.sample_content}`;
        }
      }
    }

    // 2. Try parsing slices from doc.content if formatted with chapter headers
    const textSlices = this.extractSlicesFromText(doc.content);
    if (textSlices.length > 0 && chNum !== null) {
      const matched = textSlices.find(s => s.index === chNum);
      if (matched) {
        return `【原书专属知识切片（《${doc.title}》- ${matched.title}${matched.page_range ? `，页码: ${matched.page_range}` : ''}）】\n${matched.sample_content}`;
      }
    }

    // 3. Fallback to keyword-based semantic retrieval across document content
    const keywords = [
      task.title,
      ...(task.tags || []),
      ...(task.title.split(/[\s\-—_、，,()（）]+/).filter(w => w.length >= 2)),
    ];

    const snippet = this.searchKeywordSnippets(doc.content, keywords, 8000);
    return `【教材《${doc.title}》高关联知识检索切片】\n${snippet}`;
  }
}

export const ragService = new RagService();
