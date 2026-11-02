import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { aiService } from './ai-service.js';

export interface ParsedChapter {
  index: number;
  title: string;
  page_range: string;
  sample_content: string;
  char_count: number;
}

export interface ParsedBookResult {
  title: string;
  format: string;
  total_pages: number;
  chapter_count: number;
  chapters: ParsedChapter[];
}

export interface PipelineProgress {
  step: number;
  totalSteps: number;
  message: string;
  percent: number;
}

export class BookPipelineService {
  private findPythonPath(): string {
    const candidates = [
      '/home/anubis/book_env/bin/python3',
      '/home/anubis/book_env/bin/python',
      'python3',
      'python',
    ];
    for (const p of candidates) {
      if (p.startsWith('/') && fs.existsSync(p)) {
        return p;
      }
    }
    return process.platform === 'win32' ? 'python' : 'python3';
  }

  private findScriptPath(): string {
    const possible = [
      path.join(process.cwd(), 'scripts', 'book_parser.py'),
      path.join(process.cwd(), '..', 'scripts', 'book_parser.py'),
      path.resolve(__dirname, '../../scripts/book_parser.py'),
      path.resolve(__dirname, '../../../scripts/book_parser.py'),
      '/home/anubis/AgentLearn/scripts/book_parser.py',
    ];
    for (const p of possible) {
      if (fs.existsSync(p)) return p;
    }
    return possible[0];
  }

