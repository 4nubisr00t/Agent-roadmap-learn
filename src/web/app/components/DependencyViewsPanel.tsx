import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type NodeTypes,
  type NodeProps,
  type OnConnect,
  type OnEdgesDelete,
  type EdgeMouseHandler,
  type ReactFlowInstance,
} from '@xyflow/react';
import ELK, { type ElkEdgeSection, type ElkExtendedEdge, type ElkNode, type ElkPoint, type ElkPort, type LayoutOptions } from 'elkjs/lib/elk.bundled.js';
import { toPng } from 'html-to-image';

import { getItem, removeItem, setItem, STORAGE_KEYS } from '../utils/storage.js';
import TagBadge from './TagBadge.js';
import TagSelector from './TagSelector.js';
import { IconTree, IconCheck, IconLightning, IconPlus, IconClose, IconChevronRight, IconChevronLeft } from './Icons.js';
import { useFeedback } from './FeedbackProvider.js';

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface GraphSummary {
  id: string;
  name: string;
  description: string;
  dimension: string | null;
  revision: number;
  nodeCount: number;
}

interface ViewNode {
  taskId: string;
  x: number;
  y: number;
  collapsed: boolean;
  note: string | null;
}

interface ViewEdge {
  id: string;
  fromTaskId: string;
  toTaskId: string;
  kind: 'hard';
  createdAt: string;
}

interface DependencyView {
  id: string;
  projectId: string;
  name: string;
  description: string;
  dimension: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
  nodes: ViewNode[];
  edges: ViewEdge[];
}

interface DependencyViewMutationResponse {
  view: DependencyView;
}

interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  description?: string;
  tags: string[];
}

type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done';
type TaskPriority = TaskItem['priority'];

interface TagItem {
  id: string;
  name: string;
  color: string;
}

interface LayoutedEdgeData extends Record<string, unknown> {
  path: string;
  sourceStatus: string;
}

type DisplayMode = 'compact' | 'detailed';

interface DependencyViewsPanelProps {
  projectId: string | null;
  projectName?: string;
  displayMode: DisplayMode;
  tasks: TaskItem[];
  tags: TagItem[];
  onGraphsChange: (graphs: GraphSummary[]) => void;
  onTaskStatusChange: (taskId: string, status: TaskStatus) => Promise<boolean>;
  onCreateTask: (projectId: string, input: {
    title: string;
    description: string;
    priority: TaskPriority;
    tags: string[];
  }) => Promise<TaskItem | null>;
  onSelectTask?: (taskId: string) => void;
}

type SavedGraphSelections = Record<string, string>;
type TaskFlowEdge = Edge<LayoutedEdgeData, 'layoutedEdge'>;

const elk = new ELK();
const GRAPH_MOTION_STYLES = `
  @keyframes dependency-edge-flow {
    to {
      stroke-dashoffset: -52;
    }
  }

  @keyframes dependency-ready-glow {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.12), 0 16px 36px rgba(15, 23, 42, 0.12);
    }

    50% {
      box-shadow: 0 0 0 8px rgba(16, 185, 129, 0.1), 0 22px 44px rgba(16, 185, 129, 0.2);
    }
  }

  .dependency-edge-flow {
    animation: dependency-edge-flow 1.2s linear infinite;
  }

  .dependency-ready-card {
    animation: dependency-ready-glow 1.8s ease-in-out infinite;
  }
`;

function normalizeDependencyView(
  payload: DependencyView | DependencyViewMutationResponse | null | undefined
): DependencyView | null {
  const view = payload && 'view' in payload ? payload.view : payload;
  if (!view) {
    return null;
  }

  return {
    ...view,
    nodes: Array.isArray(view.nodes) ? view.nodes : [],
    edges: Array.isArray(view.edges) ? view.edges : [],
  };
}

// ─── ReactFlow custom node data

interface TaskNodeData extends Record<string, unknown> {
  task: TaskItem;
  tagMap: Record<string, TagItem>;
  isDone: boolean;
  isReady: boolean;
  blockedByTitles: string[];
  displayMode: DisplayMode;
  onAddNext: (taskId: string) => void;
  onRemove: (taskId: string) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => Promise<boolean>;
  isStatusUpdating: boolean;
}

type TaskFlowNode = Node<TaskNodeData, 'taskNode'>;

// ─── Constants

const DISPLAY_MODE_CONFIG: Record<DisplayMode, { nodeWidth: number; nodeHeight: number; layerXGap: number; layerYGap: number }> = {
  compact: {
    nodeWidth: 276,
    nodeHeight: 108,
    layerXGap: 78,
    layerYGap: 144,
  },
  detailed: {
    nodeWidth: 328,
    nodeHeight: 168,
    layerXGap: 88,
    layerYGap: 220,
  },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#d97706',
  medium: '#3b82f6',
  low: '#10b981',
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  'todo': { label: '待补齐', cls: 'bg-zinc-800 text-zinc-300 border border-zinc-700/60' },
  'in-progress': { label: '攻克中', cls: 'bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30' },
  'review': { label: '考核中', cls: 'bg-yellow-500/15 text-yellow-300 font-bold border border-yellow-500/30' },
  'done': { label: '已点亮', cls: 'bg-amber-400 text-zinc-950 font-black shadow-sm' },
};

const STATUS_OPTIONS: TaskStatus[] = ['todo', 'in-progress', 'review', 'done'];

function buildRoundedOrthogonalPath(points: ElkPoint[], radius = 12): string {
  if (points.length === 0) {
    return '';
  }

  if (points.length === 1) {
    return `M ${points[0].x},${points[0].y}`;
  }

  const commands: string[] = [`M ${points[0].x},${points[0].y}`];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];

    if (!next) {
      commands.push(`L ${current.x},${current.y}`);
      continue;
    }

    const incomingDx = current.x - previous.x;
    const incomingDy = current.y - previous.y;
    const outgoingDx = next.x - current.x;
    const outgoingDy = next.y - current.y;
    const incomingLength = Math.hypot(incomingDx, incomingDy);
    const outgoingLength = Math.hypot(outgoingDx, outgoingDy);

    if (incomingLength === 0 || outgoingLength === 0) {
      commands.push(`L ${current.x},${current.y}`);
      continue;
    }

    const segmentRadius = Math.min(radius, incomingLength / 2, outgoingLength / 2);
    const beforeX = current.x - (incomingDx / incomingLength) * segmentRadius;
    const beforeY = current.y - (incomingDy / incomingLength) * segmentRadius;
    const afterX = current.x + (outgoingDx / outgoingLength) * segmentRadius;
    const afterY = current.y + (outgoingDy / outgoingLength) * segmentRadius;

    commands.push(`L ${beforeX},${beforeY}`);
    commands.push(`Q ${current.x},${current.y} ${afterX},${afterY}`);
  }

  return commands.join(' ');
}

function centerOrthogonalBends(points: ElkPoint[]): ElkPoint[] {
  if (points.length < 4) {
    return points;
  }

  const normalized = points.map((point) => ({ ...point }));

  const isHorizontal = (from: ElkPoint, to: ElkPoint): boolean => from.y === to.y && from.x !== to.x;
  const isVertical = (from: ElkPoint, to: ElkPoint): boolean => from.x === to.x && from.y !== to.y;

  for (let index = 1; index < normalized.length - 1; index += 1) {
    if (!isVertical(normalized[index], normalized[index + 1])) {
      continue;
    }

    let runStart = index;
    let runEnd = index + 1;

    while (runEnd < normalized.length - 1 && isVertical(normalized[runEnd], normalized[runEnd + 1])) {
      runEnd += 1;
    }

    let leftAnchorIndex = runStart - 1;
    if (leftAnchorIndex < 0 || !isHorizontal(normalized[leftAnchorIndex], normalized[runStart])) {
      index = runEnd;
      continue;
    }

    while (leftAnchorIndex > 0 && isHorizontal(normalized[leftAnchorIndex - 1], normalized[leftAnchorIndex])) {
      leftAnchorIndex -= 1;
    }

    let rightAnchorIndex = runEnd + 1;
    if (rightAnchorIndex >= normalized.length || !isHorizontal(normalized[runEnd], normalized[rightAnchorIndex])) {
      index = runEnd;
      continue;
    }

    while (rightAnchorIndex < normalized.length - 1 && isHorizontal(normalized[rightAnchorIndex], normalized[rightAnchorIndex + 1])) {
      rightAnchorIndex += 1;
    }

    const midpointX = (normalized[leftAnchorIndex].x + normalized[rightAnchorIndex].x) / 2;
    for (let pointIndex = runStart; pointIndex <= runEnd; pointIndex += 1) {
      normalized[pointIndex] = { ...normalized[pointIndex], x: midpointX };
    }

    index = runEnd;
  }

  return normalized;
}

