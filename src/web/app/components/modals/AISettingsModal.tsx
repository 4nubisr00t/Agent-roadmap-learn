import React, { useState, useEffect } from 'react';
import {
  IconSettings,
  IconClose,
  IconAI,
  IconLightning,
  IconCheck,
  IconSparkles,
  IconArrowUpRight,
  IconEye,
  IconEyeOff,
  IconRefresh,
} from '../Icons.js';

export interface AIProviderPreset {
  id: string;
  name: string;
  code: string;
  tag: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  description: string;
  needApiKey: boolean;
  websiteUrl?: string;
  apiKeyPlaceholder?: string;
}

export interface EngineConfig {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AISettingsState {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens?: number;
  systemPromptPreset: 'mentor' | 'rigorous' | 'socratic' | 'custom';
  customSystemPrompt: string;
  // Backward compatibility fields
  buildEngine?: EngineConfig;
  mentorEngine?: EngineConfig;
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

export const SYSTEM_PROMPTS = {
  mentor: DEFAULT_HUMAN_MENTOR_PROMPT,
  rigorous: `你是一位国际顶尖计算机与理工科学术导师。
回答必须严格、严密、富有学术深度：
1. 【概念定义清晰】：明确给出公理、定义与成立的前提边界条件；
2. 【数理推导完整】：涉及公式使用严格的 KaTeX 排版，一步步推导全流程；
3. 【系统机制到底】：不回避任何微体系结构、内核机制或系统调用细节。`,
  socratic: `你是一位苏格拉底式启发导师。
不要直接倾倒答案，通过层层剖析反问、矛盾点揭示与思维实验，引导学生主动得出正确结论：
1. 每次仅提出 1~2 个关键反问；
2. 肯定学生思考中的合理成分，指出潜在盲区；
3. 规范使用 KaTeX 与代码片段辅助设问。`,
  custom: '',
};

export const BUILTIN_PRESETS: AIProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    code: 'DS',
    tag: '官方直连',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    description: '深度求索官方接口，推理与代码实战表现卓越，超高性价比（DeepSeek-V3 / R1）。',
    needApiKey: true,
    websiteUrl: 'https://platform.deepseek.com',
    apiKeyPlaceholder: 'sk-...',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    code: 'GEMINI',
    tag: '超长上下文',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro'],
    description: 'Google 官方 OpenAI 兼容端点，毫秒级流式响应，支持百万级超长教材上下文。',
    needApiKey: true,
    websiteUrl: 'https://aistudio.google.com',
    apiKeyPlaceholder: 'AIzaSy...',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    code: 'OAI',
    tag: '行业基准',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini', 'o1', 'gpt-4-turbo'],
    description: '全球大模型行业标杆，逻辑推导与复杂指令遵循能力强劲。',
    needApiKey: true,
    websiteUrl: 'https://platform.openai.com',
    apiKeyPlaceholder: 'sk-...',
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    code: 'CLAUDE',
    tag: '学术与代码',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-7-sonnet-20250219',
    models: [
      'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
    ],
    description: 'Anthropic 前沿旗舰模型，擅长超长代码审阅与严谨数理推导。',
    needApiKey: true,
    websiteUrl: 'https://console.anthropic.com',
    apiKeyPlaceholder: 'sk-ant-...',
  },
  {
    id: 'siliconflow',
    name: 'SiliconFlow (硅基流动)',
    code: 'SILICON',
    tag: '国内高并发',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    models: [
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1',
      'Qwen/Qwen2.5-72B-Instruct',
      'Qwen/Qwen2.5-Coder-32B-Instruct',
    ],
    description: '国内高并发大模型聚合平台，稳定免翻墙，提供多规格 DeepSeek 与 Qwen 系列。',
    needApiKey: true,
    websiteUrl: 'https://siliconflow.cn',
    apiKeyPlaceholder: 'sk-...',
  },
  {
    id: 'moonshot',
    name: 'Moonshot AI (Kimi)',
    code: 'KIMI',
    tag: '长文研读',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    description: '专精超长文本理解与中文多轮伴学，擅长整本教材深度解构。',
    needApiKey: true,
    websiteUrl: 'https://platform.moonshot.cn',
    apiKeyPlaceholder: 'sk-...',
  },
  {
    id: 'zhipu',
    name: 'Zhipu AI (智谱 GLM)',
    code: 'GLM',
    tag: '自主基座',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    models: ['glm-4-flash', 'glm-4-plus', 'glm-4-air', 'glm-4-long'],
    description: '清华智谱国产自主可控基座大模型，中文知识面广。',
    needApiKey: true,
    websiteUrl: 'https://open.bigmodel.cn',
    apiKeyPlaceholder: 'key.secret',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    code: 'ROUTER',
    tag: '全球路由',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'deepseek/deepseek-chat',
    models: [
      'deepseek/deepseek-chat',
      'deepseek/deepseek-r1',
      'anthropic/claude-3.5-sonnet',
      'openai/gpt-4o',
      'google/gemini-2.0-flash-exp:free',
    ],
    description: '全球主流多模型统一 API 路由，一键调用各类前沿大模型。',
    needApiKey: true,
    websiteUrl: 'https://openrouter.ai',
    apiKeyPlaceholder: 'sk-or-...',
  },
  {
    id: 'ollama',
    name: 'Ollama 本地模型',
    code: 'OLLAMA',
    tag: '离线免密',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'deepseek-r1:8b',
    models: ['deepseek-r1:8b', 'qwen2.5-coder:7b', 'llama3.3:latest'],
    description: '本地私有化部署，数据物理隔绝不出本机，完全免费且无需 API Key。',
    needApiKey: false,
    websiteUrl: 'https://ollama.com',
    apiKeyPlaceholder: '本地无需密钥',
  },
  {
    id: 'anubis-gateway',
    name: 'Anubis Gateway (主机托管)',
    code: 'GATEWAY',
    tag: '内置开箱即用',
    baseUrl: 'https://api.anubisroot.top/v1',
    defaultModel: 'deepseek-v4.1-flash',
    models: ['deepseek-v4.1-flash', 'deepseek-v4-pro'],
    description: '服务器主机内置反代网关，免配置密钥，开箱即用零计费成本。',
    needApiKey: true,
    websiteUrl: 'https://api.anubisroot.top',
    apiKeyPlaceholder: '已内置托管密钥',
  },
  {
    id: 'vertex-gemini',
    name: 'Google Vertex AI',
    code: 'VERTEX',
    tag: '云端直通',
    baseUrl: 'https://aiplatform.googleapis.com/v1/publishers/google/models',
    defaultModel: 'gemini-3.8-flash',
    models: ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-1.5-pro'],
    description: 'Google Cloud Vertex AI 原生通道，支持超长上下文与极速响应。',
    needApiKey: true,
    websiteUrl: 'https://console.cloud.google.com/vertex-ai',
    apiKeyPlaceholder: 'AQ....',
  },
  {
    id: 'custom',
    name: '自定义 API (OpenAI 兼容)',
    code: 'CUSTOM',
    tag: '自由配置',
    baseUrl: '',
    defaultModel: '',
    models: [],
    description: '支持任何符合 OpenAI 规范的私有部署网关、OneAPI、NewAPI 或自定义中转站。',
    needApiKey: true,
    apiKeyPlaceholder: 'sk-...',
  },
];