  async parseBookFile(filePath: string): Promise<ParsedBookResult> {
    const pythonExe = this.findPythonPath();
    const scriptPath = this.findScriptPath();

    return new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, [scriptPath, filePath], {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });

      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`沙箱解析书籍失败 (exit ${code}): ${stderr || stdout}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          if (parsed.error) {
            reject(new Error(parsed.error));
          } else {
            resolve(parsed);
          }
        } catch (err: any) {
          reject(new Error(`解析书籍输出 JSON 失败: ${err.message}, 输出: ${stdout.slice(0, 300)}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`无法启动沙箱 Python 环境: ${err.message}`));
      });
    });
  }

  async generateDeepSkillTree(options: {
    bookData: ParsedBookResult;
    topicName: string;
    targetLevel?: string;
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    onProgress?: (progress: PipelineProgress) => void;
  }): Promise<{
    name: string;
    description: string;
    milestones: Array<{ id: string; title: string; order: number }>;
    tasks: Array<{
      id: string;
      title: string;
      description: string;
      milestoneId: string;
      priority: 'critical' | 'high' | 'medium' | 'low';
      tags: string[];
    }>;
    dependencies: Array<{ source: string; target: string; type?: string }>;
  }> {
    const { bookData, topicName, targetLevel, onProgress } = options;
    const creds = aiService.resolveCredentials(options);

    if (!creds.baseUrl) {
      throw new Error('未配置 AI 供应商或 Base URL');
    }

    const endpoint = aiService.normalizeUrl(creds.baseUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (creds.apiKey) {
      headers['Authorization'] = `Bearer ${creds.apiKey}`;
    }

    // Helper to call LLM with JSON output
    const callLLM = async (systemPrompt: string, userPrompt: string, temperature = 0.2): Promise<any> => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: creds.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          stream: false,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`大模型响应异常 (${res.status}): ${errText.slice(0, 200)}`);
      }

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content || '';
      let cleanContent = content.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
      const firstBrace = cleanContent.indexOf('{');
      const lastBrace = cleanContent.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        cleanContent = cleanContent.slice(firstBrace, lastBrace + 1);
      }
      return JSON.parse(cleanContent);
    };

    // ========================================================
    // Step 1: Macro Blueprint (全局里程碑阶段生成)
    // ========================================================
    onProgress?.({
      step: 1,
      totalSteps: 4,
      message: `沙箱提取完成：共识别 ${bookData.chapter_count} 个核心章节（约 ${bookData.total_pages} 页），正在规划全局学习阶段...`,
      percent: 20,
    });

    const chapterListBrief = bookData.chapters.map(c => `- 第 ${c.index} 章: ${c.title} (${c.page_range})`).join('\n');
    
    const step1System = `你是一位顶级课程设计与知识图谱专家。
请根据用户提供的书籍/教材目录章节，为《${topicName}》规划 3~5 个具有递进逻辑的学习阶段（Milestones）。
目标学习者水平：${targetLevel || '零基础到实战精通'}。

【输出要求】
必须严格输出纯 JSON 对象，格式如下：
{
  "description": "简要概述全书核心进阶体系",
  "milestones": [
    { "id": "m1", "title": "第一阶段：基础底座与环境准备", "order": 1, "chapterIndices": [1, 2] },
    { "id": "m2", "title": "第二阶段：核心机制与关键突破", "order": 2, "chapterIndices": [3, 4, 5] },
    { "id": "m3", "title": "第三阶段：进阶防御与综合实战", "order": 3, "chapterIndices": [6, 7] }
  ]
}`;

    const step1User = `【书籍信息】：
书名：《${bookData.title}》
总页数：${bookData.total_pages} 页
章节总数：${bookData.chapter_count} 个章节

【章节目录列表】：
${chapterListBrief}

请基于上述真实目录，输出规划好的 milestones JSON。`;

    let step1Result;
    try {
      step1Result = await callLLM(step1System, step1User);
    } catch {
      // Fallback default milestones if model fails
      step1Result = {
        description: `基于《${bookData.title}》全书架构提炼的专属进阶技能树`,
        milestones: [
          { id: 'm1', title: '第一阶段：基础认知与核心机制', order: 1, chapterIndices: [1, 2] },
          { id: 'm2', title: '第二阶段：深度剖析与关键技术', order: 2, chapterIndices: [3, 4] },
          { id: 'm3', title: '第三阶段：进阶拓展与实战沉淀', order: 3, chapterIndices: [5, 6] },
        ],
      };
    }

    const milestones = step1Result.milestones || [];
    const chapterToMilestoneMap: Record<number, string> = {};
    milestones.forEach((m: any) => {
      (m.chapterIndices || []).forEach((idx: number) => {
        chapterToMilestoneMap[idx] = m.id;
      });
    });

    // ========================================================
    // Step 2: Chapter-by-Chapter Micro Knowledge Mining (逐章精读挖掘)
    // ========================================================
    const allTasks: Array<{
      id: string;
      title: string;
      description: string;
      milestoneId: string;
      priority: 'critical' | 'high' | 'medium' | 'low';
      tags: string[];
    }> = [];

    // Process up to 16 chapters so full 15-chapter textbooks are completely covered
    const selectedChapters = bookData.chapters.slice(0, 16);
    const totalChaptersToProcess = selectedChapters.length;

    for (let i = 0; i < totalChaptersToProcess; i++) {
      const ch = selectedChapters[i];
      const milestoneId = chapterToMilestoneMap[ch.index] || milestones[Math.min(milestones.length - 1, Math.floor((i / totalChaptersToProcess) * milestones.length))]?.id || 'm1';

      onProgress?.({
        step: 2,
        totalSteps: 4,
        message: `正在精读第 ${i + 1}/${totalChaptersToProcess} 章《${ch.title.slice(0, 20)}》并沉淀原书讲义...`,
        percent: Math.round(20 + 60 * ((i + 1) / totalChaptersToProcess)),
      });

      const step2System = `你是一位严谨的教材精讲导师。
你的任务是研读用户给出的教材章节内容，提炼出 1~3 个具体的硬核知识节点（Tasks）。
每个节点必须生成详尽、排版考究、专业深入的讲义内容（Markdown 格式）：
包含：
### 一、核心机制与底层原理
（用生活比喻结合底层原理剖析）
### 二、关键代码与应用场景
（提炼教材中的核心伪代码、指令或场景示例）
### 三、易错陷阱与实操考核
（指出初学者极易踩坑的地方，并给出一道动手练习题）

【输出格式】必须为纯 JSON：
{
  "tasks": [
    {
      "title": "节点标题（例如：栈帧动态平衡与调用约定）",
      "description": "上述三大结构的完整 Markdown 讲义内容...",
      "priority": "critical" 或 "high" 或 "medium",
      "tags": ["核心标签1", "标签2"]
    }
  ]
}`;

      const step2User = `【章节信息】：
所属章节：第 ${ch.index} 章 - ${ch.title}
页码范围：${ch.page_range}

【原书章节正文切片】：
${ch.sample_content || ch.title}

请立即输出本章提炼的 tasks JSON。`;

      try {
        const step2Result = await callLLM(step2System, step2User);
        const chapterTasks = step2Result.tasks || [];
        chapterTasks.forEach((t: any, taskIdx: number) => {
          allTasks.push({
            id: `t_${ch.index}_${taskIdx + 1}`,
            title: t.title || `${ch.title} - 知识点 ${taskIdx + 1}`,
            description: t.description || `本节点属于第 ${ch.index} 章《${ch.title}》核心教学范畴。`,
            milestoneId,
            priority: t.priority || 'high',
            tags: Array.isArray(t.tags) && t.tags.length > 0 ? t.tags : [ch.title.slice(0, 6)],
          });
        });
      } catch (err) {
        // Fallback single task for chapter
        allTasks.push({
          id: `t_${ch.index}_1`,
          title: ch.title,
          description: `### 一、核心机制与底层原理\n\n本章节摘录自《${bookData.title}》第 ${ch.index} 章。\n\n### 二、关键原书内容\n\n${ch.sample_content.slice(0, 1000)}\n\n### 三、动手实操\n\n请结合原书练习题进行实操验证。`,
          milestoneId,
          priority: 'high',
          tags: ['章节核心'],
        });
      }
    }

    // ========================================================
    // Step 3: Dependency Graph Inference (全景依赖拓扑推演)
    // ========================================================
    onProgress?.({
      step: 3,
      totalSteps: 4,
      message: `已提炼出 ${allTasks.length} 个核心攻坚节点，正在分析前后置依赖逻辑构建有向无环拓扑图 (DAG)...`,
      percent: 88,
    });

    const taskBriefs = allTasks.map(t => ({ id: t.id, title: t.title }));
    const step3System = `你是一位知识拓扑架构师。
请分析以下知识节点之间的前置先后依赖关系（先学会哪个，才能攻克哪个）。
输出有向依赖边数组，必须保证为有向无环图（DAG），不要产生循环引用。

【输出格式】纯 JSON：
{
  "dependencies": [
    { "source": "前置节点id", "target": "后置节点id", "type": "prerequisite" }
  ]
}`;

    let dependencies: Array<{ source: string; target: string; type?: string }> = [];
    try {
      const step3Result = await callLLM(step3System, JSON.stringify(taskBriefs));
      dependencies = step3Result.dependencies || [];
    } catch {
      // Linear sequential fallback
      for (let i = 0; i < allTasks.length - 1; i++) {
        dependencies.push({
          source: allTasks[i].id,
          target: allTasks[i + 1].id,
          type: 'prerequisite',
        });
      }
    }

    onProgress?.({
      step: 4,
      totalSteps: 4,
      message: '全景技能树构建完成，正在加载排版视图！',
      percent: 100,
    });

    return {
      name: topicName || bookData.title,
      description: step1Result.description || `由大模型与沙箱基于《${bookData.title}》教材精讲深度构建`,
      milestones,
      tasks: allTasks,
      dependencies,
    };
  }
}

export const bookPipelineService = new BookPipelineService();