function buildEdgePath(points: ElkPoint[]): string {
  return buildRoundedOrthogonalPath(centerOrthogonalBends(points));
}

function getSectionPoints(section: ElkEdgeSection): ElkPoint[] {
  return [section.startPoint, ...(section.bendPoints ?? []), section.endPoint];
}

function getEdgePalette(status: string, isSelected: boolean): {
  stroke: string;
  strokeWidth: number;
  animated: boolean;
  opacity: number;
} {
  if (isSelected) {
    return {
      stroke: '#10b981',
      strokeWidth: 3,
      animated: false,
      opacity: 1,
    };
  }

  switch (status) {
    case 'in-progress':
      return {
        stroke: '#2563eb',
        strokeWidth: 2.75,
        animated: true,
        opacity: 0.95,
      };
    case 'review':
      return {
        stroke: '#d97706',
        strokeWidth: 2.75,
        animated: true,
        opacity: 0.95,
      };
    case 'done':
      return {
        stroke: '#94a3b8',
        strokeWidth: 2,
        animated: false,
        opacity: 0.7,
      };
    default:
      return {
        stroke: '#94a3b8',
        strokeWidth: 2,
        animated: false,
        opacity: 0.9,
      };
  }
}

function buildElkLayoutOptions(config: {
  nodeWidth: number;
  nodeHeight: number;
  layerXGap: number;
  layerYGap: number;
}): LayoutOptions {
  return {
    'elk.algorithm': 'layered',
    'elk.direction': 'RIGHT',
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.layered.spacing.nodeNodeBetweenLayers': String(Math.max(config.layerXGap, 48)),
    'elk.spacing.nodeNode': String(Math.max(config.layerYGap - config.nodeHeight + 48, 64)),
    'elk.spacing.edgeEdge': '12',
    'elk.spacing.edgeNode': '14',
    'elk.layered.spacing.edgeNodeBetweenLayers': '14',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.layered.nodePlacement.favorStraightEdges': 'true',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.unnecessaryBendpoints': 'true',
    'elk.layered.highDegreeNodes.treatment': 'true',
    'elk.layered.highDegreeNodes.threshold': '6',
    'elk.portConstraints': 'FIXED_ORDER',
  };
}

async function computeAutoLayout(
  nodes: TaskFlowNode[],
  viewEdges: ViewEdge[],
  taskMap: Map<string, TaskItem>,
  selectedEdgeId: string | null,
  config: { nodeWidth: number; nodeHeight: number; layerXGap: number; layerYGap: number }
): Promise<{ nodes: TaskFlowNode[]; edges: TaskFlowEdge[] }> {
  const portsByNode = new Map<string, { in: ElkPort; out: ElkPort }>();
  const elkNodes: ElkNode[] = nodes.map((node) => {
    const ports = {
      in: {
        id: `${node.id}__in`,
        width: 12,
        height: 12,
        layoutOptions: {
          'elk.port.side': 'WEST',
          'elk.port.index': '0',
        },
      },
      out: {
        id: `${node.id}__out`,
        width: 12,
        height: 12,
        layoutOptions: {
          'elk.port.side': 'EAST',
          'elk.port.index': '1',
        },
      },
    };
    portsByNode.set(node.id, ports);
    return {
      id: node.id,
      width: config.nodeWidth,
      height: config.nodeHeight,
      layoutOptions: {
        'elk.portConstraints': 'FIXED_ORDER',
      },
      ports: [ports.in, ports.out],
    };
  });

  const elkEdges: ElkExtendedEdge[] = viewEdges.flatMap((edge) => {
    const sourcePorts = portsByNode.get(edge.fromTaskId);
    const targetPorts = portsByNode.get(edge.toTaskId);
    if (!sourcePorts || !targetPorts) {
      return [];
    }

    return [{
      id: edge.id,
      sources: [sourcePorts.out.id],
      targets: [targetPorts.in.id],
    }];
  });

  const layoutedGraph = await elk.layout({
    id: 'dependency-view-root',
    layoutOptions: buildElkLayoutOptions(config),
    children: elkNodes,
    edges: elkEdges,
  });

  const layoutedNodeMap = new Map<string, ElkNode>(
    (layoutedGraph.children ?? []).map((layoutedNode: ElkNode) => [layoutedNode.id, layoutedNode])
  );
  const finalNodes = nodes.map((node) => {
    const layoutedNode = layoutedNodeMap.get(node.id);
    if (!layoutedNode || layoutedNode.x === undefined || layoutedNode.y === undefined) {
      return node;
    }

    return {
      ...node,
      position: { x: layoutedNode.x, y: layoutedNode.y },
    };
  });

  const finalEdges: TaskFlowEdge[] = elkEdges.map((edge) => {
    const originalEdge = viewEdges.find((viewEdge) => viewEdge.id === edge.id);
    const layoutedEdge = (layoutedGraph.edges ?? []).find((layoutedItem: ElkExtendedEdge) => layoutedItem.id === edge.id);
    const section = layoutedEdge?.sections?.[0];
    const points = section ? getSectionPoints(section) : [];
    const sourceTaskStatus = originalEdge ? (taskMap.get(originalEdge.fromTaskId)?.status ?? 'todo') : 'todo';
    const palette = getEdgePalette(sourceTaskStatus, selectedEdgeId === edge.id);

    return {
      id: edge.id,
      source: originalEdge?.fromTaskId ?? '',
      target: originalEdge?.toTaskId ?? '',
      type: 'layoutedEdge',
      markerEnd: { type: MarkerType.ArrowClosed, color: palette.stroke },
      animated: palette.animated,
      style: {
        stroke: palette.stroke,
        strokeWidth: palette.strokeWidth,
        opacity: palette.opacity,
      },
      data: {
        path: buildEdgePath(points),
        sourceStatus: sourceTaskStatus,
      },
    };
  });

  return {
    nodes: finalNodes,
    edges: finalEdges,
  };
}

