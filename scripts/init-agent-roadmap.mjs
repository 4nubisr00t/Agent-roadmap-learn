import fs from 'fs';
import path from 'path';
import os from 'os';

const storageDir = path.join(os.homedir(), '.roadmap-skill', 'projects');
const projectFile = path.join(storageDir, 'proj_1792495696797_y31j6lv.json');

const now = new Date().toISOString();

const tags = [
  { id: 'tag_basic', name: '基础底座', color: '#38bdf8', description: 'Agent 必需的大模型底层技术', createdAt: now },
  { id: 'tag_core', name: '四大支柱', color: '#a855f7', description: 'Prompt / Tools / Memory / Planning 核心能力', createdAt: now },
  { id: 'tag_advanced', name: '架构进阶', color: '#10b981', description: 'RAG、多智能体与 MCP 协议工业级落地', createdAt: now },
];

const tasks = [
  {
    id: 'task_01_prompt',
    projectId: 'proj_1792495696797_y31j6lv',
    title: '模块 01：大模型底层与上下文工程 (Prompt & Context)',
    description: '【学习目标】：掌握 System Prompt 角色定义、Few-shot 少样本提示、思维链 (CoT) 激发，以及 Token 上下文窗口限制对 Agent 的影响。\n\n【实践任务】：编写一个具备结构化输出 (JSON) 和防注入约束的智能体元提示词。\n\n【求教指令】：给 Gemini 发送：“Gemini老师，我想学模块 01，请用通俗语言给我讲讲上下文工程和思维链原理！”',
    status: 'done',
    priority: 'high',
    tags: ['tag_basic', 'tag_core'],
    dueDate: null,
    assignee: 'You',
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  },
  {
    id: 'task_02_tools',
    projectId: 'proj_1792495696797_y31j6lv',
    title: '模块 02：函数调用与工具链对接 (Function Calling & Tools)',
    description: '【学习目标】：理解 Agent 为什么需要长出“手脚”。掌握 JSON Schema 定义工具入参、大模型解析用户意图生成工具调用指令、本地执行函数并把结果回填给模型的完整闭环。\n\n【实践任务】：手写一个简单的天气查询/文件读取 Tool，并让 Agent 自动根据问答决定是否调用。\n\n【求教指令】：给 Gemini 发送：“Gemini老师，我想学模块 02 函数调用，请带我手写一个最简单的工具调用脚本并讲透原理！”',
    status: 'in-progress',
    priority: 'critical',
    tags: ['tag_core'],
    dueDate: null,
    assignee: 'You',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  },
  {
    id: 'task_03_memory',
    projectId: 'proj_1792495696797_y31j6lv',
    title: '模块 03：智能体短期与长期记忆 (Short & Long-term Memory)',
    description: '【学习目标】：解决大模型“无状态记不住事”的痛点。理解短期滑动窗口记忆 (Buffer Window)、动态摘要压缩记忆 (Summary Memory)，以及基于向量数据库的长期语义记忆机制。\n\n【实践任务】：为你的 Agent 实现一个具有用户偏好记忆（持久化存入 JSON/SQLite）的记忆组件。\n\n【求教指令】：给 Gemini 发送：“Gemini老师，我想学模块 03 记忆系统，请通俗解释短期记忆和长期记忆的区别，并教我怎么设计！”',
    status: 'todo',
    priority: 'high',
    tags: ['tag_core'],
    dueDate: null,
    assignee: 'You',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  },
  {
    id: 'task_04_planning',
    projectId: 'proj_1792495696797_y31j6lv',
    title: '模块 04：智能体规划与自主反思 (Planning & Reflection)',
    description: '【学习目标】：理解 Agent 真正“自主”的灵魂。掌握经典 ReAct (Reason + Act + Observation) 循环、Plan-and-Solve 分解规划，以及当执行出错时自我审视并修正行动的 Reflection 机制。\n\n【实践任务】：实现一个能够自主多步推理并纠正错误执行结果的小型 Agent。\n\n【求教指令】：给 Gemini 发送：“Gemini老师，我想学模块 04 规划与反思，请用生活中的例子解释 ReAct 循环是怎么工作的！”',
    status: 'todo',
    priority: 'critical',
    tags: ['tag_core', 'tag_advanced'],
    dueDate: null,
    assignee: 'You',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  },
  {
    id: 'task_05_rag',
    projectId: 'proj_1792495696797_y31j6lv',
    title: '模块 05：检索增强生成与私有知识库 (RAG & Knowledge)',
    description: '【学习目标】：让 Agent 突破训练时间壁垒，读懂私有文档。掌握文档加载分块 (Chunking)、向量化 Embedding、语义相似度搜索与上下文重组全流程。\n\n【实践任务】：搭建一个能读取本地特定 Markdown 知识并精准回答提问的 RAG 管道。\n\n【求教指令】：给 Gemini 发送：“Gemini老师，我想学模块 05 RAG，请通俗讲讲文本向量化和相似度检索到底是怎么一回事！”',
    status: 'todo',
    priority: 'medium',
    tags: ['tag_advanced'],
    dueDate: null,
    assignee: 'You',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  },
  {
    id: 'task_06_multiagent',
    projectId: 'proj_1792495696797_y31j6lv',
    title: '模块 06：多智能体协作与群体智能 (Multi-Agent Collaboration)',
    description: '【学习目标】：从单兵作战走向团队协作。掌握主管-员工 (Supervisor-Worker) 拓扑结构、对话轮转机制、智能体间通信协议与任务交接。\n\n【实践任务】：配置一个“产品经理 Agent”和“程序员 Agent”协同完成一个功能设计的场景。\n\n【求教指令】：给 Gemini 发送：“Gemini老师，我想学模块 06 多智能体协作，请讲讲多个 Agent 之间是怎么传递信息并合作的！”',
    status: 'todo',
    priority: 'high',
    tags: ['tag_advanced'],
    dueDate: null,
    assignee: 'You',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  },
  {
    id: 'task_07_mcp',
    projectId: 'proj_1792495696797_y31j6lv',
    title: '模块 07：模型上下文协议与生态 (MCP Protocol & Ecosystem)',
    description: '【学习目标】：掌握 Anthropic / 全球开源社区最新的标准协议 MCP (Model Context Protocol)。理解 Client-Server 架构、Resources、Tools 和 Prompts 的标准规范。\n\n【实践任务】：编写一个标准的本地 MCP 服务，让外部 AI 助手无缝调用。\n\n【求教指令】：给 Gemini 发送：“Gemini老师，我想学模块 07 MCP 协议，请深入浅出给我科普 MCP 为什么会成为大模型工具交互的新标准！”',
    status: 'todo',
    priority: 'medium',
    tags: ['tag_advanced'],
    dueDate: null,
    assignee: 'You',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  },
];

