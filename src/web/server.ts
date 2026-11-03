import express from 'express';
import multer from 'multer';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';
import fs, { existsSync } from 'node:fs';
import type { Server } from 'http';
import { storage } from '../storage/index.js';
import os from 'node:os';
import { DependencyViewService, TaskService, TagService, authService, aiService, documentService, bookPipelineService, ragService, vaultService } from '../services/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolve the path to the web app static files using multiple fallback strategies.
 * Handles npx execution, global installation, local development, and bundled execution.
 */
function resolveAppPath(): string {
  const candidates: Array<{ path: string; source: string }> = [];

  try {
    const require = createRequire(import.meta.url);
    const pkgRoot = path.dirname(require.resolve('../../package.json'));
    candidates.push({ path: path.join(pkgRoot, 'dist/web/app'), source: 'package.json resolve' });
  } catch {
    // Package.json not resolvable
  }

  // Primary path when bundled: __dirname = dist/, so dist/web/app is correct
  candidates.push({ path: path.join(__dirname, 'web/app'), source: '__dirname/web/app' });
  candidates.push({ path: path.join(__dirname, 'app'), source: '__dirname relative' });
  candidates.push({ path: path.join(process.cwd(), 'dist/web/app'), source: 'process.cwd()' });
  candidates.push({ path: path.join(__dirname, '../web/app'), source: '__dirname/../web/app' });

  for (const { path: candidatePath, source } of candidates) {
    const indexPath = path.join(candidatePath, 'index.html');
    if (existsSync(indexPath)) {
      console.error(`[roadmap-skill] Static files found at: ${candidatePath} (via ${source})`);
      return candidatePath;
    }
  }

  const triedPaths = candidates.map(c => `  - ${c.path} (${c.source})`).join('\n');
  throw new Error(
    `Cannot find web app static files.\n\n` +
    `Tried:\n${triedPaths}\n\n` +
    `Ensure the package is installed correctly and web assets exist.`
  );
}

const tagService = new TagService(storage);
const dependencyViewService = new DependencyViewService(storage);

function unwrapDependencyViewMutation(data: unknown): unknown {
  if (typeof data !== 'object' || data === null || !('view' in data)) {
    return data;
  }

  return (data as { view: unknown }).view;
}

function normalizeRepositoryUrl(repository: string | undefined): string | null {
  if (!repository) {
    return null;
  }

  if (repository.startsWith('git@github.com:')) {
    return `https://github.com/${repository.slice('git@github.com:'.length).replace(/\.git$/, '')}`;
  }

  return repository.replace(/^git\+/, '').replace(/\.git$/, '');
}

function resolveAppMetadata(): { version: string; repositoryUrl: string } {
  const fallback = {
    version: '0.0.0',
    repositoryUrl: 'https://github.com/shiquda/roadmap-skill',
  };

  const candidates: string[] = [];

  try {
    const require = createRequire(import.meta.url);
    try {
      const pkgRoot = path.dirname(require.resolve('../../package.json'));
      candidates.push(path.join(pkgRoot, 'package.json'));
    } catch {
    }

    candidates.push(path.join(process.cwd(), 'package.json'));
    candidates.push(path.join(__dirname, '../../package.json'));
    candidates.push(path.join(__dirname, '../package.json'));

    for (const candidate of candidates) {
      if (!existsSync(candidate)) {
        continue;
      }

      const pkg = require(candidate) as {
        version?: string;
        repository?: string | { url?: string };
        homepage?: string;
      };
      const repository = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;

      return {
        version: pkg.version ?? fallback.version,
        repositoryUrl: normalizeRepositoryUrl(repository) ?? pkg.homepage ?? fallback.repositoryUrl,
      };
    }
  } catch {
  }

  return fallback;
}

const appMetadata = resolveAppMetadata();

