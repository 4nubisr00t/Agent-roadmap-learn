import React, { useEffect, useMemo, useState } from 'react';
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconLightning,
  IconPlus,
  IconSparkles,
  IconTree,
} from './Icons.js';

export interface HorizonTaskItem {
  id: string;
  title: string;
  status: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  description?: string;
  tags: string[];
}

export interface HorizonEdge {
  id: string;
  fromTaskId: string;
  toTaskId: string;
}

export interface HorizonTagItem {
  id: string;
  name: string;
  color: string;
}

interface BranchHorizonViewProps {
  graphName?: string;
  tasks: HorizonTaskItem[];
  nodeTaskIds: string[];
  edges: HorizonEdge[];
  tagMap: Record<string, HorizonTagItem>;
  focusTaskId: string | null;
  onFocusTaskChange: (taskId: string) => void;
  onOpenCockpit: (taskId: string) => void;
  onStatusChange: (taskId: string, status: 'todo' | 'in-progress' | 'review' | 'done') => Promise<boolean>;
  onOpenSolarMap: () => void;
  onOpenAddNode: (predecessorId?: string | null) => void;
}

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  critical: { label: '核心必考', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/40' },
  high: { label: '深度推荐', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40' },
  medium: { label: '标准主干', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/40' },
  low: { label: '拓展选修', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
};

function extractBriefExcerpt(desc?: string): string {
  if (!desc || !desc.trim()) {
    return '尚未生成导师深度讲义。进入驾驶舱点击「Gemini 精讲点亮」，即可基于教材原著实时撰写。';
  }
  const clean = desc
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/^>\s*\[!.*?\]\s*/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/[*_`~[\]]/g, '')
    .replace(/\$\$[\s\S]*?\$\$/g, '[公式]')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) {
    return '已包含结构化讲义与代码块，点击下方按钮进入沉浸式双屏研读。';
  }
  return clean.length > 150 ? `${clean.slice(0, 150)}...` : clean;
}

export const BranchHorizonView: React.FC<BranchHorizonViewProps> = ({
  graphName,
  tasks,
  nodeTaskIds,
  edges,
  tagMap,
  focusTaskId,
  onFocusTaskChange,
  onOpenCockpit,
  onStatusChange,
  onOpenSolarMap,
  onOpenAddNode,
}) => {
  const [transitionDir, setTransitionDir] = useState<'forward' | 'backward' | 'warp'>('forward');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [historyStack, setHistoryStack] = useState<string[]>([]);

  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const activeNodeTasks = useMemo(
    () => nodeTaskIds.map((id) => taskMap.get(id)).filter((t): t is HorizonTaskItem => Boolean(t)),
    [nodeTaskIds, taskMap]
  );

  const nodeIdSet = useMemo(() => new Set(activeNodeTasks.map((t) => t.id)), [activeNodeTasks]);

  const { incomingMap, outgoingMap } = useMemo(() => {
    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();
    for (const edge of edges) {
      if (!nodeIdSet.has(edge.fromTaskId) || !nodeIdSet.has(edge.toTaskId)) continue;
      const inList = incoming.get(edge.toTaskId) || [];
      if (!inList.includes(edge.fromTaskId)) inList.push(edge.fromTaskId);
      incoming.set(edge.toTaskId, inList);

      const outList = outgoing.get(edge.fromTaskId) || [];
      if (!outList.includes(edge.toTaskId)) outList.push(edge.fromTaskId === edge.toTaskId ? '' : edge.toTaskId);
      outgoing.set(edge.fromTaskId, outList.filter(Boolean));
    }
    return { incomingMap: incoming, outgoingMap: outgoing };
  }, [edges, nodeIdSet]);

  const isTaskReady = (id: string) => {
    const preds = incomingMap.get(id) || [];
    return preds.every((pid) => taskMap.get(pid)?.status === 'done');
  };

  // Pick smart default frontier node when focusTaskId is invalid
  const resolvedFocusId = useMemo(() => {
    if (focusTaskId && nodeIdSet.has(focusTaskId)) return focusTaskId;
    const inProgress = activeNodeTasks.find((t) => t.status === 'in-progress');
    if (inProgress) return inProgress.id;
    const readyTodo = activeNodeTasks.find((t) => t.status !== 'done' && isTaskReady(t.id));
    if (readyTodo) return readyTodo.id;
    const firstUndone = activeNodeTasks.find((t) => t.status !== 'done');
    if (firstUndone) return firstUndone.id;
    return activeNodeTasks[0]?.id ?? null;
  }, [focusTaskId, nodeIdSet, activeNodeTasks, incomingMap, taskMap]);

  useEffect(() => {
    if (resolvedFocusId && resolvedFocusId !== focusTaskId) {
      onFocusTaskChange(resolvedFocusId);
    }
  }, [resolvedFocusId, focusTaskId, onFocusTaskChange]);

  const focusTask = resolvedFocusId ? taskMap.get(resolvedFocusId) ?? null : null;

  const upstreamTasks = useMemo(() => {
    if (!focusTask) return [];
    return (incomingMap.get(focusTask.id) || [])
      .map((id) => taskMap.get(id))
      .filter((t): t is HorizonTaskItem => Boolean(t));
  }, [focusTask, incomingMap, taskMap]);

  const downstreamTasks = useMemo(() => {
    if (!focusTask) return [];
    return (outgoingMap.get(focusTask.id) || [])
      .map((id) => taskMap.get(id))
      .filter((t): t is HorizonTaskItem => Boolean(t));
  }, [focusTask, outgoingMap, taskMap]);

  // Sibling branches sharing at least one prerequisite (or other root nodes)
  const siblingTasks = useMemo(() => {
    if (!focusTask) return [];
    if (upstreamTasks.length === 0) {
      return activeNodeTasks.filter((t) => t.id !== focusTask.id && (incomingMap.get(t.id) || []).length === 0);
    }
    const siblingSet = new Set<string>();
    for (const up of upstreamTasks) {
      for (const childId of outgoingMap.get(up.id) || []) {
        if (childId !== focusTask.id) siblingSet.add(childId);
      }
    }
    return Array.from(siblingSet)
      .map((id) => taskMap.get(id))
      .filter((t): t is HorizonTaskItem => Boolean(t));
  }, [focusTask, upstreamTasks, activeNodeTasks, incomingMap, outgoingMap, taskMap]);

  const stats = useMemo(() => {
    const total = activeNodeTasks.length;
    const done = activeNodeTasks.filter((t) => t.status === 'done').length;
    const unlocked = activeNodeTasks.filter((t) => t.status !== 'done' && isTaskReady(t.id)).length;
    return { total, done, unlocked, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [activeNodeTasks, incomingMap, taskMap]);

  const stepToNode = (targetId: string, dir: 'forward' | 'backward' | 'warp') => {
    if (resolvedFocusId && resolvedFocusId !== targetId && dir !== 'backward') {
      setHistoryStack((prev) => [...prev.slice(-11), resolvedFocusId]);
    }
    setTransitionDir(dir);
    onFocusTaskChange(targetId);
  };

  const handleGoBackHistory = () => {
    if (historyStack.length > 0) {
      const prevId = historyStack[historyStack.length - 1];
      setHistoryStack((prev) => prev.slice(0, -1));
      setTransitionDir('backward');
      onFocusTaskChange(prevId);
    } else if (upstreamTasks.length > 0) {
      setTransitionDir('backward');
      onFocusTaskChange(upstreamTasks[0].id);
    }
  };

  const handleToggleMastered = async (task: HorizonTaskItem) => {
    const nextStatus = task.status === 'done' ? 'in-progress' : 'done';
    setUpdatingId(task.id);
    try {
      await onStatusChange(task.id, nextStatus);
    } finally {
      setUpdatingId(null);
    }
  };

  if (activeNodeTasks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4 pb-24 md:pb-8">
        <div className="max-w-md w-full leather-card rounded-3xl p-6 sm:p-8 text-center animate-slideUp">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-500/15 border border-amber-500/35 text-amber-300 flex items-center justify-center">
            <IconTree className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-black text-zinc-100 mb-1.5">该星图尚无知识星体</h3>
          <p className="text-xs text-zinc-400 leading-relaxed mb-5">
            挂载首批知识模块后，即可启用分岔探索与《星际拓荒》太阳系星图总览。
          </p>
          <button
            type="button"
            onClick={() => onOpenAddNode(null)}
            className="btn-shimmer-gold px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 font-black text-xs shadow-lg shadow-amber-500/25 active:scale-95 inline-flex items-center gap-1.5"
          >
            <IconPlus className="w-4 h-4" />
            <span>添加首批知识节点</span>
          </button>
        </div>
      </div>
    );
  }

  if (!focusTask) return null;

  const focusReady = isTaskReady(focusTask.id);
  const focusDone = focusTask.status === 'done';
  const focusBlockedBy = upstreamTasks.filter((t) => t.status !== 'done');
  const priorityInfo = PRIORITY_META[focusTask.priority] || PRIORITY_META.medium;

  const animClass =
    transitionDir === 'backward'
      ? 'animate-fadeIn'
      : 'animate-slideUp';

  return (
    <div className="h-full flex flex-col overflow-y-auto px-3 sm:px-6 pt-14 sm:pt-16 pb-24 md:pb-8 relative">
      {/* Horizon Telemetry Top Ribbon */}
      <div className="max-w-5xl w-full mx-auto flex flex-wrap items-center justify-between gap-2.5 mb-5">
        <div className="flex items-center gap-2 min-w-0">
          {(historyStack.length > 0 || upstreamTasks.length > 0) && (
            <button
              type="button"
              onClick={handleGoBackHistory}
              className="px-2.5 py-1.5 rounded-xl bg-zinc-900/90 border border-zinc-800 hover:border-amber-500/40 text-zinc-300 hover:text-amber-300 text-xs font-bold flex items-center gap-1 active:scale-95 transition-all"
            >
              <IconChevronLeft className="w-3.5 h-3.5" />
              <span>回溯上游</span>
            </button>
          )}
          <div className="px-3 py-1.5 rounded-xl bg-zinc-950/80 border border-zinc-800/90 text-[11px] font-mono text-zinc-400 flex items-center gap-2 truncate">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
            <span className="truncate text-zinc-300 font-semibold">{graphName || '局部探索视野'}</span>
            <span className="text-zinc-600">·</span>
            <span className="text-amber-300 font-bold">{stats.done}/{stats.total} 已点亮 ({stats.pct}%)</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenSolarMap}
          className="btn-shimmer-gold px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 via-amber-400/15 to-sky-500/20 hover:from-amber-500/30 hover:to-sky-500/30 border border-amber-400/45 text-amber-200 text-xs font-black flex items-center gap-2 shadow-lg shadow-amber-500/10 active:scale-95 transition-all"
        >
          <span className="text-sm">🌌</span>
          <span>进入星图总览</span>
          <span className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-950/70 text-amber-300 border border-amber-500/30">
            {stats.total} 星体
          </span>
        </button>
      </div>

      {/* Main Focused Stage (Keyed by resolvedFocusId for crisp slide entrance!) */}
      <div key={resolvedFocusId} className={`max-w-5xl w-full mx-auto flex-1 flex flex-col items-center justify-start ${animClass}`}>
        {/* ZONE 1: Upstream Prerequisites */}
        <div className="w-full flex flex-col items-center mb-3">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-2">
            前置基石节点 ({upstreamTasks.length})
          </div>
          {upstreamTasks.length === 0 ? (
            <div className="px-3.5 py-1.5 rounded-full bg-zinc-900/70 border border-zinc-800 text-[11px] font-semibold text-zinc-400">
              ✨ 起始基石节点 · 零前置门槛
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {upstreamTasks.map((up) => {
                const upDone = up.status === 'done';
                return (
                  <button
                    key={up.id}
                    type="button"
                    onClick={() => stepToNode(up.id, 'backward')}
                    className={`group px-3.5 py-1.5 rounded-full border text-xs font-bold flex items-center gap-2 transition-all active:scale-95 ${
                      upDone
                        ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/20'
                        : 'bg-zinc-900/90 border-amber-500/35 text-amber-200 hover:border-amber-400'
                    }`}
                  >
                    <span>{upDone ? '✅' : '⏳'}</span>
                    <span className="max-w-[200px] truncate">{up.title}</span>
                    <span className="text-[10px] opacity-60 group-hover:opacity-100">↩</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Animated Energy Conduit Downward */}
          <div className="relative h-8 w-px my-1 bg-gradient-to-b from-amber-500/20 via-amber-400/70 to-amber-400">
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.9)] animate-ping" />
          </div>
        </div>

        {/* ZONE 2: Current Focus Centerpiece Card */}
        <div
          className={`w-full max-w-2xl rounded-3xl p-5 sm:p-7 relative overflow-hidden transition-all duration-300 ${
            focusDone
              ? 'leather-card border-amber-400/60 shadow-[0_0_50px_-12px_rgba(245,158,11,0.35)]'
              : focusReady
                ? 'leather-card border-amber-500/50 shadow-[0_0_55px_-12px_rgba(245,158,11,0.28)]'
                : 'leather-card border-zinc-700/80'
          }`}
        >
          {/* Ambient radial rim glow inside centerpiece */}
          <div
            className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full opacity-25 blur-3xl"
            style={{
              background: focusDone
                ? 'radial-gradient(circle, #fbbf24, transparent 70%)'
                : focusReady
                  ? 'radial-gradient(circle, #38bdf8, transparent 70%)'
                  : 'radial-gradient(circle, #6366f1, transparent 70%)',
            }}
          />

          <div className="relative z-10">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-black border ${
                    focusDone
                      ? 'bg-amber-400 text-zinc-950 border-amber-300'
                      : focusReady
                        ? 'bg-sky-500/15 text-sky-300 border-sky-400/40'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                  }`}
                >
                  {focusDone ? '🌟 已掌握点亮' : focusReady ? '🚀 当前焦点 · 已解锁可攻克' : `🔒 待前置 (${focusBlockedBy.length})`}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${priorityInfo.cls}`}>
                  {priorityInfo.label}
                </span>
              </div>

              <button
                type="button"
                disabled={updatingId === focusTask.id}
                onClick={() => void handleToggleMastered(focusTask)}
                className={`px-3 py-1 rounded-xl text-xs font-black border transition-all active:scale-95 flex items-center gap-1.5 ${
                  focusDone
                    ? 'bg-amber-400/15 text-amber-300 border-amber-400/40 hover:bg-amber-400/25'
                    : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-amber-400/50 hover:text-amber-300'
                }`}
              >
                <IconCheck className="w-3.5 h-3.5" />
                <span>{updatingId === focusTask.id ? '同步中...' : focusDone ? '已点亮 ✓' : '标记已掌握'}</span>
              </button>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-zinc-100 tracking-tight leading-snug mb-2.5">
              {focusTask.title}
            </h2>

            {focusBlockedBy.length > 0 && (
              <div className="mb-3 px-3 py-2 rounded-xl bg-amber-950/35 border border-amber-500/30 text-[11px] text-amber-200 font-medium">
                提示：建议先完成前置节点「{focusBlockedBy.map((b) => b.title).join('、')}」，再推进本节内容会更丝滑。
              </div>
            )}

            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed mb-4">
              {extractBriefExcerpt(focusTask.description)}
            </p>

            {focusTask.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                {focusTask.tags.map((tid) => {
                  const tag = tagMap[tid];
                  if (!tag) return null;
                  return (
                    <span
                      key={tid}
                      className="px-2 py-0.5 rounded-lg text-[10px] font-bold border border-zinc-800 bg-zinc-950/80 text-zinc-300"
                      style={{ borderColor: `${tag.color}55`, color: tag.color }}
                    >
                      #{tag.name}
                    </span>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => onOpenCockpit(focusTask.id)}
                className="btn-shimmer-gold flex-1 sm:flex-none px-5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 text-zinc-950 font-black text-xs sm:text-sm shadow-xl shadow-amber-500/25 hover:brightness-105 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <IconSparkles className="w-4 h-4" />
                <span>进入讲义精讲与划词批注</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenAddNode(focusTask.id)}
                className="px-3.5 py-2.5 rounded-2xl bg-zinc-950/90 hover:bg-zinc-850 border border-zinc-800 hover:border-amber-500/40 text-zinc-300 hover:text-amber-300 font-bold text-xs active:scale-95 transition-all flex items-center gap-1.5"
                title="在此节点后新建或挂载下一跳分支"
              >
                <IconPlus className="w-3.5 h-3.5 text-amber-400" />
                <span>拓展后继分支</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sibling Quick Jump Bar (if parallel forks exist at same tier) */}
        {siblingTasks.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-[11px]">
            <span className="text-zinc-500 font-bold mr-1">同级分岔切换:</span>
            {siblingTasks.slice(0, 5).map((sib) => (
              <button
                key={sib.id}
                type="button"
                onClick={() => stepToNode(sib.id, 'warp')}
                className="px-2.5 py-1 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-500/40 text-zinc-300 hover:text-amber-300 font-semibold transition-all active:scale-95 max-w-[160px] truncate"
              >
                {sib.status === 'done' ? '✅' : isTaskReady(sib.id) ? '⚡' : '🔒'} {sib.title}
              </button>
            ))}
          </div>
        )}

        {/* Animated Conduit to Next Forks */}
        <div className="relative h-8 w-px my-2 bg-gradient-to-b from-amber-400 to-sky-400/40">
          <span className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_8px_#fbbf24]" />
        </div>

        {/* ZONE 3: Immediate Next Branches (1 - N Fork Cards) */}
        <div className="w-full">
          <div className="text-center mb-3">
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-400">
              前方知识分岔口 ({downstreamTasks.length})
            </span>
          </div>

          {downstreamTasks.length === 0 ? (
            <div className="max-w-lg mx-auto rounded-2xl border border-zinc-800/90 bg-zinc-900/55 p-5 text-center backdrop-blur-md">
              <p className="text-xs font-bold text-amber-300 mb-1">🏆 已抵达当前学习路径终点</p>
              <p className="text-[11px] text-zinc-400 mb-3.5">
                你可以拓展下一级后继知识点，或进入《星图总览》跃迁到课程的其他支线星系。
              </p>
              <div className="flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={onOpenSolarMap}
                  className="px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-black active:scale-95 transition-all"
                >
                  🌌 打开星图选分支
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAddNode(focusTask.id)}
                  className="px-4 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold active:scale-95 transition-all"
                >
                  + 新增延伸分支
                </button>
              </div>
            </div>
          ) : (
            <div
              className={`grid gap-3.5 ${
                downstreamTasks.length === 1
                  ? 'grid-cols-1 max-w-md mx-auto'
                  : downstreamTasks.length === 2
                    ? 'grid-cols-1 sm:grid-cols-2 max-w-3xl mx-auto'
                    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
              }`}
            >
              {downstreamTasks.map((branch, idx) => {
                const branchDone = branch.status === 'done';
                const branchReady = isTaskReady(branch.id);
                const branchUnlocksAfterFocus =
                  !branchDone &&
                  (incomingMap.get(branch.id) || []).every(
                    (pid) => pid === focusTask.id || taskMap.get(pid)?.status === 'done'
                  );

                return (
                  <div
                    key={branch.id}
                    style={{ animationDelay: `${idx * 65}ms` }}
                    className={`animate-stagger group leather-card rounded-2xl p-4 flex flex-col justify-between transition-all cursor-pointer hover:-translate-y-1 ${
                      branchDone
                        ? 'border-amber-500/35 hover:border-amber-400/70'
                        : branchReady || branchUnlocksAfterFocus
                          ? 'border-sky-500/35 hover:border-amber-400/70 hover:shadow-[0_12px_30px_-8px_rgba(245,158,11,0.2)]'
                          : 'border-zinc-800/90 opacity-85 hover:opacity-100'
                    }`}
                    onClick={() => stepToNode(branch.id, 'forward')}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                            branchDone
                              ? 'bg-amber-400/15 text-amber-300 border-amber-400/35'
                              : branchReady
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                                : branchUnlocksAfterFocus
                                  ? 'bg-sky-500/15 text-sky-300 border-sky-500/35'
                                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          {branchDone
                            ? '✅ 已掌握'
                            : branchReady
                              ? '⚡ 已解锁'
                              : branchUnlocksAfterFocus
                                ? '🔓 完成当前即解锁'
                                : '🔒 多重前置'}
                        </span>
                        <span className="text-[11px] font-bold text-amber-300/80 group-hover:text-amber-300 flex items-center gap-0.5 transition-transform group-hover:translate-x-0.5">
                          <span>推进至此</span>
                          <IconChevronRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                      <h4 className="text-sm font-black text-zinc-100 group-hover:text-amber-200 transition-colors leading-snug mb-1.5">
                        {branch.title}
                      </h4>
                      <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                        {extractBriefExcerpt(branch.description)}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-zinc-500">
                        后继分支 {(outgoingMap.get(branch.id) || []).length} 路
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenCockpit(branch.id);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-zinc-950 hover:bg-amber-500/20 border border-zinc-800 hover:border-amber-500/40 text-[11px] font-bold text-amber-300 flex items-center gap-1 transition-all active:scale-95"
                      >
                        <IconLightning className="w-3 h-3" />
                        <span>直接精讲</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
