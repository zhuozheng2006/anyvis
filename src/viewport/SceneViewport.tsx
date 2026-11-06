import { Component, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ErrorInfo, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { Edges, Grid, Html, Line, OrbitControls } from '@react-three/drei';
import { ArrowHelper, Vector3 } from 'three';
import { Crosshair, Move, MousePointer2, Rotate3D } from 'lucide-react';
import type { Evaluation, Project, SceneObject } from '../core/types';
import { evaluateExpression } from '../core/engine';
import './viewport.css';

export interface SceneViewportProps {
  project: Project;
  evaluation: Evaluation;
  time: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onObjectChange?: (id: string, patch: Partial<SceneObject>) => void;
  presentation?: boolean;
}

const WIDTH = 1000;
const HEIGHT = 480;
const UNIT = 70;
const ORIGIN = { x: 250, y: 245 };
const px = (x: number) => ORIGIN.x + x * UNIT;
const py = (y: number) => ORIGIN.y - y * UNIT;
const pretty = (n: number) => Math.abs(n) < 0.0005 ? '0.00' : n.toFixed(2);

function sampleCurve(object: SceneObject, parameters: Record<string, number>, time: number) {
  const points: [number, number, number][] = [];
  let error: string | null = null;
  for (let i = 0; i <= 160; i++) {
    const x = i / 160 * Math.PI * 2;
    try {
      const y = evaluateExpression(object.expression || 'sin(x)', { ...parameters, t: time, x });
      if (!Number.isFinite(y) || Math.abs(y) > 10000) { points.push([NaN, NaN, NaN]); continue; }
      const sx = x * object.scale;
      const sy = y * object.scale;
      points.push([
        object.x + sx * Math.cos(object.rotation) - sy * Math.sin(object.rotation),
        object.y + sx * Math.sin(object.rotation) + sy * Math.cos(object.rotation),
        object.z,
      ]);
    } catch (e) {
      error = e instanceof Error ? e.message : '曲线表达式无效';
      break;
    }
  }
  return { points, error };
}

function SvgViewport({ project, evaluation, time, selectedId, onSelect, onObjectChange, presentation }: SceneViewportProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; pointerId: number; start: { x: number; y: number }; object: SceneObject; moved: boolean } | null>(null);
  const [hint, setHint] = useState('');
  const curves = useMemo(() => new Map(evaluation.objects.filter(o => o.visible && o.kind === 'curve').map(o => [o.id, sampleCurve(o, evaluation.parameters, time)])), [evaluation, time]);
  const curveErrors = [...curves].filter(([, result]) => result.error);
  const selection = evaluation.objects.find(o => o.id === selectedId);

  function worldPoint(event: ReactPointerEvent<SVGSVGElement | SVGGElement>) {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: (point.x - ORIGIN.x) / UNIT, y: (ORIGIN.y - point.y) / UNIT };
  }

  function beginDrag(event: ReactPointerEvent<SVGGElement>, object: SceneObject) {
    event.stopPropagation();
    onSelect(object.id);
    if (presentation || !onObjectChange) return;
    const linked = project.nodes.some(node => node.kind === 'binding' && node.objectId === object.id && (node.property === 'x' || node.property === 'y'));
    if (linked) { setHint('位置由节点驱动 · 可在节点图中修改关系'); return; }
    setHint('拖动以调整位置');
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: object.id, pointerId: event.pointerId, start: worldPoint(event), object, moved: false };
  }

  function moveDrag(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !onObjectChange) return;
    const point = worldPoint(event);
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.015) drag.moved = true;
    if (drag.moved) onObjectChange(drag.id, { x: Math.round((drag.object.x + dx) * 100) / 100, y: Math.round((drag.object.y + dy) * 100) / 100 });
  }

  function finishDrag() { dragRef.current = null; }

  return <div className="av-svg-shell">
    <svg ref={svgRef} className="av-scene-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-label="二维实时场景" role="img" onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onPointerDown={() => { onSelect(null); setHint(''); }}>
      <defs>
        <pattern id="av-minor-grid" x={ORIGIN.x % (UNIT / 2)} y={ORIGIN.y % (UNIT / 2)} width={UNIT / 2} height={UNIT / 2} patternUnits="userSpaceOnUse"><path d={`M ${UNIT / 2} 0 L 0 0 0 ${UNIT / 2}`} fill="none" stroke="#222933" strokeWidth=".65" /></pattern>
        <pattern id="av-major-grid" x={ORIGIN.x % UNIT} y={ORIGIN.y % UNIT} width={UNIT} height={UNIT} patternUnits="userSpaceOnUse"><rect width={UNIT} height={UNIT} fill="url(#av-minor-grid)"/><path d={`M ${UNIT} 0 L 0 0 0 ${UNIT}`} fill="none" stroke="#303945" strokeWidth=".75"/></pattern>
        <radialGradient id="av-stage-light"><stop offset="0" stopColor="#1c2530" stopOpacity=".35"/><stop offset="1" stopColor="#11161e" stopOpacity="0"/></radialGradient>
      </defs>
      <rect width={WIDTH} height={HEIGHT} fill="#11161d"/>
      <rect width={WIDTH} height={HEIGHT} fill="url(#av-major-grid)"/>
      <rect width={WIDTH} height={HEIGHT} fill="url(#av-stage-light)"/>
      <line x1="25" x2={WIDTH - 25} y1={ORIGIN.y} y2={ORIGIN.y} stroke="#56616f" strokeWidth="1"/>
      <line x1={ORIGIN.x} x2={ORIGIN.x} y1="45" y2={HEIGHT - 30} stroke="#56616f" strokeWidth="1"/>
      <path d={`M ${WIDTH - 31} ${ORIGIN.y - 4} l 6 4 -6 4 M ${ORIGIN.x - 4} 51 l 4 -6 4 6`} stroke="#697686" fill="none"/>
      <text x={WIDTH - 29} y={ORIGIN.y - 12} className="av-axis-letter">x</text><text x={ORIGIN.x + 12} y="51" className="av-axis-letter">y</text>
      {Array.from({ length: 13 }, (_, i) => i - 3).map(x => <g key={`x${x}`}><line x1={px(x)} x2={px(x)} y1={ORIGIN.y - 3} y2={ORIGIN.y + 3} stroke="#637080"/><text x={px(x) + (x === 0 ? -10 : 0)} y={ORIGIN.y + 19} textAnchor="middle" className="av-tick">{x}</text></g>)}
      {[-2, -1, 1, 2].map(y => <g key={`y${y}`}><line x1={ORIGIN.x - 3} x2={ORIGIN.x + 3} y1={py(y)} y2={py(y)} stroke="#637080"/><text x={ORIGIN.x - 12} y={py(y) + 4} textAnchor="end" className="av-tick">{y}</text></g>)}
      {evaluation.objects.filter(o => o.visible).map(object => {
        const selected = object.id === selectedId;
        const r = Math.max(.01, Math.abs(object.scale));
        const x = px(object.x), y = py(object.y);
        const common = { stroke: object.color, strokeWidth: selected ? 3 : 2.2, fill: 'none', vectorEffect: 'non-scaling-stroke' as const };
        let content: ReactNode;
        if (object.kind === 'circle' || object.kind === 'sphere') {
          content = <><circle cx={x} cy={y} r={r * UNIT} {...common} fill={object.color} fillOpacity=".045"/><circle cx={x} cy={y} r={r * UNIT} stroke="transparent" strokeWidth="16" fill="none"/>{object.kind === 'sphere' && <ellipse cx={x} cy={y} rx={r * UNIT} ry={r * UNIT * .3} {...common} strokeOpacity=".45"/>}</>;
        } else if (object.kind === 'point') {
          content = <><circle cx={x} cy={y} r={selected ? 15 : 11} fill={object.color} opacity=".12"/><circle cx={x} cy={y} r={Math.max(4.5, Math.min(10, 6 * r))} fill={object.color} stroke="#11161d" strokeWidth="2"/><circle cx={x} cy={y} r="16" fill="transparent"/></>;
        } else if (object.kind === 'vector') {
          const ex = px((object.x * Math.cos(object.rotation) - object.y * Math.sin(object.rotation)) * object.scale);
          const ey = py((object.x * Math.sin(object.rotation) + object.y * Math.cos(object.rotation)) * object.scale);
          const angle = Math.atan2(ey - ORIGIN.y, ex - ORIGIN.x);
          const length = Math.hypot(ex - ORIGIN.x, ey - ORIGIN.y);
          const head = Math.min(11, length / 3);
          content = <><line x1={ORIGIN.x} y1={ORIGIN.y} x2={ex} y2={ey} {...common}/><path d={`M ${ex - head * Math.cos(angle - .45)} ${ey - head * Math.sin(angle - .45)} L ${ex} ${ey} L ${ex - head * Math.cos(angle + .45)} ${ey - head * Math.sin(angle + .45)}`} {...common} strokeLinejoin="round"/><line x1={ORIGIN.x} y1={ORIGIN.y} x2={ex} y2={ey} stroke="transparent" strokeWidth="16"/></>;
        } else if (object.kind === 'curve') {
          let open = false;
          const path = (curves.get(object.id)?.points || []).map(([cx, cy]) => {
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) { open = false; return ''; }
            const command = open ? 'L' : 'M'; open = true;
            return `${command} ${px(cx).toFixed(2)} ${py(cy).toFixed(2)}`;
          }).join(' ');
          content = <><path d={path} {...common} strokeLinecap="round" strokeLinejoin="round"/><path d={path} stroke="transparent" strokeWidth="16" fill="none"/></>;
        } else {
          content = <rect x={x - r * UNIT / 2} y={y - r * UNIT / 2} width={r * UNIT} height={r * UNIT} rx="2" transform={`rotate(${-object.rotation * 180 / Math.PI} ${x} ${y})`} {...common} fill={object.color} fillOpacity=".15"/>;
        }
        return <g key={object.id} className={`av-scene-object ${selected ? 'is-selected' : ''}`} role="button" tabIndex={0} aria-label={object.name} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(object.id); } }} onPointerDown={event => beginDrag(event, object)} style={{ cursor: presentation ? 'pointer' : 'move' }}>
          {content}
          {selected && object.kind !== 'curve' && <text x={x + 15} y={y - 17} fill={object.color} className="av-object-label" paintOrder="stroke" stroke="#11161d" strokeWidth="4">{object.name}</text>}
        </g>;
      })}
      {evaluation.objects.filter(o => o.visible && o.kind === 'curve').map(object => <g key={`label-${object.id}`}><rect x={px(object.x) - 7} y="65" width={Math.min(425, 90 + (object.expression?.length || 6) * 7)} height="31" rx="6" fill="#131a23" stroke="#303946"/><circle cx={px(object.x) + 6} cy="80" r="3" fill={object.color}/><text x={px(object.x) + 17} y="85" className="av-formula" fill={object.color}>y = {object.expression || 'sin(x)'}</text></g>)}
    </svg>
    <div className="av-viewport-meta"><span className="av-viewport-badge"><span/> 实时预览</span><span>正交视图 · 2D</span></div>
    <div className="av-viewport-bottom"><span><MousePointer2 size={12}/>{hint || (presentation ? '选择参数，观察关联对象的变化' : '点选对象 · 拖动未绑定的位置')}</span>{selection && <span className="av-coordinate-readout">x {pretty(selection.x)} <i/> y {pretty(selection.y)}</span>}</div>
    {curveErrors.length > 0 && <div className="av-viewport-warning" role="alert">{curveErrors.map(([id, result]) => `${evaluation.objects.find(o => o.id === id)?.name}: ${result.error}`).join('；')}</div>}
  </div>;
}

class WebGLErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.warn('AnyVis WebGL preview could not start', error.message, info.componentStack); }
  render() { return this.state.error ? <div className="av-webgl-fallback"><Rotate3D size={32}/><strong>三维预览暂时无法启动</strong><span>请使用支持 WebGL 的浏览器，或切换到二维场景。</span></div> : this.props.children; }
}

function Vector3D({ object, onSelect }: { object: SceneObject; onSelect: (id: string) => void }) {
  const arrow = useMemo(() => new ArrowHelper(new Vector3(1, 0, 0), new Vector3(0, 0, 0), 1, object.color), []);
  useLayoutEffect(() => {
    const direction = new Vector3(object.x, object.y, object.z).multiplyScalar(object.scale).applyAxisAngle(new Vector3(0, 0, 1), object.rotation);
    const length = direction.length();
    arrow.setDirection(length > 0 ? direction.normalize() : new Vector3(1, 0, 0));
    arrow.setLength(Math.max(length, .001), Math.min(.25, length / 3), Math.min(.12, length / 6));
    arrow.setColor(object.color);
  }, [arrow, object.x, object.y, object.z, object.scale, object.rotation, object.color]);
  useEffect(() => () => arrow.dispose(), [arrow]);
  return <group onClick={event => { event.stopPropagation(); onSelect(object.id); }}><primitive object={arrow}/></group>;
}

