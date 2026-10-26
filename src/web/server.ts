import express from 'express';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';
import fs, { existsSync } from 'node:fs';
import type { Server } from 'http';
import { storage } from '../storage/index.js';
import { DependencyViewService, TaskService, TagService } from '../services/index.js';

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

    app.use(express.json());

    app.get('/api/meta', (_req, res) => {
      res.json(appMetadata);
    });

    app.get('/api/projects', async (_req, res) => {
      try {
        const projects = await storage.listProjects();
        res.json(projects);
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.get('/api/projects/:id', async (req, res) => {
      try {
        const project = await storage.readProject(req.params.id);
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
        const list = loadAnnotations();
        res.json({ success: true, data: list });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.post('/api/annotations', (req, res) => {
      try {
        const { taskId, taskTitle, selectedText, comment } = req.body;
        if (!selectedText || !comment) {
          res.status(400).json({ error: 'selectedText and comment are required' });
          return;
        }
        const list = loadAnnotations();
        const newAnnotation = {
          id: 'ann_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          taskId: taskId || '',
          taskTitle: taskTitle || '',
          selectedText: selectedText.trim(),
          comment: comment.trim(),
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

    app.delete('/api/annotations/:id', (req, res) => {
      try {
        const { id } = req.params;
        let list = loadAnnotations();
        list = list.filter((item: any) => item.id !== id);
        syncAnnotationsToFile(list);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.post('/api/projects', async (req, res) => {
      try {
        const project = await storage.createProject(req.body);
        res.json({ success: true, data: project });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.put('/api/projects', async (req, res) => {
      try {
        const { projectId, ...updateData } = req.body;
        const project = await storage.updateProject(projectId, updateData);
        res.json({ success: true, data: project });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    app.delete('/api/projects', async (req, res) => {
      try {
        const { projectId } = req.query;
        await storage.deleteProject(projectId as string);
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
