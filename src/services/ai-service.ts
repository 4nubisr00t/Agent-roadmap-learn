export interface AIProviderPreset {
  id: string;
  name: string;
  icon: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  description: string;
  needApiKey: boolean;
  websiteUrl?: string;
}

export const PRESET_PROVIDERS: AIProviderPreset[] = [
  {
    id: 'anubis-gateway',
    name: 'Anubis DeepSeek Gateway (自有反代网关)',
    icon: '⚡',
    baseUrl: 'https://api.anubisroot.top/v1',
    defaultModel: 'deepseek-v4.1-flash',
    models: ['deepseek-v4.1-flash', 'deepseek-v4-pro'],
    description: '主机本地 8000 端口直连 DeepSeek V4 反代网关，零 Token 计费成本，内置 800K 上下文与原生多模态',
    needApiKey: true,
    websiteUrl: 'https://api.anubisroot.top',
  },
  {
    id: 'gemini',
    name: 'Google Gemini (OpenAI 协议)',
    icon: '💎',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    description: 'Google 官方 OpenAI 兼容接口，极速且支持超长上下文（适合课堂实时互动）',
    needApiKey: true,
    websiteUrl: 'https://aistudio.google.com',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek (深度求索官方)',
    icon: '🚀',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    description: '国内推理与代码能力顶尖，性价比极高',
    needApiKey: true,
    websiteUrl: 'https://platform.deepseek.com',
  },
  {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    icon: '🌐',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'o1-mini', 'gpt-4-turbo'],
    description: 'OpenAI 官方大模型，全球通用智能基准',
    needApiKey: true,
    websiteUrl: 'https://platform.openai.com',
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow (硅基流动)',
    icon: '⚡',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    models: [
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1',
      'Qwen/Qwen2.5-72B-Instruct',
      'Qwen/Qwen2.5-Coder-32B-Instruct',
    ],
    description: '国内高并发大模型聚合平台，稳定免翻',
    needApiKey: true,
    websiteUrl: 'https://siliconflow.cn',
  },
  {
    id: 'moonshot',
    name: 'Moonshot AI (月之暗面 / Kimi)',
    icon: '🌙',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    description: '长文本与中文场景理解专家',
    needApiKey: true,
    websiteUrl: 'https://platform.moonshot.cn',
  },
  {
    id: 'zhipu',
    name: 'Zhipu AI (智谱清言)',
    icon: '🧠',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    models: ['glm-4-flash', 'glm-4-plus', 'glm-4-air'],
    description: '清华智谱国产自主可控基座大模型',
    needApiKey: true,
    websiteUrl: 'https://open.bigmodel.cn',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (全球聚合路由)',
    icon: '🔀',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-chat',
    models: [
      'deepseek/deepseek-chat',
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4o',
      'meta-llama/llama-3.3-70b-instruct',
    ],
    description: '全球多模型统一 API 路由，支持 Claude、Llama 等',
    needApiKey: true,
    websiteUrl: 'https://openrouter.ai',
  },
  {
    id: 'ollama',
    name: 'Ollama (本地离线私有化)',
    icon: '🦙',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5-coder:7b',
    models: ['qwen2.5-coder:7b', 'deepseek-r1:8b', 'llama3.2:3b'],
    description: '本地私有化部署，数据不出本机，无需 API Key',
    needApiKey: false,
    websiteUrl: 'https://ollama.com',
  },
  {
    id: 'custom',
    name: '自定义供应商 (Custom API)',
    icon: '🛠️',
    baseUrl: '',
    defaultModel: '',
    models: [],
    description: '支持任何符合 OpenAI 规范的自定义代理或中转站',
    needApiKey: true,
  },
];

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIRequestConfig {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  messages: ChatMessage[];
}

export class AIService {
  getPresetProviders(): AIProviderPreset[] {
    return PRESET_PROVIDERS;
  }

