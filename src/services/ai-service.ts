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
    id: 'deepseek',
    name: 'DeepSeek (深度求索)',
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
    id: 'gemini',
    name: 'Google Gemini (OpenAI 协议)',
    icon: '💎',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    description: 'Google 官方 OpenAI 兼容接口，极速且支持超长上下文',
    needApiKey: true,
    websiteUrl: 'https://aistudio.google.com',
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
    const preset = PRESET_PROVIDERS.find(p => p.id === config.provider);
    
    let baseUrl = config.baseUrl || preset?.baseUrl || '';
    let apiKey = config.apiKey || '';
    let model = config.model || preset?.defaultModel || 'gpt-4o-mini';

    // Fallback to server env if not provided by client
    if (!apiKey) {
      if (config.provider === 'deepseek' || baseUrl.includes('deepseek')) {
        apiKey = process.env.DEEPSEEK_API_KEY || '';
      } else if (config.provider === 'gemini' || baseUrl.includes('generativelanguage')) {
        apiKey = process.env.GEMINI_API_KEY || '';
      } else if (config.provider === 'openai' || baseUrl.includes('openai.com')) {
        apiKey = process.env.OPENAI_API_KEY || '';
      } else if (config.provider === 'siliconflow' || baseUrl.includes('siliconflow')) {
        apiKey = process.env.SILICONFLOW_API_KEY || '';
      } else {
        apiKey = process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
      }
    }

    if (!baseUrl) {
      baseUrl = preset?.baseUrl || process.env.AI_BASE_URL || 'https://api.deepseek.com/v1';
    }

    if (!model) {
      model = preset?.defaultModel || process.env.AI_MODEL || 'deepseek-chat';
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
}

export const aiService = new AIService();
