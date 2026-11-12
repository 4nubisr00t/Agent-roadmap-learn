import { HttpsProxyAgent } from 'https-proxy-agent';
import https from 'https';
import fs from 'fs';
import path from 'path';

/**
 * Load key=value pairs from .env files into process.env without overriding existing env vars.
 */
export function loadDotEnv(candidatePaths?: string[]): void {
  const paths = candidatePaths || [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
  ];
  for (const envPath of paths) {
    try {
      if (!fs.existsSync(envPath)) continue;
      const raw = fs.readFileSync(envPath, 'utf-8');
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (key && process.env[key] === undefined) {
          process.env[key] = val;
        }
      }
      break;
    } catch {
      // Ignore unreadable .env candidate
    }
  }
}

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

export const DEFAULT_HUMAN_MENTOR_PROMPT = `你是一位极富人情味、生动透彻、通俗且直击底层本质的大学顶尖伴学导师。
你的教学风格像坐在学生身旁的亲切师兄兼资深讲师：
1. 【人情味与温度】：绝不冷冰冰地罗列八股文，用亲近、鼓励、启发式的语言与学生交流；
2. 【生活比喻与底层推导】：多用接地气的生活现实比喻，深入浅出地解释晦涩概念，同时对核心底层原理推演到底；
3. 【专业排版规范】：
   - 涉及数学或物理公式推导，必须输出标准 LaTeX 格式（行内公式用 $...$，独立块级公式用 $$...$$）；
   - 涉及数据流、状态转移或系统架构，输出规范的标准 Mermaid 图表 (\`\`\`mermaid ... \`\`\`)；
   - 涉及代码给出精炼、带中文注释的典型实现；
4. 【互动式思维启发】：在讲授核心知识的同时，引导学生主动思考“为什么系统要这样设计”。`;

