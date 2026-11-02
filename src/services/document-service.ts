import * as path from 'path';
import * as fs from 'fs';
import { getStorageDir } from '../utils/path-helpers.js';
import { ensureDir, readJsonFile, writeJsonFile } from '../utils/file-helpers.js';

export interface UserDocument {
  id: string;
  userId: string;
  projectId?: string;
  projectName?: string;
  title: string;
  originalName: string;
  fileType: string; // 'pdf' | 'md' | 'txt' | 'code' | 'json' | 'text'
  size: number;
  textLength: number;
  content: string; // Extracted pure text for AI feeding
  filePath?: string; // Physical file path on disk for sandbox/deep parsing
  summary?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserDocumentSummary {
  id: string;
  userId: string;
  projectId?: string;
  projectName?: string;
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

  private getTempChunkDir(uploadId: string): string {
    const safeUploadId = uploadId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.baseDocsDir, 'temp_chunks', safeUploadId);
  }

  async saveChunk(
    uploadId: string,
    chunkIndex: number,
    totalChunks: number,
    chunkBuffer: Buffer
  ): Promise<{ received: number; chunkIndex: number; totalChunks: number }> {
    if (!uploadId || chunkIndex < 0 || totalChunks <= 0 || !chunkBuffer) {
      throw new Error('分片上传参数不完整');
    }
    const tempDir = this.getTempChunkDir(uploadId);
    await ensureDir(tempDir);

    const chunkPath = path.join(tempDir, `chunk_${chunkIndex}`);
    await fs.promises.writeFile(chunkPath, chunkBuffer);

    return {
      received: chunkBuffer.length,
      chunkIndex,
      totalChunks,
    };
  }

  async mergeChunks(
    userId: string,
    input: {
      uploadId: string;
      totalChunks: number;
      title?: string;
      originalName: string;
      fileType: string;
      projectId?: string;
      projectName?: string;
      tags?: string[];
    }
  ): Promise<UserDocument> {
    if (!userId) {
      throw new Error('未提供有效用户身份');
    }
    const { uploadId, totalChunks, originalName, fileType } = input;
    const tempDir = this.getTempChunkDir(uploadId);
    if (!fs.existsSync(tempDir)) {
      throw new Error('上传分片会话已失效或分片目录不存在');
    }

    // Verify all chunks exist
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(tempDir, `chunk_${i}`);
      if (!fs.existsSync(chunkPath)) {
        throw new Error(`缺少分片序号 ${i} / ${totalChunks}，请重新传输该分片`);
      }
    }

    const userDir = this.getUserDir(userId);
    await ensureDir(userDir);

    const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const cleanExt = (fileType || 'pdf').toLowerCase().replace(/^\./, '');
    const rawFilePath = path.join(userDir, `${docId}_raw.${cleanExt}`);