function LayoutedEdgeComponent({ id, data, markerEnd, style, interactionWidth }: EdgeProps<TaskFlowEdge>) {
  const path = typeof data?.path === 'string' ? data.path : '';
  if (!path) {
    return null;
  }

  const sourceStatus = typeof data?.sourceStatus === 'string' ? data.sourceStatus : 'todo';
  const stroke = typeof style?.stroke === 'string' ? style.stroke : '#94a3b8';
  const strokeWidth = typeof style?.strokeWidth === 'number' ? style.strokeWidth : 2;
  const opacity = typeof style?.opacity === 'number' ? style.opacity : 1;
  const isAnimated = sourceStatus === 'in-progress' || sourceStatus === 'review';
  const glowStroke = sourceStatus === 'review'
    ? 'rgba(217, 119, 6, 0.26)'
    : sourceStatus === 'in-progress'
      ? 'rgba(37, 99, 235, 0.24)'
      : 'rgba(148, 163, 184, 0.18)';

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={glowStroke}
        strokeWidth={strokeWidth + 8}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={isAnimated ? 0.85 : 0.35}
      />
      <path
        id={id}
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={opacity}
        markerEnd={markerEnd}
      />
      {isAnimated && (
        <path
          d={path}
          fill="none"
          stroke="#ffffff"
          strokeWidth={Math.max(strokeWidth - 0.2, 1.6)}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="14 12"
          className="dependency-edge-flow"
          markerEnd={markerEnd}
        />
      )}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(interactionWidth ?? 20, strokeWidth + 16)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

// ─── Task Node Component (defined outside main to prevent re-creation)

function TaskNodeComponent({ data }: NodeProps<TaskFlowNode>) {
  const task = data.task as TaskItem;
  const tagMap = data.tagMap as Record<string, TagItem>;
  const isDone = data.isDone as boolean;
  const isReady = data.isReady as boolean;
  const blockedByTitles = data.blockedByTitles as string[];
  const displayMode = data.displayMode as DisplayMode;
  const onAddNext = data.onAddNext as (id: string) => void;
  const onRemove = data.onRemove as (id: string) => void;
  const onStatusChange = data.onStatusChange as (taskId: string, status: TaskStatus) => Promise<boolean>;
  const isStatusUpdating = data.isStatusUpdating as boolean;
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const statusButtonRef = useRef<HTMLButtonElement | null>(null);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);
  const color = PRIORITY_COLORS[task.priority] ?? '#3b82f6';
  const status = STATUS_CONFIG[task.status] ?? { label: task.status, cls: 'bg-slate-100 text-slate-600' };
  const layout = DISPLAY_MODE_CONFIG[displayMode];
  const isCompact = displayMode === 'compact';
  const readinessState = isDone ? 'done' : isReady ? 'ready' : 'blocked';
  const readinessBadge = isDone
    ? { label: '已掌握点亮', cls: 'bg-amber-400 text-zinc-950 font-black shadow-sm shadow-amber-400/20', iconCls: 'text-zinc-950' }
    : isReady
      ? { label: '推荐攻克', cls: 'bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 font-black shadow-md shadow-amber-500/20 animate-pulse', iconCls: 'text-zinc-950' }
      : { label: '需先掌握前置', cls: 'bg-zinc-800 text-zinc-400 border border-zinc-700 font-medium', iconCls: 'text-zinc-500' };
  const surfaceStyle = isDone
    ? {
        width: layout.nodeWidth,
        border: `1.5px solid #d97706`,
        boxShadow: `0 4px 14px rgba(245, 158, 11, 0.15)`,
        background: 'linear-gradient(180deg, #18181b 0%, #09090b 100%)',
        opacity: 0.85,
      }
    : isReady
      ? {
          width: layout.nodeWidth,
          border: `2px solid #f59e0b`,
          background: `linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, #18181b 40%, #09090b 100%)`,
          boxShadow: `0 0 0 4px rgba(245, 158, 11, 0.15), 0 16px 36px rgba(0, 0, 0, 0.6)`,
          transform: 'translateY(-3px)',
        }
      : {
          width: layout.nodeWidth,
          border: `1px solid #27272a`,
          background: 'linear-gradient(180deg, #18181b 0%, #09090b 100%)',
          boxShadow: '0 6px 18px rgba(0, 0, 0, 0.4)',
          opacity: 0.92,
        };

  const updateMenuPosition = useCallback(() => {
    const button = statusButtonRef.current;
    if (!button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const width = Math.max(rect.width + 48, 176);
    setMenuStyle({
      top: rect.bottom + 10,
      left: Math.max(12, rect.right - width),
      width,
    });
  }, []);

  useEffect(() => {
    if (!isStatusMenuOpen) {
      return;
    }

    updateMenuPosition();

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (statusButtonRef.current?.contains(target) || statusMenuRef.current?.contains(target)) {
        return;
      }

      setIsStatusMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsStatusMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isStatusMenuOpen, updateMenuPosition]);

  useEffect(() => {
    if (isStatusUpdating) {
      setIsStatusMenuOpen(false);
    }
  }, [isStatusUpdating]);

  const handleStatusToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isStatusUpdating) {
      return;
    }

    if (!isStatusMenuOpen) {
      updateMenuPosition();
    }
    setIsStatusMenuOpen((value) => !value);
  };

  const handleStatusSelect = async (nextStatus: TaskStatus) => {
    if (nextStatus === task.status) {
      setIsStatusMenuOpen(false);
      return;
    }

    const success = await onStatusChange(task.id, nextStatus);
    if (success) {
      setIsStatusMenuOpen(false);
    }
  };

  const readinessIcon = isDone
    ? (
        <svg aria-hidden="true" className={`h-3 w-3 ${readinessBadge.iconCls}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" d="M5 13l4 4L19 7" />
        </svg>
      )
    : isReady
      ? (
          <svg aria-hidden="true" className={`h-3 w-3 ${readinessBadge.iconCls}`} fill="currentColor" viewBox="0 0 24 24">
            <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
          </svg>
        )
      : (
          <svg aria-hidden="true" className={`h-3 w-3 ${readinessBadge.iconCls}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 2" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
  const waitingTooltip = !isDone && !isReady && blockedByTitles.length > 0
    ? `Waiting for: ${blockedByTitles.join(', ')}`
    : undefined;

  return (
    <>
      <div
        className={`bg-zinc-900 rounded-2xl text-zinc-100 ${readinessState === 'ready' ? 'dependency-ready-card' : ''}`}
        style={surfaceStyle}
      >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#f59e0b', width: 10, height: 10, border: '2px solid #18181b' }}
      />
      {/* Priority / Status header */}
      <div
        className="px-4 py-2.5 rounded-t-2xl"
        style={{ backgroundColor: `${color}15` }}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="pt-0.5 text-[10px] font-black uppercase tracking-widest" style={{ color }}>
            {task.priority}
          </span>
          <div className="flex max-w-[70%] flex-wrap justify-end gap-1.5">
            <span
              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${readinessBadge.cls}`}
              title={waitingTooltip}
            >
              {readinessIcon}
              {readinessBadge.label}
            </span>
            <button
              ref={statusButtonRef}
              type="button"
              onClick={handleStatusToggle}
              disabled={isStatusUpdating}
              className={`nodrag nopan inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold transition-all ${status.cls} ${isStatusUpdating ? 'cursor-wait opacity-70' : 'cursor-pointer hover:brightness-125 active:scale-95'}`}
              aria-haspopup="menu"
              aria-expanded={isStatusMenuOpen}
              title="修改掌握状态"
            >
              {status.label}
              <svg aria-hidden="true" className="h-3 w-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      {/* Title + description */}
      <div
        className="px-4 pt-2.5 pb-1 cursor-pointer hover:bg-zinc-800/40 transition-colors rounded-xl"
        onClick={() => (data as any).onSelect?.()}
        title="点击查看课程详细讲义"
      >
        <p className={`font-bold text-zinc-100 leading-snug line-clamp-2 hover:text-amber-300 transition-colors ${isCompact ? 'text-[13px]' : 'text-sm'}`}>{task.title}</p>
        {!isCompact && task.description && (
          <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">{task.description}</p>
        )}
        {!isCompact && task.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {task.tags.map((tagId) => {
              const tag = tagMap[tagId];
              if (!tag) {
                return null;
              }

              return (
                <TagBadge
                  key={tagId}
                  name={tag.name}
                  color={tag.color}
                  size="sm"
                  className="rounded-lg font-bold"
                />
              );
            })}
          </div>
        )}
      </div>
      {/* Actions */}
      <div className={`px-4 pb-3 flex items-center justify-between ${isCompact ? 'mt-0.5' : 'mt-1'}`}>
        <button
          type="button"
          className={`nodrag flex items-center gap-1 font-bold text-amber-400 hover:text-zinc-950 hover:bg-amber-400 rounded-lg transition-all active:scale-95 ${isCompact ? 'text-[11px] px-2 py-1' : 'text-xs px-2.5 py-1'}`}
          onClick={() => onAddNext(task.id)}
        >
          <span className="text-sm leading-none">+</span>
          <span>下一步</span>
        </button>
        <button
          type="button"
          className="nodrag text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 p-1.5 rounded-lg transition-all active:scale-90"
          title="从拓扑图中移出"
          aria-label="Remove from graph"
          onClick={() => onRemove(task.id)}
        >
          <IconClose className="w-3.5 h-3.5" />
        </button>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#f59e0b', width: 10, height: 10, border: '2px solid #18181b' }}
      />
      </div>
      {isStatusMenuOpen && menuStyle && createPortal(
        <div
          ref={statusMenuRef}
          className="rounded-2xl border border-zinc-750 bg-zinc-900/95 p-2 shadow-2xl backdrop-blur-md text-zinc-100"
          style={{
            position: 'fixed',
            top: menuStyle.top,
            left: menuStyle.left,
            width: menuStyle.width,
            zIndex: 80,
          }}
        >
          <p className="px-2 pb-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">修改掌握状态</p>
          <div className="space-y-1">
            {STATUS_OPTIONS.map((option) => {
              const optionConfig = STATUS_CONFIG[option];
              const isCurrent = option === task.status;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => void handleStatusSelect(option)}
                  disabled={isStatusUpdating}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors active:scale-95 ${isCurrent ? 'bg-amber-400 text-zinc-950 font-black' : 'text-zinc-300 hover:bg-zinc-800'} disabled:cursor-wait disabled:opacity-60`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${optionConfig.cls}`} />
                    <span>{optionConfig.label}</span>
                  </span>
                  {isCurrent && <span className="text-[10px] font-black uppercase tracking-wide">当前</span>}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

const nodeTypes: NodeTypes = { taskNode: TaskNodeComponent };
const edgeTypes: EdgeTypes = { layoutedEdge: LayoutedEdgeComponent };

// ─── Main Component

export default function DependencyViewsPanel({
  projectId,
  projectName,
  displayMode,
  tasks,
  tags,
  onGraphsChange,
  onTaskStatusChange,
  onCreateTask,
  onSelectTask,
}: DependencyViewsPanelProps) {
  const { toast, confirm } = useFeedback();
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<DependencyView | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Modal state
  const [isCreateGraphOpen, setIsCreateGraphOpen] = useState(false);
  const [newGraphName, setNewGraphName] = useState('');
  const [newGraphDesc, setNewGraphDesc] = useState('');
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [addTaskSuccessorId, setAddTaskSuccessorId] = useState<string | null>(null);
  const [selectedAddTaskIds, setSelectedAddTaskIds] = useState<string[]>([]);
  const [hideCompletedInAdd, setHideCompletedInAdd] = useState(true);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isUpdatingEdge, setIsUpdatingEdge] = useState(false);
  const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<string>>(() => new Set());
  const [isGraphListCollapsed, setIsGraphListCollapsed] = useState(
    () => getItem<boolean>(STORAGE_KEYS.GRAPH_SIDEBAR_COLLAPSED) ?? false
  );
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [isCanvasFullscreen, setIsCanvasFullscreen] = useState(false);
  const [isQuickCreateTaskOpen, setIsQuickCreateTaskOpen] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [quickCreateTaskError, setQuickCreateTaskError] = useState('');
  const [quickCreateTaskForm, setQuickCreateTaskForm] = useState<{
    title: string;
    description: string;
    priority: TaskPriority;
    tags: string[];
  }>({
    title: '',
    description: '',
    priority: 'medium',
    tags: [],
  });

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState<TaskFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Refs for stable callbacks (no need to re-create on projectId / selectedGraphId changes)
  const projectIdRef = useRef(projectId);
  const selectedGraphIdRef = useRef(selectedGraphId);
  const selectedEdgeIdRef = useRef<string | null>(selectedEdgeId);
  const graphListRequestIdRef = useRef(0);
  const graphViewRequestIdRef = useRef(0);
  const reactFlowWrapperRef = useRef<HTMLDivElement | null>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance<TaskFlowNode, Edge> | null>(null);
  projectIdRef.current = projectId;
  selectedGraphIdRef.current = selectedGraphId;
  selectedEdgeIdRef.current = selectedEdgeId;
  const tagMap = useMemo(
    () => Object.fromEntries(tags.map((tag) => [tag.id, tag])),
    [tags]
  );

  // Load graphs when projectId changes
  useEffect(() => {
    if (!projectId) {
      graphListRequestIdRef.current += 1;
      graphViewRequestIdRef.current += 1;
      setGraphs([]);
      setSelectedGraphId(null);
      setCurrentView(null);
      setIsLoading(false);
      return;
    }

    graphListRequestIdRef.current += 1;
    const requestId = graphListRequestIdRef.current;

    void (async () => {
      const res = await fetch(`/api/projects/${projectId}/dependency-views`);
      const payload = await res.json() as { success: boolean; data: Array<GraphSummary & { nodes: ViewNode[] }> };
      if (requestId !== graphListRequestIdRef.current || projectIdRef.current !== projectId) {
        return;
      }

      if (payload.success) {
        const nextGraphs = payload.data.map((graph) => ({
          ...graph,
          nodeCount: graph.nodes.length,
        }));
        setGraphs(nextGraphs);
        onGraphsChange(nextGraphs);
        setSelectedGraphId((current) => {
          if (current && nextGraphs.some((graph) => graph.id === current)) {
            return current;
          }
          const savedSelections = getItem<SavedGraphSelections>(STORAGE_KEYS.SELECTED_GRAPH_BY_PROJECT);
          const savedGraphId = projectId ? savedSelections?.[projectId] : null;
          if (savedGraphId && nextGraphs.some((graph) => graph.id === savedGraphId)) {
            return savedGraphId;
          }
          return nextGraphs[0]?.id ?? null;
        });
      }
    })();
  }, [projectId, onGraphsChange]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    const savedSelections = getItem<SavedGraphSelections>(STORAGE_KEYS.SELECTED_GRAPH_BY_PROJECT) ?? {};

    if (selectedGraphId) {
      if (savedSelections[projectId] === selectedGraphId) {
        return;
      }

      setItem(STORAGE_KEYS.SELECTED_GRAPH_BY_PROJECT, {
        ...savedSelections,
        [projectId]: selectedGraphId,
      });
      return;
    }

    if (!(projectId in savedSelections)) {
      return;
    }

    const { [projectId]: _removedSelection, ...restSelections } = savedSelections;
    if (Object.keys(restSelections).length === 0) {
      removeItem(STORAGE_KEYS.SELECTED_GRAPH_BY_PROJECT);
      return;
    }

    setItem(STORAGE_KEYS.SELECTED_GRAPH_BY_PROJECT, restSelections);
  }, [projectId, selectedGraphId]);

  useEffect(() => {
    setItem(STORAGE_KEYS.GRAPH_SIDEBAR_COLLAPSED, isGraphListCollapsed);
  }, [isGraphListCollapsed]);

  const syncGraphSummary = useCallback((view: DependencyView | null) => {
    if (!view) {
      return;
    }

    setGraphs((currentGraphs) => {
      let hasChanges = false;
      const nextGraphs = currentGraphs.map((graph) => {
        if (graph.id !== view.id) {
          return graph;
        }

        const nextGraph = {
          ...graph,
          name: view.name,
          description: view.description,
          dimension: view.dimension,
          revision: view.revision,
          nodeCount: view.nodes.length,
        };

        if (
          nextGraph.name !== graph.name ||
          nextGraph.description !== graph.description ||
          nextGraph.dimension !== graph.dimension ||
          nextGraph.revision !== graph.revision ||
          nextGraph.nodeCount !== graph.nodeCount
        ) {
          hasChanges = true;
        }

        return nextGraph;
      });

      if (!hasChanges) {
        return currentGraphs;
      }

      onGraphsChange(nextGraphs);
      return nextGraphs;
    });
  }, [onGraphsChange]);

  const resetAddTaskState = useCallback(() => {
    setIsAddTaskOpen(false);
    setAddTaskSuccessorId(null);
    setSelectedAddTaskIds([]);
    setHideCompletedInAdd(true);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsCanvasFullscreen(document.fullscreenElement === reactFlowWrapperRef.current);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.fullscreenElement === reactFlowWrapperRef.current) {
        void document.exitFullscreen();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // Load selected view when selectedGraphId changes
  useEffect(() => {
    if (!projectId || !selectedGraphId) {
      graphViewRequestIdRef.current += 1;
      setCurrentView(null);
      setSelectedEdgeId(null);
      setIsLoading(false);
      return;
    }

    graphViewRequestIdRef.current += 1;
    const requestId = graphViewRequestIdRef.current;
    setIsLoading(true);
    void (async () => {
      const res = await fetch(`/api/projects/${projectId}/dependency-views/${selectedGraphId}`);
      const payload = await res.json() as { success: boolean; data: DependencyView | DependencyViewMutationResponse };
      if (
        requestId !== graphViewRequestIdRef.current ||
        projectIdRef.current !== projectId ||
        selectedGraphIdRef.current !== selectedGraphId
      ) {
        return;
      }

      if (payload.success) {
        setCurrentView(normalizeDependencyView(payload.data));
      } else {
        setCurrentView(null);
      }
      setIsLoading(false);
    })();
  }, [projectId, selectedGraphId]);

  // Stable callbacks via refs
  const handleAddNext = useCallback((taskId: string) => {
    setAddTaskSuccessorId(taskId);
    setSelectedAddTaskIds([]);
    setHideCompletedInAdd(true);
    setIsAddTaskOpen(true);
  }, []);

  const handleRemove = useCallback((taskId: string) => {
    const pid = projectIdRef.current;
    const gid = selectedGraphIdRef.current;
    if (!pid || !gid) return;
    void (async () => {
      const res = await fetch(`/api/projects/${pid}/dependency-views/${gid}/nodes/${taskId}`, {
        method: 'DELETE',
      });
      const payload = await res.json() as { success: boolean; data: DependencyView | DependencyViewMutationResponse };
      if (payload.success) {
        setCurrentView(normalizeDependencyView(payload.data));
      }
    })();
  }, []);

  const resetQuickCreateTaskForm = useCallback(() => {
    setQuickCreateTaskForm({
      title: '',
      description: '',
      priority: 'medium',
      tags: [],
    });
    setQuickCreateTaskError('');
  }, []);

  const handleOpenQuickCreateTask = useCallback(() => {
    resetQuickCreateTaskForm();
    setIsQuickCreateTaskOpen(true);
  }, [resetQuickCreateTaskForm]);

  const handleCloseQuickCreateTask = useCallback(() => {
    setIsQuickCreateTaskOpen(false);
    resetQuickCreateTaskForm();
  }, [resetQuickCreateTaskForm]);

  useEffect(() => {
    resetAddTaskState();
    handleCloseQuickCreateTask();
    setIsCreateGraphOpen(false);
    setNewGraphName('');
    setNewGraphDesc('');
    setSelectedEdgeId(null);
    setIsUpdatingEdge(false);
    setUpdatingTaskIds(new Set());
  }, [projectId, selectedGraphId, handleCloseQuickCreateTask, resetAddTaskState]);

  const handleTaskStatusChange = useCallback(async (taskId: string, status: TaskStatus) => {
    setUpdatingTaskIds((current) => {
      const next = new Set(current);
      next.add(taskId);
      return next;
    });
    try {
      return await onTaskStatusChange(taskId, status);
    } finally {
      setUpdatingTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  }, [onTaskStatusChange]);

  const handleQuickCreateTask = useCallback(async () => {
    const title = quickCreateTaskForm.title.trim();
    if (!title) {
      setQuickCreateTaskError('Title is required.');
      return;
    }
    if (title.length < 3) {
      setQuickCreateTaskError('Title must be at least 3 characters.');
      return;
    }
    if (title.length > 120) {
      setQuickCreateTaskError('Title must be 120 characters or fewer.');
      return;
    }

    setIsCreatingTask(true);
    try {
      const targetProjectId = projectIdRef.current;
      if (!targetProjectId) {
        setQuickCreateTaskError('No active project is selected for this graph.');
        return;
      }

      const createdTask = await onCreateTask(targetProjectId, {
        title,
        description: quickCreateTaskForm.description,
        priority: quickCreateTaskForm.priority,
        tags: quickCreateTaskForm.tags,
      });

      if (!createdTask) {
        setQuickCreateTaskError('Failed to create task. Please try again.');
        return;
      }

      setSelectedAddTaskIds((current) => (current.includes(createdTask.id) ? current : [...current, createdTask.id]));
      setIsQuickCreateTaskOpen(false);
      resetQuickCreateTaskForm();
    } catch (error) {
      console.error('Failed to create task from graph modal:', error);
      setQuickCreateTaskError('Failed to create task. Please try again.');
    } finally {
      setIsCreatingTask(false);
    }
  }, [onCreateTask, quickCreateTaskForm, resetQuickCreateTaskForm]);

  const handleDeleteEdge = useCallback(async (edgeId: string) => {
    const pid = projectIdRef.current;
    const gid = selectedGraphIdRef.current;
    if (!pid || !gid) return;

    setIsUpdatingEdge(true);
    try {
      const res = await fetch(`/api/projects/${pid}/dependency-views/${gid}/edges/${edgeId}`, {
        method: 'DELETE',
      });
      const payload = await res.json() as {
        success?: boolean;
        data?: DependencyView | DependencyViewMutationResponse;
        error?: string;
      };
      const nextView = normalizeDependencyView(payload.data);
      if (!res.ok || !payload.success || !nextView) {
        toast.error(payload.error ?? '移除依赖连线失败');
        return;
      }
      setCurrentView(nextView);
      setSelectedEdgeId(null);
    } finally {
      setIsUpdatingEdge(false);
    }
  }, [toast]);

  const handleReverseEdge = useCallback(async (edgeId: string) => {
    const pid = projectIdRef.current;
    const gid = selectedGraphIdRef.current;
    const view = currentView;
    if (!pid || !gid || !view) return;

    const edge = view.edges.find((item) => item.id === edgeId);
    if (!edge) return;

    setIsUpdatingEdge(true);
    try {
      const updateRes = await fetch(`/api/projects/${pid}/dependency-views/${gid}/edges/${edgeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromTaskId: edge.toTaskId, toTaskId: edge.fromTaskId }),
      });
      const updatePayload = await updateRes.json() as {
        success?: boolean;
        data?: DependencyView | DependencyViewMutationResponse;
        error?: string;
      };
      const nextView = normalizeDependencyView(updatePayload.data);
      if (!updateRes.ok || !updatePayload.success || !nextView) {
        toast.error(updatePayload.error ?? '反转依赖方向失败');
        return;
      }

      setCurrentView(nextView);
      setSelectedEdgeId(null);
    } finally {
      setIsUpdatingEdge(false);
    }
  }, [currentView, toast]);

  useEffect(() => {
    syncGraphSummary(currentView);
  }, [currentView, syncGraphSummary]);

  // Rebuild ReactFlow graph whenever the view or task list changes
  useEffect(() => {
    if (!currentView) {
      setNodes([]);
      setEdges([]);
      setSelectedEdgeId(null);
      return;
    }
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const layoutConfig = DISPLAY_MODE_CONFIG[displayMode];
    const rawNodes: TaskFlowNode[] = currentView.nodes
      .filter((n) => taskMap.has(n.taskId))
      .map((n) => {
        const task = taskMap.get(n.taskId) as TaskItem;
        const blockingTasks = currentView.edges
          .filter((edge) => edge.toTaskId === n.taskId)
          .map((edge) => taskMap.get(edge.fromTaskId))
          .filter((upstreamTask): upstreamTask is TaskItem => upstreamTask !== undefined)
          .filter((upstreamTask) => upstreamTask.status !== 'done');

        return {
          id: n.taskId,
          type: 'taskNode' as const,
          position: { x: 0, y: 0 },
          data: {
            task,
            tagMap,
            isDone: task.status === 'done',
            isReady: blockingTasks.length === 0,
            blockedByTitles: blockingTasks.map((blockingTask) => blockingTask.title),
            displayMode,
            onAddNext: handleAddNext,
            onRemove: handleRemove,
            onStatusChange: handleTaskStatusChange,
            isStatusUpdating: updatingTaskIds.has(n.taskId),
            onSelect: () => onSelectTask?.(n.taskId),
          } as unknown as TaskNodeData,
        };
      });
    let isCancelled = false;

    void (async () => {
      const layouted = rawNodes.length > 0
        ? await computeAutoLayout(rawNodes, currentView.edges, taskMap, selectedEdgeId, layoutConfig)
        : { nodes: rawNodes, edges: [] as TaskFlowEdge[] };

      if (isCancelled) {
        return;
      }

      setNodes(layouted.nodes);
      setEdges(layouted.edges);
    })();

    return () => {
      isCancelled = true;
    };
  }, [currentView, tasks, tagMap, handleAddNext, handleRemove, handleTaskStatusChange, selectedEdgeId, displayMode, setNodes, setEdges, updatingTaskIds]);

  useEffect(() => {
    if (!currentView || !selectedEdgeId) {
      return;
    }
    const stillExists = currentView.edges.some((edge) => edge.id === selectedEdgeId);
    if (!stillExists) {
      setSelectedEdgeId(null);
    }
  }, [currentView, selectedEdgeId]);

  // Drag connect between handles
  const handleConnect: OnConnect = useCallback((connection) => {
    const pid = projectIdRef.current;
    const gid = selectedGraphIdRef.current;
    if (!pid || !gid || !connection.source || !connection.target) return;
    void (async () => {
      const res = await fetch(`/api/projects/${pid}/dependency-views/${gid}/edges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromTaskId: connection.source, toTaskId: connection.target }),
      });
      const payload = await res.json() as { success: boolean; data: DependencyView | DependencyViewMutationResponse };
      if (payload.success) {
        setCurrentView(normalizeDependencyView(payload.data));
      }
    })();
  }, []);

  // Delete edges via keyboard
  const handleEdgesDelete: OnEdgesDelete = useCallback((deletedEdges) => {
    const pid = projectIdRef.current;
    const gid = selectedGraphIdRef.current;
    if (!pid || !gid) return;
    void (async () => {
      for (const edge of deletedEdges) {
        const res = await fetch(`/api/projects/${pid}/dependency-views/${gid}/edges/${edge.id}`, {
          method: 'DELETE',
        });
        const payload = await res.json() as { success: boolean; data: DependencyView | DependencyViewMutationResponse };
        if (payload.success) {
          setCurrentView(normalizeDependencyView(payload.data));
          if (edge.id === selectedEdgeIdRef.current) {
            setSelectedEdgeId(null);
          }
        }
      }
    })();
  }, []);

  const selectedEdge = useMemo(
    () => currentView?.edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [currentView, selectedEdgeId]
  );
  const isCompact = displayMode === 'compact';

  const selectedEdgeLabel = useMemo(() => {
    if (!selectedEdge) {
      return null;
    }
    const taskMap = new Map(tasks.map((task) => [task.id, task.title]));
    return {
      from: taskMap.get(selectedEdge.fromTaskId) ?? selectedEdge.fromTaskId,
      to: taskMap.get(selectedEdge.toTaskId) ?? selectedEdge.toTaskId,
    };
  }, [selectedEdge, tasks]);
  const handleEdgeClick: EdgeMouseHandler = useCallback((_event, edge) => {
    setSelectedEdgeId(edge.id);
  }, []);

  const handleExportImage = useCallback(async () => {
    const viewport = reactFlowWrapperRef.current?.querySelector('.react-flow__viewport');
    if (!(viewport instanceof HTMLElement)) {
      toast.error('图谱画布尚未就绪，请稍后再试');
      return;
    }

    setIsExportingImage(true);
    try {
      reactFlowInstanceRef.current?.fitView({ padding: 0.2, duration: 0 });
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });

      const dataUrl = await toPng(viewport, {
        backgroundColor: '#f8fafc',
        pixelRatio: 2,
        cacheBust: true,
      });

      const downloadLink = document.createElement('a');
      const exportName = (currentView?.name || 'dependency-graph')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'dependency-graph';
      downloadLink.download = `${exportName}.png`;
      downloadLink.href = dataUrl;
      downloadLink.click();
      toast.success('知识拓扑图已导出为高清 PNG');
    } catch (error) {
      console.error('Failed to export graph image:', error);
      toast.error('导出拓扑图失败，请重试');
    } finally {
      setIsExportingImage(false);
    }
  }, [currentView?.name, toast]);

  const handleToggleFullscreen = useCallback(async () => {
    const wrapper = reactFlowWrapperRef.current;
    if (!wrapper) {
      return;
    }

    try {
      if (document.fullscreenElement === wrapper) {
        await document.exitFullscreen();
      } else {
        await wrapper.requestFullscreen();
      }
    } catch (error) {
      console.error('Failed to toggle graph fullscreen mode:', error);
    }
  }, []);

  // Create graph
  const handleCreateGraph = useCallback(async () => {
    const pid = projectIdRef.current;
    if (!pid || !newGraphName.trim()) return;
    const res = await fetch(`/api/projects/${pid}/dependency-views`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newGraphName.trim(), description: newGraphDesc }),
    });
    const payload = await res.json() as { success: boolean; data: DependencyView | DependencyViewMutationResponse };
    if (payload.success) {
      const v = normalizeDependencyView(payload.data);
      if (!v) {
        return;
      }
      const summary: GraphSummary = {
        id: v.id, name: v.name, description: v.description,
        dimension: v.dimension, revision: v.revision, nodeCount: v.nodes.length,
      };
      const updated = [...graphs, summary];
      setGraphs(updated);
      onGraphsChange(updated);
      setSelectedGraphId(v.id);
      setNewGraphName('');
      setNewGraphDesc('');
      setIsCreateGraphOpen(false);
    }
  }, [newGraphName, newGraphDesc, graphs, onGraphsChange]);

  // Delete graph
  const handleDeleteGraph = useCallback(async (graphId: string) => {
    const pid = projectIdRef.current;
    if (!pid) return;
    const ok = await confirm({
      title: '删除拓扑图视图',
      message: '确认删除该知识拓扑图视图吗？视图中的连线布局将永久移除（知识点讲义本身保留）。',
      confirmText: '确认删除',
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/projects/${pid}/dependency-views/${graphId}`, { method: 'DELETE' });
    if (res.ok) {
      const updated = graphs.filter((g) => g.id !== graphId);
      setGraphs(updated);
      onGraphsChange(updated);
      if (selectedGraphId === graphId) {
        setSelectedGraphId(updated.length > 0 ? updated[0].id : null);
      }
      toast.success('已删除拓扑图视图');
    }
  }, [graphs, onGraphsChange, selectedGraphId, confirm, toast]);

  // Add task to graph (optionally with a successor edge)
  // Add tasks to graph (batch; optionally all as successors of addTaskSuccessorId)
  const handleAddTask = useCallback(async () => {
    const pid = projectIdRef.current;
    const gid = selectedGraphIdRef.current;
    if (!pid || !gid || selectedAddTaskIds.length === 0) return;
    let updatedView: DependencyView | null = null;
    for (const taskId of selectedAddTaskIds) {
      const addRes = await fetch(`/api/projects/${pid}/dependency-views/${gid}/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      const addPayload = await addRes.json() as {
        success: boolean;
        data: DependencyView | DependencyViewMutationResponse;
        error?: string;
      };
      if (!addPayload.success) { toast.error(addPayload.error ?? `添加节点 ${taskId} 失败`); continue; }
      updatedView = normalizeDependencyView(addPayload.data);
      if (addTaskSuccessorId) {
        const edgeRes = await fetch(`/api/projects/${pid}/dependency-views/${gid}/edges`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromTaskId: addTaskSuccessorId, toTaskId: taskId }),
        });
        const edgePayload = await edgeRes.json() as {
          success: boolean;
          data: DependencyView | DependencyViewMutationResponse;
        };
        if (edgePayload.success) {
          updatedView = normalizeDependencyView(edgePayload.data);
        }
      }
    }
    if (updatedView) setCurrentView(updatedView);
    setIsAddTaskOpen(false);
    setAddTaskSuccessorId(null);
    setSelectedAddTaskIds([]);
  }, [selectedAddTaskIds, addTaskSuccessorId]);

  // Tasks not yet in the current view
  const availableTasksForAdd = useMemo(() => {
    if (!currentView) return tasks;
    const inGraph = new Set(currentView.nodes.map((n) => n.taskId));
    return tasks.filter((t) => {
      if (inGraph.has(t.id)) return false;
      if (hideCompletedInAdd && t.status === 'done') return false;
      return true;
    });
  }, [tasks, currentView, hideCompletedInAdd]);

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center text-zinc-500">
          <IconTree className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <p className="font-semibold text-zinc-400">请选择一个技能树以查看依赖拓扑</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-4">

      {/* Sidebar */}
      <aside
        className={`hidden md:flex flex-shrink-0 p-4 flex-col overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/60 shadow-xl backdrop-blur-xl transition-all duration-300 ${
          isGraphListCollapsed ? 'w-20' : isCompact ? 'w-48' : 'w-56'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          {!isGraphListCollapsed && (
            <div className="min-w-0">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">知识图谱目录</h2>
              {projectName && (
                <p className="text-xs text-zinc-300 font-semibold truncate mt-0.5">{projectName}</p>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => setIsGraphListCollapsed((value) => !value)}
              className="w-8 h-8 flex items-center justify-center rounded-full border border-zinc-800 bg-zinc-850 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 active:scale-95 transition-all shadow-sm"
              title={isGraphListCollapsed ? '展开视图列表' : '收起视图列表'}
            >
              {isGraphListCollapsed ? <IconChevronRight className="w-3.5 h-3.5" /> : <IconChevronLeft className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setIsCreateGraphOpen(true)}
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 rounded-full hover:brightness-110 active:scale-95 transition-all shadow-md shadow-amber-500/20 text-xl leading-none"
              title="创建新拓扑图"
            >
              <IconPlus className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-1.5">
            {graphs.length === 0 ? (
              <div className="py-10 text-center text-zinc-500">
                <IconTree className="w-8 h-8 text-zinc-600 mx-auto mb-2 opacity-50" />
                {!isGraphListCollapsed && (
                  <>
                    <p className="text-xs font-medium">暂无拓扑图</p>
                    <p className="text-xs text-zinc-600">点击上方 + 号新建</p>
                  </>
                )}
              </div>
            ) : graphs.map((graph) => (
              <div key={graph.id} className="group relative">
                <button
                  type="button"
                  onClick={() => setSelectedGraphId(graph.id)}
                  className={`w-full rounded-xl transition-all duration-200 active:scale-[0.98] ${
                    selectedGraphId === graph.id
                      ? 'bg-zinc-800/90 border border-amber-500/40 text-amber-300 font-bold shadow-md shadow-amber-500/5'
                      : 'text-zinc-400 hover:bg-zinc-850 hover:text-zinc-200 border border-transparent'
                  } ${isGraphListCollapsed ? 'px-2 py-3 text-center' : 'text-left px-3 py-2.5 text-sm'}`}
                  title={isGraphListCollapsed ? graph.name : undefined}
                >
                  {isGraphListCollapsed ? (
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-[11px] font-black uppercase tracking-widest">{graph.name.slice(0, 2)}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${selectedGraphId === graph.id ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}>
                        {selectedGraphId === graph.id && currentView ? currentView.nodes.length : graph.nodeCount}n
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="truncate pr-5">{graph.name}</div>
                      <div className={`text-[10px] mt-0.5 font-bold px-2 py-0.5 rounded-full inline-block ${selectedGraphId === graph.id ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-800 text-zinc-400'}`}>
                        {selectedGraphId === graph.id && currentView ? currentView.nodes.length : graph.nodeCount} 个节点
                      </div>
                    </>
                  )}
                </button>
                {!isGraphListCollapsed && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); void handleDeleteGraph(graph.id); }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-zinc-800 active:scale-90"
                    title="删除拓扑图"
                    aria-label="Delete graph"
                  >
                    <IconClose className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Canvas */}
      <div ref={reactFlowWrapperRef} className={`relative flex-1 h-full overflow-hidden bg-zinc-950/60 ${isCanvasFullscreen ? 'h-screen w-screen rounded-none border-0 shadow-none' : 'rounded-2xl border border-zinc-800/80 shadow-inner'}`}>
        {!selectedGraphId ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-zinc-500">
              <IconTree className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <p className="font-semibold text-zinc-400">
                {graphs.length === 0 ? '创建拓扑图以开始规划学习路径' : '选择左侧拓扑图以查看详情'}
              </p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-zinc-500">
              <div className="text-3xl mb-3 animate-spin">⟳</div>
              <p className="text-sm font-medium">Loading graph…</p>
            </div>
          </div>
        ) : (
          <>
            {/* Toolbar overlay */}
             <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1.5 sm:gap-2 bg-zinc-900/90 backdrop-blur-md p-1 sm:p-1.5 rounded-xl border border-zinc-800 shadow-xl max-w-[calc(100%-1.5rem)]">
                {graphs.length > 0 && (
                  <div className="md:hidden flex items-center">
                    <select
                      value={selectedGraphId || ''}
                      onChange={(e) => setSelectedGraphId(e.target.value)}
                      className="bg-zinc-950 text-amber-300 border border-amber-500/40 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none max-w-[110px] truncate"
                    >
                      {graphs.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setIsCreateGraphOpen(true)}
                  className="md:hidden flex items-center justify-center w-7 h-7 bg-amber-500/20 text-amber-300 rounded-lg border border-amber-500/40 text-xs font-black"
                  title="新建图谱"
                >
                  <IconPlus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddTaskSuccessorId(null);
                    setSelectedAddTaskIds([]);
                    setHideCompletedInAdd(true);
                    setIsAddTaskOpen(true);
                  }}
                  className="flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-zinc-800 hover:bg-zinc-750 text-amber-300 rounded-lg text-xs font-bold border border-amber-500/30 active:scale-95 transition-all shadow-sm"
                >
                  <IconPlus className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">添加模块</span>
                  <span className="sm:hidden">加模块</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportImage()}
                  disabled={isExportingImage || nodes.length === 0}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded-lg text-xs font-bold border border-zinc-700 active:scale-95 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span>导出图片</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggleFullscreen()}
                  className="flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded-lg text-xs font-bold border border-zinc-700 active:scale-95 transition-all"
                  title={isCanvasFullscreen ? '退出全屏' : '全屏查看拓扑图'}
                >
                  <span>{isCanvasFullscreen ? '退出' : '全屏'}</span>
                </button>
               </div>

             <div className={`absolute top-3 right-3 z-10 rounded-2xl border border-zinc-800 bg-zinc-900/95 p-3.5 shadow-2xl backdrop-blur-md text-zinc-100 ${
               selectedEdge ? 'block w-72' : 'hidden md:block ' + (isCompact ? 'w-64' : 'w-72')
             }`}>
               <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">节点关联与连线</p>
               {selectedEdge && selectedEdgeLabel ? (
                 <>
                  <p className="mt-2 text-xs font-semibold text-zinc-200 leading-snug">
                    {selectedEdgeLabel.from}
                    <span className="mx-2 text-amber-400">→</span>
                    {selectedEdgeLabel.to}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    点击其他依赖连线可切换，或点击下方按钮执行倒转或移除：
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleReverseEdge(selectedEdge.id)}
                      disabled={isUpdatingEdge}
                      className="flex-1 rounded-xl border border-amber-500/40 bg-zinc-800 px-3 py-1.5 text-xs font-bold text-amber-300 transition-colors hover:bg-zinc-750 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      倒转方向
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteEdge(selectedEdge.id)}
                      disabled={isUpdatingEdge}
                      className="flex-1 rounded-xl bg-rose-600/80 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-rose-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      删除连线
                    </button>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                  {isCompact
                    ? '点击任意连线可倒转依赖或删除。'
                    : '点击任意依赖连线后，可直接反转依赖先后顺序或移除该依赖约束。'}
                </p>
              )}
            </div>

            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={handleConnect}
              onEdgesDelete={handleEdgesDelete}
              onEdgeClick={handleEdgeClick}
              onNodeClick={(_event, node) => onSelectTask?.(node.id)}
              onPaneClick={() => setSelectedEdgeId(null)}
              onInit={(instance) => {
                reactFlowInstanceRef.current = instance;
              }}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={2}
              deleteKeyCode="Delete"
            >
              <style>{GRAPH_MOTION_STYLES}</style>
              <Background gap={24} color="#e2e8f0" />
              <Controls className="!rounded-xl !shadow-md !border-0 !bg-white" />
            </ReactFlow>

            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <div className="text-4xl mb-3">✨</div>
                  <p className="text-sm font-semibold text-slate-500">当前图谱中暂无学习节点</p>
                  <p className="text-xs text-slate-400 mt-1">点击上方「+ 添加模块」即可创建新节点</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {isCreateGraphOpen && createPortal(
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fadeIn"
        >
          <div className="bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-750 text-zinc-100">
            <div className="px-6 py-5 border-b border-zinc-800 bg-zinc-950/60">
              <h2 className="text-lg font-black text-zinc-100">创建技能拓扑图</h2>
              <p className="text-xs text-zinc-400 mt-0.5">将知识模块的上下游依赖关系可视化为有向拓扑</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="dependency-graph-name" className="block text-xs font-bold text-zinc-300 mb-1.5">
                  拓扑图名称 <span className="text-amber-400">*</span>
                </label>
                <input
                  id="dependency-graph-name"
                  type="text"
                  value={newGraphName}
                  onChange={(e) => setNewGraphName(e.target.value)}
                  placeholder="例如：第一阶段 前置依赖攻坚图"
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/50 text-xs text-zinc-100 placeholder-zinc-500 transition-all"
                  onKeyDown={(e) => { if (e.key === 'Enter' && newGraphName.trim()) void handleCreateGraph(); }}
                />
              </div>
              <div>
                <label htmlFor="dependency-graph-description" className="block text-xs font-bold text-zinc-300 mb-1.5">拓扑说明 (可选)</label>
                <textarea
                  id="dependency-graph-description"
                  value={newGraphDesc}
                  onChange={(e) => setNewGraphDesc(e.target.value)}
                  placeholder="输入此拓扑图的重点或阶段性目标…"
                  rows={2}
                  className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/50 text-xs text-zinc-200 placeholder-zinc-500 resize-none transition-all leading-relaxed"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3 bg-zinc-950/60">
              <button
                type="button"
                onClick={() => setIsCreateGraphOpen(false)}
                className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-xl transition-all active:scale-95"
              >取消</button>
              <button
                type="button"
                onClick={() => void handleCreateGraph()}
                disabled={!newGraphName.trim()}
                className="px-5 py-2 text-xs font-black bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 rounded-xl hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-amber-500/20 active:scale-95"
              >立即创建</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isAddTaskOpen && createPortal(
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fadeIn"
        >
          <div className="bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-zinc-750 text-zinc-100">
            <div className="px-6 py-5 border-b border-zinc-800 bg-zinc-950/60">
              <h2 className="text-lg font-black text-zinc-100">
                {addTaskSuccessorId ? '添加后置承接模块' : '向拓扑图添加知识模块'}
              </h2>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-zinc-400">
                  {addTaskSuccessorId
                    ? '所选模块将作为前序知识的后置节点'
                    : `当前可用 ${availableTasksForAdd.length} 个知识模块`}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenQuickCreateTask}
                    className="text-xs px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold hover:bg-amber-500/25 transition-all active:scale-95"
                  >
                    新建模块
                  </button>
                  <button
                    type="button"
                    onClick={() => setHideCompletedInAdd(!hideCompletedInAdd)}
                    className="text-xs px-2 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-zinc-100 font-medium transition-all active:scale-95"
                  >
                    {hideCompletedInAdd ? '显示已掌握' : '隐藏已掌握'}
                  </button>
                </div>
              </div>
            </div>
            <div className="p-6">
              {availableTasksForAdd.length === 0 ? (
                <div className="py-8 text-center text-zinc-500">
                  <IconCheck className="w-8 h-8 text-amber-400 mx-auto mb-2 opacity-60" />
                  <p className="font-medium text-xs text-zinc-300">
                    {tasks.length === 0 ? '此技能树尚未创建知识模块' : '所有可用模块均已加入该拓扑图'}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    点击下方按钮可直接新建知识模块并自动选入。
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenQuickCreateTask}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 px-4 py-2 text-xs font-black text-zinc-950 shadow-md shadow-amber-500/20 transition-all hover:brightness-105 active:scale-95"
                  >
                    <IconPlus className="w-3.5 h-3.5" />
                    <span>新建知识模块</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {availableTasksForAdd.map((task) => {
                    const color = PRIORITY_COLORS[task.priority] ?? '#94a3b8';
                    const isSelected = selectedAddTaskIds.includes(task.id);
                    return (
                      <button
                        type="button"
                        key={task.id}
                        onClick={() => {
                          setSelectedAddTaskIds(isSelected
                            ? selectedAddTaskIds.filter((id) => id !== task.id)
                            : [...selectedAddTaskIds, task.id]);
                        }}
                        className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs transition-all border ${
                          isSelected
                            ? 'border-amber-400 bg-amber-500/10 text-amber-300'
                            : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <span className="font-bold truncate">{task.title}</span>
                          {isSelected && (
                            <span className="ml-auto text-amber-400 font-black flex-shrink-0">✓</span>
                          )}
                        </div>
                        {task.description && (
                          <p className="text-[11px] text-zinc-500 mt-1 ml-4.5 line-clamp-1">{task.description}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3 bg-zinc-950/60">
              <button
                type="button"
                onClick={handleOpenQuickCreateTask}
                className="px-3.5 py-2 text-xs font-bold text-amber-300 hover:text-amber-200 hover:bg-zinc-800 rounded-xl transition-all active:scale-95"
              >
                新建模块
              </button>
              <button
                type="button"
                onClick={resetAddTaskState}
                className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-xl transition-all active:scale-95"
              >取消</button>
              <button
                type="button"
                onClick={() => void handleAddTask()}
                disabled={selectedAddTaskIds.length === 0 || availableTasksForAdd.length === 0}
                className="px-5 py-2 text-xs font-black bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 rounded-xl hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-amber-500/20 active:scale-95"
              >{selectedAddTaskIds.length > 0 ? `添加 ${selectedAddTaskIds.length} 个模块到拓扑` : '添加到拓扑'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isQuickCreateTaskOpen && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-750 text-zinc-100 shadow-2xl">
            <div className="border-b border-zinc-800 px-6 py-5 bg-zinc-950/60">
              <h2 className="text-lg font-black text-zinc-100">为拓扑图快速创建模块</h2>
              <p className="mt-1 text-xs text-zinc-400">无需切出拓扑图视图，新建后将直接默认选入当前图谱。</p>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <label htmlFor="quick-create-task-title" className="mb-1 block text-xs font-bold text-zinc-300">模块名称 *</label>
                <input
                  id="quick-create-task-title"
                  type="text"
                  value={quickCreateTaskForm.title}
                  onChange={(event) => setQuickCreateTaskForm({ ...quickCreateTaskForm, title: event.target.value })}
                  placeholder="输入模块名称"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 transition-all focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="quick-create-task-description" className="mb-1 block text-xs font-bold text-zinc-300">讲义或说明</label>
                <textarea
                  id="quick-create-task-description"
                  value={quickCreateTaskForm.description}
                  onChange={(event) => setQuickCreateTaskForm({ ...quickCreateTaskForm, description: event.target.value })}
                  rows={3}
                  placeholder="可选：模块要点或说明…"
                  className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs text-zinc-200 placeholder-zinc-500 transition-all focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50 leading-relaxed"
                />
              </div>
              <div>
                <label htmlFor="quick-create-task-priority" className="mb-1 block text-xs font-bold text-zinc-300">重要优先级</label>
                <select
                  id="quick-create-task-priority"
                  value={quickCreateTaskForm.priority}
                  onChange={(event) => setQuickCreateTaskForm({ ...quickCreateTaskForm, priority: event.target.value as TaskPriority })}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs text-zinc-100 transition-all focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                >
                  <option value="critical">核心必备 (Critical)</option>
                  <option value="high">深度推荐 (High)</option>
                  <option value="medium">标准基准 (Medium)</option>
                  <option value="low">拓展选修 (Low)</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold text-zinc-300">所属标签</label>
                <TagSelector
                  tags={tags}
                  selectedTagIds={quickCreateTaskForm.tags}
                  onChange={(nextTagIds) => setQuickCreateTaskForm({ ...quickCreateTaskForm, tags: nextTagIds })}
                />
              </div>
              {quickCreateTaskError && (
                <p className="text-xs font-medium text-rose-400">{quickCreateTaskError}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-zinc-800 px-6 py-4 bg-zinc-950/60">
              <button
                type="button"
                onClick={handleCloseQuickCreateTask}
                className="rounded-xl px-4 py-2 text-xs font-bold text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 active:scale-95"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleQuickCreateTask()}
                disabled={isCreatingTask || !quickCreateTaskForm.title.trim()}
                className="rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 px-5 py-2 text-xs font-black text-zinc-950 shadow-md shadow-amber-500/20 transition-all hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isCreatingTask ? '创建中...' : '立即创建模块'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
