import React, { useState, useEffect } from 'react';
import { IconSettings, IconClose, IconAI, IconLightning, IconCheck, IconLayers, IconSparkles } from '../Icons.js';

export interface AIProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  description: string;
  needApiKey: boolean;
  websiteUrl?: string;
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
  systemPromptPreset: string;
  customSystemPrompt: string;
  // Dual-Engine Support
  buildEngine?: EngineConfig;
  mentorEngine?: EngineConfig;
}

export const DEFAULT_BUILD_ENGINE: EngineConfig = {
  providerId: 'anubis-gateway',
  baseUrl: 'https://api.anubisroot.top/v1',
  apiKey: 'sk-0448f4d2aacffacf756d555794703bf3d13f2487259d98da',
  model: 'deepseek-v4.1-flash',
};

export const DEFAULT_MENTOR_ENGINE: EngineConfig = {
  providerId: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  apiKey: '',
  model: 'gemini-2.0-flash',
};

const DEFAULT_SETTINGS: AISettingsState = {
  providerId: 'anubis-gateway',
  baseUrl: 'https://api.anubisroot.top/v1',
  apiKey: 'sk-0448f4d2aacffacf756d555794703bf3d13f2487259d98da',
  model: 'deepseek-v4.1-flash',
  temperature: 0.7,
  systemPromptPreset: 'pwn',
  customSystemPrompt: '',
  buildEngine: DEFAULT_BUILD_ENGINE,
  mentorEngine: DEFAULT_MENTOR_ENGINE,
};

const normalizeSavedSettings = (parsed: any): AISettingsState => {
  if (!parsed || parsed.apiKey === 'sk-8edbc2d2456045068188e41b02d6d1b7') {
    return DEFAULT_SETTINGS;
  }
  const buildEngine = parsed.buildEngine || {
    providerId: 'anubis-gateway',
    baseUrl: 'https://api.anubisroot.top/v1',
    apiKey: 'sk-0448f4d2aacffacf756d555794703bf3d13f2487259d98da',
    model: 'deepseek-v4.1-flash',
  };
  const mentorEngine = parsed.mentorEngine || {
    providerId: parsed.providerId || 'anubis-gateway',
    baseUrl: parsed.baseUrl || 'https://api.anubisroot.top/v1',
    apiKey: parsed.apiKey || 'sk-0448f4d2aacffacf756d555794703bf3d13f2487259d98da',
    model: parsed.model || 'deepseek-v4.1-flash',
  };

  return {
    ...DEFAULT_SETTINGS,
    ...parsed,
    buildEngine,
    mentorEngine,
  };
};