    // Stream merge chunks into final file
    let totalSize = 0;
    const writeStream = fs.createWriteStream(rawFilePath);

    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(tempDir, `chunk_${i}`);
      const chunkBuffer = await fs.promises.readFile(chunkPath);
      totalSize += chunkBuffer.length;
      await new Promise<void>((resolve) => {
        if (!writeStream.write(chunkBuffer)) {
          writeStream.once('drain', resolve);
        } else {
          process.nextTick(resolve);
        }
      });
    }

    await new Promise<void>((resolve) => {
      writeStream.end(resolve);
    });

    // Clean up temporary chunks asynchronously
    fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});

    // Fast text extraction / placeholder (Never block event loop on heavy PDFs during upload)
    let extractedText = '';
    const isTextFormat = ['txt', 'md', 'markdown', 'json', 'yaml', 'yml', 'js', 'ts', 'jsx', 'tsx', 'c', 'cpp', 'py', 'java', 'html', 'css'].includes(cleanExt);

    if (isTextFormat && totalSize < 5 * 1024 * 1024) {
      try {
        const fullContent = await fs.promises.readFile(rawFilePath, 'utf-8');
        extractedText = fullContent;
      } catch {
        extractedText = `[文本资料: 共 ${totalSize} 字节，已物理安全落盘]`;
      }
    } else {
      extractedText = `[${cleanExt.toUpperCase()} 教材资料: 共 ${(totalSize / (1024 * 1024)).toFixed(2)} MB。原件已物理完整存储。AI 读教材构建技能树时将按章流式解构]`;
    }

    const finalTitle = (input.title || originalName.replace(/\.[^/.]+$/, '') || '未命名教材').trim();
    const doc: UserDocument = {
      id: docId,
      userId,
      projectId: input.projectId || undefined,
      projectName: input.projectName || undefined,
      title: finalTitle,
      originalName: originalName || `${finalTitle}.${cleanExt}`,
      fileType: cleanExt,
      size: totalSize,
      textLength: extractedText.length,
      content: extractedText,
      filePath: rawFilePath,
      tags: input.tags || [],
      createdAt: now,
      updatedAt: now,
    };

    const docPath = this.getDocPath(userId, docId);
    await writeJsonFile(docPath, doc);
    return doc;
  }

  private getUserDir(userId: string): string {
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.baseDocsDir, safeUserId);
  }

  private getDocPath(userId: string, docId: string): string {
    const safeDocId = docId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.getUserDir(userId), `${safeDocId}.json`);
  }

  private async extractText(fileType: string, content?: string, base64?: string, bufferInput?: Buffer): Promise<{ text: string; size: number }> {
    if (content && !base64 && !bufferInput) {
      return {
        text: content,
        size: Buffer.byteLength(content, 'utf-8'),
      };
    }

    const buffer = bufferInput || (base64 ? Buffer.from(base64, 'base64') : null);
    if (buffer) {
      const size = buffer.length;

      if (fileType.toLowerCase() === 'pdf') {
        try {
          const pdfParseModule = await import('pdf-parse');
          let text = '';
          if (pdfParseModule.PDFParse) {
            const parser = new pdfParseModule.PDFParse({ data: buffer });
            const result = await parser.getText();
            text = result.text || '';
            await parser.destroy();
          } else {
            const pdfParse = (pdfParseModule as any).default || pdfParseModule;
            const parsed = await pdfParse(buffer);
            text = parsed.text || '';
          }
          if (!text.trim()) {
            text = `[PDF 文档: 共 ${size} 字节。未检测到纯文本层（可能是扫描件或图片型 PDF），已保留原件物理存储供 AI 解构]`;
          }
          return { text, size };
        } catch (err: any) {
          console.error('PDF text extraction notice:', err);
          return {
            text: `[PDF 文档: 共 ${size} 字节。文本层提取提示: ${err.message || '文件格式复杂'}。原件已完整安全存盘]`,
            size,
          };
        }
      }

      // Plain text or code
      try {
        return {
          text: buffer.toString('utf-8'),
          size,
        };
      } catch {
        return {
          text: `[二进制文件: 共 ${size} 字节。已存盘供沙箱解构]`,
          size,
        };
      }
    }

    return { text: '', size: 0 };
  }

  async list(userId: string, projectId?: string): Promise<UserDocumentSummary[]> {
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
          // If specific projectId requested, allow matching project docs or global docs
          if (!projectId || doc.projectId === projectId || !doc.projectId) {
            summaries.push({
              id: doc.id,
              userId: doc.userId,
              projectId: doc.projectId,
              projectName: doc.projectName,
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
      projectId?: string;
      projectName?: string;
      title: string;
      originalName?: string;
      fileType: string;
      content?: string;
      base64?: string;
      buffer?: Buffer;
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

    const { text, size } = await this.extractText(input.fileType, input.content, input.base64, input.buffer);
    if (!text.trim()) {
      throw new Error('未能从文件或内容中提取出有效文本信息');
    }

    // Persist raw physical file on disk for sandbox and deep book decomposition
    let rawFilePath: string | undefined = undefined;
    try {
      const cleanExt = (input.fileType || 'txt').toLowerCase().replace(/^\./, '');
      rawFilePath = path.join(userDir, `${docId}_raw.${cleanExt}`);
      if (input.buffer) {
        await fs.promises.writeFile(rawFilePath, input.buffer);
      } else if (input.base64) {
        await fs.promises.writeFile(rawFilePath, Buffer.from(input.base64, 'base64'));
      } else if (input.content) {
        await fs.promises.writeFile(rawFilePath, input.content, 'utf-8');
      }
    } catch (err) {
      console.error('Failed to write raw file for document:', err);
    }

    const doc: UserDocument = {
      id: docId,
      userId,
      projectId: input.projectId || undefined,
      projectName: input.projectName || undefined,
      title: (input.title || input.originalName || '未命名资料').trim(),
      originalName: input.originalName || `${input.title}.${input.fileType}`,
      fileType: input.fileType.toLowerCase(),
      size,
      textLength: text.length,
      content: text,
      filePath: rawFilePath,
      tags: input.tags || [],
      createdAt: now,
      updatedAt: now,
    };

    const docPath = this.getDocPath(userId, docId);
    await writeJsonFile(docPath, doc);
    return doc;
  }

  async update(
    userId: string,
    docId: string,
    updateData: {
      projectId?: string | null;
      projectName?: string | null;
      title?: string;
      tags?: string[];
    }
  ): Promise<UserDocument | null> {
    if (!userId || !docId) return null;
    const doc = await this.get(userId, docId);
    if (!doc) return null;

    if (updateData.projectId !== undefined) {
      doc.projectId = updateData.projectId ? updateData.projectId : undefined;
    }
    if (updateData.projectName !== undefined) {
      doc.projectName = updateData.projectName ? updateData.projectName : undefined;
    }
    if (updateData.title !== undefined) {
      doc.title = updateData.title.trim();
    }
    if (updateData.tags !== undefined) {
      doc.tags = updateData.tags;
    }
    doc.updatedAt = new Date().toISOString();

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
      if (doc.filePath && fs.existsSync(doc.filePath)) {
        await fs.promises.unlink(doc.filePath).catch(() => {});
      }
      await fs.promises.unlink(docPath);
      return true;
    } catch {
      return false;
    }
  }
}

export const documentService = new DocumentService();
