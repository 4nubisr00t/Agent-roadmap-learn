/**
 * Obsidian Vault Service
 * Handles seamless two-way synchronization between AgentLearn and Obsidian Vault.
 * Integrates with Syncthing for instant multi-device desktop and mobile syncing.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Project, Task } from '../models/index.js';

export interface VaultStatus {
  available: boolean;
  vaultPath: string;
  targetFolder: string;
  projectCount: number;
  noteCount: number;
  syncthingDetected: boolean;
  message?: string;
}

export class VaultService {
  private vaultRoot: string | null = null;
  private readonly defaultSubFolder = '01-Project/AgentLearn';

  constructor() {
    this.detectVaultPath();
  }

  /**
   * Automatically resolve Obsidian Vault path
   */
  public detectVaultPath(): string | null {
    if (process.env.OBSIDIAN_VAULT_PATH && fs.existsSync(process.env.OBSIDIAN_VAULT_PATH)) {
      this.vaultRoot = process.env.OBSIDIAN_VAULT_PATH;
      return this.vaultRoot;
    }

    const candidatePaths = [
      '/home/anubis/obsidian_vault', // User production server Syncthing vault
      path.join(os.homedir(), 'obsidian_vault'),
      path.join(process.cwd(), 'obsidian_vault'),
    ];

    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
          this.vaultRoot = p;
          return this.vaultRoot;
        }
      } catch {
        // Continue fallback
      }
    }

    return null;
  }

  /**
   * Get the AgentLearn notes root inside Obsidian Vault
   */
  public getAgentLearnVaultDir(): string | null {
    const root = this.detectVaultPath();
    if (!root) return null;

    const dir = path.join(root, this.defaultSubFolder);
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      return dir;
    } catch (err) {
      console.error('[VaultService] Failed to create directory in vault:', err);
      return null;
    }
  }

  /**
   * Check status of Obsidian Vault & Syncthing
   */
  public getStatus(): VaultStatus {
    const root = this.detectVaultPath();
    if (!root) {
      return {
        available: false,
        vaultPath: '',
        targetFolder: this.defaultSubFolder,
        projectCount: 0,
        noteCount: 0,
        syncthingDetected: false,
        message: '未检测到 Obsidian 笔记库路径，请检查 /home/anubis/obsidian_vault',
      };
    }

    const agentLearnDir = path.join(root, this.defaultSubFolder);
    let projectCount = 0;
    let noteCount = 0;

    try {
      if (fs.existsSync(agentLearnDir)) {
        const items = fs.readdirSync(agentLearnDir, { withFileTypes: true });
        for (const item of items) {
          if (item.isDirectory()) {
            projectCount++;
            const subFiles = fs.readdirSync(path.join(agentLearnDir, item.name));
            noteCount += subFiles.filter(f => f.endsWith('.md')).length;
          } else if (item.name.endsWith('.md')) {
            noteCount++;
          }
        }
      }
    } catch (e) {
      console.warn('[VaultService] Error scanning notes count:', e);
    }

    // Check if syncthing markers or processes are present
    const syncthingDetected = fs.existsSync(path.join(root, '.stfolder')) || fs.existsSync(path.join(root, '.stignore'));

    return {
      available: true,
      vaultPath: root,
      targetFolder: this.defaultSubFolder,
      projectCount,
      noteCount,
      syncthingDetected,
      message: 'Obsidian 笔记库已就绪，Syncthing 多端同步监听中',
    };
  }

  /**
   * Sanitize string for valid file/folder name across Windows, macOS and Linux
   */
  public sanitizeName(name: string): string {
    return name
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/[\r\n\t]/g, ' ')
      .trim();
  }

  /**
   * Sync a single task note to Obsidian Vault
   */
  public async syncTaskNote(
    project: { id: string; name: string },
    task: Task,
    relations?: { incoming?: string[]; outgoing?: string[] }
  ): Promise<{ success: boolean; filePath?: string; relativePath?: string; error?: string }> {
    const baseDir = this.getAgentLearnVaultDir();
    if (!baseDir) {
      return { success: false, error: '未能获取 Obsidian Vault 目录' };
    }

    try {
      const projectFolderName = this.sanitizeName(project.name || '默认知识图谱');
      const projectDir = path.join(baseDir, projectFolderName);
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }

      const noteFileName = `${this.sanitizeName(task.title || '未命名知识点')}.md`;
      const fullPath = path.join(projectDir, noteFileName);
      const relativePath = path.join(this.defaultSubFolder, projectFolderName, noteFileName).replace(/\\/g, '/');

      const statusMap: Record<string, string> = {
        todo: '待攻克 (todo)',
        'in-progress': '攻克中 (in-progress)',
        review: '考核复习 (review)',
        done: '已掌握点亮 (done)',
      };

      const priorityMap: Record<string, string> = {
        critical: '核心必备 (critical)',
        high: '高度推荐 (high)',
        medium: '标准模块 (medium)',
        low: '选学扩展 (low)',
      };

      // Obsidian Frontmatter (YAML)
      const frontmatter = [
        '---',
        `id: "${task.id}"`,
        `projectId: "${project.id}"`,
        `title: "${task.title.replace(/"/g, '\\"')}"`,
        `project: "${project.name.replace(/"/g, '\\"')}"`,
        `status: "${task.status}"`,
        `priority: "${task.priority}"`,
        `tags:`,
        `  - "AgentLearn"`,
        `  - "${this.sanitizeName(project.name)}"`,
        ...(task.tags || []).map(t => `  - "${t}"`),
        `updatedAt: "${new Date().toISOString()}"`,
        `syncedSource: "AgentLearn-Studio"`,
        '---',
        '',
      ].join('\n');

      // Obsidian Callout with metadata
      const callout = [
        `> [!NOTE] 知识卡片档案`,
        `> - **所属图谱**: [[${projectFolderName} 知识大纲总览|${project.name}]]`,
        `> - **研习状态**: \`${statusMap[task.status] || task.status}\` | **重要级**: \`${priorityMap[task.priority] || task.priority}\``,
        `> - **同步时间**: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
        '',
      ].join('\n');

      // Body (Task Description)
      const body = task.description || '*暂无讲义内容，可在 AgentLearn 中唤醒 AI 导师生成或直接在此编辑*';

      // Relations (WikiLinks)
      let relationsSection = '';
      const hasIncoming = relations?.incoming && relations.incoming.length > 0;
      const hasOutgoing = relations?.outgoing && relations.outgoing.length > 0;
      if (hasIncoming || hasOutgoing) {
        relationsSection = [
          '',
          '---',
          '### 🔗 知识图谱网络关联',
          hasIncoming ? `- **前置依赖**: ${relations.incoming!.map(t => `[[${this.sanitizeName(t)}]]`).join(', ')}` : '',
          hasOutgoing ? `- **后续延伸**: ${relations.outgoing!.map(t => `[[${this.sanitizeName(t)}]]`).join(', ')}` : '',
          '',
        ].filter(Boolean).join('\n');
      }

      const fileContent = `${frontmatter}# ${task.title}\n\n${callout}${body}\n${relationsSection}`;

      fs.writeFileSync(fullPath, fileContent, 'utf-8');

      return {
        success: true,
        filePath: fullPath,
        relativePath,
      };
    } catch (err: any) {
      console.error('[VaultService] syncTaskNote error:', err);
      return { success: false, error: err.message || '写入笔记失败' };
    }
  }

  /**
   * Sync entire project roadmap and all nodes to Obsidian
   * Generates a Map of Content (MOC) index note with wikilinks
   */
  public async syncProjectAll(
    project: { id: string; name: string; description?: string },
    tasks: Task[],
    edges: Array<{ fromTaskId: string; toTaskId: string }> = []
  ): Promise<{ success: boolean; syncedCount: number; mocPath?: string; error?: string }> {
    const baseDir = this.getAgentLearnVaultDir();
    if (!baseDir) {
      return { success: false, syncedCount: 0, error: '未能定位 Obsidian 笔记库' };
    }

    try {
      const projectFolderName = this.sanitizeName(project.name || '默认知识图谱');
      const projectDir = path.join(baseDir, projectFolderName);
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }

      // Build task lookup
      const taskMap = new Map<string, Task>();
      for (const t of tasks) {
        taskMap.set(t.id, t);
      }

      // Build relations
      const incomingMap = new Map<string, string[]>();
      const outgoingMap = new Map<string, string[]>();
      for (const edge of edges) {
        const fromTask = taskMap.get(edge.fromTaskId);
        const toTask = taskMap.get(edge.toTaskId);
        if (fromTask && toTask) {
          if (!outgoingMap.has(fromTask.id)) outgoingMap.set(fromTask.id, []);
          outgoingMap.get(fromTask.id)!.push(toTask.title);

          if (!incomingMap.has(toTask.id)) incomingMap.set(toTask.id, []);
          incomingMap.get(toTask.id)!.push(fromTask.title);
        }
      }

      let syncedCount = 0;
      for (const task of tasks) {
        await this.syncTaskNote(project, task, {
          incoming: incomingMap.get(task.id),
          outgoing: outgoingMap.get(task.id),
        });
        syncedCount++;
      }

      // Generate MOC (Map of Content) Overview Index
      const mocTitle = `${projectFolderName} 知识大纲总览`;
      const mocPath = path.join(projectDir, `00-${mocTitle}.md`);

      const todoTasks = tasks.filter(t => t.status === 'todo');
      const inProgressTasks = tasks.filter(t => t.status === 'in-progress');
      const doneTasks = tasks.filter(t => t.status === 'done');

      const mocContent = [
        '---',
        `title: "${mocTitle}"`,
        `projectId: "${project.id}"`,
        `tags:`,
        `  - "AgentLearn"`,
        `  - "MOC"`,
        `  - "${projectFolderName}"`,
        `updatedAt: "${new Date().toISOString()}"`,
        '---',
        '',
        `# 🗺️ ${project.name} 知识大纲总览 (MOC)`,
        '',
        `> [!TIP] 图谱导读`,
        `> 本大纲由 **AgentLearn 智学工坊** 自动构建并双向同步。在 Obsidian 中可开启「关系图谱 (Graph View)」查看完整的知识脉络与节点流转！`,
        `> - **总节点数**: ${tasks.length} 节`,
        `> - **当前进度**: 已点亮 ${doneTasks.length} / 攻克中 ${inProgressTasks.length} / 待学习 ${todoTasks.length}`,
        '',
        `## 📚 项目简介`,
        project.description || '*暂无详细描述*',
        '',
        `## 🌟 已掌握点亮 (${doneTasks.length})`,
        doneTasks.length > 0
          ? doneTasks.map(t => `- [x] [[${this.sanitizeName(t.title)}]] ⭐ \`${t.priority}\``).join('\n')
          : '- *暂无已点亮节点，继续加油！*',
        '',
        `## ⚡ 攻克进行中 (${inProgressTasks.length})`,
        inProgressTasks.length > 0
          ? inProgressTasks.map(t => `- [/] [[${this.sanitizeName(t.title)}]] 🔥 \`${t.priority}\``).join('\n')
          : '- *暂无攻克中节点*',
        '',
        `## 📝 待学习路线 (${todoTasks.length})`,
        todoTasks.length > 0
          ? todoTasks.map(t => `- [ ] [[${this.sanitizeName(t.title)}]] 📌 \`${t.priority}\``).join('\n')
          : '- *所有节点已全部攻克！*',
        '',
      ].join('\n');

      fs.writeFileSync(mocPath, mocContent, 'utf-8');

      return {
        success: true,
        syncedCount,
        mocPath,
      };
    } catch (err: any) {
      console.error('[VaultService] syncProjectAll error:', err);
      return { success: false, syncedCount: 0, error: err.message || '全量同步失败' };
    }
  }

  /**
   * Read task note from Obsidian Vault if user updated it outside AgentLearn
   */
  public readTaskNote(
    project: { name: string },
    task: { title: string }
  ): { exists: boolean; content?: string; lastModified?: string } {
    const baseDir = this.getAgentLearnVaultDir();
    if (!baseDir) return { exists: false };

    const projectFolderName = this.sanitizeName(project.name || '默认知识图谱');
    const noteFileName = `${this.sanitizeName(task.title || '未命名知识点')}.md`;
    const fullPath = path.join(baseDir, projectFolderName, noteFileName);

    if (!fs.existsSync(fullPath)) {
      return { exists: false };
    }

    try {
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const stat = fs.statSync(fullPath);

      // Strip YAML frontmatter if present
      let cleanContent = raw;
      if (raw.startsWith('---')) {
        const endIdx = raw.indexOf('---', 3);
        if (endIdx !== -1) {
          cleanContent = raw.slice(endIdx + 3).trim();
        }
      }

      // Strip leading title # Title and metadata callout
      cleanContent = cleanContent.replace(/^#\s+[^\n]+\n+/, '');
      cleanContent = cleanContent.replace(/^> \[!NOTE\] 知识卡片档案[\s\S]*?(?=\n\n|\n[#\w])/i, '').trim();

      // Strip trailing relations section
      cleanContent = cleanContent.replace(/\n---\n### 🔗 知识图谱网络关联[\s\S]*$/, '').trim();

      return {
        exists: true,
        content: cleanContent,
        lastModified: stat.mtime.toISOString(),
      };
    } catch (err) {
      console.error('[VaultService] readTaskNote error:', err);
      return { exists: false };
    }
  }
}

export const vaultService = new VaultService();
