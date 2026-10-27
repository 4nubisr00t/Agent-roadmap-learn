import React, { useState, useEffect } from 'react';

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

  // Fetch presets from backend on open
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
      // Look up saved key for this provider if any
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
          message: `连接成功！响应延迟 ${data.latencyMs}ms (模型回复: "${data.reply}")`,
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

    // Cache key for this provider
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
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-100 animate-slideUp flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold text-base border border-indigo-500/20">
              🤖
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800">
                AI 导师模型与供应商配置
              </h2>
              <p className="text-[11px] text-slate-500 font-medium">
                配置大模型 API 后即可在任何卡片与课程中进行实时智能问答
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Provider Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
              <span>选择大模型供应商 / 平台 *</span>
              {currentPreset?.websiteUrl && (
                <a
                  href={currentPreset.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 underline flex items-center gap-0.5"
                >
                  前往官网获取 API Key ↗
                </a>
              )}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {presets.map((p) => {
                const isSelected = settings.providerId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProviderChange(p.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2 ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-500/20 font-bold text-indigo-950'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="text-lg">{p.icon}</span>
                    <div className="truncate">
                      <div className="text-xs truncate">{p.name.split(' ')[0]}</div>
                      <div className="text-[10px] text-slate-400 truncate">{p.id}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Provider Description Banner */}
          {currentPreset && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-xs text-slate-600 flex items-center gap-2">
              <span>💡</span>
              <span>{currentPreset.description}</span>
            </div>
          )}

          {/* Base URL */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              API Base URL *
            </label>
            <input
              type="text"
              value={settings.baseUrl}
              onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
              placeholder="例如 https://api.deepseek.com/v1"
              className="w-full px-3.5 py-2 text-xs font-mono border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              遵循 OpenAI 标准接口规范，会自动请求 <code className="text-slate-600">/chat/completions</code>
            </p>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span>API Key {currentPreset?.needApiKey ? '*' : '(本地模型可选)'}</span>
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="text-[11px] text-slate-500 hover:text-slate-800"
              >
                {showApiKey ? '隐藏 Key 🔒' : '显示 Key 👁️'}
              </button>
            </label>
            <input
              type={showApiKey ? 'text' : 'password'}
              value={settings.apiKey}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              placeholder={currentPreset?.needApiKey ? 'sk-...' : '本地模型无需 API Key，留空即可'}
              className="w-full px-3.5 py-2 text-xs font-mono border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              🔒 秘钥仅保存在您本地浏览器中，通过本地后端直连中转，绝不上传第三方数据库
            </p>
          </div>

          {/* Model Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                模型名称 (Model) *
              </label>
              <input
                type="text"
                value={settings.model}
                onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                placeholder="例如 deepseek-chat, gpt-4o"
                className="w-full px-3.5 py-2 text-xs font-mono border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Quick Model Selector */}
            {currentPreset && currentPreset.models.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  推荐预设模型
                </label>
                <select
                  value={currentPreset.models.includes(settings.model) ? settings.model : ''}
                  onChange={(e) => e.target.value && setSettings({ ...settings, model: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-medium"
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
            <label className="block text-xs font-bold text-slate-700 mb-1">
              导师人设与角色定位 (System Prompt)
            </label>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <button
                type="button"
                onClick={() => setSettings({ ...settings, systemPromptPreset: 'pwn' })}
                className={`p-2 rounded-xl border text-left text-xs font-bold transition-all ${
                  settings.systemPromptPreset === 'pwn'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                🛡️ 二进制与安全导师
              </button>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, systemPromptPreset: 'fullstack' })}
                className={`p-2 rounded-xl border text-left text-xs font-bold transition-all ${
                  settings.systemPromptPreset === 'fullstack'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                💻 全栈与架构导师
              </button>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, systemPromptPreset: 'socratic' })}
                className={`p-2 rounded-xl border text-left text-xs font-bold transition-all ${
                  settings.systemPromptPreset === 'socratic'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                💡 苏格拉底启发式
              </button>
            </div>
          </div>

          {/* Test Result Message */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs font-medium flex items-start gap-2 ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <span>{testResult.success ? '✅' : '❌'}</span>
              <div className="flex-1 leading-relaxed">{testResult.message}</div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing || !settings.baseUrl}
            className="px-4 py-2 text-xs font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
          >
            {testing ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-slate-700 rounded-full animate-spin" />
                <span>正在测速...</span>
              </>
            ) : (
              <>
                <span>⚡</span>
                <span>测试连通性</span>
              </>
            )}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 text-xs font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl shadow-md shadow-indigo-500/20 active:scale-95 transition-all"
            >
              保存配置
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
