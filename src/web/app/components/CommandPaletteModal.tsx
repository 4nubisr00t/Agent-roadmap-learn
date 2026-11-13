import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IconBook, IconClose, IconLightning, IconPin, IconSearch, IconSettings, IconSparkles, IconTree } from './Icons.js';

export interface CommandPaletteProjectItem {
  id: string;
  name: string;
  taskCount: number;
}

export interface CommandPaletteTaskItem {
  id: string;
  title: string;
  description?: string;
  status: string;
  projectId: string;
  projectName: string;
}

export interface CommandPaletteAnnotationItem {
  id: string;
  taskId: string;
  taskTitle: string;
  selectedText: string;
  comment: string;
  aiResponse?: string;
}

interface PaletteEntry {
  id: string;
  category: 'action' | 'project' | 'task' | 'annotation';
  title: string;
  subtitle?: string;
  badge?: string;
  onSelect: () => void;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: CommandPaletteProjectItem[];
  tasks: CommandPaletteTaskItem[];
  annotations: CommandPaletteAnnotationItem[];
  onContinueLearning?: () => void;
  onOpenNewRoadmap: () => void;
  onOpenDocs: () => void;
  onOpenAISettings: () => void;
  onOpenAnnotationDigest: () => void;
  onSelectProject: (projectId: string | null) => void;
  onSelectTask: (projectId: string, taskId: string) => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  projects,
  tasks,
  annotations,
  onContinueLearning,
  onOpenNewRoadmap,
  onOpenDocs,
  onOpenAISettings,
  onOpenAnnotationDigest,
  onSelectProject,
  onSelectTask,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isOpen]);

  const entries = useMemo<PaletteEntry[]>(() => {
    const q = query.trim().toLowerCase();
    const list: PaletteEntry[] = [];

    const quickActions: PaletteEntry[] = [];
    if (onContinueLearning) {
      quickActions.push({
        id: 'act_continue',
        category: 'action',
        title: '继续上次学习 / 跳转推荐下一节',
        subtitle: '自动定位当前攻克中或下一待学知识节点',
        badge: '快捷学习',
        onSelect: () => {
          onClose();
          onContinueLearning();
        },
      });
    }
    quickActions.push(
      {
        id: 'act_digest',
        category: 'action',
        title: '打开全书批注精华本',
        subtitle: '集中回顾划词释义与重难点答疑并导出 Markdown 复习卡',
        badge: '复习汇总',
        onSelect: () => {
          onClose();
          onOpenAnnotationDigest();
        },
      },
      {
        id: 'act_new_tree',
        category: 'action',
        title: 'AI 教材拆书 · 新建学习技能树',
        subtitle: '上传 PDF / Markdown 教材自动抽取章节拓扑网',
        badge: 'AI 建树',
        onSelect: () => {
          onClose();
          onOpenNewRoadmap();
        },
      },
      {
        id: 'act_docs',
        category: 'action',
        title: '管理我的教材与电子书资料库',
        subtitle: '上传、预览与管理课程参考资料',
        badge: '资料库',
        onSelect: () => {
          onClose();
          onOpenDocs();
        },
      },
      {
        id: 'act_ai_settings',
        category: 'action',
        title: '双 AI 引擎配置中心',
        subtitle: '切换建树引擎 (DeepSeek) 与伴学引擎 (Gemini 3.8 Flash)',
        badge: '设置',
        onSelect: () => {
          onClose();
          onOpenAISettings();
        },
      }
    );

    for (const act of quickActions) {
      if (!q || act.title.toLowerCase().includes(q) || (act.subtitle && act.subtitle.toLowerCase().includes(q))) {
        list.push(act);
      }
    }

    for (const proj of projects) {
      if (!q || proj.name.toLowerCase().includes(q)) {
        list.push({
          id: `proj_${proj.id}`,
          category: 'project',
          title: proj.name,
          subtitle: `切换至该课程技能树（共 ${proj.taskCount} 个节点）`,
          badge: '课程路线',
          onSelect: () => {
            onSelectProject(proj.id);
            onClose();
          },
        });
      }
    }

    const matchedTasks = tasks
      .filter((t) => {
        if (!q) return true;
        return (
          t.title.toLowerCase().includes(q) ||
          t.projectName.toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q)
        );
      })
      .slice(0, q ? 18 : 6);

    for (const t of matchedTasks) {
      const statusLabel = t.status === 'done' ? '✅ 已掌握' : t.status === 'in-progress' ? '⚡ 攻克中' : '⭕ 待学习';
      list.push({
        id: `task_${t.id}`,
        category: 'task',
        title: t.title,
        subtitle: `${t.projectName} · ${statusLabel}`,
        badge: '知识节点',
        onSelect: () => {
          onClose();
          onSelectTask(t.projectId, t.id);
        },
      });
    }

    if (q) {
      const matchedAnns = annotations
        .filter(
          (a) =>
            a.selectedText.toLowerCase().includes(q) ||
            a.comment.toLowerCase().includes(q) ||
            (a.aiResponse || '').toLowerCase().includes(q)
        )
        .slice(0, 8);

      for (const ann of matchedAnns) {
        const ownerTask = tasks.find((t) => t.id === ann.taskId);
        if (!ownerTask) continue;
        list.push({
          id: `ann_${ann.id}`,
          category: 'annotation',
          title: `“${ann.selectedText.slice(0, 60)}${ann.selectedText.length > 60 ? '...' : ''}”`,
          subtitle: `${ownerTask.projectName} → ${ann.taskTitle} · ${ann.comment}`,
          badge: '划词批注',
          onSelect: () => {
            onClose();
            onSelectTask(ownerTask.projectId, ownerTask.id);
          },
        });
      }
    }

    return list;
  }, [
    query,
    projects,
    tasks,
    annotations,
    onContinueLearning,
    onOpenNewRoadmap,
    onOpenDocs,
    onOpenAISettings,
    onOpenAnnotationDigest,
    onSelectProject,
    onSelectTask,
    onClose,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((idx) => (entries.length > 0 ? (idx + 1) % entries.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((idx) => (entries.length > 0 ? (idx - 1 + entries.length) % entries.length : 0));
    } else if (e.key === 'Enter' && entries[activeIndex]) {
      e.preventDefault();
      entries[activeIndex].onSelect();
    }
  };

  const renderCategoryIcon = (cat: PaletteEntry['category']) => {
    switch (cat) {
      case 'action':
        return <IconLightning className="w-4 h-4 text-amber-400" />;
      case 'project':
        return <IconTree className="w-4 h-4 text-emerald-400" />;
      case 'task':
        return <IconBook className="w-4 h-4 text-sky-400" />;
      case 'annotation':
        return <IconPin className="w-4 h-4 text-purple-400" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/75 backdrop-blur-md flex items-start justify-center pt-[10vh] p-3 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        onKeyDown={handleKeyDown}
        className="w-full max-w-2xl bg-zinc-900 border border-amber-500/35 rounded-2xl shadow-2xl overflow-hidden animate-slideUp"
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-800 bg-zinc-950/80">
          <IconSearch className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索任意课程、知识节点、讲义内容、划词批注，或输入动作..."
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono text-zinc-400 bg-zinc-800 border border-zinc-700 rounded-md">
            ESC
          </kbd>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[58vh] overflow-y-auto p-2 space-y-1">
          {entries.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 space-y-1">
              <IconSparkles className="w-8 h-8 text-zinc-700 mx-auto" />
              <p className="text-xs font-semibold text-zinc-400">未找到匹配的课程或知识点</p>
              <p className="text-[11px] text-zinc-500">试试搜索章节关键词、批注笔记或切换课程名称</p>
            </div>
          ) : (
            entries.map((entry, idx) => {
              const isSelected = idx === activeIndex;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={entry.onSelect}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl flex items-center gap-3 transition-all ${
                    isSelected
                      ? 'bg-amber-500/15 border border-amber-500/40 text-zinc-100'
                      : 'border border-transparent text-zinc-300 hover:bg-zinc-850'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center flex-shrink-0">
                    {renderCategoryIcon(entry.category)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">{entry.title}</div>
                    {entry.subtitle && (
                      <div className="text-[11px] text-zinc-400 truncate mt-0.5">{entry.subtitle}</div>
                    )}
                  </div>
                  {entry.badge && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700/70 flex-shrink-0">
                      {entry.badge}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-3">
            <span>↑↓ 选择</span>
            <span>↵ 直达打开</span>
            <span>ESC 关闭</span>
          </div>
          <span className="flex items-center gap-1 text-amber-400/80">
            <IconSettings className="w-3 h-3" />
            <span>全局知识索引已就绪</span>
          </span>
        </div>
      </div>
    </div>
  );
};