export const DEFAULT_AI_CONFIG: AISettingsState = {
  providerId: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 4096,
  systemPromptPreset: 'mentor',
  customSystemPrompt: '',
};

export const DEFAULT_BUILD_ENGINE: EngineConfig = {
  providerId: DEFAULT_AI_CONFIG.providerId,
  baseUrl: DEFAULT_AI_CONFIG.baseUrl,
  apiKey: DEFAULT_AI_CONFIG.apiKey,
  model: DEFAULT_AI_CONFIG.model,
};

export const DEFAULT_MENTOR_ENGINE: EngineConfig = {
  providerId: DEFAULT_AI_CONFIG.providerId,
  baseUrl: DEFAULT_AI_CONFIG.baseUrl,
  apiKey: DEFAULT_AI_CONFIG.apiKey,
  model: DEFAULT_AI_CONFIG.model,
};

export const normalizeSavedSettings = (parsed: any): AISettingsState => {
  if (!parsed || parsed.apiKey === 'sk-8edbc2d2456045068188e41b02d6d1b7') {
    return {
      ...DEFAULT_AI_CONFIG,
      buildEngine: DEFAULT_BUILD_ENGINE,
      mentorEngine: DEFAULT_MENTOR_ENGINE,
    };
  }

  const providerId = parsed.providerId || parsed.mentorEngine?.providerId || DEFAULT_AI_CONFIG.providerId;
  const baseUrl = parsed.baseUrl || parsed.mentorEngine?.baseUrl || DEFAULT_AI_CONFIG.baseUrl;
  const apiKey = parsed.apiKey !== undefined ? parsed.apiKey : (parsed.mentorEngine?.apiKey || '');
  const model = parsed.model || parsed.mentorEngine?.model || DEFAULT_AI_CONFIG.model;
  const temperature = typeof parsed.temperature === 'number' ? parsed.temperature : DEFAULT_AI_CONFIG.temperature;
  const maxTokens = typeof parsed.maxTokens === 'number' ? parsed.maxTokens : DEFAULT_AI_CONFIG.maxTokens;
  const systemPromptPreset = parsed.systemPromptPreset || DEFAULT_AI_CONFIG.systemPromptPreset;
  const customSystemPrompt = parsed.customSystemPrompt || '';

  const unifiedEngine: EngineConfig = {
    providerId,
    baseUrl,
    apiKey,
    model,
  };

  return {
    providerId,
    baseUrl,
    apiKey,
    model,
    temperature,
    maxTokens,
    systemPromptPreset,
    customSystemPrompt,
    buildEngine: parsed.buildEngine ? { ...unifiedEngine, ...parsed.buildEngine } : unifiedEngine,
    mentorEngine: parsed.mentorEngine ? { ...unifiedEngine, ...parsed.mentorEngine } : unifiedEngine,
  };
};