export const SYSTEM_PROMPTS = {
  pwn: '你是一位资深的计算机底层与系统架构导师。请遵循苏格拉底式启发教学法，用生动的比喻结合底层原理剖析核心机制。在给出答案前，先引导学生思考底层时序、逻辑与架构。',
  fullstack: '你是一位资深全栈架构师与工程专家。擅长系统设计、代码质量重构与核心技术底层原理剖析。回答清晰、结构严谨，给出最佳实践与生产级代码示例。',
  socratic: '你是一位善于启发思考的学习导师。永远不直接把答案塞给学生，而是通过连环追问、类比举例和概念引导，带领学生自主推导出底层真理。',
  custom: '',
};

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (settings: AISettingsState) => void;
  currentUserId?: string;
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({ isOpen, onClose, onSave, currentUserId }) => {
  const [presets, setPresets] = useState<AIProviderPreset[]>([]);
  const [activeSlot, setActiveSlot] = useState<'mentor' | 'build'>('mentor');
  const userConfigKey = currentUserId ? `roadmap_ai_config_${currentUserId}` : 'roadmap_ai_config';

  const [settings, setSettings] = useState<AISettingsState>(() => {
    try {
      if (currentUserId) {
        const userSaved = localStorage.getItem(`roadmap_ai_config_${currentUserId}`);
        if (userSaved) return normalizeSavedSettings(JSON.parse(userSaved));
      }
      const saved = localStorage.getItem('roadmap_ai_config');
      if (saved) {
        return normalizeSavedSettings(JSON.parse(saved));
      }
    } catch {}
    return DEFAULT_SETTINGS;
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; message?: string } | null>(null);
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchModelsMsg, setFetchModelsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Active slot current config view
  const currentEngine: EngineConfig = activeSlot === 'build'
    ? (settings.buildEngine || DEFAULT_BUILD_ENGINE)
    : (settings.mentorEngine || DEFAULT_MENTOR_ENGINE);

  const updateCurrentEngine = (partial: Partial<EngineConfig>) => {
    setSettings((prev) => {
      if (activeSlot === 'build') {
        const updated = { ...(prev.buildEngine || DEFAULT_BUILD_ENGINE), ...partial };
        return {
          ...prev,
          buildEngine: updated,
        };
      } else {
        const updated = { ...(prev.mentorEngine || DEFAULT_MENTOR_ENGINE), ...partial };
        return {
          ...prev,
          providerId: updated.providerId,
          baseUrl: updated.baseUrl,
          apiKey: updated.apiKey,
          model: updated.model,
          mentorEngine: updated,
        };
      }
    });
  };

  const currentPreset = presets.find(p => p.id === currentEngine.providerId);

  const handleFetchModels = async () => {
    if (!currentEngine.baseUrl.trim()) {
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
          provider: currentEngine.providerId,
          baseUrl: currentEngine.baseUrl.trim(),
          apiKey: currentEngine.apiKey.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '获取模型列表失败');
      }
      setFetchedModels(data.models || []);
      setFetchModelsMsg({ type: 'success', text: `成功获取 ${data.models?.length || 0} 个可用模型` });
    } catch (err: any) {
      setFetchModelsMsg({ type: 'error', text: err.message || '获取模型列表失败' });
    } finally {
      setIsFetchingModels(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetch('/api/ai/providers')
        .then(res => res.json())
        .then(data => {
          if (data.data) {
            setPresets(data.data);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleProviderChange = (newProviderId: string) => {
    const preset = presets.find(p => p.id === newProviderId);
    if (preset) {
      const savedKeys = JSON.parse(localStorage.getItem('roadmap_ai_keys_cache') || '{}');
      const fallbackKey =
        newProviderId === 'anubis-gateway'
          ? 'sk-0448f4d2aacffacf756d555794703bf3d13f2487259d98da'
          : (savedKeys[newProviderId] || '');
      updateCurrentEngine({
        providerId: newProviderId,
        baseUrl: preset.baseUrl,
        model: preset.defaultModel,
        apiKey: fallbackKey || currentEngine.apiKey,
      });
    } else {
      updateCurrentEngine({ providerId: newProviderId });
    }
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: currentEngine.providerId,
          baseUrl: currentEngine.baseUrl,
          apiKey: currentEngine.apiKey,
          model: currentEngine.model,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          success: true,
          latencyMs: data.latencyMs,
          message: `连接成功 (握手延迟 ${data.latencyMs}ms，模型回复: "${data.reply}")`,
        });
      } else {
        setTestResult({
          success: false,
          latencyMs: data.latencyMs,
          message: data.error || '连接失败，请检查 Base URL、API Key 或模型名称',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || '网络连接异常',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    localStorage.setItem(userConfigKey, JSON.stringify(settings));
    localStorage.setItem('roadmap_ai_config', JSON.stringify(settings));

    try {
      const cacheKey = currentUserId ? `roadmap_ai_keys_cache_${currentUserId}` : 'roadmap_ai_keys_cache';
      const savedKeys = JSON.parse(localStorage.getItem(cacheKey) || '{}');
      if (currentEngine.apiKey) {
        savedKeys[currentEngine.providerId] = currentEngine.apiKey;
        localStorage.setItem(cacheKey, JSON.stringify(savedKeys));
      }
    } catch {}

    if (onSave) {
      onSave(settings);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-2 sm:p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-zinc-800 gold-border-hover animate-slideUp flex flex-col max-h-[96vh] sm:max-h-[90vh]">
        {/* Header */}
        <div className="p-3.5 sm:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/10">
              <IconSettings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-zinc-100 tracking-tight">
                双擎 AI 智能路由配置
              </h2>
              <p className="text-[11px] text-zinc-400 font-medium mt-0.5">
                支持区分「课堂伴学导师」与「教材建树引擎」，自动分流省心免切换
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors active:scale-95"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        {/* Dual Engine Tabs */}
        <div className="px-5 pt-4 pb-1 bg-zinc-950/40 border-b border-zinc-800/80">
          <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-900/90 rounded-xl border border-zinc-800">
            <button
              type="button"
              onClick={() => { setActiveSlot('mentor'); setTestResult(null); }}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeSlot === 'mentor'
                  ? 'bg-amber-500 text-zinc-950 font-black shadow-md shadow-amber-500/20'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <span>🎓</span>
              <span>课堂伴学导师 (Gemini / 实时问答)</span>
            </button>
            <button
              type="button"
              onClick={() => { setActiveSlot('build'); setTestResult(null); }}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeSlot === 'build'
                  ? 'bg-amber-500 text-zinc-950 font-black shadow-md shadow-amber-500/20'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              <span>🏗️</span>
              <span>教材建树引擎 (Anubis 反代网关)</span>
            </button>
          </div>

          <div className="text-[11px] text-zinc-400 mt-2 pb-2">
            {activeSlot === 'mentor' ? (
              <span className="text-amber-400/90 font-medium">
                💡 <b>伴学导师职责</b>：专门响应上课划词答疑、卡片实时伴学追问、随堂笔记解析，推荐配置 <b>Google Gemini</b> 或 <b>DeepSeek</b>。
              </span>
            ) : (
              <span className="text-emerald-400/90 font-medium">
                ⚡ <b>建树引擎职责</b>：专门承接大部头教材分章解构、全量知识节点生成与依赖拓扑推演，默认锁定<b>自有反代网关 (0 Token 成本)</b>。
              </span>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Provider Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-zinc-300">
                供应商平台 ({activeSlot === 'mentor' ? '课堂伴学槽位' : '知识库建树槽位'})
              </label>
              {currentPreset?.websiteUrl && (
                <a
                  href={currentPreset.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-amber-400 hover:text-amber-300 font-medium underline flex items-center gap-1"
                >
                  <span>获取官方密钥</span>
                  <span>↗</span>
                </a>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {presets.map((p) => {
                const isSelected = currentEngine.providerId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProviderChange(p.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all active:scale-95 flex items-center gap-2.5 ${
                      isSelected
                        ? 'border-amber-500/80 bg-amber-500/10 text-amber-300 shadow-sm shadow-amber-500/10 ring-1 ring-amber-500/40 font-bold'
                        : 'border-zinc-800/90 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-800/60 text-zinc-300'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-black ${
                      isSelected ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {p.id.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <div className="text-xs truncate">{p.name.split(' ')[0]}</div>
                      <div className="text-[10px] text-zinc-500 truncate">{p.id}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Provider Description */}
          {currentPreset && (
            <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800/80 text-xs text-zinc-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
              <span>{currentPreset.description}</span>
            </div>
          )}

          {/* Base URL */}
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">
              接口服务地址 (Base URL)
            </label>
            <input
              type="text"
              value={currentEngine.baseUrl}
              onChange={(e) => updateCurrentEngine({ baseUrl: e.target.value })}
              placeholder="例如 https://api.deepseek.com/v1"
              className="w-full px-3.5 py-2 text-xs font-mono bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-zinc-100 placeholder-zinc-500"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              遵循 OpenAI 标准协议，系统会自动向 <code className="text-amber-400/90">/chat/completions</code> 发起请求
            </p>
          </div>

          {/* API Key */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-zinc-300">
                大模型访问密钥 (API Key)
              </label>
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="text-[11px] text-zinc-400 hover:text-amber-400 transition-colors"
              >
                {showApiKey ? '隐藏秘钥' : '显示秘钥'}
              </button>
            </div>
            <input
              type={showApiKey ? 'text' : 'password'}
              value={currentEngine.apiKey}
              onChange={(e) => updateCurrentEngine({ apiKey: e.target.value })}
              placeholder={currentPreset?.needApiKey ? 'sk-...' : '本地模型无需填写密钥，留空即可'}
              className="w-full px-3.5 py-2 text-xs font-mono bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-zinc-100 placeholder-zinc-500"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              秘钥仅加密保留于您本地浏览器中，绝不上传任何外部第三方服务器
            </p>
          </div>

          {/* Model Selection */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-300 flex items-center gap-2">
                <span>选用模型 (Model)</span>
                {fetchedModels.length > 0 && (
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                    已拉取 {fetchedModels.length} 个模型
                  </span>
                )}
              </label>
              <button
                type="button"
                onClick={handleFetchModels}
                disabled={isFetchingModels}
                className="text-xs font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 shadow-sm"
                title="向当前厂商接口发送请求，获取可用模型列表"
              >
                {isFetchingModels ? (
                  <>
                    <span className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    <span>正在拉取...</span>
                  </>
                ) : (
                  <>
                    <IconSparkles className="w-3 h-3 text-amber-400" />
                    <span>在线获取模型列表</span>
                  </>
                )}
              </button>
            </div>

            {fetchModelsMsg && (
              <div className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                fetchModelsMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  fetchModelsMsg.type === 'success' ? 'bg-emerald-400' : 'bg-rose-400'
                }`} />
                <span>{fetchModelsMsg.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <input
                  type="text"
                  value={currentEngine.model}
                  onChange={(e) => updateCurrentEngine({ model: e.target.value })}
                  placeholder="例如 deepseek-v4.1-flash, gemini-2.0-flash"
                  className="w-full px-3.5 py-2 text-xs font-mono bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-zinc-100 placeholder-zinc-500"
                />
              </div>

              <div>
                {fetchedModels.length > 0 ? (
                  <select
                    value={fetchedModels.includes(currentEngine.model) ? currentEngine.model : ''}
                    onChange={(e) => e.target.value && updateCurrentEngine({ model: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-amber-500/40 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-amber-300 font-bold"
                  >
                    <option value="">点击选用在线拉取的模型...</option>
                    {fetchedModels.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : currentPreset && currentPreset.models.length > 0 ? (
                  <select
                    value={currentPreset.models.includes(currentEngine.model) ? currentEngine.model : ''}
                    onChange={(e) => e.target.value && updateCurrentEngine({ model: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-zinc-200 font-medium"
                  >
                    <option value="">快速选用内置模型...</option>
                    {currentPreset.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center text-[11px] text-zinc-500 px-3 py-2 bg-zinc-950/50 rounded-xl border border-zinc-800">
                    点击右上角按钮可自动拉取全部可用模型
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* System Prompt Preset (Applied for Mentor) */}
          {activeSlot === 'mentor' && (
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                伴学教学指导风格
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, systemPromptPreset: 'pwn' })}
                  className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all active:scale-95 ${
                    settings.systemPromptPreset === 'pwn'
                      ? 'border-amber-500/80 bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/40'
                      : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  计算机底层与体系
                </button>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, systemPromptPreset: 'fullstack' })}
                  className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all active:scale-95 ${
                    settings.systemPromptPreset === 'fullstack'
                      ? 'border-amber-500/80 bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/40'
                      : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  全栈工程与架构师
                </button>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, systemPromptPreset: 'socratic' })}
                  className={`p-2.5 rounded-xl border text-left text-xs font-bold transition-all active:scale-95 ${
                    settings.systemPromptPreset === 'socratic'
                      ? 'border-amber-500/80 bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/40'
                      : 'border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  苏格拉底式启发
                </button>
              </div>
            </div>
          )}

          {/* Test Result Message */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-medium flex items-start gap-2.5 ${
                testResult.success
                  ? 'bg-amber-950/40 border-amber-600/60 text-amber-300'
                  : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                testResult.success ? 'bg-amber-400' : 'bg-rose-500 animate-ping'
              }`} />
              <div className="flex-1 leading-relaxed">{testResult.message}</div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || !currentEngine.baseUrl}
            className="px-4 py-2 text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-1.5 disabled:opacity-40"
          >
            {testing ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-amber-400 rounded-full animate-spin" />
                <span>正在测试当前槽位...</span>
              </>
            ) : (
              <>
                <IconLightning className="w-3.5 h-3.5 text-amber-400" />
                <span>测试当前引擎连通性</span>
              </>
            )}
          </button>

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
              className="px-5 py-2 text-xs font-black bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-zinc-950 rounded-xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
            >
              保存双擎配置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