export function createServer(port: number = 7860): Promise<Server> {
  return new Promise((resolve, reject) => {
    const app = express();

    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: true }));

    function getAuthUser(req: express.Request): { id: string; username: string } | null {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
      }
      const token = authHeader.slice(7).trim();
      return authService.verifyToken(token);
    }

    // ==========================================
    // Auth Routes
    // ==========================================
    app.post('/api/auth/register', async (req, res) => {
      try {
        const { username, password } = req.body;
        const result = await authService.register(username, password);
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    app.post('/api/auth/login', async (req, res) => {
      try {
        const { username, password } = req.body;
        const result = await authService.login(username, password);
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    app.get('/api/auth/me', (req, res) => {
      const user = getAuthUser(req);
      if (!user) {
        res.status(401).json({ error: '未登录或登录已过期' });
        return;
      }
      res.json({ success: true, data: user });
    });

    app.get('/api/meta', (_req, res) => {
      res.json(appMetadata);
    });

    // ==========================================
    // AI Provider & Chat Routes
    // ==========================================
    app.get('/api/ai/providers', (_req, res) => {
      res.json({
        success: true,
        data: aiService.getPresetProviders(),
      });
    });

    app.post('/api/ai/test', async (req, res) => {
      try {
        const result = await aiService.testConnection(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message });
      }
    });

    app.post('/api/ai/models', async (req, res) => {
      try {
        const result = await aiService.fetchModels(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ success: false, error: (error as Error).message });
      }
    });

    app.post('/api/ai/chat', async (req, res) => {
      try {
        const upstreamRes = await aiService.streamChat(req.body);
        if (!upstreamRes.ok) {
          const errText = await upstreamRes.text();
          let msg = `Upstream error ${upstreamRes.status}: ${upstreamRes.statusText}`;
          try {
            const parsed = JSON.parse(errText);
            if (parsed.error?.message) msg = parsed.error.message;
          } catch {}
          res.status(upstreamRes.status).json({ error: msg });
          return;
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        if (!upstreamRes.body) {
          res.end();
          return;
        }

        const reader = upstreamRes.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      } catch (error) {
        if (!res.headersSent) {
          res.status(500).json({ error: (error as Error).message });
        } else {
          res.end();
        }
      }
    });

    // ==========================================
    // AI Enrich Task (Read Materials & Fill Card)
    // ==========================================
    app.post('/api/ai/enrich-task', async (req, res) => {
      try {
        const user = getAuthUser(req);
        if (!user) {
          res.status(401).json({ error: '请先登录账号以启用 AI 智能点亮与讲义生成' });
          return;
        }

        const {
          projectId,
          taskId,
          documentIds,
          targetLevel,
          focusPrompt,
          provider,
          baseUrl,
          apiKey,
          model,
        } = req.body;

        if (!projectId || !taskId) {
          res.status(400).json({ error: '缺少 projectId 或 taskId' });
          return;
        }

        const taskResult = await TaskService.get(projectId, taskId);
        if (!taskResult.success || !taskResult.data) {
          res.status(404).json({ error: (taskResult as any).error || '未找到目标学习节点' });
          return;
        }

        const task = taskResult.data;

        // Collect relevant materials using precise chapter-aware RAG
        let materialSnippets = '';
        const userDocs = await documentService.list(user.id);

        if (Array.isArray(documentIds) && documentIds.length > 0) {
          for (const docId of documentIds) {
            const doc = await documentService.get(user.id, docId);
            if (doc) {
              const snippet = await ragService.getPreciseContext(doc, {
                title: task.title,
                description: task.description,
                tags: task.tags,
              });
              materialSnippets += `\n\n${snippet}`;
            }
          }
        } else if (userDocs.length > 0) {
          // Prioritize documents belonging to current project
          const projectDocs = userDocs.filter(d => d.projectId === projectId);
          const candidateDocs = projectDocs.length > 0 ? projectDocs : userDocs;
          for (const docSummary of candidateDocs.slice(0, 3)) {
            const doc = await documentService.get(user.id, docSummary.id);
            if (doc) {
              const snippet = await ragService.getPreciseContext(doc, {
                title: task.title,
                description: task.description,
                tags: task.tags,
              });
              materialSnippets += `\n\n${snippet}`;
            }
          }
        }

        // Get project info
        const projectData = await storage.readProject(projectId);
        const projectTopic = projectData?.project?.name || '专属学习技能树';

        const richDescription = await aiService.enrichTaskNotes({
          taskTitle: task.title,
          taskDescription: task.description,
          projectTopic,
          materialSnippets: materialSnippets || '（未检索到直接上传的讲义文件，请结合标准知识库与权威技术原理深入阐述）',
          targetLevel,
          focusPrompt,
          provider,
          baseUrl,
          apiKey,
          model,
        });

        // Automatically update task in storage and set status to in-progress if currently todo
        const newStatus = task.status === 'todo' ? 'in-progress' : task.status;
        const updateRes = await TaskService.update(projectId, taskId, {
          description: richDescription,
          status: newStatus,
        });

        // Trigger Obsidian Vault auto-sync in background
        const finalTask = updateRes.success ? updateRes.data : { ...task, description: richDescription, status: newStatus };
        if (projectData?.project && finalTask) {
          vaultService.syncTaskNote(projectData.project, finalTask as any).catch(err => {
            console.warn('[Vault] Auto-sync on enrich-task failed:', err);
          });
        }

        res.json({
          success: true,
          description: richDescription,
          task: finalTask,
        });
      } catch (err: any) {
        console.error('enrich-task error:', err);
        res.status(500).json({ error: err.message || 'AI 研读资料填充失败' });
      }
    });

    // ==========================================
    // AI Explain Highlight / Annotation
    // ==========================================
    app.post('/api/ai/explain-annotation', async (req, res) => {
      try {
        const {
          selectedText,
          comment,
          taskTitle,
          contextText,
          intent,
          projectId,
          taskId,
          provider,
          baseUrl,
          apiKey,
          model,
        } = req.body;

        if (!selectedText) {
          res.status(400).json({ error: '缺少划选文字' });
          return;
        }

        let chapterContext = '';
        const user = getAuthUser(req);
        if (user && projectId) {
          try {
            const docs = await documentService.list(user.id, projectId);
            if (docs.length > 0) {
              const targetDoc = await documentService.get(user.id, docs[0].id);
              if (targetDoc) {
                chapterContext = await ragService.getPreciseContext(targetDoc, {
                  title: taskTitle || '',
                });
              }
            }
          } catch {}
        }

        const reply = await aiService.explainAnnotation({
          selectedText,
          comment,
          taskTitle: taskTitle || '当前课件',
          contextText: chapterContext
            ? `${contextText}\n\n【教材关联原文章节背景】：\n${chapterContext.slice(0, 3500)}`
            : contextText,
          intent,
          provider,
          baseUrl,
          apiKey,
          model,
        });

        res.json({ success: true, reply });
      } catch (err: any) {
        console.error('explain-annotation error:', err);
        res.status(500).json({ error: err.message || 'AI 划词答疑失败' });
      }
    });

    // ==========================================
    // User Document / Knowledge Base Routes
    // ==========================================
    app.get('/api/documents', async (req, res) => {
      try {
        const user = getAuthUser(req);
        if (!user) {
          res.json({ success: true, data: [] });
          return;
        }
        const projectId = req.query.projectId as string | undefined;
        const docs = await documentService.list(user.id, projectId);
        res.json({ success: true, data: docs });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.get('/api/documents/:id', async (req, res) => {
      try {
        const user = getAuthUser(req);
        if (!user) {
          res.status(401).json({ error: '未登录' });
          return;
        }
        const doc = await documentService.get(user.id, req.params.id);
        if (!doc) {
          res.status(404).json({ error: '资料未找到或无权访问' });
          return;
        }
        res.json({ success: true, data: doc });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    const uploadHandler = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
      },
    });

    app.post('/api/documents/upload', uploadHandler.single('file'), async (req, res) => {
      try {
        const user = getAuthUser(req);
        if (!user) {
          res.status(401).json({ error: '请先登录账号以上传个人专属资料' });
          return;
        }
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: '未接收到上传的文件内容' });
          return;
        }

        // Recover proper UTF-8 filename if transmitted with latin1 encoding
        let originalName = file.originalname;
        try {
          originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        } catch {}

        const ext = (originalName.split('.').pop() || 'txt').toLowerCase();
        const { projectId, projectName, title, tags } = req.body;
        const finalTitle = title || originalName.replace(/\.[^/.]+$/, '');

        let parsedTags: string[] = [];
        if (tags) {
          try {
            parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
          } catch {
            parsedTags = [];
          }
        }

        const doc = await documentService.create(user.id, {
          projectId: projectId || undefined,
          projectName: projectName || undefined,
          title: finalTitle,
          originalName,
          fileType: ext,
          buffer: file.buffer,
          tags: parsedTags,
        });

        res.json({ success: true, data: doc });
      } catch (error) {
        console.error('Document upload error:', error);
        res.status(400).json({ error: (error as Error).message });
      }
    });

    // Multi-channel Concurrent Chunk Upload Endpoint
    app.post('/api/documents/upload-chunk', uploadHandler.single('chunk'), async (req, res) => {
      try {
        const user = getAuthUser(req);
        if (!user) {
          res.status(401).json({ error: '请先登录账号后上传资料' });
          return;
        }

        const chunkFile = req.file;
        if (!chunkFile) {
          res.status(400).json({ error: '分片二进制数据缺失' });
          return;
        }

        const uploadId = req.body.uploadId;
        const chunkIndex = parseInt(req.body.chunkIndex, 10);
        const totalChunks = parseInt(req.body.totalChunks, 10);

        if (!uploadId || isNaN(chunkIndex) || isNaN(totalChunks)) {
          res.status(400).json({ error: '分片元参数无效' });
          return;
        }

        const result = await documentService.saveChunk(uploadId, chunkIndex, totalChunks, chunkFile.buffer);
        res.json({ success: true, ...result });
      } catch (error) {
        console.error('Chunk upload error:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Merge Chunks and Finalize Document
    app.post('/api/documents/merge-chunks', async (req, res) => {
      try {
        const user = getAuthUser(req);
        if (!user) {
          res.status(401).json({ error: '请先登录账号后操作资料' });
          return;
        }

        const { uploadId, totalChunks, originalName, fileType, title, projectId, projectName, tags } = req.body;
        if (!uploadId || !totalChunks || !originalName) {
          res.status(400).json({ error: '缺少必要的合并参数' });
          return;
        }

        let parsedTags: string[] = [];
        if (tags) {
          try {
            parsedTags = Array.isArray(tags) ? tags : JSON.parse(tags);
          } catch {
            parsedTags = [];
          }
        }

        const doc = await documentService.mergeChunks(user.id, {
          uploadId,
          totalChunks: parseInt(totalChunks, 10),
          originalName,
          fileType: fileType || 'pdf',
          title,
          projectId: projectId || undefined,
          projectName: projectName || undefined,
          tags: parsedTags,
        });

        res.json({ success: true, data: doc });
      } catch (error) {
        console.error('Merge chunks error:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.post('/api/documents', async (req, res) => {
      try {
        const user = getAuthUser(req);
        if (!user) {
          res.status(401).json({ error: '请先登录账号以上传个人专属资料' });
          return;
        }
        const { title, originalName, fileType, content, base64, tags, projectId, projectName } = req.body;
        const doc = await documentService.create(user.id, {
          projectId,
          projectName,
          title,
          originalName,
          fileType,
          content,
          base64,
          tags,
        });
        res.json({ success: true, data: doc });
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    app.put('/api/documents/:id', async (req, res) => {
      try {
        const user = getAuthUser(req);
        if (!user) {
          res.status(401).json({ error: '未登录' });
          return;
        }
        const { projectId, projectName, title, tags } = req.body;
        const doc = await documentService.update(user.id, req.params.id, {
          projectId,
          projectName,
          title,
          tags,
        });
        if (!doc) {
          res.status(404).json({ error: '资料未找到或无权修改' });
          return;
        }
        res.json({ success: true, data: doc });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.delete('/api/documents/:id', async (req, res) => {
      try {
        const user = getAuthUser(req);
        if (!user) {
          res.status(401).json({ error: '未登录' });
          return;
        }
        const success = await documentService.delete(user.id, req.params.id);
        res.json({ success });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

        // ==========================================
    // AI Skill Tree Generator from Materials (with Deep Book Pipeline)
    // ==========================================
    app.post('/api/ai/generate-roadmap', async (req, res) => {
      const isStream = req.body?.stream === true;

      const sendProgress = (step: number, totalSteps: number, message: string, percent: number) => {
        if (isStream) {
          res.write(`data: ${JSON.stringify({ type: 'progress', step, totalSteps, message, percent })}\n\n`);
          if ((res as any).flush) (res as any).flush();
        }
      };

      try {
        const user = getAuthUser(req);
        if (!user) {
          if (isStream) {
            res.write(`data: ${JSON.stringify({ type: 'error', error: '请先登录账号以生成您的专属技能树' })}\n\n`);
            res.end();
          } else {
            res.status(401).json({ error: '请先登录账号以生成您的专属技能树' });
          }
          return;
        }

        if (isStream) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
        }

        const {
          documentIds,
          rawMaterialText,
          topicName,
          targetLevel,
          provider,
          baseUrl,
          apiKey,
          model,
        } = req.body;

        sendProgress(1, 4, '准备解析教材与参考资料...', 10);

        let plan: any = null;

        // Try Deep Book Pipeline if an uploaded document is selected
        if (Array.isArray(documentIds) && documentIds.length > 0) {
          const doc = await documentService.get(user.id, documentIds[0]);
          if (doc) {
            let bookFilePath = doc.filePath;
            if (!bookFilePath || !fs.existsSync(bookFilePath)) {
              // Create temporary file from doc content if raw file missing
              const tempDir = path.join(os.tmpdir(), 'book_pipeline');
              if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
              bookFilePath = path.join(tempDir, `${doc.id}.txt`);
              fs.writeFileSync(bookFilePath, doc.content, 'utf-8');
            }

            try {
              sendProgress(1, 4, `启动沙箱解析《${doc.title}》目录树与知识章节...`, 15);
              const parsedBook = await bookPipelineService.parseBookFile(bookFilePath);
              if (parsedBook && parsedBook.chapter_count > 1) {
                plan = await bookPipelineService.generateDeepSkillTree({
                  bookData: parsedBook,
                  topicName: topicName || doc.title,
                  targetLevel,
                  provider,
                  baseUrl,
                  apiKey,
                  model,
                  onProgress: (p) => sendProgress(p.step, p.totalSteps, p.message, p.percent),
                });
              }
            } catch (err: any) {
              console.warn('Deep book pipeline fallback to standard:', err.message);
            }
          }
        }

        // Fallback to standard generation if deep pipeline not applicable
        if (!plan) {
          sendProgress(2, 4, '正在梳理教材资料并规划专属技能树...', 45);
          let combinedMaterial = rawMaterialText || '';

          if (Array.isArray(documentIds) && documentIds.length > 0) {
            for (const docId of documentIds) {
              const doc = await documentService.get(user.id, docId);
              if (doc && doc.content) {
                combinedMaterial += `\n\n【教材/资料：《${doc.title}》】\n${doc.content.slice(0, 15000)}`;
              }
            }
          }

          if (!combinedMaterial.trim()) {
            throw new Error('未提供任何教材文本或未选中有效资料');
          }

          plan = await aiService.generateSkillTreePlan({
            materialText: combinedMaterial,
            topicName: topicName || '专属学习技能树',
            targetLevel: targetLevel || '初学者至实战专家',
            provider,
            baseUrl,
            apiKey,
            model,
          });
        }

        sendProgress(4, 4, '正在存储并编排可视化拓扑视图...', 95);

        let existingProject: any = null;
        let targetProjId = req.body.projectId;
        if (!targetProjId && Array.isArray(documentIds) && documentIds.length > 0) {
          const firstDoc = await documentService.get(user.id, documentIds[0]);
          if (firstDoc?.projectId) {
            targetProjId = firstDoc.projectId;
          }
        }
        if (targetProjId) {
          try {
            const loaded = await storage.readProject(targetProjId);
            if (loaded && (!loaded.project.userId || loaded.project.userId === user.id)) {
              existingProject = loaded;
            }
          } catch {}
        }

        const projectId = existingProject ? existingProject.project.id : `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        const now = new Date().toISOString();

        const milestones = (plan.milestones || []).map((m: any, idx: number) => ({
          id: `ms_${Date.now()}_${idx}`,
          title: m.title,
          description: '',
          targetDate: '',
          status: 'planned' as const,
          order: idx + 1,
          createdAt: now,
          updatedAt: now,
        }));

        const milestoneIdMap: Record<string, string> = {};
        (plan.milestones || []).forEach((m: any, idx: number) => {
          milestoneIdMap[m.id] = milestones[idx].id;
        });

        const taskIdMap: Record<string, string> = {};
        const tasks = (plan.tasks || []).map((t: any, idx: number) => {
          const newTaskId = `task_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
          taskIdMap[t.id] = newTaskId;
          return {
            id: newTaskId,
            projectId,
            title: t.title,
            description: t.description || '',
            status: idx === 0 ? ('in-progress' as const) : ('todo' as const),
            priority: t.priority || 'medium',
            milestoneId: milestoneIdMap[t.milestoneId] || milestones[0]?.id || null,
            assignedTo: null,
            estimatedHours: null,
            actualHours: null,
            startDate: null,
            dueDate: null,
            completedAt: null,
            tags: t.tags || [],
            metadata: {},
            createdAt: now,
            updatedAt: now,
          };
        });

        const graphId = existingProject?.dependencyViews?.[0]?.id || `view_${Date.now()}`;
        const nodes = tasks.map((t: any, idx: number) => ({
          taskId: t.id,
          x: 60 + 280 * (idx % 3),
          y: 120 + 180 * Math.floor(idx / 3),
          collapsed: false,
          note: t.title,
        }));

        const validTaskIds = new Set(tasks.map((t: any) => t.id));
        const edges = (plan.dependencies || [])
          .map((dep: any, idx: number) => {
            const s = taskIdMap[dep.source] || dep.source;
            const t = taskIdMap[dep.target] || dep.target;
            return {
              id: `edge_${Date.now()}_${idx}`,
              fromTaskId: s,
              toTaskId: t,
              kind: 'hard' as const,
              createdAt: now,
            };
          })
          .filter((e: any) => validTaskIds.has(e.fromTaskId) && validTaskIds.has(e.toTaskId) && e.fromTaskId !== e.toTaskId);

        const finalProjectName = existingProject ? existingProject.project.name : (plan.name || topicName);

        const dependencyView = {
          id: graphId,
          projectId,
          name: '🌟 技能拓扑树',
          description: `基于《${finalProjectName}》由沙箱与大模型深度解构构建的认知进阶路径`,
          dimension: null,
          revision: 1,
          nodes,
          edges,
          createdAt: now,
          updatedAt: now,
        };

        const projectData = {
          version: 1,
          project: {
            id: projectId,
            name: finalProjectName,
            description: plan.description || existingProject?.project?.description || '根据教材自动提炼生成的专属技能树',
            projectType: 'skill-tree' as const,
            status: 'active' as const,
            startDate: existingProject?.project?.startDate || now,
            targetDate: existingProject?.project?.targetDate || '',
            userId: user.id, // Strictly isolated per user!
            createdAt: existingProject?.project?.createdAt || now,
            updatedAt: now,
          },
          milestones,
          tasks,
          tags: existingProject?.tags || [],
          dependencyViews: [dependencyView],
        };

        await storage.saveFullProject(projectData);

        // Auto-bind source document(s) to this project
        if (Array.isArray(documentIds)) {
          for (const docId of documentIds) {
            await documentService.update(user.id, docId, {
              projectId,
              projectName: finalProjectName,
            }).catch(() => {});
          }
        }

        if (isStream) {
          res.write(`data: ${JSON.stringify({ type: 'done', data: projectData })}\n\n`);
          res.end();
        } else {
          res.json({ success: true, data: projectData });
        }
      } catch (err: any) {
        console.error('generate-roadmap error:', err);
        if (isStream) {
          res.write(`data: ${JSON.stringify({ type: 'error', error: err.message || '生成技能树失败' })}\n\n`);
          res.end();
        } else {
          res.status(500).json({ error: err.message || '生成技能树失败' });
        }
      }
    });

    app.get('/api/projects', async (req, res) => {
      try {
        const user = getAuthUser(req);
        const projects = await storage.listProjects(user?.id);
        res.json(projects);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.get('/api/projects/:id', async (req, res) => {
      try {
        const user = getAuthUser(req);
        const project = await storage.readProject(req.params.id, user?.id);
        if (!project) {
          res.status(404).json({ error: 'Project not found' });
          return;
        }
        res.json(project);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.get('/api/projects/:projectId/dependency-views', async (req, res) => {
      try {
        const result = await dependencyViewService.list(req.params.projectId);
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true, data: unwrapDependencyViewMutation(result.data) });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.post('/api/projects/:projectId/dependency-views', async (req, res) => {
      try {
        const result = await dependencyViewService.create(req.params.projectId, req.body);
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true, data: unwrapDependencyViewMutation(result.data) });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.get('/api/projects/:projectId/dependency-views/:viewId', async (req, res) => {
      try {
        const result = await dependencyViewService.get(req.params.projectId, req.params.viewId);
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true, data: unwrapDependencyViewMutation(result.data) });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.put('/api/projects/:projectId/dependency-views/:viewId', async (req, res) => {
      try {
        const result = await dependencyViewService.update(req.params.projectId, req.params.viewId, req.body);
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true, data: unwrapDependencyViewMutation(result.data) });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.delete('/api/projects/:projectId/dependency-views/:viewId', async (req, res) => {
      try {
        const result = await dependencyViewService.delete(req.params.projectId, req.params.viewId);
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.post('/api/projects/:projectId/dependency-views/:viewId/nodes', async (req, res) => {
      try {
        const result = await dependencyViewService.addNode(req.params.projectId, req.params.viewId, req.body);
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true, data: unwrapDependencyViewMutation(result.data) });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.put('/api/projects/:projectId/dependency-views/:viewId/nodes/:taskId', async (req, res) => {
      try {
        const result = await dependencyViewService.updateNode(
          req.params.projectId,
          req.params.viewId,
          req.params.taskId,
          req.body
        );
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true, data: unwrapDependencyViewMutation(result.data) });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.put('/api/projects/:projectId/dependency-views/:viewId/nodes', async (req, res) => {
      try {
        const result = await dependencyViewService.batchUpdateNodes(
          req.params.projectId,
          req.params.viewId,
          req.body
        );
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true, data: unwrapDependencyViewMutation(result.data) });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.delete('/api/projects/:projectId/dependency-views/:viewId/nodes/:taskId', async (req, res) => {
      try {
        const result = await dependencyViewService.removeNode(req.params.projectId, req.params.viewId, req.params.taskId);
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true, data: unwrapDependencyViewMutation(result.data) });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.post('/api/projects/:projectId/dependency-views/:viewId/edges', async (req, res) => {
      try {
        const result = await dependencyViewService.addEdge(req.params.projectId, req.params.viewId, req.body);
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true, data: unwrapDependencyViewMutation(result.data) });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.put('/api/projects/:projectId/dependency-views/:viewId/edges/:edgeId', async (req, res) => {
      try {
        const result = await dependencyViewService.updateEdge(
          req.params.projectId,
          req.params.viewId,
          req.params.edgeId,
          req.body
        );
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true, data: unwrapDependencyViewMutation(result.data) });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.delete('/api/projects/:projectId/dependency-views/:viewId/edges/:edgeId', async (req, res) => {
      try {
        const result = await dependencyViewService.removeEdge(req.params.projectId, req.params.viewId, req.params.edgeId);
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true, data: unwrapDependencyViewMutation(result.data) });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.get('/api/projects/:projectId/dependency-views/:viewId/analyze', async (req, res) => {
      try {
        const result = await dependencyViewService.analyze(req.params.projectId, req.params.viewId);
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true, data: result.data });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.get('/api/tasks', async (req, res) => {
      try {
        const filters: Record<string, unknown> = { ...req.query };

        // Convert includeCompleted from string to boolean
        if (filters.includeCompleted !== undefined) {
          filters.includeCompleted = filters.includeCompleted === 'true';
        }

        const tasks = await storage.searchTasks(filters as any);
        res.json(tasks);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // ==========================================
    // Annotations & Questions APIs for Agent Pairing
    // ==========================================
    const notesDir = path.resolve('e:/Learn/notes');
    const annotationsFile = path.join(notesDir, 'user_annotations.json');
    const annotationsMdFile = path.join(notesDir, '我的学习批注与疑问.md');

    function loadAnnotations(): any[] {
      try {
        if (!fs.existsSync(annotationsFile)) return [];
        return JSON.parse(fs.readFileSync(annotationsFile, 'utf-8'));
      } catch {
        return [];
      }
    }

    function syncAnnotationsToFile(list: any[]) {
      try {
        if (!fs.existsSync(notesDir)) {
          fs.mkdirSync(notesDir, { recursive: true });
        }
        fs.writeFileSync(annotationsFile, JSON.stringify(list, null, 2), 'utf-8');

        let md = '# 📝 我的 Pwn 学习批注与疑问清单 (实时同步)\n\n';
        md += '> 💡 **说明**：你在 Web 端对讲义任何划词产生的批注和疑问都会自动同步于此。在 Antigravity 聊天中只要呼叫 Gemini，即可一键解析你划出的全部疑问！\n\n';
        md += `*最近更新时间：${new Date().toLocaleString('zh-CN')}*\n\n---\n\n`;

        if (list.length === 0) {
          md += '*当前暂无批注记录。在课程讲义中用鼠标划选任意文字，即可添加批注！*\n';
        } else {
          const groups: Record<string, any[]> = {};
          for (const item of list) {
            const title = item.taskTitle || '未分类模块';
            if (!groups[title]) groups[title] = [];
            groups[title].push(item);
          }
          for (const [title, items] of Object.entries(groups)) {
            md += `### 📌 【${title}】\n\n`;
            items.forEach((it, idx) => {
              md += `#### 疑问 ${idx + 1}（${it.createdAt || ''}）\n`;
              md += `> **划选原文**：\n> \`\`\`text\n> ${it.selectedText}\n> \`\`\`\n\n`;
              md += `❓ **我的问题/批注**：\n**${it.comment}**\n\n`;
              md += `---\n\n`;
            });
          }
        }
        fs.writeFileSync(annotationsMdFile, md, 'utf-8');
      } catch (err) {
        console.error('Failed to sync annotations to file:', err);
      }
    }

    app.get('/api/annotations', (req, res) => {
      try {
        const user = getAuthUser(req);
        let list = loadAnnotations();
        if (user) {
          list = list.filter((item: any) => !item.userId || item.userId === user.id);
        } else {
          list = list.filter((item: any) => !item.userId);
        }
        res.json({ success: true, data: list });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.post('/api/annotations', (req, res) => {
      try {
        const user = getAuthUser(req);
        const { taskId, taskTitle, selectedText, comment, aiResponse, aiStatus } = req.body;
        if (!selectedText) {
          res.status(400).json({ error: 'selectedText is required' });
          return;
        }
        const list = loadAnnotations();
        const newAnnotation = {
          id: 'ann_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          userId: user ? user.id : undefined,
          taskId: taskId || '',
          taskTitle: taskTitle || '',
          selectedText: selectedText.trim(),
          comment: (comment || '').trim(),
          aiResponse: aiResponse || undefined,
          aiStatus: aiStatus || (aiResponse ? 'answered' : 'idle'),
          createdAt: new Date().toLocaleString('zh-CN'),
          status: 'pending'
        };
        list.unshift(newAnnotation);
        syncAnnotationsToFile(list);
        res.json({ success: true, data: newAnnotation });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.put('/api/annotations/:id', (req, res) => {
      try {
        const user = getAuthUser(req);
        const { id } = req.params;
        const { comment, aiResponse, aiStatus } = req.body;
        let list = loadAnnotations();
        const index = list.findIndex((it: any) => it.id === id);
        if (index === -1) {
          res.status(404).json({ error: '批注未找到' });
          return;
        }
        if (list[index].userId && list[index].userId !== user?.id) {
          res.status(403).json({ error: '无权修改其他用户的批注' });
          return;
        }
        if (comment !== undefined) list[index].comment = comment;
        if (aiResponse !== undefined) list[index].aiResponse = aiResponse;
        if (aiStatus !== undefined) list[index].aiStatus = aiStatus;
        list[index].updatedAt = new Date().toLocaleString('zh-CN');
        syncAnnotationsToFile(list);
        res.json({ success: true, data: list[index] });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.delete('/api/annotations/:id', (req, res) => {
      try {
        const user = getAuthUser(req);
        const { id } = req.params;
        let list = loadAnnotations();
        const target = list.find((it: any) => it.id === id);
        if (target && target.userId && target.userId !== user?.id) {
          res.status(403).json({ error: '无权删除其他用户的批注' });
          return;
        }
        list = list.filter((item: any) => item.id !== id);
        syncAnnotationsToFile(list);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.post('/api/projects', async (req, res) => {
      try {
        const user = getAuthUser(req);
        const project = await storage.createProject(req.body, user?.id);
        res.json({ success: true, data: project });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.put('/api/projects', async (req, res) => {
      try {
        const user = getAuthUser(req);
        const { projectId, ...updateData } = req.body;
        const project = await storage.updateProject(projectId, updateData, user?.id);
        res.json({ success: true, data: project });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.delete('/api/projects', async (req, res) => {
      try {
        const user = getAuthUser(req);
        const { projectId } = req.query;
        await storage.deleteProject(projectId as string, user?.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.post('/api/tasks', async (req, res) => {
      try {
        const { projectId, ...taskData } = req.body;
        const result = await TaskService.create(projectId, taskData);
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true, data: result.data });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.put('/api/tasks', async (req, res) => {
      try {
        const { projectId, taskId, ...updateData } = req.body;
        const result = await TaskService.update(projectId, taskId, updateData);
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }

        // Asynchronously sync updated task note to Obsidian Vault
        if (result.data) {
          storage.readProject(projectId).then((proj) => {
            if (proj?.project) {
              vaultService.syncTaskNote(proj.project, result.data!).catch(e => {
                console.warn('[Vault] Auto-sync on task update failed:', e);
              });
            }
          }).catch(() => {});
        }

        res.json({ success: true, data: result.data });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.delete('/api/tasks', async (req, res) => {
      try {
        const { projectId, taskId } = req.query;
        const result = await TaskService.delete(projectId as string, taskId as string);
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // ==========================================
    // Obsidian Vault & Syncthing Integration APIs
    // ==========================================
    app.get('/api/vault/status', (_req, res) => {
      try {
        const status = vaultService.getStatus();
        res.json(status);
      } catch (err: any) {
        res.status(500).json({ available: false, error: err.message });
      }
    });

    app.post('/api/vault/sync-task', async (req, res) => {
      try {
        const { projectId, taskId } = req.body;
        if (!projectId || !taskId) {
          res.status(400).json({ success: false, error: '缺少 projectId 或 taskId' });
          return;
        }

        const projectData = await storage.readProject(projectId);
        if (!projectData?.project) {
          res.status(404).json({ success: false, error: '未找到对应项目' });
          return;
        }

        const taskResult = await TaskService.get(projectId, taskId);
        if (!taskResult.success || !taskResult.data) {
          res.status(404).json({ success: false, error: '未找到对应节点' });
          return;
        }

        // Extract incoming & outgoing relations from views
        const views = projectData.dependencyViews || [];
        const incoming: string[] = [];
        const outgoing: string[] = [];
        const taskMap = new Map<string, string>();
        for (const t of projectData.tasks) {
          taskMap.set(t.id, t.title);
        }

        for (const v of views) {
          for (const edge of v.edges) {
            if (edge.toTaskId === taskId && taskMap.has(edge.fromTaskId)) {
              incoming.push(taskMap.get(edge.fromTaskId)!);
            }
            if (edge.fromTaskId === taskId && taskMap.has(edge.toTaskId)) {
              outgoing.push(taskMap.get(edge.toTaskId)!);
            }
          }
        }

        const syncResult = await vaultService.syncTaskNote(
          projectData.project,
          taskResult.data,
          {
            incoming: Array.from(new Set(incoming)),
            outgoing: Array.from(new Set(outgoing)),
          }
        );

        res.json(syncResult);
      } catch (err: any) {
        console.error('sync-task vault error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.post('/api/vault/sync-project', async (req, res) => {
      try {
        const { projectId } = req.body;
        if (!projectId) {
          res.status(400).json({ success: false, error: '缺少 projectId' });
          return;
        }

        const projectData = await storage.readProject(projectId);
        if (!projectData?.project) {
          res.status(404).json({ success: false, error: '未找到对应项目' });
          return;
        }

        const views = projectData.dependencyViews || [];
        const edges: Array<{ fromTaskId: string; toTaskId: string }> = [];
        for (const v of views) {
          for (const e of v.edges) {
            edges.push({ fromTaskId: e.fromTaskId, toTaskId: e.toTaskId });
          }
        }

        const result = await vaultService.syncProjectAll(
          projectData.project,
          projectData.tasks,
          edges
        );

        res.json(result);
      } catch (err: any) {
        console.error('sync-project vault error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.get('/api/vault/read-task', async (req, res) => {
      try {
        const { projectId, taskId } = req.query;
        if (!projectId || !taskId) {
          res.status(400).json({ exists: false, error: '缺少参数' });
          return;
        }

        const projectData = await storage.readProject(projectId as string);
        if (!projectData?.project) {
          res.status(404).json({ exists: false, error: '项目不存在' });
          return;
        }

        const taskResult = await TaskService.get(projectId as string, taskId as string);
        if (!taskResult.success || !taskResult.data) {
          res.status(404).json({ exists: false, error: '任务不存在' });
          return;
        }

        const readResult = vaultService.readTaskNote(projectData.project, taskResult.data);
        res.json(readResult);
      } catch (err: any) {
        res.status(500).json({ exists: false, error: err.message });
      }
    });

    app.post('/api/projects/:projectId/tags', async (req, res) => {
      try {
        const { projectId } = req.params;
        const result = await tagService.create(projectId, req.body);
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true, data: result.data });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.get('/api/projects/:projectId/tags', async (req, res) => {
      try {
        const { projectId } = req.params;
        const result = await tagService.list(projectId);
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true, data: result.data });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.put('/api/projects/:projectId/tags/:tagId', async (req, res) => {
      try {
        const { projectId, tagId } = req.params;
        const result = await tagService.update(projectId, tagId, req.body);
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true, data: result.data });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.delete('/api/projects/:projectId/tags/:tagId', async (req, res) => {
      try {
        const { projectId, tagId } = req.params;
        const result = await tagService.delete(projectId, tagId);
        if (!result.success) {
          const statusCode = result.code === 'NOT_FOUND' ? 404 : 400;
          res.status(statusCode).json({ error: result.error });
          return;
        }
        res.json({ success: true, data: result.data });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.get('/api/backup', async (_req, res) => {
      try {
        const backup = await storage.exportAllData();
        const filename = `roadmap-skill-backup-${new Date().toISOString().split('T')[0]}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.json(backup);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.post('/api/backup', async (req, res) => {
      try {
        const result = await storage.importAllData(req.body);
        res.json(result);
      } catch (error) {
        res.status(400).json({
          success: false,
          error: (error as Error).message,
        });
      }
    });

    const distPath = resolveAppPath();
    app.use(express.static(distPath));

    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) {
        res.status(404).json({ error: 'API not found' });
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });

    const server = app.listen(port, '127.0.0.1');

    server.once('listening', () => {
      console.error(`Web interface server running at http://localhost:${port}`);
      resolve(server);
    });

    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use`));
        return;
      }

      reject(error);
    });
  });
}

// Start server if run directly
if (process.argv[1]?.endsWith('server.js')) {
  const port = parseInt(process.argv[2] || '7860', 10);
  createServer(port).catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