const dependencyViews = [
  {
    id: 'view_main_skilltree',
    projectId: 'proj_1792495696797_y31j6lv',
    name: '🌟 Agent 核心能力技能树',
    description: '从基础到进阶的清晰依赖拓扑，模块按顺序依赖并逐步解锁。',
    dimension: null,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    nodes: [
      { taskId: 'task_01_prompt', x: 100, y: 200, collapsed: false, note: '【已点亮】基础中的基础' },
      { taskId: 'task_02_tools', x: 380, y: 120, collapsed: false, note: '【正在攻克】赋予 Agent 行动能力' },
      { taskId: 'task_03_memory', x: 380, y: 300, collapsed: false, note: '【待解锁】赋予 Agent 记忆能力' },
      { taskId: 'task_04_planning', x: 680, y: 120, collapsed: false, note: '【待解锁】自主思考与纠错' },
      { taskId: 'task_05_rag', x: 680, y: 300, collapsed: false, note: '【待解锁】连接私有知识' },
      { taskId: 'task_06_multiagent', x: 980, y: 200, collapsed: false, note: '【待解锁】团队化多智能体' },
      { taskId: 'task_07_mcp', x: 1280, y: 200, collapsed: false, note: '【终极目标】行业标准协议与实战' },
    ],
    edges: [
      { id: 'edge_1_2', fromTaskId: 'task_01_prompt', toTaskId: 'task_02_tools', kind: 'hard', createdAt: now },
      { id: 'edge_1_3', fromTaskId: 'task_01_prompt', toTaskId: 'task_03_memory', kind: 'hard', createdAt: now },
      { id: 'edge_2_4', fromTaskId: 'task_02_tools', toTaskId: 'task_04_planning', kind: 'hard', createdAt: now },
      { id: 'edge_3_4', fromTaskId: 'task_03_memory', toTaskId: 'task_04_planning', kind: 'hard', createdAt: now },
      { id: 'edge_3_5', fromTaskId: 'task_03_memory', toTaskId: 'task_05_rag', kind: 'hard', createdAt: now },
      { id: 'edge_4_6', fromTaskId: 'task_04_planning', toTaskId: 'task_06_multiagent', kind: 'hard', createdAt: now },
      { id: 'edge_5_6', fromTaskId: 'task_05_rag', toTaskId: 'task_06_multiagent', kind: 'hard', createdAt: now },
      { id: 'edge_6_7', fromTaskId: 'task_06_multiagent', toTaskId: 'task_07_mcp', kind: 'hard', createdAt: now },
    ],
  },
];

const projectData = {
  version: 1,
  project: {
    id: 'proj_1792495696797_y31j6lv',
    name: '⚡ AI Agent 核心能力进阶树',
    description: '通过模块化闯关学习 AI Agent 核心支柱：提示词、工具调用、记忆系统、规划推理、RAG、多智能体与 MCP。',
    projectType: 'skill-tree',
    status: 'active',
    startDate: now,
    targetDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    createdAt: now,
    updatedAt: now,
  },
  milestones: [],
  tasks,
  tags,
  dependencyViews,
};

fs.writeFileSync(projectFile, JSON.stringify(projectData, null, 2), 'utf-8');
console.log('Successfully initialized learning skill-tree at:', projectFile);