  normalizeUrl(baseUrl: string): string {
    let clean = baseUrl.trim().replace(/\/+$/, '');
    if (!clean) return '';
    if (clean.endsWith('/chat/completions')) {
      return clean;
    }
    return `${clean}/chat/completions`;
  }

  resolveCredentials(config: { provider?: string; baseUrl?: string; apiKey?: string; model?: string }): {
    baseUrl: string;
    apiKey: string;
    model: string;
  } {
    const ANUBIS_GATEWAY_KEY = 'sk-0448f4d2aacffacf756d555794703bf3d13f2487259d98da';
    const isLinuxHost = process.platform === 'linux';
    const defaultGatewayUrl = isLinuxHost ? 'http://127.0.0.1:8000/v1' : 'https://api.anubisroot.top/v1';

    // Auto-migrate legacy default key or empty provider to Anubis Gateway
    const isLegacyDefault =
      config.apiKey === 'sk-8edbc2d2456045068188e41b02d6d1b7' ||
      (!config.provider && !config.baseUrl) ||
      config.provider === 'anubis-gateway';

    if (isLegacyDefault) {
      const targetModel =
        config.model === 'deepseek-v4-pro' || config.model === 'deepseek-v4.1-flash'
          ? config.model
          : 'deepseek-v4.1-flash';
      return {
        baseUrl: defaultGatewayUrl,
        apiKey: config.apiKey && config.apiKey !== 'sk-8edbc2d2456045068188e41b02d6d1b7' ? config.apiKey : ANUBIS_GATEWAY_KEY,
        model: targetModel,
      };
    }

    const preset = PRESET_PROVIDERS.find(p => p.id === config.provider);
    
    let baseUrl = config.baseUrl || preset?.baseUrl || '';
    let apiKey = config.apiKey || '';
    let model = config.model || preset?.defaultModel || 'deepseek-v4.1-flash';

    // Route api.anubisroot.top via local loopback when running on the server host
    if (isLinuxHost && baseUrl.includes('api.anubisroot.top')) {
      baseUrl = 'http://127.0.0.1:8000/v1';
    }

    if (!apiKey) {
      if (config.provider === 'anubis-gateway' || baseUrl.includes('anubisroot.top') || baseUrl.includes('127.0.0.1:8000')) {
        apiKey = ANUBIS_GATEWAY_KEY;
      } else if (config.provider === 'deepseek' || baseUrl.includes('deepseek')) {
        apiKey = process.env.DEEPSEEK_API_KEY || ANUBIS_GATEWAY_KEY;
      } else if (config.provider === 'gemini' || baseUrl.includes('generativelanguage')) {
        apiKey = process.env.GEMINI_API_KEY || '';
      } else if (config.provider === 'openai' || baseUrl.includes('openai.com')) {
        apiKey = process.env.OPENAI_API_KEY || '';
      } else if (config.provider === 'siliconflow' || baseUrl.includes('siliconflow')) {
        apiKey = process.env.SILICONFLOW_API_KEY || '';
      } else {
        apiKey = ANUBIS_GATEWAY_KEY;
      }
    }

    if (!baseUrl) {
      baseUrl = preset?.baseUrl || defaultGatewayUrl;
    }

    if (!model) {
      model = preset?.defaultModel || 'deepseek-v4.1-flash';
    }

    return { baseUrl, apiKey, model };
  }

