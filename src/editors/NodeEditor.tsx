import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, Handle, Position, useEdgesState, useNodesState,
  type Connection, type Edge, type Node, type NodeProps,
} from '@xyflow/react';
import { Clock3, GitBranch, SlidersHorizontal, Variable, X, Waypoints, LayoutGrid } from 'lucide-react';
import type { BindingProperty, GraphEdge, GraphNode, Parameter, Project, SceneObject } from '../core/types';
import '@xyflow/react/dist/style.css';
import './editors.css';

interface Props { project: Project; onChange: (project: Project) => void; values?: Record<string, number> }
interface NodeData extends Record<string, unknown> {
  item: GraphNode;
  parameters: Parameter[];
  objects: SceneObject[];
  value?: number;
  patch: (id: string, patch: Partial<GraphNode>) => void;
  remove: (id: string) => void;
}
type FlowNode = Node<NodeData>;
const labels = { parameter: '参数', time: '时间', formula: '公式', binding: '属性绑定' };
const icons = { parameter: SlidersHorizontal, time: Clock3, formula: Variable, binding: Waypoints };

function DataNode({ data, selected }: NodeProps<FlowNode>) {
  const { item, parameters, objects, value, patch, remove } = data;
  const Icon = icons[item.kind];
  return <div className={`av-node av-node-${item.kind}${selected ? ' av-node-selected' : ''}`}>
    <div className="av-node-heading"><Icon size={12} /><span>{labels[item.kind]}</span><button className="nodrag av-node-delete" title="删除节点" aria-label={`删除节点 ${item.label}`} onClick={() => remove(item.id)}><X size={12} /></button></div>
    <input className="nodrag av-node-name" aria-label="节点名称" maxLength={120} value={item.label} onChange={e => patch(item.id, { label: e.target.value })} onBlur={e => { if (!e.target.value.trim()) patch(item.id, { label: labels[item.kind] }); }} />
    {item.kind === 'parameter' && <select className="nodrag" aria-label="来源参数" value={item.parameterId ?? ''} onChange={e => patch(item.id, { parameterId: e.target.value })}>
      {!parameters.length && <option value="">请先添加参数</option>}{parameters.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>}
    {item.kind === 'time' && <div className="av-node-description">播放时间 · 秒</div>}
    {item.kind === 'formula' && <>
      <input className="nodrag av-node-expression" aria-label="公式表达式" maxLength={240} value={item.expression ?? ''} onChange={e => patch(item.id, { expression: e.target.value })} onBlur={e => { if (!e.target.value.trim()) patch(item.id, { expression: 'a' }); }} placeholder="sin(a) * b" spellCheck={false} />
      <div className="av-node-description">连接 a、b · 支持 t 和参数名</div>
    </>}
    {item.kind === 'binding' && <div className="av-node-binding">
      <select className="nodrag" aria-label="绑定对象" value={item.objectId ?? ''} onChange={e => patch(item.id, { objectId: e.target.value })}>{!objects.length && <option value="">请先添加对象</option>}{objects.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      <select className="nodrag" aria-label="绑定属性" value={item.property ?? 'x'} onChange={e => patch(item.id, { property: e.target.value as BindingProperty })}>
        <option value="x">位置 X</option><option value="y">位置 Y</option><option value="z">位置 Z</option><option value="scale">缩放</option><option value="rotation">旋转</option>
      </select>
    </div>}
    <div className="av-node-value">{value !== undefined && Number.isFinite(value) ? value.toFixed(3) : '—'}<span>{item.kind === 'binding' ? '应用值' : '输出'}</span></div>
    {(item.kind === 'formula' || item.kind === 'binding') && <><Handle type="target" position={Position.Left} id="a" style={{ top: 51 }} /><span className="av-port-label av-port-a">a</span></>}
    {item.kind === 'formula' && <><Handle type="target" position={Position.Left} id="b" style={{ top: 83 }} /><span className="av-port-label av-port-b">b</span></>}
    {item.kind !== 'binding' && <Handle type="source" position={Position.Right} id="out" style={{ top: 51 }} />}
  </div>;
}
const nodeTypes = { dataNode: DataNode };
const EMPTY_VALUES: Record<string, number> = {};

/** Reject a connection when the destination can already reach its source. */
export function createsGraphCycle(edges: GraphEdge[], source: string, target: string): boolean {
  const stack = [target];
  const visited = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === source) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    edges.forEach(edge => { if (edge.source === current) stack.push(edge.target); });
  }
  return false;
}

