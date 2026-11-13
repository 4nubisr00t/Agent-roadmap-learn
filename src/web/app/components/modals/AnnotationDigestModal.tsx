import React, { useMemo, useState } from 'react';
import { renderMarkdown } from '../../utils/markdown.js';
import { IconClose, IconPin, IconSearch, IconSparkles, IconTrash, IconUpload } from '../Icons.js';
import { useFeedback } from '../FeedbackProvider.js';

export interface DigestAnnotation {
  id: string;
  taskId: string;
  taskTitle: string;
  selectedText: string;
  comment: string;
  aiResponse?: string;
  aiStatus?: string;
  createdAt: string;
}

export interface DigestTaskMeta {
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
}

interface AnnotationDigestModalProps {
  isOpen: boolean;
  onClose: () => void;
  annotations: DigestAnnotation[];
  taskMetaList: DigestTaskMeta[];
  selectedProjectId: string | null;
  selectedProjectName?: string;
  onJumpToTask: (projectId: string, taskId: string) => void;
  onDeleteAnnotation: (id: string) => Promise<void> | void;
}

export const AnnotationDigestModal: React.FC<AnnotationDigestModalProps> = ({
  isOpen,
  onClose,
  annotations,
  taskMetaList,
  selectedProjectId,
  selectedProjectName,
  onJumpToTask,
  onDeleteAnnotation,
}) => {
  const { toast } = useFeedback();
  const [scope, setScope] = useState<'project' | 'all'>(selectedProjectId ? 'project' : 'all');
  const [search, setSearch] = useState('');

  const taskMetaMap = useMemo(() => {
    const map = new Map<string, DigestTaskMeta>();
    for (const meta of taskMetaList) {
      map.set(meta.taskId, meta);
    }
    return map;
  }, [taskMetaList]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return annotations.filter((ann) => {
      const meta = taskMetaMap.get(ann.taskId);
      if (scope === 'project' && selectedProjectId) {
        if (!meta || meta.projectId !== selectedProjectId) return false;
      }
      if (!q) return true;
      return (
        ann.selectedText.toLowerCase().includes(q) ||
        ann.comment.toLowerCase().includes(q) ||
        ann.taskTitle.toLowerCase().includes(q) ||
        (ann.aiResponse || '').toLowerCase().includes(q)
      );
    });
  }, [annotations, taskMetaMap, scope, selectedProjectId, search]);

  if (!isOpen) return null;

  const handleExportDigest = () => {
    if (filtered.length === 0) {
      toast.info('当前筛选条件下暂无批注可导出');
      return;
    }
    const headerTitle =
      scope === 'project' && selectedProjectName
        ? `《${selectedProjectName}》全书划词批注与核心答疑精华本`
        : '全部课程划词批注与核心答疑精华本';
    const lines = [
      `# ${headerTitle}`,
      '',
      `> 导出时间：${new Date().toLocaleString('zh-CN')} · 共收录 ${filtered.length} 条重点批注`,
      '',
    ];
    filtered.forEach((ann, idx) => {
      const meta = taskMetaMap.get(ann.taskId);
      lines.push(`## ${idx + 1}. ${meta?.projectName ? `[${meta.projectName}] ` : ''}${ann.taskTitle}`);
      lines.push('');
      lines.push(`> **📌 划选原文**`);
      lines.push(`> ${ann.selectedText.replace(/\n/g, '\n> ')}`);
      lines.push('');
      if (ann.comment) {
        lines.push(`- **💬 个人疑问/批注**：${ann.comment}`);
      }
      if (ann.aiResponse) {
        lines.push('');
        lines.push(`### 💎 导师精讲解析`);
        lines.push(ann.aiResponse);
      }
      lines.push('\n---\n');
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scope === 'project' && selectedProjectName ? selectedProjectName : '全部课程'}-批注精华本.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${filtered.length} 条批注至 Markdown 复习讲义！`);
  };

  return (
    <div
      className="fixed inset-0 z-[105] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-4xl h-[92dvh] sm:h-[88dvh] flex flex-col overflow-hidden animate-sheet-mobile pb-safe">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 bg-zinc-950/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-400 flex items-center justify-center">
              <IconPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-zinc-100">划词批注与答疑精华本</h2>
              <p className="text-xs text-zinc-400">跨章节汇聚重点句段与 Gemini 导师深度解析，考前复习一眼直达</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportDigest}
              className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 font-black text-xs rounded-xl hover:brightness-105 transition-all flex items-center gap-1.5 shadow-md shadow-amber-500/20"
            >
              <IconUpload className="w-3.5 h-3.5 rotate-180" />
              <span>导出 Markdown 复习本</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 flex items-center justify-center transition-colors"
            >
              <IconClose className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="px-4 sm:px-5 py-3 border-b border-zinc-800 bg-zinc-950/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
            {selectedProjectId && (
              <button
                type="button"
                onClick={() => setScope('project')}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  scope === 'project' ? 'bg-amber-400 text-zinc-950 font-black' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                当前课程（{selectedProjectName || '本课程'}）
              </button>
            )}
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                scope === 'all' || !selectedProjectId
                  ? 'bg-amber-400 text-zinc-950 font-black'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              全部课程（{annotations.length}）
            </button>
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <IconSearch className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="检索批注原文、疑问或解析关键词..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>
        </div>

        {/* Annotation Feed */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3 bg-zinc-950/30">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-zinc-500 space-y-2">
              <IconSparkles className="w-10 h-10 text-zinc-700 mx-auto" />
              <p className="text-sm font-bold text-zinc-400">暂无符合条件的划词批注记录</p>
              <p className="text-xs text-zinc-500">在任意章节讲义中划选词句点击「⚡ 即刻释义」，所有精华都会自动沉淀于此</p>
            </div>
          ) : (
            filtered.map((ann) => {
              const meta = taskMetaMap.get(ann.taskId);
              return (
                <div
                  key={ann.id}
                  className="p-4 rounded-2xl border border-zinc-800 bg-zinc-900/90 hover:border-amber-500/40 transition-all space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {meta && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {meta.projectName}
                        </span>
                      )}
                      <span className="text-xs font-black text-amber-300">{ann.taskTitle}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-500">{ann.createdAt}</span>
                      {meta && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onJumpToTask(meta.projectId, meta.taskId);
                          }}
                          className="px-2.5 py-1 text-[11px] font-bold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-lg transition-all"
                        >
                          跳转章节 →
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteAnnotation(ann.id)}
                        className="p-1.5 text-zinc-500 hover:text-rose-400 rounded-lg hover:bg-zinc-800 transition-colors"
                        title="删除批注"
                      >
                        <IconTrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-zinc-950 border-l-4 border-amber-400 rounded-r-lg text-xs font-mono text-amber-100/90 leading-relaxed">
                    “{ann.selectedText}”
                  </div>

                  {ann.comment && (
                    <div className="text-xs font-semibold text-zinc-300 bg-zinc-950/60 px-3 py-2 rounded-xl border border-zinc-800/80">
                      💬 {ann.comment}
                    </div>
                  )}

                  {ann.aiResponse && (
                    <div
                      className="courseware-content text-xs text-zinc-300 p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(ann.aiResponse) }}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