function Object3D({ object, selected, parameters, time, onSelect }: { object: SceneObject; selected: boolean; parameters: Record<string, number>; time: number; onSelect: (id: string) => void }) {
  const r = Math.max(.01, Math.abs(object.scale));
  const curve = useMemo(() => object.kind === 'curve' ? sampleCurve(object, parameters, time) : null, [object, parameters, time]);
  const circle = useMemo(() => Array.from({ length: 97 }, (_, i) => [Math.cos(i / 96 * Math.PI * 2) * r, Math.sin(i / 96 * Math.PI * 2) * r, 0] as [number, number, number]), [r]);
  if (object.kind === 'vector') return <Vector3D object={object} onSelect={onSelect}/>;
  if (object.kind === 'curve') {
    const points = curve?.points.filter(p => p.every(Number.isFinite)) || [];
    return points.length > 1 ? <Line points={points} color={object.color} lineWidth={selected ? 3 : 2} onClick={event => { event.stopPropagation(); onSelect(object.id); }}/> : null;
  }
  return <group position={[object.x, object.y, object.z]} rotation={[object.kind === 'cube' ? object.rotation * .3 : 0, object.kind === 'cube' ? object.rotation : 0, object.kind === 'cube' ? 0 : object.rotation]} onClick={event => { event.stopPropagation(); onSelect(object.id); }}>
    {object.kind === 'circle' ? <Line points={circle} color={object.color} lineWidth={selected ? 3 : 2}/> : <mesh castShadow receiveShadow>
      {object.kind === 'cube' ? <boxGeometry args={[r, r, r]}/> : <sphereGeometry args={[object.kind === 'point' ? r * .1 : r, 32, 24]}/>}
      <meshStandardMaterial color={object.color} metalness={.22} roughness={.32}/>
      {selected && <Edges color="#e1f1ff" threshold={15}/>}
    </mesh>}
    {selected && <Html position={[0, (object.kind === 'cube' ? r / 2 : r) + .25, 0]} center className="av-3d-object-label"><span>{object.name}</span></Html>}
  </group>;
}