export function NodeEditor({ project, onChange, values = EMPTY_VALUES }: Props) {
  const current = useRef({ project, onChange });
  current.current = { project, onChange };
  const [notice, setNotice] = useState('连接输出端口到 a / b，让对象随参数自动变化。');
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const patch = useCallback((id: string, fields: Partial<GraphNode>) => {
    const { project: p, onChange: change } = current.current;
    change({ ...p, nodes: p.nodes.map(n => n.id === id ? { ...n, ...fields } : n) });
  }, []);
  const remove = useCallback((id: string) => {
    const { project: p, onChange: change } = current.current;
    change({ ...p, nodes: p.nodes.filter(n => n.id !== id), edges: p.edges.filter(e => e.source !== id && e.target !== id) });
  }, []);
  useEffect(() => {
    setNodes(previous => project.nodes.map(item => ({
      id: item.id, type: 'dataNode', position: item.position,
      selected: previous.find(n => n.id === item.id)?.selected ?? false,
      data: { item, parameters: project.parameters, objects: project.objects, patch, remove },
    })));
  }, [project.nodes, project.parameters, project.objects, patch, remove, setNodes]);
  useEffect(() => {
    setNodes(previous => previous.map(n => ({ ...n, data: { ...n.data, value: values[n.id] } })));
  }, [values, setNodes]);
  useEffect(() => {
    setEdges(project.edges.map(edge => ({ ...edge, sourceHandle: 'out', targetHandle: edge.input, type: 'smoothstep', animated: false, style: { stroke: '#8ba36f', strokeWidth: 1.5 } })));
  }, [project.edges, setEdges]);
  const connect = useCallback((connection: Connection) => {
    const { project: p, onChange: change } = current.current;
    const { source, target } = connection;
    const input = connection.targetHandle === 'b' ? 'b' : 'a';
    const sourceNode = p.nodes.find(n => n.id === source);
    const targetNode = p.nodes.find(n => n.id === target);
    if (!sourceNode || !targetNode || sourceNode.kind === 'binding' || !['formula', 'binding'].includes(targetNode.kind)) return;
    const remaining = p.edges.filter(e => !(e.target === target && e.input === input));
    if (createsGraphCycle(remaining, source, target)) {
      setNotice('无法连接：这会形成循环依赖。请保持数据从输入流向输出。');
      return;
    }
    const edge: GraphEdge = { id: crypto.randomUUID(), source, target, input };
    change({ ...p, edges: [...remaining, edge] });
    setNotice('已连接。画面与节点数值会实时更新。');
  }, []);
  function add(kind: GraphNode['kind']) {
    if (project.nodes.length >= 100) { setNotice('当前原型最多支持 100 个节点。'); return; }
    if (kind === 'parameter' && !project.parameters.length) { setNotice('请先在参数面板添加一个参数。'); return; }
    if (kind === 'binding' && !project.objects.length) { setNotice('请先在场景中添加一个对象。'); return; }
    const node: GraphNode = {
      id: crypto.randomUUID(), kind, label: labels[kind],
      position: { x: 40 + (project.nodes.length % 4) * 210, y: 50 + Math.floor(project.nodes.length / 4) * 175 },
      ...(kind === 'parameter' ? { parameterId: project.parameters[0]?.id } : {}),
      ...(kind === 'formula' ? { expression: 'a * b' } : {}),
      ...(kind === 'binding' ? { objectId: project.objects[0]?.id, property: 'x' as const } : {}),
    };
    onChange({ ...project, nodes: [...project.nodes, node] });
    setNotice('已添加节点。拖动端口连接数据，选中节点后可按 Delete 删除。');
  }
  function arrange() {
    const levels = new Map(project.nodes.map(n => [n.id, 0]));
    for (let i = 0; i < project.nodes.length; i++) {
      let changed = false;
      for (const e of project.edges) {
        const next = Math.min(project.nodes.length, (levels.get(e.source) ?? 0) + 1);
        if ((levels.get(e.target) ?? 0) < next) { levels.set(e.target, next); changed = true; }
      }
      if (!changed) break;
    }
    const rows = new Map<number, number>();
    const arranged = project.nodes.map(n => {
      const col = levels.get(n.id) ?? 0;
      const row = rows.get(col) ?? 0;
      rows.set(col, row + 1);
      return { ...n, position: { x: col * 230, y: row * 185 } };
    });
    onChange({ ...project, nodes: arranged });
    setNotice('已按依赖方向排列。使用左下角按钮将全部节点放入视图。');
  }
  const defaultEdgeOptions = useMemo(() => ({ style: { stroke: '#9bbd79', strokeWidth: 1.5 } }), []);
  return <div className="av-node-editor">
    <div className="av-editor-toolbar">
      <span className="av-editor-toolbar-label"><GitBranch size={13} /> 数据关系</span>
      <button onClick={() => add('parameter')} title="添加参数输入"><SlidersHorizontal size={12} /> 参数</button>
      <button onClick={() => add('time')} title="添加播放时间输入"><Clock3 size={12} /> 时间</button>
      <button onClick={() => add('formula')} title="添加计算公式"><Variable size={12} /> 公式</button>
      <button onClick={() => add('binding')} title="绑定到对象属性"><Waypoints size={12} /> 绑定</button>
      <button className="av-arrange" onClick={arrange} title="按依赖顺序排列节点"><LayoutGrid size={12} /></button>
    </div>
    <div className="av-flow-canvas">
      <ReactFlow<FlowNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeDragStop={(_, node) => patch(node.id, { position: node.position })}
        onDelete={({ nodes: deletedNodes, edges: deletedEdges }) => {
          const { project: p, onChange: change } = current.current;
          const nodeIds = new Set(deletedNodes.map(n => n.id));
          const edgeIds = new Set(deletedEdges.map(e => e.id));
          change({ ...p, nodes: p.nodes.filter(n => !nodeIds.has(n.id)), edges: p.edges.filter(e => !nodeIds.has(e.source) && !nodeIds.has(e.target) && !edgeIds.has(e.id)) });
        }}
        onConnect={connect} fitView fitViewOptions={{ padding: 0.16, maxZoom: 0.9 }} minZoom={0.2} maxZoom={1.8}
        defaultEdgeOptions={defaultEdgeOptions} colorMode="dark" deleteKeyCode={['Backspace', 'Delete']}>
        <Background gap={20} size={1} color="#333b49" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
    <div className="av-editor-footnote" role="status">{notice}</div>
  </div>;
}
export default NodeEditor;