  async testConnection(config: { provider?: string; baseUrl?: string; apiKey?: string; model?: string }): Promise<{
    success: boolean;
    latencyMs?: number;
    reply?: string;
    error?: string;
  }> {
    const creds = this.resolveCredentials(config);
    if (!creds.baseUrl) {
      return { success: false, error: '缺少 Base URL' };
    }
    if (!creds.apiKey && config.provider !== 'ollama' && !creds.baseUrl.includes('localhost') && !creds.baseUrl.includes('127.0.0.1')) {
      return { success: false, error: '缺少 API Key' };
    }

    const endpoint = this.normalizeUrl(creds.baseUrl);
    const start = Date.now();

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (creds.apiKey) {
        headers['Authorization'] = `Bearer ${creds.apiKey}`;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: creds.model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10,
        }),
      });

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const text = await res.text();
        let errMsg = `HTTP ${res.status}: ${res.statusText}`;
        try {
          const parsed = JSON.parse(text);
          if (parsed.error?.message) {
            errMsg = parsed.error.message;
          }
        } catch {}
        return { success: false, latencyMs, error: errMsg };
      }

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || 'OK';
      return { success: true, latencyMs, reply };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: err.message || '网络连接超时或地址不可达',
      };
    }
  }

  async fetchModels(config: { provider?: string; baseUrl?: string; apiKey?: string }): Promise<{
    success: boolean;
    models: string[];
    error?: string;
  }> {
    const creds = this.resolveCredentials(config);
    let cleanBase = creds.baseUrl.trim().replace(/\/+$/, '');
    if (cleanBase.endsWith('/chat/completions')) {
      cleanBase = cleanBase.replace('/chat/completions', '');
    }
    const endpoint = `${cleanBase}/models`;

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (creds.apiKey) {
        headers['Authorization'] = `Bearer ${creds.apiKey}`;
      }

      const res = await fetch(endpoint, {
        method: 'GET',
        headers,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return {
          success: false,
          models: [],
          error: `获取模型列表失败 (${res.status}): ${errText.slice(0, 150)}`,
        };
      }

      const data = await res.json();
      let modelList: string[] = [];
      if (Array.isArray(data.data)) {
        modelList = data.data.map((m: any) => m.id || m.name).filter(Boolean);
      } else if (Array.isArray(data.models)) {
        modelList = data.models.map((m: any) => m.name || m.id).filter(Boolean);
      } else if (Array.isArray(data)) {
        modelList = data.map((m: any) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
      }

      modelList = Array.from(new Set(modelList)).sort();

      return {
        success: true,
        models: modelList,
      };
    } catch (err: any) {
      return {
        success: false,
        models: [],
        error: err.message || '网络连接超时或无法解析模型列表',
      };
    }
  }

  async streamChat(config: AIRequestConfig): Promise<Response> {
    const creds = this.resolveCredentials(config);
    if (!creds.baseUrl) {
      throw new Error('未配置 AI 供应商或 Base URL');
    }
    if (!creds.apiKey && config.provider !== 'ollama' && !creds.baseUrl.includes('localhost') && !creds.baseUrl.includes('127.0.0.1')) {
      throw new Error('未提供 API Key，请先在 AI 导师设置中配置');
    }

    const endpoint = this.normalizeUrl(creds.baseUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (creds.apiKey) {
      headers['Authorization'] = `Bearer ${creds.apiKey}`;
    }

    return await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: creds.model,
        messages: config.messages,
        temperature: config.temperature ?? 0.7,
        stream: true,
      }),
    });
  }

  async generateSkillTreePlan(options: {
    materialText: string;
    topicName: string;
    targetLevel?: string;
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
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
    const creds = this.resolveCredentials(options);
    if (!creds.baseUrl) {
      throw new Error('未配置 AI 供应商或 Base URL');
    }

    const endpoint = this.normalizeUrl(creds.baseUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (creds.apiKey) {
      headers['Authorization'] = `Bearer ${creds.apiKey}`;
    }

    const systemPrompt = `你是一位世界顶级的课程研发专家与知识图谱架构师。
你的任务是根据用户提供的资料/教材/大纲文本，为《${options.topicName}》设计一套由浅入深、循序渐进、结构严谨的技能树（Skill Tree）。
培养目标受众级别：${options.targetLevel || '零基础到实战精通'}。

请将知识分解为 3~4 个阶段（Milestones），每个阶段分解为 2~4 个攻坚节点（Tasks），并标注清晰的前后依赖关系（Dependencies）。
每个节点必须包含具体的标题和讲义描述（包含：1. 为什么学这个；2. 核心原理要点；3. 实操验证标准）。

【返回格式要求】
必须严格输出纯 JSON 对象，不要用 markdown 包裹，也不要有任何其他解释性文字：
{
  "name": "${options.topicName}",
  "description": "简要介绍本技能树的核心成长路径与终极实战目标",
  "milestones": [
    { "id": "m1", "title": "第一阶段：基础底座与环境准备", "order": 1 },
    { "id": "m2", "title": "第二阶段：核心机制与关键突破", "order": 2 },
    { "id": "m3", "title": "第三阶段：进阶防御与综合实战", "order": 3 }
  ],
  "tasks": [
    {
      "id": "t1_1",
      "title": "节点 1.1：...",
      "description": "### 1. 为什么学这个\\n...\\n### 2. 核心原理要点\\n...\\n### 3. 实操验证标准\\n...",
      "milestoneId": "m1",
      "priority": "high",
      "tags": ["基础", "核心"]
    }
  ],
  "dependencies": [
    { "source": "t1_1", "target": "t1_2", "type": "prerequisite" }
  ]
}`;

    const userPrompt = `【以下是用户提供的教材/大纲/资料内容】：\n\n${options.materialText.slice(0, 15000)}\n\n请立即根据上述教材资料，提炼生成完整的技能树 JSON。`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: creds.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg = `HTTP ${res.status}: ${res.statusText}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) msg = parsed.error.message;
      } catch {}
      throw new Error(`AI 生成失败: ${msg}`);
    }

    const data = await res.json();
    const rawContent = data.choices?.[0]?.message?.content || '';
    if (!rawContent) {
      throw new Error('AI 未返回有效内容');
    }

    let cleaned = rawContent.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    try {
      const parsed = JSON.parse(cleaned);
      if (!parsed.milestones || !parsed.tasks) {
        throw new Error('JSON 缺少 milestones 或 tasks 字段');
      }
      return parsed;
    } catch (parseErr: any) {
      throw new Error(`解析 AI 返回的 JSON 失败: ${parseErr.message}。原始内容片段: ${rawContent.slice(0, 300)}`);
    }
  }

  /**
   * AI Read materials and enrich a specific task with deep lecture notes, code, and checkpoints
   */
  async enrichTaskNotes(options: {
    taskTitle: string;
    taskDescription?: string;
    projectTopic?: string;
    materialSnippets: string;
    targetLevel?: string;
    focusPrompt?: string;
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  }): Promise<string> {
    const creds = this.resolveCredentials(options);
    if (!creds.baseUrl) {
      throw new Error('未配置 AI 供应商或 Base URL');
    }

    const endpoint = this.normalizeUrl(creds.baseUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (creds.apiKey) {
      headers['Authorization'] = `Bearer ${creds.apiKey}`;
    }

    const systemPrompt = `你是一位世界顶级的专业技术导师与教材编委会主编。
学员正在学习《${options.projectTopic || '专属学习技能树'}》中的核心攻坚节点：【${options.taskTitle}】。
你的任务是研读用户提供的教材/参考资料内容，为该节点撰写极其详尽、干货密集、条理清晰的系统化讲义（Markdown 格式）。
难度目标定位：${options.targetLevel || '零基础到实战精通'}。

【讲义内容必须包含以下 5 个标准模块】：
### 🎯 1. 核心攻坚目标与概念定义
- 用通俗生动的大白话拆解该技术的底层逻辑、现实应用场景，以及为什么在技能树中处于该关键位置。

### 📖 2. 深度讲义与核心原理解析
- 紧密结合提供的教材与资料，深入浅出地剖析核心机制与内部运作原理，重点概念加粗说明。

### 💻 3. 典型代码与实战复现步骤
- 给出完备、可运行或可动手验证的代码案例、实验步骤或命令流程，附带关键代码逐行详细注解。

### ⚠️ 4. 关键避坑与高频盲点
- 总结初学者最容易犯错、踩坑或混淆的 2~3 个关键要点与调试经验。

### ❓ 5. 阶段过关自测题
- 设计 2 道思考问答题或实操挑战题，并附带简要思路指引，帮助学员自我检测过关。

【格式要求】：
直接输出格式优美的 Markdown 内容，不要有前言寒暄，不要在最外层包裹 \`\`\`markdown 代码块。`;

    let userPrompt = `【节点标题】：${options.taskTitle}\n`;
    if (options.taskDescription) {
      userPrompt += `【当前已有大纲/摘要】：\n${options.taskDescription}\n\n`;
    }
    if (options.focusPrompt) {
      userPrompt += `【学员特殊定制要求】：\n${options.focusPrompt}\n\n`;
    }
    userPrompt += `【相关教材/参考资料研读摘录】：\n${options.materialSnippets.slice(0, 16000)}\n\n请立即研读以上资料，为【${options.taskTitle}】生成完整的深度系统化讲义。`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: creds.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg = `HTTP ${res.status}: ${res.statusText}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) msg = parsed.error.message;
      } catch {}
      throw new Error(`AI 生成讲义失败: ${msg}`);
    }

    const data = await res.json();
    let content = data.choices?.[0]?.message?.content || '';
    if (!content) {
      throw new Error('AI 未返回有效讲义内容');
    }

    content = content.trim();
    if (content.startsWith('```markdown')) {
      content = content.replace(/^```markdown\s*/i, '').replace(/\s*```$/, '');
    } else if (content.startsWith('```')) {
      content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    return content.trim();
  }

  /**
   * Immediate Reactive Explanation for Highlighted Text / Annotation
   */
  async explainAnnotation(options: {
    selectedText: string;
    comment?: string;
    taskTitle: string;
    contextText?: string;
    intent?: string;
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  }): Promise<string> {
    const creds = this.resolveCredentials(options);
    if (!creds.baseUrl) {
      throw new Error('未配置 AI 供应商或 Base URL');
    }

    const endpoint = this.normalizeUrl(creds.baseUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (creds.apiKey) {
      headers['Authorization'] = `Bearer ${creds.apiKey}`;
    }

    const systemPrompt = `你是一位极具耐心、技术精湛的伴学导师。
学员在研读【${options.taskTitle}】的讲义时，用鼠标划选了特定词句，并提出了疑问或标注了心得。
你的任务是**立即针对该划词内容与学员疑问进行一针见血、清晰透彻的解答**。

【回复规范】：
1. 语言直击痛点，通俗易懂，杜绝空话套话；
2. 结合原理与实战场景，如果涉及代码或命令，给出精简的 3~5 行示例；
3. 字数控制在 200~450 字左右，条理清晰（可适当使用加粗与列表）；
4. 直接输出 Markdown，不要外层代码块包裹。`;

    let userPrompt = `【划选原文】：\n"${options.selectedText}"\n\n`;
    if (options.comment) {
      userPrompt += `【学员疑问/标注】：\n"${options.comment}"\n\n`;
    } else {
      userPrompt += `【学员疑问】：请深入通俗地剖析这段话的核心含义、底层原理及实际应用方法。\n\n`;
    }
    if (options.contextText) {
      userPrompt += `【所在段落上下文】：\n${options.contextText.slice(0, 1000)}\n\n`;
    }
    userPrompt += `请立即为我答疑解惑：`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: creds.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg = `HTTP ${res.status}: ${res.statusText}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) msg = parsed.error.message;
      } catch {}
      throw new Error(`AI 解答失败: ${msg}`);
    }

    const data = await res.json();
    let content = data.choices?.[0]?.message?.content || '';
    if (!content) {
      throw new Error('AI 未返回有效解答');
    }

    content = content.trim();
    if (content.startsWith('```markdown')) {
      content = content.replace(/^```markdown\s*/i, '').replace(/\s*```$/, '');
    } else if (content.startsWith('```')) {
      content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    return content.trim();
  }
}

export const aiService = new AIService();
