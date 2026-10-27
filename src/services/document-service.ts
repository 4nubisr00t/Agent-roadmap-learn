import * as path from 'path';
import * as fs from 'fs';
import { getStorageDir } from '../utils/path-helpers.js';
import { ensureDir, readJsonFile, writeJsonFile } from '../utils/file-helpers.js';

export interface UserDocument {
  id: string;
  userId: string;
  title: string;
  originalName: string;
  fileType: string; // 'pdf' | 'md' | 'txt' | 'code' | 'json' | 'text'
  size: number;
  textLength: number;
  content: string; // Extracted pure text for AI feeding
  summary?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserDocumentSummary {
  id: string;
  userId: string;
  title: string;
  originalName: string;
  fileType: string;
  size: number;
  textLength: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export class DocumentService {
  private baseDocsDir: string;

  constructor() {
    const storageDir = getStorageDir();
    this.baseDocsDir = path.join(path.dirname(storageDir), 'documents');
  }

  private getUserDir(userId: string): string {
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.baseDocsDir, safeUserId);
  }

  private getDocPath(userId: string, docId: string): string {
    const safeDocId = docId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.getUserDir(userId), `${safeDocId}.json`);
  }

  private async extractText(fileType: string, content?: string, base64?: string): Promise<{ text: string; size: number }> {
    if (content && !base64) {
      return {
        text: content,
        size: Buffer.byteLength(content, 'utf-8'),
      };
    }

    if (base64) {
      const buffer = Buffer.from(base64, 'base64');
      const size = buffer.length;

      if (fileType.toLowerCase() === 'pdf') {
        try {
          const pdfParseModule = await import('pdf-parse');
          const pdfParse = (pdfParseModule as any).default || pdfParseModule;
          const parsed = await pdfParse(buffer);
          return {
            text: parsed.text || '',
            size,
          };
        } catch (err: any) {
          throw new Error(`PDF 解析失败: ${err.message || '格式不支持或文件损坏'}`);
        }
      }

      // Plain text or code
      return {
        text: buffer.toString('utf-8'),
        size,
      };
    }

    return { text: '', size: 0 };
  }

  async list(userId: string): Promise<UserDocumentSummary[]> {
    if (!userId) return [];
    const userDir = this.getUserDir(userId);
    if (!fs.existsSync(userDir)) {
      return [];
    }

    const files = await fs.promises.readdir(userDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    const summaries: UserDocumentSummary[] = [];

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(userDir, file);
        const doc = await readJsonFile<UserDocument>(filePath);
        if (doc && doc.userId === userId) {
          summaries.push({
            id: doc.id,
            userId: doc.userId,
            title: doc.title,
            originalName: doc.originalName,
            fileType: doc.fileType,
            size: doc.size,
            textLength: doc.textLength,
            tags: doc.tags || [],
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          });
        }
      } catch {
        // Skip unreadable files
      }
    }

    return summaries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async get(userId: string, docId: string): Promise<UserDocument | null> {
    if (!userId || !docId) return null;
    const docPath = this.getDocPath(userId, docId);
    if (!fs.existsSync(docPath)) {
      return null;
    }
    try {
      const doc = await readJsonFile<UserDocument>(docPath);
      if (doc.userId !== userId) {
        return null;
      }
      return doc;
    } catch {
      return null;
    }
  }

  async create(
    userId: string,
    input: {
      title: string;
      originalName?: string;
      fileType: string;
      content?: string;
      base64?: string;
      tags?: string[];
    }
  ): Promise<UserDocument> {
    if (!userId) {
      throw new Error('未提供有效用户身份');
    }

    const userDir = this.getUserDir(userId);
    await ensureDir(userDir);

    const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const { text, size } = await this.extractText(input.fileType, input.content, input.base64);
    if (!text.trim()) {
      throw new Error('未能从文件或内容中提取出有效文本信息');
    }

    const doc: UserDocument = {
      id: docId,
      userId,
      title: (input.title || input.originalName || '未命名资料').trim(),
      originalName: input.originalName || `${input.title}.${input.fileType}`,
      fileType: input.fileType.toLowerCase(),
      size,
      textLength: text.length,
      content: text,
      tags: input.tags || [],
      createdAt: now,
      updatedAt: now,
    };

    const docPath = this.getDocPath(userId, docId);
    await writeJsonFile(docPath, doc);
    return doc;
  }

  async delete(userId: string, docId: string): Promise<boolean> {
    if (!userId || !docId) return false;
    const docPath = this.getDocPath(userId, docId);
    if (!fs.existsSync(docPath)) {
      return false;
    }
    try {
      const doc = await readJsonFile<UserDocument>(docPath);
      if (doc.userId !== userId) {
        return false;
      }
      await fs.promises.unlink(docPath);
      return true;
    } catch {
      return false;
    }
  }
}

export const documentService = new DocumentService();
