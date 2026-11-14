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
      subtitle?: string;
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

    // Helper to call LLM with JSON output (supports both Vertex Express & OpenAI gateways + retry + fallback)
    const callLLM = async (systemPrompt: string, userPrompt: string, temperature = 0.2): Promise<any> => {
      try {
        return await aiService.completeJson({
          systemPrompt,
          userPrompt,
          temperature,
          provider: options.provider,
          baseUrl: options.baseUrl,
          apiKey: options.apiKey,
          model: options.model,
          retries: 1,
        });
      } catch (primaryErr) {
        const keyStatus = aiService.getServerKeyStatus();
        if (options.provider !== 'vertex-gemini' && keyStatus.vertex) {
          onProgress?.({
            step: 1,
            totalSteps: 4,
            message: '主建树引擎响应波动，正在自动切换 Vertex Gemini 3.8 Flash 兜底继续拆书...',
            percent: 22,
          });
          return await aiService.completeJson({
            systemPrompt,
            userPrompt,
            temperature,
            provider: 'vertex-gemini',
            model: 'gemini-3.8-flash',
            retries: 1,
          });
        }
        throw primaryErr;
      }
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
    // Step 2: Full-Book Knowledge DAG Extraction (极速轻量知识拓扑与大纲生成，按需解锁精讲)
    // ========================================================
    onProgress?.({
      step: 2,
      totalSteps: 3,
      message: `阶段划分完成，正在根据目录提炼全书核心知识大纲与 DAG 拓扑（按需解锁模式，秒级建树）...`,
      percent: 60,
    });

    const step2System = `你是一位顶级知识拓扑架构师与课程设计师。
请根据全书目录与阶段规划，为《${topicName}》提取 8~16 个核心攻坚知识节点（Tasks），并推演各节点之间的前置依赖关系（Dependencies）。

【标题规范 —— 非常重要】
每个节点的卡片有「主标题 + 副标题」两层，务必分工明确：
- title（主标题）：精练的概念名，纯名词短语，4~12 个汉字（英文术语可保留，如 "ret2libc"），一眼能认出这是什么。
  * 严禁出现编号前缀（如 "节点 1.1："、"第3章"、"1.2-1.3"），严禁出现冒号、括号、破折号、顿号并列、"与…"连接多个主题。
  * 好例子："栈帧与调用约定"、"Canary 机制"、"堆溢出基础"、"B+ 树索引"、"冯·诺依曼结构"。
  * 坏例子："节点 2.1：Canary 栈金丝雀机制与信息泄露突破 (Canary Leak & Bypass)"（这种长句应放进 subtitle）。
- subtitle（副标题）：一句话讲清「这个节点学什么、解决什么问题」，15~40 个汉字，可以包含冒号前后的关键技术点、对比关系、核心结论，信息量要比主标题大。
  * 示例：主标题「Canary 机制」→ 副标题「栈金丝雀的工作原理，以及信息泄露与逐字节爆破两种绕过思路」。
- 所有字段内不要使用 emoji 或装饰性符号。

每个节点必须包含：
- id: 唯一标识（例如 "t_1", "t_2"）
- title: 主标题（见上方规范）
- subtitle: 副标题（见上方规范）
- milestoneId: 归属的阶段 ID（如 "m1", "m2"）
- chapterIndex: 对应的章节编号（整数，如 1, 2）
- summary: 1~2 句话的核心攻坚方向与概念摘要
- priority: "critical" | "high" | "medium"
- tags: 核心标签数组（必须包含类似 "第X章" 的标签）

同时输出有向无环图依赖边数组 dependencies: [{ source: "前置id", target: "后置id" }]。

【输出格式】纯 JSON：
{
  "tasks": [
    {
      "id": "t_1",
      "title": "栈帧与调用约定",
      "subtitle": "函数调用时栈底、栈顶指针的平衡原理，以及参数传递与返回流程",
      "milestoneId": "m1",
      "chapterIndex": 1,
      "summary": "掌握栈底指针与栈顶指针在函数调用、参数传递及返回过程中的底层平衡原理",
      "priority": "critical",
      "tags": ["第1章", "底层调用"]
    }
  ],
  "dependencies": [
    { "source": "t_1", "target": "t_2" }
  ]
}`;

    const step2User = `【书籍信息】：
书名：《${bookData.title}》
章节总数：${bookData.chapter_count} 个章节
规划好的阶段列表：
${JSON.stringify(milestones, null, 2)}

【章节详细目录与简介】：
${bookData.chapters.map(c => `第 ${c.index} 章: ${c.title} (页码: ${c.page_range})\n简介摘录: ${c.sample_content.slice(0, 160)}`).join('\n\n')}

请立即输出 tasks 与 dependencies 纯 JSON。`;

    let allTasks: Array<{
      id: string;
      title: string;
      subtitle?: string;
      description: string;
      milestoneId: string;
      priority: 'critical' | 'high' | 'medium' | 'low';
      tags: string[];
    }> = [];

    let dependencies: Array<{ source: string; target: string; type?: string }> = [];

    try {
      const step2Result = await callLLM(step2System, step2User);
      const rawTasks = step2Result.tasks || [];
      dependencies = step2Result.dependencies || [];

      if (rawTasks.length > 0) {
        rawTasks.forEach((t: any, idx: number) => {
          const chIdx = typeof t.chapterIndex === 'number' ? t.chapterIndex : idx + 1;
          const ch = bookData.chapters.find(c => c.index === chIdx) || bookData.chapters[Math.min(idx, bookData.chapters.length - 1)];
          const chTitle = ch?.title || `第 ${chIdx} 章`;
          const chPageRange = ch?.page_range || '全书';

          const initialDescription = `### 章节定位\n归属原书：第 ${chIdx} 章《${chTitle}》（页码范围：${chPageRange}）\n\n### 学习目标与攻坚方向\n${t.summary || '掌握本章节的核心技术机制与体系逻辑。'}\n\n---\n> **Gemini 专属学伴导学**：本节点已就绪！点击上方「Gemini 精讲点亮」，即可调用 Gemini 3.8 Flash 结合本章教材原书正文生成生动通透的系统化讲义。`;

          const tags = Array.isArray(t.tags) && t.tags.length > 0 ? t.tags : [`第${chIdx}章`, '核心考点'];
          if (!tags.some((tag: string) => tag.includes('章'))) {
            tags.unshift(`第${chIdx}章`);
          }

          allTasks.push({
            id: t.id || `t_${idx + 1}`,
            title: t.title || `${chTitle} - 核心知识点`,
            subtitle: t.subtitle || t.summary || '',
            description: initialDescription,
            milestoneId: t.milestoneId || chapterToMilestoneMap[chIdx] || milestones[0]?.id || 'm1',
            priority: t.priority || 'high',
            tags,
          });
        });
      }
    } catch (err) {
      console.warn('One-pass DAG generation failed, falling back to chapter outline mapping:', err);
    }

    // Fallback if model returned empty tasks
    if (allTasks.length === 0) {
      bookData.chapters.forEach((ch, idx) => {
        const msId = chapterToMilestoneMap[ch.index] || milestones[Math.min(milestones.length - 1, Math.floor((idx / bookData.chapters.length) * milestones.length))]?.id || 'm1';
        allTasks.push({
          id: `t_${ch.index}`,
          title: ch.title,
          subtitle: `原书第 ${ch.index} 章（${ch.page_range}）核心原理与技术要点`,
          description: `### 章节定位\n归属原书：第 ${ch.index} 章《${ch.title}》（页码范围：${ch.page_range}）\n\n### 学习目标与攻坚方向\n深入掌握第 ${ch.index} 章《${ch.title}》的核心原理与技术要点。\n\n---\n> **Gemini 专属学伴导学**：本节点已就绪！点击上方「Gemini 精讲点亮」，即可调用 Gemini 3.8 Flash 结合本章教材原书正文生成生动通透的系统化讲义。`,
          milestoneId: msId,
          priority: 'high',
          tags: [`第${ch.index}章`, '原书章节'],
        });
      });
    }

    // Fallback linear dependencies if empty
    if (dependencies.length === 0) {
      for (let i = 0; i < allTasks.length - 1; i++) {
        dependencies.push({
          source: allTasks[i].id,
          target: allTasks[i + 1].id,
          type: 'prerequisite',
        });
      }
    }

    onProgress?.({
      step: 3,
      totalSteps: 3,
      message: '全景技能树与拓扑关系构建完成，正在加载排版视图！',
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
