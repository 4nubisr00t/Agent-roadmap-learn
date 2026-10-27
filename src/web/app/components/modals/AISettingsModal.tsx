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

export interface AISettingsState {
  providerId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  systemPromptPreset: string;
  customSystemPrompt: string;
}

const DEFAULT_SETTINGS: AISettingsState = {
  providerId: 'deepseek',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.7,
  systemPromptPreset: 'pwn',
  customSystemPrompt: '',
};

export const SYSTEM_PROMPTS = {
  pwn: '你是一位资深的二进制安全、逆向工程与底层系统安全导师。请遵循苏格拉底式启发教学法，用通俗生动的比喻讲透内存布局、汇编指令与漏洞原理。在给出攻击脚本或答案前，先引导学生思考内存偏移与保护绕过逻辑。',
  fullstack: '你是一位资深全栈架构师与工程专家。擅长系统设计、代码质量重构与核心技术底层原理剖析。回答清晰、结构严谨，给出最佳实践与生产级代码示例。',
  socratic: '你是一位善于启发思考的学习导师。永远不直接把答案塞给学生，而是通过连环追问、类比举例和概念引导，带领学生自主推导出底层真理。',
  custom: '',
};

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (settings: AISettingsState) => void;
}

export const AISettingsModal: React.FC<AISettingsModalProps> = ({ isOpen, onClose, onSave }) => {
  const [presets, setPresets] = useState<AIProviderPreset[]>([]);
  const [settings, setSettings] = useState<AISettingsState>(() => {
    try {
      const saved = localStorage.getItem('roadmap_ai_config');
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {}
    return DEFAULT_SETTINGS;
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; message?: string } | null>(null);

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

  const currentPreset = presets.find(p => p.id === settings.providerId);

  const handleProviderChange = (newProviderId: string) => {
    const preset = presets.find(p => p.id === newProviderId);
    if (preset) {
      const savedKeys = JSON.parse(localStorage.getItem('roadmap_ai_keys_cache') || '{}');
      setSettings(prev => ({
        ...prev,
        providerId: newProviderId,
        baseUrl: preset.baseUrl,
        model: preset.defaultModel,
        apiKey: savedKeys[newProviderId] || prev.apiKey,
      }));
    } else {
      setSettings(prev => ({
        ...prev,
        providerId: newProviderId,
      }));
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
          provider: settings.providerId,
          baseUrl: settings.baseUrl,
          apiKey: settings.apiKey,
          model: settings.model,
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
    localStorage.setItem('roadmap_ai_config', JSON.stringify(settings));

    try {
      const savedKeys = JSON.parse(localStorage.getItem('roadmap_ai_keys_cache') || '{}');
      if (settings.apiKey) {
        savedKeys[settings.providerId] = settings.apiKey;
        localStorage.setItem('roadmap_ai_keys_cache', JSON.stringify(savedKeys));
      }
    } catch {}

    if (onSave) {
      onSave(settings);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-zinc-800 gold-border-hover animate-slideUp flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/10">
              <IconSettings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-zinc-100 tracking-tight">
                AI 导师模型与供应商配置
              </h2>
              <p className="text-[11px] text-zinc-400 font-medium mt-0.5">
                接入工业级大模型 API，驱动卡片实时伴学与教材一键生成技能树
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

        {/* Content Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Provider Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-zinc-300">
                大模型供应商平台
              </label>
              {currentPreset?.websiteUrl && (
                <a
                  href={currentPreset.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-amber-400 hover:text-amber-300 font-medium underline flex items-center gap-1"
                >
                  <span>获取官方 Key</span>
                  <span>↗</span>
                </a>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {presets.map((p) => {
                const isSelected = settings.providerId === p.id;
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
              API Base URL
            </label>
            <input
              type="text"
              value={settings.baseUrl}
              onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
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
                API 授权凭证 (API Key)
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
              value={settings.apiKey}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              placeholder={currentPreset?.needApiKey ? 'sk-...' : '本地模型无需 API Key，留空即可'}
              className="w-full px-3.5 py-2 text-xs font-mono bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-zinc-100 placeholder-zinc-500"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              秘钥仅加密保留于您本地浏览器中，绝不上传任何外部第三方服务器
            </p>
          </div>

          {/* Model Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                模型标识 (Model)
              </label>
              <input
                type="text"
                value={settings.model}
                onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                placeholder="例如 deepseek-chat, gpt-4o"
                className="w-full px-3.5 py-2 text-xs font-mono bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-zinc-100 placeholder-zinc-500"
              />
            </div>

            {currentPreset && currentPreset.models.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                  推荐预设模型
                </label>
                <select
                  value={currentPreset.models.includes(settings.model) ? settings.model : ''}
                  onChange={(e) => e.target.value && setSettings({ ...settings, model: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-zinc-200 font-medium"
                >
                  <option value="">快速选用内置模型...</option>
                  {currentPreset.models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* System Prompt Preset */}
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">
              导师教学人设 (System Persona)
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
                二进制与底层安全
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
            disabled={testing || !settings.baseUrl}
            className="px-4 py-2 text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-1.5 disabled:opacity-40"
          >
            {testing ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-amber-400 rounded-full animate-spin" />
                <span>连通性测速中...</span>
              </>
            ) : (
              <>
                <IconLightning className="w-3.5 h-3.5 text-amber-400" />
                <span>测试连通性</span>
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
              保存配置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
