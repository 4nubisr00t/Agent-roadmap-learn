import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconClose, IconPlus, IconSparkles } from './Icons.js';
import type { HorizonEdge, HorizonTaskItem } from './BranchHorizonView.js';

interface SolarObservatoryViewProps {
  projectName?: string;
  graphName?: string;
  tasks: HorizonTaskItem[];
  nodeTaskIds: string[];
  edges: HorizonEdge[];
  focusTaskId: string | null;
  onWarpToBranch: (taskId: string) => void;
  onOpenCockpit: (taskId: string) => void;
  onOpenAddNode: () => void;
}

interface OrbitPlanet {
  id: string;
  task: HorizonTaskItem;
  layer: number;
  orbitRadius: number;
  angle: number;
  x: number;
  y: number;
  radius: number;
  isDone: boolean;
  isReady: boolean;
  hasRing: boolean;
  hasMoon: boolean;
  upstreamIds: string[];
  downstreamIds: string[];
}

interface StarParticle {
  x: number;
  y: number;
  size: number;
  alpha: number;
  twinkleSpeed: number;
  phase: number;
  depth: number;
}

function deterministicHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Murmur3-style avalanche finalizer to eliminate linear patterns on sequential keys
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export const SolarObservatoryView: React.FC<SolarObservatoryViewProps> = ({
  projectName,
  graphName,
  tasks,
  nodeTaskIds,
  edges,
  focusTaskId,
  onWarpToBranch,
  onOpenCockpit,
  onOpenAddNode,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [selectedPlanetId, setSelectedPlanetId] = useState<string | null>(focusTaskId);
  const [hoveredPlanetId, setHoveredPlanetId] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [isWarping, setIsWarping] = useState(false);

  // Camera state (kept in ref for 60fps mutation without React churn)
  const cameraRef = useRef({
    x: 0,
    y: 0,
    scale: 0.78,
    targetX: 0,
    targetY: 0,
    targetScale: 0.9,
    hasFitted: false,
  });

  // Pointer & touch gesture tracking
  const gestureRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    camStartX: number;
    camStartY: number;
    movedDistance: number;
    pinchStartDist: number | null;
    pinchStartScale: number;
  }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    camStartX: 0,
    camStartY: 0,
    movedDistance: 0,
    pinchStartDist: null,
    pinchStartScale: 1,
  });

  // Compute concentric topological solar layout
  const { planets, orbitRadii, maxRadius, taskMap, activeEdges } = useMemo(() => {
    const tMap = new Map(tasks.map((t) => [t.id, t]));
    const validIds = nodeTaskIds.filter((id) => tMap.has(id));
    const idSet = new Set(validIds);

    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();
    const filteredEdges: HorizonEdge[] = [];

    for (const e of edges) {
      if (!idSet.has(e.fromTaskId) || !idSet.has(e.toTaskId) || e.fromTaskId === e.toTaskId) continue;
      filteredEdges.push(e);
      const inArr = incoming.get(e.toTaskId) || [];
      if (!inArr.includes(e.fromTaskId)) inArr.push(e.fromTaskId);
      incoming.set(e.toTaskId, inArr);

      const outArr = outgoing.get(e.fromTaskId) || [];
      if (!outArr.includes(e.toTaskId)) outArr.push(e.toTaskId);
      outgoing.set(e.fromTaskId, outArr);
    }

    // Longest-path topological layer (cycle-safe)
    const layerMap = new Map<string, number>();
    const inDegree = new Map<string, number>();
    for (const id of validIds) {
      layerMap.set(id, 0);
      inDegree.set(id, (incoming.get(id) || []).length);
    }

    const queue: string[] = validIds.filter((id) => (inDegree.get(id) || 0) === 0);
    const visitedCount = new Map<string, number>();
    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currLayer = layerMap.get(curr) || 0;
      for (const next of outgoing.get(curr) || []) {
        const visits = (visitedCount.get(next) || 0) + 1;
        visitedCount.set(next, visits);
        if (visits <= validIds.length) {
          layerMap.set(next, Math.max(layerMap.get(next) || 0, currLayer + 1));
        }
        const nextDeg = (inDegree.get(next) || 0) - 1;
        inDegree.set(next, nextDeg);
        if (nextDeg === 0) queue.push(next);
      }
    }

    // Group by layer (split huge single layers softly if > 9 nodes so rings stay scenic)
    const byLayer = new Map<number, string[]>();
    for (const id of validIds) {
      const l = layerMap.get(id) || 0;
      const arr = byLayer.get(l) || [];
      arr.push(id);
      byLayer.set(l, arr);
    }

    const sortedLayers = Array.from(byLayer.keys()).sort((a, b) => a - b);
    const layerCount = sortedLayers.length;
    const baseRadius = 112;
    const ringGap = layerCount > 5 ? Math.max(76, Math.min(112, 540 / Math.max(1, layerCount))) : 118;
    const radii: number[] = [];
    const angleById = new Map<string, number>();
    const builtPlanets: OrbitPlanet[] = [];

    sortedLayers.forEach((l, layerIdx) => {
      const ids = byLayer.get(l) || [];
      // Order by parent mean angle for minimal edge crossings
      ids.sort((a, b) => {
        const pA = (incoming.get(a) || []).map((pid) => angleById.get(pid)).filter((v): v is number => v !== undefined);
        const pB = (incoming.get(b) || []).map((pid) => angleById.get(pid)).filter((v): v is number => v !== undefined);
        const avgA = pA.length > 0 ? pA.reduce((s, x) => s + x, 0) / pA.length : deterministicHash(a) * Math.PI * 2;
        const avgB = pB.length > 0 ? pB.reduce((s, x) => s + x, 0) / pB.length : deterministicHash(b) * Math.PI * 2;
        return avgA - avgB;
      });

      const r = baseRadius + layerIdx * ringGap;
      radii.push(r);
      const count = ids.length;
      const baseAngleOffset = layerIdx * 0.58 - Math.PI / 2;

      ids.forEach((id, idx) => {
        const task = tMap.get(id)!;
        const angle = baseAngleOffset + (idx / Math.max(1, count)) * Math.PI * 2;
        angleById.set(id, angle);

        const jitter = count > 4 ? (idx % 2 === 0 ? -12 : 12) : 0;
        const actualR = r + jitter;
        const x = Math.cos(angle) * actualR;
        const y = Math.sin(angle) * actualR;

        const preds = incoming.get(id) || [];
        const isDone = task.status === 'done';
        const isReady = preds.every((pid) => tMap.get(pid)?.status === 'done');
        const radius =
          task.priority === 'critical'
            ? 23
            : task.priority === 'high'
              ? 19
              : task.priority === 'medium'
                ? 16
                : 14;

        builtPlanets.push({
          id,
          task,
          layer: layerIdx,
          orbitRadius: actualR,
          angle,
          x,
          y,
          radius,
          isDone,
          isReady,
          hasRing: task.priority === 'critical',
          hasMoon: task.priority === 'high' || (outgoing.get(id) || []).length > 1,
          upstreamIds: preds,
          downstreamIds: outgoing.get(id) || [],
        });
      });
    });

    const outer = (radii[radii.length - 1] ?? 160) + 88;
    return {
      planets: builtPlanets,
      orbitRadii: radii,
      maxRadius: outer,
      taskMap: tMap,
      activeEdges: filteredEdges,
    };
  }, [tasks, nodeTaskIds, edges]);

  const planetMap = useMemo(() => new Map(planets.map((p) => [p.id, p])), [planets]);

  // Procedural starfield generated once
  const stars = useMemo<StarParticle[]>(() => {
    const arr: StarParticle[] = [];
    for (let i = 0; i < 240; i++) {
      const h1 = deterministicHash(`star_x_seed_${i}_alpha`);
      const h2 = deterministicHash(`star_y_seed_${i}_beta`);
      const h3 = deterministicHash(`star_z_seed_${i}_gamma`);
      arr.push({
        x: (h1 - 0.5) * 2800,
        y: (h2 - 0.5) * 2200,
        size: 0.65 + h3 * 1.9,
        alpha: 0.25 + h3 * 0.68,
        twinkleSpeed: 0.7 + h1 * 1.8,
        phase: h2 * Math.PI * 2,
        depth: 0.16 + h3 * 0.4,
      });
    }
    return arr;
  }, []);

  // Compute full highlighted dependency constellation for hovered or selected planet
  const highlightedIds = useMemo(() => {
    const targetId = hoveredPlanetId || selectedPlanetId;
    if (!targetId || !planetMap.has(targetId)) return null;
    const related = new Set<string>([targetId]);
    // Ancestors BFS
    const upQueue = [targetId];
    while (upQueue.length > 0) {
      const cur = upQueue.shift()!;
      const p = planetMap.get(cur);
      if (!p) continue;
      for (const u of p.upstreamIds) {
        if (!related.has(u)) {
          related.add(u);
          upQueue.push(u);
        }
      }
    }
    // Immediate downstream children
    const targetPlanet = planetMap.get(targetId);
    if (targetPlanet) {
      for (const d of targetPlanet.downstreamIds) {
        related.add(d);
      }
    }
    return related;
  }, [hoveredPlanetId, selectedPlanetId, planetMap]);

  const fitSolarSystem = useCallback((instant = false) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const minDim = Math.max(320, Math.min(rect.width, rect.height));
    const fittedScale = Math.max(0.42, Math.min(1.12, (minDim * 0.45) / Math.max(220, maxRadius)));
    cameraRef.current.targetX = 0;
    cameraRef.current.targetY = 0;
    cameraRef.current.targetScale = fittedScale;
    if (instant) {
      // Subtle warp-in opening punch
      cameraRef.current.x = 0;
      cameraRef.current.y = 0;
      cameraRef.current.scale = fittedScale * 0.68;
    }
    cameraRef.current.hasFitted = true;
    setZoomPercent(Math.round(fittedScale * 100));
  }, [maxRadius]);

  const focusCameraOnPlanet = useCallback((planetId: string, zoomFloor = 1.05) => {
    const p = planetMap.get(planetId);
    if (!p) return;
    cameraRef.current.targetX = p.x;
    cameraRef.current.targetY = p.y;
    cameraRef.current.targetScale = Math.max(cameraRef.current.targetScale, zoomFloor);
    setSelectedPlanetId(planetId);
    setZoomPercent(Math.round(cameraRef.current.targetScale * 100));
  }, [planetMap]);

  const triggerWarpToBranch = useCallback((planetId: string) => {
    const p = planetMap.get(planetId);
    if (!p) {
      onWarpToBranch(planetId);
      return;
    }
    setIsWarping(true);
    cameraRef.current.targetX = p.x;
    cameraRef.current.targetY = p.y;
    cameraRef.current.targetScale = Math.max(2.6, cameraRef.current.scale * 2.2);
    window.setTimeout(() => {
      onWarpToBranch(planetId);
    }, 360);
  }, [planetMap, onWarpToBranch]);

  // Initial cosmic warp entrance
  useEffect(() => {
    fitSolarSystem(true);
  }, [fitSolarSystem]);

  // Sync selected if focusTaskId changes externally
  useEffect(() => {
    if (focusTaskId && planetMap.has(focusTaskId)) {
      setSelectedPlanetId(focusTaskId);
    }
  }, [focusTaskId, planetMap]);

  // Main 60fps Canvas Render Loop
  useEffect(() => {
    let rafId = 0;
    const startTime = performance.now();

    const renderFrame = (now: number) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) {
        rafId = requestAnimationFrame(renderFrame);
        return;
      }

      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetW = Math.max(1, Math.floor(rect.width * dpr));
      const targetH = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        rafId = requestAnimationFrame(renderFrame);
        return;
      }

      // Smooth inertial camera lerp
      const cam = cameraRef.current;
      const lerpFactor = isWarping ? 0.16 : 0.14;
      cam.x += (cam.targetX - cam.x) * lerpFactor;
      cam.y += (cam.targetY - cam.y) * lerpFactor;
      cam.scale += (cam.targetScale - cam.scale) * lerpFactor;

      const t = (now - startTime) * 0.001;
      const w = rect.width;
      const h = rect.height;

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Deep Cosmic Obsidian Backdrop & Nebula Clouds
      const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 10, w * 0.5, h * 0.5, Math.max(w, h) * 0.85);
      bgGrad.addColorStop(0, '#161324');
      bgGrad.addColorStop(0.55, '#0b0b12');
      bgGrad.addColorStop(1, '#050508');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      const nebulaWarm = ctx.createRadialGradient(w * 0.68, h * 0.34, 10, w * 0.68, h * 0.34, Math.max(w, h) * 0.48);
      nebulaWarm.addColorStop(0, 'rgba(245, 158, 11, 0.08)');
      nebulaWarm.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = nebulaWarm;
      ctx.fillRect(0, 0, w, h);

      const nebulaCool = ctx.createRadialGradient(w * 0.28, h * 0.66, 10, w * 0.28, h * 0.66, Math.max(w, h) * 0.52);
      nebulaCool.addColorStop(0, 'rgba(56, 189, 248, 0.075)');
      nebulaCool.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = nebulaCool;
      ctx.fillRect(0, 0, w, h);

      // 2. Parallax Starfield
      for (const s of stars) {
        const sx = w * 0.5 + (s.x - cam.x * s.depth);
        const sy = h * 0.5 + (s.y - cam.y * s.depth);
        if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;
        const twinkle = 0.55 + 0.45 * Math.sin(t * s.twinkleSpeed + s.phase);
        ctx.fillStyle = `rgba(254, 243, 199, ${(s.alpha * twinkle).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, s.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // World space transform
      ctx.translate(w * 0.5, h * 0.5);
      ctx.scale(cam.scale, cam.scale);
      ctx.translate(-cam.x, -cam.y);

      // 3. Concentric Keplerian Orbit Tracks
      for (let i = 0; i < orbitRadii.length; i++) {
        const r = orbitRadii[i];
        ctx.save();
        ctx.rotate((i % 2 === 0 ? 1 : -1) * t * 0.018);
        ctx.strokeStyle = i === 0 ? 'rgba(245, 158, 11, 0.22)' : 'rgba(161, 161, 170, 0.14)';
        ctx.lineWidth = 1 / Math.max(0.5, cam.scale);
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();

        // Astrolabe cardinal tick marks
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.24)';
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * (r - 4), Math.sin(a) * (r - 4));
          ctx.lineTo(Math.cos(a) * (r + 4), Math.sin(a) * (r + 4));
          ctx.stroke();
        }
        ctx.restore();
      }

      // 4. Course Central Sun Core (☀️)
      const sunPulse = 1 + 0.06 * Math.sin(t * 2.1);
      const sunCorona = ctx.createRadialGradient(0, 0, 8, 0, 0, 92 * sunPulse);
      sunCorona.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
      sunCorona.addColorStop(0.28, 'rgba(245, 158, 11, 0.65)');
      sunCorona.addColorStop(0.65, 'rgba(245, 158, 11, 0.12)');
      sunCorona.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = sunCorona;
      ctx.beginPath();
      ctx.arc(0, 0, 92 * sunPulse, 0, Math.PI * 2);
      ctx.fill();

      // Sun sphere
      const sunCore = ctx.createRadialGradient(-8, -8, 4, 0, 0, 32);
      sunCore.addColorStop(0, '#fef9c3');
      sunCore.addColorStop(0.55, '#fbbf24');
      sunCore.addColorStop(1, '#d97706');
      ctx.fillStyle = sunCore;
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2);
      ctx.fill();

      // Sun Label
      ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(254, 243, 199, 0.92)';
      ctx.fillText((projectName || '核心课程恒星').slice(0, 16), 0, 50);

      // 5. Constellation Dependency Beams & Animated Photon Packets
      for (const edge of activeEdges) {
        const from = planetMap.get(edge.fromTaskId);
        const to = planetMap.get(edge.toTaskId);
        if (!from || !to) continue;

        const isHighlighted =
          !highlightedIds || (highlightedIds.has(from.id) && highlightedIds.has(to.id));

        // Curve slightly outward away from origin so lines never cross through Sun
        const mx = (from.x + to.x) * 0.5;
        const my = (from.y + to.y) * 0.5;
        const mLen = Math.hypot(mx, my) || 1;
        const bend = 26;
        const cx = mx + (mx / mLen) * bend;
        const cy = my + (my / mLen) * bend;

        const isActiveRoute = from.isDone || to.isReady;
        ctx.save();
        if (!isHighlighted) {
          ctx.strokeStyle = 'rgba(113, 113, 122, 0.10)';
          ctx.lineWidth = 1;
        } else if (from.isDone && to.isDone) {
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.72)';
          ctx.lineWidth = highlightedIds ? 2.4 : 1.7;
        } else if (from.isDone || to.isReady) {
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.68)';
          ctx.lineWidth = highlightedIds ? 2.4 : 1.6;
        } else {
          ctx.strokeStyle = highlightedIds ? 'rgba(161, 161, 170, 0.48)' : 'rgba(113, 113, 122, 0.24)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([4, 5]);
        }

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(cx, cy, to.x, to.y);
        ctx.stroke();

        // Traveling Photon Packet along active/highlighted curves
        if (isHighlighted && (isActiveRoute || highlightedIds)) {
          const speed = from.isDone ? 0.42 : 0.28;
          const phase = (t * speed + deterministicHash(edge.id)) % 1;
          const inv = 1 - phase;
          const px = inv * inv * from.x + 2 * inv * phase * cx + phase * phase * to.x;
          const py = inv * inv * from.y + 2 * inv * phase * cy + phase * phase * to.y;

          ctx.setLineDash([]);
          ctx.fillStyle = from.isDone ? '#fde68a' : '#7dd3fc';
          ctx.shadowColor = from.isDone ? '#fbbf24' : '#38bdf8';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(px, py, highlightedIds ? 3.2 : 2.3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // 6. Planets & Rumor Nodes
      for (const p of planets) {
        const isSelected = selectedPlanetId === p.id;
        const isHovered = hoveredPlanetId === p.id;
        const isFocused = focusTaskId === p.id;
        const dimmed = Boolean(highlightedIds && !highlightedIds.has(p.id));

        ctx.save();
        ctx.globalAlpha = dimmed ? 0.25 : 1;

        // Atmospheric Halo
        if (p.isDone || p.isReady || isSelected || isHovered) {
          const haloR = p.radius * (isSelected || isHovered ? 2.5 : 2.0);
          const halo = ctx.createRadialGradient(p.x, p.y, p.radius * 0.4, p.x, p.y, haloR);
          if (p.isDone) {
            halo.addColorStop(0, 'rgba(251, 191, 36, 0.45)');
            halo.addColorStop(1, 'rgba(251, 191, 36, 0)');
          } else if (p.isReady) {
            halo.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
            halo.addColorStop(1, 'rgba(56, 189, 248, 0)');
          } else {
            halo.addColorStop(0, 'rgba(161, 161, 170, 0.28)');
            halo.addColorStop(1, 'rgba(161, 161, 170, 0)');
          }
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2);
          ctx.fill();
        }

        // Planetary Sphere
        const sphereGrad = ctx.createRadialGradient(
          p.x - p.radius * 0.35,
          p.y - p.radius * 0.35,
          p.radius * 0.15,
          p.x,
          p.y,
          p.radius
        );
        if (p.isDone) {
          sphereGrad.addColorStop(0, '#fef08a');
          sphereGrad.addColorStop(0.55, '#f59e0b');
          sphereGrad.addColorStop(1, '#78350f');
        } else if (p.isReady) {
          sphereGrad.addColorStop(0, '#bae6fd');
          sphereGrad.addColorStop(0.55, '#0284c7');
          sphereGrad.addColorStop(1, '#0c4a6e');
        } else {
          sphereGrad.addColorStop(0, '#52525b');
          sphereGrad.addColorStop(0.6, '#27272a');
          sphereGrad.addColorStop(1, '#09090b');
        }

        ctx.fillStyle = sphereGrad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = p.isDone
          ? 'rgba(254, 240, 138, 0.85)'
          : p.isReady
            ? 'rgba(125, 211, 252, 0.9)'
            : 'rgba(113, 113, 122, 0.55)';
        ctx.lineWidth = isSelected || isHovered ? 2.2 : 1.2;
        ctx.stroke();

        // Saturn-style tilted luminous ring for critical priority
        if (p.hasRing) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(-0.42);
          ctx.strokeStyle = p.isDone ? 'rgba(253, 224, 71, 0.7)' : 'rgba(125, 211, 252, 0.6)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.radius * 1.8, p.radius * 0.55, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Orbiting Micro-Moon Satellite
        if (p.hasMoon) {
          const moonA = t * 1.15 + p.angle;
          const mx = p.x + Math.cos(moonA) * (p.radius + 9);
          const my = p.y + Math.sin(moonA) * (p.radius + 9);
          ctx.fillStyle = p.isDone ? '#fde68a' : '#7dd3fc';
          ctx.beginPath();
          ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Outer Wilds Rotating Target Reticle Brackets on Selected / Hovered / Focus Node
        if (isSelected || isHovered || isFocused) {
          const bracketR = p.radius + 8 + (isSelected ? Math.sin(t * 4) * 2 : 0);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(isSelected ? t * 0.45 : 0);
          ctx.strokeStyle = isSelected ? '#fbbf24' : '#38bdf8';
          ctx.lineWidth = 2;
          const arcSpan = Math.PI * 0.28;
          for (let q = 0; q < 4; q++) {
            const startA = q * (Math.PI / 2) - arcSpan / 2;
            ctx.beginPath();
            ctx.arc(0, 0, bracketR, startA, startA + arcSpan);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Readable Label Pill (zoom-compensated so titles stay crisp at overview scale)
        const showLabel =
          isSelected ||
          isHovered ||
          isFocused ||
          p.isReady ||
          p.isDone ||
          cam.scale >= 0.48;

        if (showLabel) {
          const rawTitle = p.task.title;
          const shortTitle = rawTitle.length > 14 ? `${rawTitle.slice(0, 14)}…` : rawTitle;
          const labelScale = Math.min(1.55, Math.max(0.95, 0.78 / Math.max(0.38, cam.scale)));
          ctx.save();
          ctx.translate(p.x, p.y + p.radius + 9);
          ctx.scale(labelScale, labelScale);
          ctx.font = `${isSelected || isHovered ? '700' : '600'} 10.5px "Plus Jakarta Sans", sans-serif`;
          const textW = ctx.measureText(shortTitle).width;
          const pillW = textW + 14;
          const pillH = 20;
          const pillX = -pillW / 2;
          const pillY = 0;

          drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 6);
          ctx.fillStyle = isSelected
            ? 'rgba(24, 24, 27, 0.96)'
            : 'rgba(9, 9, 11, 0.84)';
          ctx.fill();
          ctx.strokeStyle = isSelected
            ? 'rgba(251, 191, 36, 0.9)'
            : p.isDone
              ? 'rgba(245, 158, 11, 0.42)'
              : p.isReady
                ? 'rgba(56, 189, 248, 0.5)'
                : 'rgba(63, 63, 70, 0.55)';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = isSelected
            ? '#fde68a'
            : p.isDone
              ? '#fcd34d'
              : p.isReady
                ? '#e0f2fe'
                : '#a1a1aa';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(shortTitle, 0, pillH / 2 + 0.5);
          ctx.restore();
        }

        ctx.restore();
      }

      ctx.restore();
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [planets, orbitRadii, activeEdges, planetMap, stars, projectName, selectedPlanetId, hoveredPlanetId, focusTaskId, highlightedIds, isWarping]);

  // Coordinate hit-test helper
  const screenToWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { wx: 0, wy: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = clientX - rect.left - rect.width * 0.5;
    const sy = clientY - rect.top - rect.height * 0.5;
    const cam = cameraRef.current;
    return {
      wx: sx / cam.scale + cam.x,
      wy: sy / cam.scale + cam.y,
    };
  };

  const findPlanetAt = (clientX: number, clientY: number): OrbitPlanet | null => {
    const { wx, wy } = screenToWorld(clientX, clientY);
    const hitPad = Math.max(12, 16 / Math.max(0.4, cameraRef.current.scale));
    let closest: OrbitPlanet | null = null;
    let bestD = Infinity;
    for (const p of planets) {
      const d = Math.hypot(wx - p.x, wy - p.y);
      if (d <= p.radius + hitPad && d < bestD) {
        bestD = d;
        closest = p;
      }
    }
    return closest;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraRef.current;
      const factor = e.deltaY < 0 ? 1.14 : 0.88;
      const nextScale = Math.max(0.24, Math.min(2.6, cam.targetScale * factor));
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left - rect.width * 0.5;
      const sy = e.clientY - rect.top - rect.height * 0.5;
      cam.targetX += sx * (1 / cam.targetScale - 1 / nextScale);
      cam.targetY += sy * (1 / cam.targetScale - 1 / nextScale);
      cam.targetScale = nextScale;
      setZoomPercent(Math.round(nextScale * 100));
    };
    canvas.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onNativeWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    gestureRef.current.isDragging = true;
    gestureRef.current.startX = e.clientX;
    gestureRef.current.startY = e.clientY;
    gestureRef.current.camStartX = cameraRef.current.targetX;
    gestureRef.current.camStartY = cameraRef.current.targetY;
    gestureRef.current.movedDistance = 0;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const g = gestureRef.current;
    if (g.isDragging) {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      g.movedDistance = Math.hypot(dx, dy);
      const cam = cameraRef.current;
      cam.targetX = g.camStartX - dx / cam.scale;
      cam.targetY = g.camStartY - dy / cam.scale;
      return;
    }
    const hit = findPlanetAt(e.clientX, e.clientY);
    setHoveredPlanetId(hit?.id ?? null);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const wasClick = gestureRef.current.movedDistance < 6;
    gestureRef.current.isDragging = false;
    if (!wasClick) return;
    const hit = findPlanetAt(e.clientX, e.clientY);
    if (hit) {
      setSelectedPlanetId(hit.id);
    } else {
      setSelectedPlanetId(null);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = findPlanetAt(e.clientX, e.clientY);
    if (hit) {
      triggerWarpToBranch(hit.id);
    }
  };

  // Touch pan & two-finger pinch zoom
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const g = gestureRef.current;
    if (e.touches.length === 1) {
      g.isDragging = true;
      g.pinchStartDist = null;
      g.startX = e.touches[0].clientX;
      g.startY = e.touches[0].clientY;
      g.camStartX = cameraRef.current.targetX;
      g.camStartY = cameraRef.current.targetY;
      g.movedDistance = 0;
    } else if (e.touches.length === 2) {
      g.isDragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      g.pinchStartDist = Math.hypot(dx, dy);
      g.pinchStartScale = cameraRef.current.targetScale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const g = gestureRef.current;
    if (e.touches.length === 1 && g.isDragging) {
      const dx = e.touches[0].clientX - g.startX;
      const dy = e.touches[0].clientY - g.startY;
      g.movedDistance = Math.hypot(dx, dy);
      const cam = cameraRef.current;
      cam.targetX = g.camStartX - dx / cam.scale;
      cam.targetY = g.camStartY - dy / cam.scale;
    } else if (e.touches.length === 2 && g.pinchStartDist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const nextScale = Math.max(0.24, Math.min(2.6, g.pinchStartScale * (dist / g.pinchStartDist)));
      cameraRef.current.targetScale = nextScale;
      setZoomPercent(Math.round(nextScale * 100));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const g = gestureRef.current;
    if (e.changedTouches.length === 1 && g.isDragging && g.movedDistance < 10) {
      const touch = e.changedTouches[0];
      const hit = findPlanetAt(touch.clientX, touch.clientY);
      setSelectedPlanetId(hit?.id ?? null);
    }
    if (e.touches.length === 0) {
      g.isDragging = false;
      g.pinchStartDist = null;
    }
  };

  const selectedPlanet = selectedPlanetId ? planetMap.get(selectedPlanetId) ?? null : null;
  const masteredCount = planets.filter((p) => p.isDone).length;
  const frontierCount = planets.filter((p) => !p.isDone && p.isReady).length;

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-[#060609] select-none">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'none' }}
        className={`w-full h-full block ${hoveredPlanetId ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
      />

      {/* Warp Vignette Flash Overlay */}
      {isWarping && (
        <div
          className="pointer-events-none absolute inset-0 z-30 animate-fadeIn"
          style={{
            background:
              'radial-gradient(circle at center, rgba(251,191,36,0.35) 0%, rgba(56,189,248,0.18) 45%, rgba(9,9,11,0.92) 85%)',
          }}
        />
      )}

      {/* Outer Wilds Telemetry Header Readout (bottom-top left below toolbar) */}
      <div className="pointer-events-none absolute top-16 left-3 sm:left-4 z-10 hidden sm:flex flex-col gap-1 bg-zinc-950/70 border border-amber-500/20 px-3 py-2 rounded-xl backdrop-blur-md font-mono text-[10px] text-zinc-400">
        <div className="flex items-center gap-2 text-amber-300 font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
          <span>SHIP LOG // {graphName || 'SOLAR OBSERVATORY'}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>星体 {planets.length}</span>
          <span className="text-amber-300">已点亮 {masteredCount}</span>
          <span className="text-sky-300">可跃迁 {frontierCount}</span>
          <span>ZOOM {zoomPercent}%</span>
        </div>
      </div>

      {/* Camera Control Cluster */}
      <div className="absolute bottom-20 md:bottom-4 right-3 sm:right-4 z-10 flex flex-col gap-1.5 bg-zinc-900/85 border border-zinc-800 p-1.5 rounded-2xl backdrop-blur-xl shadow-2xl">
        <button
          type="button"
          onClick={() => {
            cameraRef.current.targetScale = Math.min(2.6, cameraRef.current.targetScale * 1.25);
            setZoomPercent(Math.round(cameraRef.current.targetScale * 100));
          }}
          className="w-8 h-8 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-zinc-200 hover:text-amber-300 font-black text-sm flex items-center justify-center transition-colors"
          title="放大星图"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            cameraRef.current.targetScale = Math.max(0.24, cameraRef.current.targetScale * 0.8);
            setZoomPercent(Math.round(cameraRef.current.targetScale * 100));
          }}
          className="w-8 h-8 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-zinc-200 hover:text-amber-300 font-black text-sm flex items-center justify-center transition-colors"
          title="缩小星图"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => fitSolarSystem(false)}
          className="w-8 h-8 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-amber-300 font-bold text-xs flex items-center justify-center transition-colors"
          title="全局复位全景视野"
        >
          ⌖
        </button>
        {focusTaskId && planetMap.has(focusTaskId) && (
          <button
            type="button"
            onClick={() => focusCameraOnPlanet(focusTaskId, 1.1)}
            className="w-8 h-8 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center justify-center transition-colors"
            title="定位当前聚焦星体"
          >
            🎯
          </button>
        )}
      </div>

      {/* Empty Solar Prompt */}
      {planets.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-4">
          <div className="pointer-events-auto text-center bg-zinc-950/85 border border-amber-500/30 px-6 py-5 rounded-2xl backdrop-blur-xl shadow-2xl">
            <p className="text-sm font-black text-amber-200 mb-1">星图宇宙尚未点亮任何星体</p>
            <p className="text-xs text-zinc-400 mb-3">挂载知识模块后即可生成太阳系星图与轨道航线</p>
            <button
              type="button"
              onClick={onOpenAddNode}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 text-xs font-black inline-flex items-center gap-1.5"
            >
              <IconPlus className="w-3.5 h-3.5" />
              <span>添加知识星体</span>
            </button>
          </div>
        </div>
      )}

      {/* Selected Planet Telemetry Inspector (Outer Wilds Ship Log Card) */}
      {selectedPlanet && (
        <div className="fixed bottom-20 left-3 right-3 md:absolute md:bottom-4 md:left-4 md:right-auto md:w-88 max-w-md z-20 leather-card border-amber-500/40 rounded-2xl p-4 backdrop-blur-2xl shadow-2xl animate-sheet-mobile">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] font-black px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-amber-400">
                ORBIT-0{selectedPlanet.layer + 1}
              </span>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                  selectedPlanet.isDone
                    ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
                    : selectedPlanet.isReady
                      ? 'bg-sky-500/20 text-sky-300 border-sky-400/40'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                {selectedPlanet.isDone ? '🌟 已点亮掌握' : selectedPlanet.isReady ? '🚀 可立即跃迁攻克' : '🔒 待前置点亮'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPlanetId(null)}
              className="w-6 h-6 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 flex items-center justify-center"
            >
              <IconClose className="w-3.5 h-3.5" />
            </button>
          </div>

          <h3 className="text-sm sm:text-base font-black text-zinc-100 leading-snug mb-2">
            {selectedPlanet.task.title}
          </h3>

          {/* Upstream & Downstream Mini Links */}
          <div className="space-y-1.5 mb-3.5 text-[11px]">
            {selectedPlanet.upstreamIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-zinc-500 font-bold">前置:</span>
                {selectedPlanet.upstreamIds.slice(0, 3).map((uid) => {
                  const ut = taskMap.get(uid);
                  if (!ut) return null;
                  return (
                    <button
                      key={uid}
                      type="button"
                      onClick={() => focusCameraOnPlanet(uid, 1.0)}
                      className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-amber-300 truncate max-w-[140px]"
                    >
                      {ut.status === 'done' ? '✅' : '⏳'} {ut.title}
                    </button>
                  );
                })}
              </div>
            )}
            {selectedPlanet.downstreamIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-zinc-500 font-bold">解锁分支:</span>
                {selectedPlanet.downstreamIds.slice(0, 3).map((did) => {
                  const dt = taskMap.get(did);
                  if (!dt) return null;
                  return (
                    <button
                      key={did}
                      type="button"
                      onClick={() => focusCameraOnPlanet(did, 1.0)}
                      className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-sky-300 hover:text-amber-300 truncate max-w-[140px]"
                    >
                      → {dt.title}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => triggerWarpToBranch(selectedPlanet.id)}
              className="btn-shimmer-gold flex-1 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 text-zinc-950 font-black text-xs shadow-lg shadow-amber-500/25 active:scale-95 transition-all flex items-center justify-center gap-1.5"
            >
              <span>🚀</span>
              <span>跃迁至该分岔</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenCockpit(selectedPlanet.id)}
              className="px-3 py-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 border border-amber-500/35 text-amber-300 font-bold text-xs active:scale-95 transition-all flex items-center gap-1"
            >
              <IconSparkles className="w-3.5 h-3.5" />
              <span>精讲</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
