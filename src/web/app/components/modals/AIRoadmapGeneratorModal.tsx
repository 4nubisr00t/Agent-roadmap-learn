import React, { useState, useEffect } from 'react';
import { AISettingsState } from './AISettingsModal.js';
import { UserDocumentSummary } from './DocumentManagerModal.js';

interface AIRoadmapGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  preSelectedDocId?: string;
  preSelectedDocTitle?: string;
  onSuccess: (projectData: any) => void;
}

export const AIRoadmapGeneratorModal: React.FC<AIRoadmapGeneratorModalProps> = ({
  isOpen,
  onClose,
  preSelectedDocId,
  preSelectedDocTitle,
  onSuccess,
}) => {
  const [documents, setDocuments] = useState<UserDocumentSummary[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [topicName, setTopicName] = useState('');
  const [targetLevel, setTargetLevel] = useState('零基础至实操精通');
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [generationStep, setGenerationStep] = useState('');
  const [error, setError] = useState('');

  // Load user documents
  useEffect(() => {
    if (isOpen) {
      setError('');
      setLoading(false);
      setGenerationStep('');
      if (preSelectedDocTitle) {
        setTopicName(preSelectedDocTitle);
      }
      if (preSelectedDocId) {
        setSelectedDocIds([preSelectedDocId]);
      }

      fetch('/api/documents')
        .then(res => res.json())
        .then(data => {
          if (data.data) {
            setDocuments(data.data);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, preSelectedDocId, preSelectedDocTitle]);

  if (!isOpen) return null;

  const toggleSelectDoc = (id: string) => {
    setSelectedDocIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!topicName.trim()) {
      setError('请输入技能树名称');
      return;
    }

    if (selectedDocIds.length === 0 && !rawText.trim()) {
      setError('请至少勾选一份教材资料或在下方粘贴参考大纲');
      return;
    }

    // Read AI config
    let aiConfig: AISettingsState | null = null;
    try {
      const saved = localStorage.getItem('roadmap_ai_config');
      if (saved) aiConfig = JSON.parse(saved);
    } catch {}

    setLoading(true);
    setGenerationStep('📖 正在载入教材与提取关键知识点...');

    try {
      setTimeout(() => {
        setGenerationStep('🧠 AI 正在研读资料并规划阶段里程碑与攻坚节点...');
      }, 1500);

      setTimeout(() => {
        setGenerationStep('🕸️ 正在计算认知负荷与构建前置依赖拓扑图谱...');
      }, 4000);

      const res = await fetch('/api/ai/generate-roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentIds: selectedDocIds,
          rawMaterialText: rawText.trim(),
          topicName: topicName.trim(),
          targetLevel,
          provider: aiConfig?.providerId,
          baseUrl: aiConfig?.baseUrl,
          apiKey: aiConfig?.apiKey,
          model: aiConfig?.model,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '生成失败，请检查网络或 AI 导师配置');
      }

      setGenerationStep('✨ 专属技能树构建完成，正在为您加载！');
      setTimeout(() => {
        onSuccess(data.data);
        onClose();
      }, 800);
    } catch (err: any) {
      setError(err.message || '生成过程发生异常');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-100 animate-slideUp flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-bold text-base shadow-sm">
              ✨
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">
                AI 基于教材资料一键建树
              </h2>
              <p className="text-[11px] text-slate-600 font-medium">
                输入教材或勾选个人资料，AI 导师自动提炼阶段里程碑与依赖关系图谱
              </p>
            </div>
          </div>
          {!loading && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white text-slate-400 hover:text-slate-700 flex items-center justify-center font-bold shadow-sm"
            >
              ✕
            </button>
          )}
        </div>

        {/* Content Form */}
        <form onSubmit={handleGenerate} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Loading Animation Box */}
          {loading && (
            <div className="p-5 rounded-2xl bg-indigo-50/70 border border-indigo-200 text-center space-y-3 animate-pulse">
              <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="text-xs font-black text-indigo-950">{generationStep}</div>
              <div className="text-[11px] text-slate-500">
                模型正在深度研读教材文本，通常需 10~25 秒完成结构推理...
              </div>
            </div>
          )}

          {/* Topic Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              技能树名称 / 学习主题 *
            </label>
            <input
              type="text"
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              placeholder="例如：《逆向工程核心大纲与实战》、《妈妈的私房面点研习》..."
              disabled={loading}
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-800 disabled:opacity-50"
            />
          </div>

          {/* Target Audience / Difficulty */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              预设受众与学习目标
            </label>
            <select
              value={targetLevel}
              onChange={(e) => setTargetLevel(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium disabled:opacity-50"
            >
              <option value="零基础至实操精通">🌱 零基础小白到实战精通 (梯度平缓、保姆级步骤)</option>
              <option value="进阶突破与核心实战">⚡ 进阶突破与核心实战 (直击重点、高强度突破)</option>
              <option value="极速通关与知识梳理">🚀 极速通关与知识梳理 (大纲速成、要点总结)</option>
            </select>
          </div>

          {/* Material Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
              <span>选择已上传的教材资料（勾选投喂）</span>
              <span className="text-[11px] text-emerald-600 font-medium">已选中 {selectedDocIds.length} 份</span>
            </label>

            {documents.length === 0 ? (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-400 text-center">
                资料库暂无文档，你可以直接在下方粘贴教材文本，或先在资料库上传 PDF/MD
              </div>
            ) : (
              <div className="max-h-36 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                {documents.map((doc) => {
                  const isChecked = selectedDocIds.includes(doc.id);
                  return (
                    <label
                      key={doc.id}
                      className={`p-2 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate text-xs">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectDoc(doc.id)}
                          disabled={loading}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="truncate">{doc.title}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 flex-shrink-0">
                        约 {doc.textLength} 字
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Raw Text / Supplemental Outline */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              补充说明 / 粘贴自定义章节目录 (可选)
            </label>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="可粘贴特定章节的大纲、补充重点要求或特殊的学习规划..."
              rows={3}
              disabled={loading}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-mono disabled:opacity-50"
            />
          </div>

          {/* Footer Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !topicName.trim()}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>正在全力构建专属技能树...</span>
                </>
              ) : (
                <span>🚀 立即调用 AI 提炼并生成技能树</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