export function loadMergedAISettings(currentUserId?: string): AISettingsState {
  try {
    if (currentUserId) {
      const userSaved = localStorage.getItem(`roadmap_ai_config_${currentUserId}`);
      if (userSaved) return normalizeSavedSettings(JSON.parse(userSaved));
    }
    const saved = localStorage.getItem('roadmap_ai_config');
    if (saved) return normalizeSavedSettings(JSON.parse(saved));
  } catch {}
  return {
    ...DEFAULT_AI_CONFIG,
    buildEngine: DEFAULT_BUILD_ENGINE,
    mentorEngine: DEFAULT_MENTOR_ENGINE,
  };
}

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (settings: AISettingsState) => void;
  currentUserId?: string;
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({ isOpen, onClose, onSave, currentUserId }) => {
  const [presets, setPresets] = useState<AIProviderPreset[]>(BUILTIN_PRESETS);
  const userConfigKey = currentUserId ? `roadmap_ai_config_${currentUserId}` : 'roadmap_ai_config';

  const [settings, setSettings] = useState<AISettingsState>(() => loadMergedAISettings(currentUserId));
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; message?: string } | null>(null);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchModelsMsg, setFetchModelsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [serverKeys, setServerKeys] = useState<{ vertex: boolean; anubis: boolean }>({
    vertex: false,
    anubis: true,
  });

  const currentPreset = presets.find((p) => p.id === settings.providerId) || BUILTIN_PRESETS.find((p) => p.id === settings.providerId);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/ai/providers')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data?.data) && data.data.length > 0) {
            setPresets(data.data);
          }
        })
        .catch(() => {});

      const token = localStorage.getItem('roadmap_auth_token');
      fetch('/api/ai/config', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.success && data.data) {
            if (data.data.serverKeys) {
              setServerKeys(data.data.serverKeys);
            }
            const hasLocal = Boolean(localStorage.getItem(userConfigKey) || localStorage.getItem('roadmap_ai_config'));
            if (!hasLocal && data.data.config) {
              setSettings(normalizeSavedSettings(data.data.config));
            }
          }
        })
        .catch(() => {});
    }
  }, [isOpen, userConfigKey]);

  if (!isOpen) return null;

  const isHostedByServer =
    (settings.providerId === 'vertex-gemini' && serverKeys.vertex) ||
    (settings.providerId === 'anubis-gateway' && serverKeys.anubis);

  const handleProviderSelect = (newProviderId: string) => {
    const preset = presets.find((p) => p.id === newProviderId) || BUILTIN_PRESETS.find((p) => p.id === newProviderId);

    // Retrieve cached key for this provider if user typed one earlier
    const cacheKey = currentUserId ? `roadmap_ai_keys_cache_${currentUserId}` : 'roadmap_ai_keys_cache';
    let savedKey = '';
    try {
      const savedKeys = JSON.parse(localStorage.getItem(cacheKey) || '{}');
      savedKey = savedKeys[newProviderId] || '';
    } catch {}

    setSettings((prev) => ({
      ...prev,
      providerId: newProviderId,
      baseUrl: preset?.baseUrl || prev.baseUrl,
      model: preset?.defaultModel || prev.model,
      apiKey: savedKey || (newProviderId === 'ollama' ? '' : prev.apiKey),
    }));

    setTestResult(null);
    setFetchModelsMsg(null);
    setFetchedModels([]);
  };

  const handleFetchModels = async () => {
    if (!settings.baseUrl.trim()) {
      setFetchModelsMsg({ type: 'error', text: '请先填写接口服务地址 (Base URL)' });
      return;
    }
    setIsFetchingModels(true);
    setFetchModelsMsg(null);
    try {
      const res = await fetch('/api/ai/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: settings.providerId,
          baseUrl: settings.baseUrl.trim(),
          apiKey: settings.apiKey.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '获取模型列表失败');
      }
      const models: string[] = data.models || [];
      setFetchedModels(models);
      setFetchModelsMsg({ type: 'success', text: `成功获取 ${models.length} 个可用模型` });
    } catch (err: any) {
      setFetchModelsMsg({ type: 'error', text: err.message || '获取模型列表失败' });
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: settings.providerId,
          baseUrl: settings.baseUrl.trim(),
          apiKey: settings.apiKey.trim(),
          model: settings.model.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          success: true,
          latencyMs: data.latencyMs,
          message: `连接成功 (握手延迟 ${data.latencyMs}ms，模型响应: "${data.reply || 'OK'}")`,
        });
      } else {
        setTestResult({
          success: false,
          latencyMs: data.latencyMs,
          message: data.error || '连接失败，请检查 Base URL、API Key 或模型名称是否准确',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || '网络连接异常，无法连通目标大模型网关',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleResetDefaults = () => {
    const def = DEFAULT_AI_CONFIG;
    setSettings({
      ...def,
      buildEngine: { providerId: def.providerId, baseUrl: def.baseUrl, apiKey: def.apiKey, model: def.model },
      mentorEngine: { providerId: def.providerId, baseUrl: def.baseUrl, apiKey: def.apiKey, model: def.model },
    });
    setTestResult(null);
    setFetchModelsMsg(null);
  };

  const handleSave = () => {
    const unifiedEngine: EngineConfig = {
      providerId: settings.providerId,
      baseUrl: settings.baseUrl.trim(),
      apiKey: settings.apiKey.trim(),
      model: settings.model.trim(),
    };

    const finalSettings: AISettingsState = {
      ...settings,
      baseUrl: settings.baseUrl.trim(),
      apiKey: settings.apiKey.trim(),
      model: settings.model.trim(),
      buildEngine: unifiedEngine,
      mentorEngine: unifiedEngine,
    };

    localStorage.setItem(userConfigKey, JSON.stringify(finalSettings));
    localStorage.setItem('roadmap_ai_config', JSON.stringify(finalSettings));

    // Cache key for the current provider
    try {
      const cacheKey = currentUserId ? `roadmap_ai_keys_cache_${currentUserId}` : 'roadmap_ai_keys_cache';
      const savedKeys = JSON.parse(localStorage.getItem(cacheKey) || '{}');
      if (settings.apiKey) {
        savedKeys[settings.providerId] = settings.apiKey.trim();
        localStorage.setItem(cacheKey, JSON.stringify(savedKeys));
      }
    } catch {}

    // Persist to server config for cross-device sync
    const token = localStorage.getItem('roadmap_auth_token');
    if (token) {
      fetch('/api/ai/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          providerId: finalSettings.providerId,
          baseUrl: finalSettings.baseUrl,
          apiKey: finalSettings.apiKey,
          model: finalSettings.model,
          temperature: finalSettings.temperature,
          maxTokens: finalSettings.maxTokens,
          systemPromptPreset: finalSettings.systemPromptPreset,
          customSystemPrompt: finalSettings.customSystemPrompt,
          mentorEngine: unifiedEngine,
          buildEngine: unifiedEngine,
        }),
      }).catch(() => {});
    }

    if (onSave) {
      onSave(finalSettings);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-zinc-800 gold-border-hover animate-sheet-mobile flex flex-col max-h-[92dvh] pb-safe">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/10">
              <IconAI className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-zinc-100 tracking-tight flex items-center gap-2">
                <span>AI 服务与模型网关</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono">
                  统一全栈配置
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400 font-medium mt-0.5">
                全局统一配置 AI 供应商、接入密钥与推理参数，教材拆解、讲义生成与实时答疑一站生效
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors active:scale-95"
            title="关闭设置"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Provider Preset Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-zinc-300 flex items-center gap-2">
                <span>预设供应商 (Provider Preset)</span>
                <span className="text-[10px] text-zinc-500 font-normal">点击快速切换并载入推荐参数</span>
              </label>
              {currentPreset?.websiteUrl && (
                <a
                  href={currentPreset.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-amber-400 hover:text-amber-300 font-medium underline flex items-center gap-1 transition-colors"
                >
                  <span>获取官方密钥</span>
                  <IconArrowUpRight className="w-3 h-3" />
                </a>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {presets.map((p) => {
                const isSelected = settings.providerId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProviderSelect(p.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all active:scale-95 flex flex-col justify-between gap-1.5 min-h-[64px] ${
                      isSelected
                        ? 'border-amber-500/80 bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/50 shadow-md shadow-amber-500/10 font-bold'
                        : 'border-zinc-800/90 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-850/60 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded tracking-wider ${
                          isSelected ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {p.code || p.id.slice(0, 4).toUpperCase()}
                      </span>
                      <span className="text-[9px] text-zinc-500 font-medium">{p.tag || '标准'}</span>
                    </div>
                    <div className="text-xs truncate font-bold w-full">{p.name.split(' ')[0]}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Provider Description Banner */}
          {currentPreset && (
            <div className="p-3 bg-zinc-950/90 rounded-xl border border-zinc-800 text-xs text-zinc-400 flex items-start gap-2.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 mt-1 shrink-0" />
              <div className="leading-relaxed">
                <span className="text-zinc-200 font-bold mr-1.5">{currentPreset.name}:</span>
                <span>{currentPreset.description}</span>
              </div>
            </div>
          )}

          {/* Base URL */}
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">接口服务地址 (Base URL)</label>
            <input
              type="text"
              value={settings.baseUrl}
              onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
              placeholder="例如 https://api.deepseek.com/v1 或 http://localhost:11434/v1"
              className="w-full px-3.5 py-2 text-xs font-mono bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-zinc-100 placeholder-zinc-600"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              遵循 OpenAI 标准规范，系统发起请求时自动适配 <code className="text-amber-400 font-mono">/chat/completions</code> 端点
            </p>
          </div>

          {/* API Key */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-zinc-300">大模型访问密钥 (API Key)</label>
                {isHostedByServer && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>服务端已托管密钥 · 留空即用</span>
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="text-[11px] text-zinc-400 hover:text-amber-400 flex items-center gap-1 transition-colors"
              >
                {showApiKey ? (
                  <>
                    <IconEyeOff className="w-3.5 h-3.5" />
                    <span>隐藏密钥</span>
                  </>
                ) : (
                  <>
                    <IconEye className="w-3.5 h-3.5" />
                    <span>查看密钥</span>
                  </>
                )}
              </button>
            </div>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={settings.apiKey}
                onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                placeholder={
                  isHostedByServer
                    ? '已接入服务端托管密钥（留空即可直接使用，或填入个人密钥覆盖）'
                    : currentPreset?.needApiKey
                      ? (currentPreset.apiKeyPlaceholder || 'sk-...')
                      : '本地离线私有化模型无需填写密钥，留空即可'
                }
                className="w-full px-3.5 py-2 text-xs font-mono bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-zinc-100 placeholder-zinc-600"
              />
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">
              密钥保存在本地并自动按供应商缓存；切换供应商时将自动回填您上次输入的对应密钥
            </p>
          </div>

          {/* Model Selection & Online Fetch */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-300 flex items-center gap-2">
                <span>选用模型 (Model)</span>
                {fetchedModels.length > 0 && (
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono">
                    已拉取 {fetchedModels.length} 个模型
                  </span>
                )}
              </label>
              <button
                type="button"
                onClick={handleFetchModels}
                disabled={isFetchingModels}
                className="text-xs font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 shadow-sm"
                title="请求当前供应商的 /models 接口拉取全部可用模型"
              >
                {isFetchingModels ? (
                  <>
                    <span className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    <span>正在获取...</span>
                  </>
                ) : (
                  <>
                    <IconSparkles className="w-3 h-3 text-amber-400" />
                    <span>在线拉取模型列表</span>
                  </>
                )}
              </button>
            </div>

            {fetchModelsMsg && (
              <div
                className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                  fetchModelsMsg.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    fetchModelsMsg.type === 'success' ? 'bg-emerald-400' : 'bg-rose-400'
                  }`}
                />
                <span>{fetchModelsMsg.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <input
                  type="text"
                  value={settings.model}
                  onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                  placeholder="可自由输入任何自定义模型名称"
                  className="w-full px-3.5 py-2 text-xs font-mono bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-zinc-100 placeholder-zinc-600"
                />
              </div>

              <div>
                {fetchedModels.length > 0 ? (
                  <select
                    value={fetchedModels.includes(settings.model) ? settings.model : ''}
                    onChange={(e) => e.target.value && setSettings({ ...settings, model: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-amber-500/50 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-amber-300 font-bold"
                  >
                    <option value="">快速选用在线拉取的模型...</option>
                    {fetchedModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : currentPreset && currentPreset.models.length > 0 ? (
                  <select
                    value={currentPreset.models.includes(settings.model) ? settings.model : ''}
                    onChange={(e) => e.target.value && setSettings({ ...settings, model: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-zinc-200 font-medium"
                  >
                    <option value="">选用预设推荐模型...</option>
                    {currentPreset.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center text-[11px] text-zinc-500 px-3 py-2 bg-zinc-950/50 rounded-xl border border-zinc-800">
                    可直接在左侧输入模型名，或点右上角拉取
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Advanced Inference Parameters Toggle */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs font-bold text-zinc-400 hover:text-amber-400 flex items-center gap-1.5 transition-colors"
            >
              <IconSettings className="w-3.5 h-3.5" />
              <span>{showAdvanced ? '收起高级推理与人设参数' : '展开高级推理与人设参数 (温度 / 导师风格 / 偏好)'}</span>
            </button>
          </div>

          {showAdvanced && (
            <div className="p-3.5 bg-zinc-950/70 border border-zinc-800/80 rounded-xl space-y-3.5 animate-fadeIn">
              {/* Temperature Slider */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-zinc-300">
                    采样温度 (Temperature): <span className="text-amber-400 font-mono">{settings.temperature}</span>
                  </label>
                  <span className="text-[10px] text-zinc-500">
                    {settings.temperature <= 0.3
                      ? '严谨精确 (推荐数学/编程推导)'
                      : settings.temperature <= 0.8
                        ? '平衡适中 (推荐日常伴学答疑)'
                        : '创意发散 (推荐脑暴启发)'}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={settings.temperature}
                  onChange={(e) => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
                  className="w-full accent-amber-500 bg-zinc-800 rounded-lg cursor-pointer h-1.5"
                />
              </div>

              {/* System Prompt Preset */}
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">伴学导师人设风格</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'mentor', label: '名师学伴 (推荐)' },
                    { id: 'rigorous', label: '严谨学者' },
                    { id: 'socratic', label: '苏格拉底启发' },
                    { id: 'custom', label: '完全自定义' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSettings({ ...settings, systemPromptPreset: p.id as any })}
                      className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-all text-center ${
                        settings.systemPromptPreset === p.id
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Prompt Input */}
              <div>
                <label className="block text-xs font-bold text-zinc-400 mb-1">
                  补充个性化偏好要求（选填）：
                </label>
                <input
                  type="text"
                  value={settings.customSystemPrompt || ''}
                  onChange={(e) => setSettings({ ...settings, customSystemPrompt: e.target.value })}
                  placeholder="例如：涉及代码优先使用 C/Rust 语言演示，遇到关键机制多对比 x86 体系..."
                  className="w-full px-3 py-1.5 text-xs bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 text-zinc-200 placeholder-zinc-600"
                />
              </div>
            </div>
          )}

          {/* Test Result Message */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-medium flex items-start gap-2.5 animate-fadeIn ${
                testResult.success
                  ? 'bg-amber-950/40 border-amber-600/60 text-amber-300'
                  : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                  testResult.success ? 'bg-amber-400' : 'bg-rose-500'
                }`}
              />
              <div className="flex-1 leading-relaxed">{testResult.message}</div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-800 flex items-center justify-between bg-zinc-950/80">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !settings.baseUrl}
              className="px-3.5 py-2 text-xs font-bold bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-750 rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-1.5 disabled:opacity-40"
            >
              {testing ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-amber-400 rounded-full animate-spin" />
                  <span>正在测速...</span>
                </>
              ) : (
                <>
                  <IconLightning className="w-3.5 h-3.5 text-amber-400" />
                  <span>测试连通性</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleResetDefaults}
              className="hidden sm:inline-flex px-3 py-2 text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 rounded-xl transition-colors active:scale-95"
              title="重置为默认推荐供应商"
            >
              恢复默认
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-xl transition-colors active:scale-95"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 text-xs font-black bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-zinc-950 rounded-xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <IconCheck className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>保存配置</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
