import React, { useState, useEffect } from 'react';
import { AISettingsState } from './AISettingsModal.js';
import { UserDocumentSummary } from './DocumentManagerModal.js';
import { IconSparkles, IconClose, IconBook, IconLightning, IconCheck } from '../Icons.js';

interface AIRoadmapGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  preSelectedDocId?: string;
  preSelectedDocTitle?: string;
  onSuccess: (projectData: any) => void;
  onBuildingProgress?: (step: string, percent: number, topicName: string) => void;
  onBuildingComplete?: (projectData: any, topicName: string) => void;
  onBuildingError?: (error: string) => void;
}

export const AIRoadmapGeneratorModal: React.FC<AIRoadmapGeneratorModalProps> = ({
  isOpen,
  onClose,
  preSelectedDocId,
  preSelectedDocTitle,
  onSuccess,
  onBuildingProgress,
  onBuildingComplete,
  onBuildingError,
}) => {
  const [documents, setDocuments] = useState<UserDocumentSummary[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [topicName, setTopicName] = useState('');
  const [targetLevel, setTargetLevel] = useState('零基础至实操精通');
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [generationStep, setGenerationStep] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [error, setError] = useState('');

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

    let aiConfig: AISettingsState | null = null;
    try {
      const saved = localStorage.getItem('roadmap_ai_config');
      if (saved) aiConfig = JSON.parse(saved);
    } catch {}

    setLoading(true);
    setProgressPercent(5);
    setGenerationStep('连接深度沙箱与解析引擎...');

    try {
      const res = await fetch('/api/ai/generate-roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stream: true,
          documentIds: selectedDocIds,
          rawMaterialText: rawText.trim(),
          topicName: topicName.trim(),
          targetLevel,
          provider: aiConfig?.buildEngine?.providerId || aiConfig?.providerId,
          baseUrl: aiConfig?.buildEngine?.baseUrl || aiConfig?.baseUrl,
          apiKey: aiConfig?.buildEngine?.apiKey || aiConfig?.apiKey,
          model: aiConfig?.buildEngine?.model || aiConfig?.model,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `请求失败 (${res.status})`);
      }

      if (!res.body) {
        throw new Error('未接收到服务端流式数据');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let projectData: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          const trimmed = block.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;
          try {
            const payload = JSON.parse(jsonStr);
            if (payload.type === 'progress') {
              setGenerationStep(payload.message || '正在处理...');
              if (typeof payload.percent === 'number') {
                setProgressPercent(payload.percent);
                onBuildingProgress?.(payload.message, payload.percent, topicName);
              }
            } else if (payload.type === 'done') {
              projectData = payload.data;
              setProgressPercent(100);
              setGenerationStep('专属知识图谱构建成功，正在载入！');
              onBuildingComplete?.(projectData, topicName);
            } else if (payload.type === 'error') {
              onBuildingError?.(payload.error || '生成失败');
              throw new Error(payload.error || '生成失败');
            }
          } catch (parseErr: any) {
            if (parseErr.message && !parseErr.message.includes('Unexpected token')) {
              throw parseErr;
            }
          }
        }
      }

      if (!projectData) {
        throw new Error('未接收到生成的项目数据');
      }

      setTimeout(() => {
        onSuccess(projectData);
        onClose();
      }, 600);
    } catch (err: any) {
      setError(err.message || '生成过程发生异常');
      onBuildingError?.(err.message || '生成过程发生异常');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div className="bg-zinc-900 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-zinc-800 gold-border-hover animate-sheet-mobile flex flex-col max-h-[92dvh] pb-safe">
        {/* Header */}
        <div className="p-3.5 sm:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/10">
              <IconSparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-zinc-100 tracking-tight">
                AI 研读资料构建知识图谱
              </h2>
              <p className="text-[11px] text-zinc-400 font-medium mt-0.5">
                投喂教材或参考大纲，由 AI 导师分析提取技能关卡与前后依赖图谱
              </p>
            </div>
          </div>
          {!loading && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors active:scale-95"
            >
              <IconClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content Form */}
        <form onSubmit={handleGenerate} className="p-3.5 sm:p-6 space-y-3.5 sm:space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs font-semibold flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Loading Animation Box with Real-time Progress Bar */}
          {loading && (
            <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-center space-y-3 animate-fadeIn">
              <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="text-xs font-black text-amber-300">{generationStep}</div>
              <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden border border-zinc-700/50">
                <div
                  className="bg-gradient-to-r from-amber-500 to-amber-300 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="text-[11px] text-zinc-400 flex justify-between px-1 font-mono">
                <span>AI 沙箱深度解构建树中...</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 rounded-xl bg-zinc-850 hover:bg-zinc-800 border border-amber-500/30 text-amber-300 text-xs font-bold transition-all shadow-sm active:scale-95"
                >
                  转入后台继续构建 (可自由浏览其他模块)
                </button>
              </div>
            </div>
          )}

          {/* Topic Name */}
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">
              技能树名称 / 学习主题
            </label>
            <input
              type="text"
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              placeholder="例如：《逆向工程核心大纲与实战》、《现代全栈架构》..."
              disabled={loading}
              className="w-full px-3.5 py-2.5 text-xs bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 font-bold text-zinc-100 placeholder-zinc-500 disabled:opacity-50"
            />
          </div>

          {/* Target Level */}
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">
              预设受众与学习目标
            </label>
            <select
              value={targetLevel}
              onChange={(e) => setTargetLevel(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 text-zinc-200 font-medium disabled:opacity-50"
            >
              <option value="零基础至实操精通">零基础小白到实战精通 (梯度平缓、细致递进)</option>
              <option value="进阶突破与核心实战">进阶突破与核心实战 (直击重点、高强度强化)</option>
              <option value="极速通关与知识梳理">极速通关与知识梳理 (大纲速成、重点精讲)</option>
            </select>
          </div>

          {/* Material Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-zinc-300">
                选择投喂的教材资料
              </label>
              <span className="text-[11px] text-amber-400 font-mono">已选中 {selectedDocIds.length} 份</span>
            </div>

            {documents.length === 0 ? (
              <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800 text-xs text-zinc-500 text-center">
                资料库暂无文档，可先在资料库上传 PDF/MD，或直接在下方文本框录入章节大纲
              </div>
            ) : (
              <div className="max-h-36 overflow-y-auto space-y-1.5 border border-zinc-800 rounded-xl p-2 bg-zinc-950/60">
                {documents.map((doc) => {
                  const isChecked = selectedDocIds.includes(doc.id);
                  return (
                    <label
                      key={doc.id}
                      className={`p-2.5 rounded-lg border flex items-center justify-between cursor-pointer transition-all active:scale-[0.99] ${
                        isChecked
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-bold'
                          : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate text-xs">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectDoc(doc.id)}
                          disabled={loading}
                          className="rounded text-amber-500 focus:ring-amber-500"
                        />
                        <span className="truncate">{doc.title}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 flex-shrink-0 font-mono">
                        约 {doc.textLength} 字
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Raw Text Outline */}
          <div>
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">
              补充说明 / 自定义章节大纲 (可选)
            </label>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="可粘贴特定章节的大纲、特殊关注的薄弱环节或学习定制要求..."
              rows={3}
              disabled={loading}
              className="w-full px-3 py-2 text-xs bg-zinc-950 border border-zinc-700/80 rounded-xl focus:outline-none focus:border-amber-500 text-zinc-100 placeholder-zinc-500 resize-none font-mono disabled:opacity-50"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !topicName.trim()}
              className="w-full py-3 bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-zinc-950 font-black text-xs rounded-xl shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  <span>正在全力构建专属技能树...</span>
                </>
              ) : (
                <>
                  <IconSparkles className="w-4 h-4 text-zinc-950" />
                  <span>立即调用 AI 提炼并生成技能树</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