function ThreeViewport({ evaluation, time, selectedId, onSelect }: SceneViewportProps) {
  return <div className="av-three-shell">
    <WebGLErrorBoundary>
      <Canvas camera={{ position: [7, 5, 8], fov: 42, near: .1, far: 100 }} dpr={[1, 2]} frameloop="demand" shadows gl={{ antialias: true, alpha: false }} onPointerMissed={() => onSelect(null)} fallback={<div className="av-webgl-fallback">此浏览器不支持 WebGL 三维预览。</div>}>
        <color attach="background" args={['#11161d']}/>
        <ambientLight intensity={.7}/>
        <hemisphereLight args={['#dae8ff', '#1d283a', 1]}/>
        <directionalLight position={[5, 8, 5]} intensity={2.3} castShadow shadow-mapSize={[1024, 1024]}/>
        <directionalLight position={[-6, 3, -4]} intensity={1.3} color="#9f9cff"/>
        <Grid position={[0, -1.51, 0]} args={[20, 20]} cellSize={1} cellThickness={.6} cellColor="#303c4a" sectionSize={5} sectionThickness={.8} sectionColor="#526071" fadeDistance={32} fadeStrength={1.8} infiniteGrid/>
        <axesHelper args={[3]}/>
        {evaluation.objects.filter(o => o.visible).map(object => <Object3D key={object.id} object={object} selected={object.id === selectedId} parameters={evaluation.parameters} time={time} onSelect={onSelect}/>)}
        <OrbitControls makeDefault enableDamping dampingFactor={.1} minDistance={2} maxDistance={30} target={[0, 0, 0]}/>
      </Canvas>
    </WebGLErrorBoundary>
    <div className="av-viewport-meta"><span className="av-viewport-badge"><span/> 实时预览</span><span>透视视图 · 3D</span></div>
    <div className="av-viewport-bottom"><span><Rotate3D size={13}/>拖动旋转 · 滚轮缩放 · 右键平移</span><span className="av-3d-axes"><b>X</b><b>Y</b><b>Z</b></span></div>
  </div>;
}

export default function SceneViewport(props: SceneViewportProps) {
  return <div className={`av-scene-viewport ${props.presentation ? 'av-scene-presentation' : ''}`}>
    {props.project.dimension === '2d' ? <SvgViewport {...props}/> : <ThreeViewport {...props}/>}
    {!props.evaluation.objects.some(o => o.visible) && <div className="av-scene-empty"><Crosshair size={30}/><strong>从一个对象开始</strong><span>添加图形，再用参数和节点建立关系。</span></div>}
    {!props.presentation && <div className="av-viewport-corner"><Move size={12}/><span>{props.evaluation.objects.filter(o => o.visible).length} 个可见对象</span></div>}
  </div>;
}