export const PRESET_PROVIDERS: AIProviderPreset[] = [
  {
    id: 'vertex-gemini',
    name: 'Google Vertex AI (Gemini 3.8 Flash 专属伴学)',
    icon: '💎',
    baseUrl: 'https://aiplatform.googleapis.com/v1/publishers/google/models',
    defaultModel: 'gemini-3.8-flash',
    models: ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-1.5-pro'],
    description: 'Google Cloud Vertex AI 专属极速通道，Gemini 3.8 Flash 最具人情味、响应如闪电',
    needApiKey: true,
    websiteUrl: 'https://console.cloud.google.com/vertex-ai',
  },
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

  private getProxyAgent(): HttpsProxyAgent<string> | undefined {
    const proxyUrl =
      process.env.HTTPS_PROXY ||
      process.env.HTTP_PROXY ||
      process.env.https_proxy ||
      process.env.http_proxy;
    if (!proxyUrl) return undefined;
    try {
      return new HttpsProxyAgent(proxyUrl);
    } catch {
      return undefined;
    }
  }

  getServerKeyStatus(): { vertex: boolean; anubis: boolean } {
    return {
      vertex: Boolean(process.env.VERTEX_API_KEY || process.env.GEMINI_API_KEY),
      anubis: Boolean(process.env.ANUBIS_GATEWAY_KEY || 'sk-0448f4d2aacffacf756d555794703bf3d13f2487259d98da'),
    };
  }

  isVertexProvider(provider?: string, baseUrl?: string, apiKey?: string): boolean {
    if (provider === 'vertex-gemini') return true;
    if (baseUrl && baseUrl.includes('aiplatform.googleapis.com')) return true;
    if (apiKey && apiKey.startsWith('AQ.')) return true;
    return false;
  }

  /**
   * Directly invoke Google Cloud Vertex AI Express Mode with API Key (AQ....)
   */
  async callVertexExpress(options: {
    model: string;
    apiKey: string;
    messages: ChatMessage[];
    systemPrompt?: string;
    temperature?: number;
  }): Promise<string> {
    const { model, apiKey, messages, systemPrompt, temperature } = options;
    const targetModel = model || 'gemini-3.8-flash';
    const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${targetModel}:generateContent`;
    const u = new URL(url);
    const agent = this.getProxyAgent();

    let systemText = systemPrompt || '';
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    for (const m of messages) {
      if (m.role === 'system') {
        systemText += (systemText ? '\n\n' : '') + m.content;
      } else {
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        });
      }
    }
    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: '你好' }] });
    }

    const payload: any = {
      contents,
      generationConfig: {
        temperature: temperature ?? 0.7,
      },
    };
    if (systemText) {
      payload.system_instruction = { parts: [{ text: systemText }] };
    }

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: 443,
          path: u.pathname + u.search,
          method: 'POST',
          agent,
          headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json',
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              let errMsg = `Vertex AI Error (HTTP ${res.statusCode})`;
              try {
                const errJson = JSON.parse(body);
                if (errJson.error?.message) errMsg = errJson.error.message;
              } catch {}
              return reject(new Error(errMsg));
            }
            try {
              const data = JSON.parse(body);
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
              resolve(text);
            } catch (err: any) {
              reject(new Error(`解析 Vertex AI 响应失败: ${err.message}`));
            }
          });
        }
      );
      req.on('error', reject);
      req.write(JSON.stringify(payload));
      req.end();
    });
  }

  /**
   * Stream Google Cloud Vertex AI Express Mode as standard OpenAI SSE format
   */
  async streamVertexExpress(options: {
    model: string;
    apiKey: string;
    messages: ChatMessage[];
    systemPrompt?: string;
    temperature?: number;
  }): Promise<Response> {
    const { model, apiKey, messages, systemPrompt, temperature } = options;
    const targetModel = model || 'gemini-3.8-flash';
    const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${targetModel}:streamGenerateContent?alt=sse`;
    const u = new URL(url);
    const agent = this.getProxyAgent();

    let systemText = systemPrompt || '';
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    for (const m of messages) {
      if (m.role === 'system') {
        systemText += (systemText ? '\n\n' : '') + m.content;
      } else {
        contents.push({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        });
      }
    }
    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: '你好' }] });
    }

    const payload: any = {
      contents,
      generationConfig: {
        temperature: temperature ?? 0.7,
      },
    };
    if (systemText) {
      payload.system_instruction = { parts: [{ text: systemText }] };
    }

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: 443,
          path: u.pathname + u.search,
          method: 'POST',
          agent,
          headers: {
            'x-goog-api-key': apiKey,
            'Content-Type': 'application/json',
          },
        },
        (res) => {
          const status = res.statusCode || 200;
          if (status >= 400) {
            let errBody = '';
            res.on('data', (chunk) => {
              errBody += chunk.toString();
            });
            res.on('end', () => {
              resolve(
                new Response(errBody || JSON.stringify({ error: { message: `Vertex HTTP ${status}` } }), {
                  status,
                  headers: { 'Content-Type': 'application/json' },
                })
              );
            });
            res.on('error', (err) => reject(err));
            return;
          }

          let buffer = '';
          const stream = new ReadableStream({
            start(controller) {
              res.on('data', (chunk) => {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (trimmed.startsWith('data: ')) {
                    try {
                      const data = JSON.parse(trimmed.slice(6));
                      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                      if (text) {
                        const sseChunk = `data: ${JSON.stringify({
                          choices: [{ delta: { content: text } }],
                        })}\n\n`;
                        controller.enqueue(new TextEncoder().encode(sseChunk));
                      }
                    } catch {}
                  }
                }
              });
              res.on('end', () => {
                controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
                controller.close();
              });
              res.on('error', (err) => controller.error(err));
            },
          });

          resolve(
            new Response(stream, {
              status,
              headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
              },
            })
          );
        }
      );
      req.on('error', reject);
      req.write(JSON.stringify(payload));
      req.end();
    });
  }

  resolveCredentials(config: { provider?: string; baseUrl?: string; apiKey?: string; model?: string }): {
    baseUrl: string;
    apiKey: string;
    model: string;
  } {
    const ANUBIS_GATEWAY_KEY = 'sk-0448f4d2aacffacf756d555794703bf3d13f2487259d98da';
    const VERTEX_EXPRESS_KEY = process.env.VERTEX_API_KEY || process.env.GEMINI_API_KEY || '';
    const isLinuxHost = process.platform === 'linux';
    const defaultGatewayUrl = isLinuxHost ? 'http://127.0.0.1:8000/v1' : 'https://api.anubisroot.top/v1';

    // Check Vertex AI Express provider first
    if (this.isVertexProvider(config.provider, config.baseUrl, config.apiKey)) {
      return {
        baseUrl: 'https://aiplatform.googleapis.com/v1/publishers/google/models',
        apiKey: config.apiKey || VERTEX_EXPRESS_KEY,
        model: config.model && config.model.startsWith('gemini') ? config.model : 'gemini-3.8-flash',
      };
    }

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

    if (this.isVertexProvider(config.provider, creds.baseUrl, creds.apiKey)) {
      const start = Date.now();
      try {
        const reply = await this.callVertexExpress({
          model: creds.model || 'gemini-3.8-flash',
          apiKey: creds.apiKey,
          messages: [{ role: 'user', content: '测试连接，请回复一句话' }],
          temperature: 0.1,
        });
        return {
          success: true,
          latencyMs: Date.now() - start,
          reply: reply.slice(0, 100),
        };
      } catch (err: any) {
        return {
          success: false,
          latencyMs: Date.now() - start,
          error: err.message || 'Vertex AI 连接超时或未获授权',
        };
      }
    }

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

    if (this.isVertexProvider(config.provider, creds.baseUrl, creds.apiKey)) {
      return {
        success: true,
        models: ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-1.5-pro'],
      };
    }

    const cleanBase = (creds.baseUrl || '').trim().replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
    if (!cleanBase) {
      return {
        success: false,
        models: [],
        error: '未配置有效的 Base URL',
      };
    }
    const endpoint = cleanBase.endsWith('/models') ? cleanBase : `${cleanBase}/models`;

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

    if (this.isVertexProvider(config.provider, creds.baseUrl, creds.apiKey)) {
      return await this.streamVertexExpress({
        model: creds.model || 'gemini-3.8-flash',
        apiKey: creds.apiKey,
        messages: config.messages,
        temperature: config.temperature ?? 0.7,
      });
    }

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

  private stripMarkdownFence(text: string): string {
    let content = text.trim();
    if (content.startsWith('```markdown')) {
      content = content.replace(/^```markdown\s*/i, '').replace(/\s*```$/, '');
    } else if (content.startsWith('```json')) {
      content = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    } else if (content.startsWith('```')) {
      content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return content.trim();
  }

  /**
   * Unified JSON completion across Vertex AI Express and OpenAI-compatible gateways (with retry).
   */
  async completeJson(options: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    retries?: number;
  }): Promise<any> {
    const creds = this.resolveCredentials(options);
    if (!creds.baseUrl) {
      throw new Error('未配置 AI 供应商或 Base URL');
    }

    const maxAttempts = (options.retries ?? 1) + 1;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        let rawText = '';
        if (this.isVertexProvider(options.provider, creds.baseUrl, creds.apiKey)) {
          rawText = await this.callVertexExpress({
            model: creds.model || 'gemini-3.8-flash',
            apiKey: creds.apiKey,
            messages: [{ role: 'user', content: options.userPrompt }],
            systemPrompt: options.systemPrompt,
            temperature: options.temperature ?? 0.2,
          });
        } else {
          const endpoint = this.normalizeUrl(creds.baseUrl);
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (creds.apiKey) headers['Authorization'] = `Bearer ${creds.apiKey}`;

          const bodyBase = {
            model: creds.model,
            messages: [
              { role: 'system', content: options.systemPrompt },
              { role: 'user', content: options.userPrompt },
            ],
            temperature: options.temperature ?? 0.2,
            stream: false,
          };

          let res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...bodyBase, response_format: { type: 'json_object' } }),
          });

          if (!res.ok && res.status === 400) {
            res = await fetch(endpoint, {
              method: 'POST',
              headers,
              body: JSON.stringify(bodyBase),
            });
          }

          if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`LLM 请求失败 (${res.status}): ${errText.slice(0, 200)}`);
          }

          const data = await res.json();
          rawText = data.choices?.[0]?.message?.content || '';
        }

        const cleaned = this.stripMarkdownFence(rawText);
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        const jsonStr = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
        return JSON.parse(jsonStr);
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 800 * attempt));
        }
      }
    }

    throw lastError || new Error('LLM JSON 解析失败');
  }

  private buildEnrichPrompts(options: {
    taskTitle: string;
    taskDescription?: string;
    projectTopic?: string;
    materialSnippets: string;
    targetLevel?: string;
    focusPrompt?: string;
  }): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `你是一位极富人情味、生动透彻、通俗且直击底层本质的大学顶尖伴学导师。
学员正在攻读《${options.projectTopic || '专属学习技能树'}》中的核心攻坚节点：【${options.taskTitle}】。
难度目标定位：${options.targetLevel || '零基础到实战精通'}。

你的任务是结合用户提供的教材章节切片，为该节点撰写一份富有温度、深入浅出、干货密集的专属精讲讲义（Markdown 格式）：

【讲义内容必须包含以下 5 个标准模块】：
### 🎯 1. 核心攻坚目标与直觉概念
- 像坐在学生身旁一样，用生活大白话比喻拆解该技术的底层逻辑，解释现实应用中为什么要设计这个机制，扫清认知畏难感。

### 📖 2. 深度讲义与底层原理解析
- 紧密结合教材原书切片深入剖析核心机制。
- 涉及数学或物理公式推导，必须输出标准 LaTeX 格式（行内用 $...$，独立块级公式用 $$...$$）。
- 涉及流程流转、状态转移或硬件架构，输出规范的 Mermaid 图表代码块 (\`\`\`mermaid ... \`\`\`)。

### 💻 3. 典型代码与关键指令拆解
- 给出完备、可动手验证的指令流水/伪代码/核心代码片段，附带详细中文逐行注释。

### ⚠️ 4. 学长避坑指南与常见认知误区
- 总结初学者最容易踩坑或混淆的 2~3 个关键盲区与调试心得。

### ❓ 5. 闯关自测与思考挑战
- 设计 2 道带思考深度的自测题或动手小练习，并附带思路启发，帮助学员自我检测过关。

【格式要求】：
直接输出格式优美的 Markdown 内容，禁止在最外层包裹 \`\`\`markdown 代码块。`;

    let userPrompt = `【节点标题】：${options.taskTitle}\n`;
    if (options.taskDescription) {
      userPrompt += `【当前已有大纲/摘要】：\n${options.taskDescription}\n\n`;
    }
    if (options.focusPrompt) {
      userPrompt += `【学员特殊定制要求】：\n${options.focusPrompt}\n\n`;
    }
    userPrompt += `【相关教材/参考资料研读摘录】：\n${options.materialSnippets.slice(0, 16000)}\n\n请立即研读以上资料，为【${options.taskTitle}】生成完整的深度系统化讲义。`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Stream deep lecture notes generation (SSE Response in OpenAI delta format)
   */
  async streamEnrichTaskNotes(options: {
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
  }): Promise<Response> {
    const { systemPrompt, userPrompt } = this.buildEnrichPrompts(options);
    return await this.streamChat({
      provider: options.provider,
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      model: options.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.45,
    });
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

    const { systemPrompt, userPrompt } = this.buildEnrichPrompts(options);

    // Fast-path: Google Cloud Vertex AI Express
    if (this.isVertexProvider(options.provider, creds.baseUrl, creds.apiKey)) {
      const rawContent = await this.callVertexExpress({
        model: creds.model || 'gemini-3.8-flash',
        apiKey: creds.apiKey,
        messages: [{ role: 'user', content: userPrompt }],
        systemPrompt,
        temperature: 0.5,
      });

      return this.stripMarkdownFence(rawContent);
    }

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
    const content = data.choices?.[0]?.message?.content || '';
    if (!content) {
      throw new Error('AI 未返回有效讲义内容');
    }

    return this.stripMarkdownFence(content);
  }

  private buildExplainPrompts(options: {
    selectedText: string;
    comment?: string;
    taskTitle: string;
    contextText?: string;
    intent?: string;
  }): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `你是一位极具耐心、技术精湛的伴学导师。
学员在研读【${options.taskTitle}】的讲义时，用鼠标划选了特定词句，并提出了疑问或标注了心得。
你的任务是**立即针对该划词内容与学员疑问进行一针见血、清晰透彻的解答**。

【回复规范】：
1. 语言直击痛点，通俗易懂，杜绝空话套话；
2. 结合原理与实战场景，如果涉及公式请使用标准 LaTeX ($...$ / $$...$$)，涉及代码给出精简 3~8 行示例；
3. 字数控制在 200~500 字左右，条理清晰（可适当使用加粗与列表）；
4. 直接输出 Markdown，不要外层代码块包裹。`;

    let userPrompt = `【划选原文】：\n"${options.selectedText}"\n\n`;
    if (options.comment) {
      userPrompt += `【学员疑问/标注】：\n"${options.comment}"\n\n`;
    } else if (options.intent === 'code') {
      userPrompt += `【学员请求】：请结合可运行的最小代码片段或指令序列，直觉化演示上述概念的工作过程。\n\n`;
    } else if (options.intent === 'simplify') {
      userPrompt += `【学员请求】：请完全抛开晦涩术语，用生活大白话/形象比喻重新讲解这段核心概念。\n\n`;
    } else {
      userPrompt += `【学员疑问】：请深入通俗地剖析这段话的核心含义、底层原理及实际应用方法。\n\n`;
    }
    if (options.contextText) {
      userPrompt += `【所在段落上下文】：\n${options.contextText.slice(0, 1200)}\n\n`;
    }
    userPrompt += `请立即为我答疑解惑：`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Stream immediate reactive explanation for highlighted text (SSE Response in OpenAI delta format)
   */
  async streamExplainAnnotation(options: {
    selectedText: string;
    comment?: string;
    taskTitle: string;
    contextText?: string;
    intent?: string;
    provider?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  }): Promise<Response> {
    const { systemPrompt, userPrompt } = this.buildExplainPrompts(options);
    return await this.streamChat({
      provider: options.provider,
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      model: options.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    });
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

    const { systemPrompt, userPrompt } = this.buildExplainPrompts(options);

    // Fast-path: Google Cloud Vertex AI Express
    if (this.isVertexProvider(options.provider, creds.baseUrl, creds.apiKey)) {
      const rawContent = await this.callVertexExpress({
        model: creds.model || 'gemini-3.8-flash',
        apiKey: creds.apiKey,
        messages: [{ role: 'user', content: userPrompt }],
        systemPrompt,
        temperature: 0.3,
      });

      return this.stripMarkdownFence(rawContent);
    }

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
    const content = data.choices?.[0]?.message?.content || '';
    if (!content) {
      throw new Error('AI 未返回有效解答');
    }

    return this.stripMarkdownFence(content);
  }
}

export const aiService = new AIService();
