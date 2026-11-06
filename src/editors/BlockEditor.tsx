import { useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly/core';
import * as Zh from 'blockly/msg/zh-hans';
import type { Parameter, Project } from '../core/types';
import { compileBlockProgram } from '../core/blockProgram';
import type { BlockInstruction, CompiledBlockProgram } from '../core/blockProgram';
import './blocks.css';

const parameterMenus = new WeakMap<Blockly.Workspace, Parameter[]>();
let blocksRegistered = false;

export function registerAnyVisBlocks() {
  if (blocksRegistered) return;
  blocksRegistered = true;
  // Blockly's ESM locale exports messages alongside module metadata.
  const locale = Object.fromEntries(
    Object.entries(Zh).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  Blockly.setLocale(locale);
  Blockly.Blocks.anyvis_start = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('▶ 当课件开始');
      this.setNextStatement(true);
      this.setColour('#778d36');
      this.setTooltip('把下面的积木依次连接起来，然后应用到时间轴。');
    },
  };
  Blockly.Blocks.anyvis_animate = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('变化参数')
        .appendField(new Blockly.FieldDropdown(function (this: Blockly.FieldDropdown) {
          const workspace = this.getSourceBlock()?.workspace;
          const params = workspace && parameterMenus.get(workspace);
          return params?.length ? params.map((p): [string, string] => [p.name, p.id]) : [['参数', 'radius']];
        }), 'PARAM');
      this.appendDummyInput()
        .appendField('从').appendField(new Blockly.FieldNumber(1, -100000, 100000, 0.01), 'FROM')
        .appendField('到').appendField(new Blockly.FieldNumber(2, -100000, 100000, 0.01), 'TO');
      this.appendDummyInput()
        .appendField('用时').appendField(new Blockly.FieldNumber(3, 0.01, 3600, 0.01), 'DURATION')
        .appendField('秒').appendField(new Blockly.FieldDropdown([['平滑', 'smooth'], ['匀速', 'linear']]), 'EASING');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour('#477fa0');
      this.setTooltip('生成一个参数动画片段，播放与拖动时间轴使用同一结果。');
    },
  };
  Blockly.defineBlocksWithJsonArray([
    {
      type: 'anyvis_wait', message0: '等待 %1 秒',
      args0: [{ type: 'field_number', name: 'SECONDS', value: 1, min: 0, max: 3600, precision: 0.01 }],
      previousStatement: null, nextStatement: null, colour: '#477fa0',
      tooltip: '让后面的动作晚一些开始。',
    },
    {
      type: 'anyvis_pause', message0: '暂停并探索 %1',
      args0: [{ type: 'field_input', name: 'TITLE', text: '试着调整参数' }],
      previousStatement: null, nextStatement: null, colour: '#aa8050',
      tooltip: '播放到这里暂停。观众可调整参数，点击继续后接着播放。',
    },
    {
      type: 'anyvis_repeat', message0: '重复 %1 次',
      args0: [{ type: 'field_number', name: 'COUNT', value: 2, min: 1, max: 100, precision: 1 }],
      message1: '执行 %1', args1: [{ type: 'input_statement', name: 'BODY' }],
      previousStatement: null, nextStatement: null, colour: '#8560aa',
      tooltip: '重复内部动作。每次从前一次结束的位置继续编排。',
    },
    {
      type: 'anyvis_parallel', message0: '同时执行',
      message1: '分支 A %1', args1: [{ type: 'input_statement', name: 'A' }],
      message2: '分支 B %1', args2: [{ type: 'input_statement', name: 'B' }],
      previousStatement: null, nextStatement: null, colour: '#8560aa',
      tooltip: '两个分支同时开始，较长的分支结束后再继续。不要同时修改同一参数。',
    },
  ]);
}

export type CompiledBlocks = CompiledBlockProgram;

/** Blockly-specific adapter. All scheduling and validation live in the pure core. */
export function workspaceToBlockProgram(workspace: Blockly.Workspace): BlockInstruction[] {
  const starts = workspace.getTopBlocks(true).filter((block) => block.type === 'anyvis_start');
  if (starts.length !== 1) throw new Error('请保留一个“当课件开始”积木，并把动作连接在它下面。');
  const disconnected = workspace.getTopBlocks(false).filter((block) => block.id !== starts[0].id);
  if (disconnected.length) throw new Error('有未连接的积木。请接到开始积木，或删除不用的积木后再应用。');
  let count = 0;
  const seen = new Set<string>();
  const readSequence = (first: Blockly.Block | null, depth: number): BlockInstruction[] => {
    if (depth > 12) throw new Error('嵌套层级过深，请把重复结构简化到 12 层以内。');
    const instructions: BlockInstruction[] = [];
    let block = first;
    while (block) {
      if (++count > 1000 || seen.has(block.id)) throw new Error('积木结构过大或包含循环连接。');
      seen.add(block.id);
      if (!block.isEnabled()) { block = block.getNextBlock(); continue; }
      if (block.type === 'anyvis_animate') {
        instructions.push({ kind: 'animate', parameterId: String(block.getFieldValue('PARAM')), from: Number(block.getFieldValue('FROM')), to: Number(block.getFieldValue('TO')), duration: Number(block.getFieldValue('DURATION')), easing: block.getFieldValue('EASING') === 'smooth' ? 'smooth' : 'linear' });
      } else if (block.type === 'anyvis_wait') {
        instructions.push({ kind: 'wait', seconds: Number(block.getFieldValue('SECONDS')) });
      } else if (block.type === 'anyvis_pause') {
        instructions.push({ kind: 'pause', title: String(block.getFieldValue('TITLE')) });
      } else if (block.type === 'anyvis_repeat') {
        instructions.push({ kind: 'repeat', count: Number(block.getFieldValue('COUNT')), body: readSequence(block.getInputTargetBlock('BODY'), depth + 1) });
      } else if (block.type === 'anyvis_parallel') {
        instructions.push({ kind: 'parallel', branches: [readSequence(block.getInputTargetBlock('A'), depth + 1), readSequence(block.getInputTargetBlock('B'), depth + 1)] });
      } else {
        throw new Error(`不能编译积木 ${block.type}。`);
      }
      block = block.getNextBlock();
    }
    return instructions;
  };
  return readSequence(starts[0].getNextBlock(), 0);
}

export function compileWorkspace(workspace: Blockly.Workspace, parameters: Parameter[]): CompiledBlocks {
  return compileBlockProgram(workspaceToBlockProgram(workspace), parameters);
}

function makeStarter(parameter?: Parameter): object {
  const from = parameter?.value ?? 1;
  const to = parameter ? Math.min(parameter.max, from + (parameter.max - parameter.min) / 3) : 2;
  return { blocks: { languageVersion: 0, blocks: [{ type: 'anyvis_start', x: 32, y: 28, next: { block: {
    type: 'anyvis_animate', fields: { PARAM: parameter?.id ?? 'radius', FROM: from, TO: Number(to.toFixed(2)), DURATION: 3, EASING: 'smooth' }, next: { block: {
      type: 'anyvis_pause', fields: { TITLE: `调整${parameter?.name ?? '参数'}，观察变化` }, next: { block: { type: 'anyvis_wait', fields: { SECONDS: 2 } } },
    } },
  } } }] } };
}

const toolbox = { kind: 'flyoutToolbox', contents: [
  { kind: 'block', type: 'anyvis_start' },
  { kind: 'block', type: 'anyvis_animate' },
  { kind: 'block', type: 'anyvis_wait' },
  { kind: 'block', type: 'anyvis_pause' },
  { kind: 'block', type: 'anyvis_repeat' },
  { kind: 'block', type: 'anyvis_parallel' },
] };

export function BlockEditor({ project, onChange }: { project: Project; onChange: (project: Project) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const projectRef = useRef(project);
  const onChangeRef = useRef(onChange);
  const lastSavedRef = useRef<string>('');
  const defaultStateRef = useRef<object | null>(null);
  const [message, setMessage] = useState('拖入并连接积木，然后应用到时间轴。');
  const [hasError, setHasError] = useState(false);
  projectRef.current = project;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;
    registerAnyVisBlocks();
    const theme = Blockly.Theme.defineTheme('anyvis', {
      name: 'anyvis', base: Blockly.Themes.Classic,
      componentStyles: { workspaceBackgroundColour: '#14191f', toolboxBackgroundColour: '#191f27', toolboxForegroundColour: '#d2d8df', flyoutBackgroundColour: '#202731', flyoutForegroundColour: '#e6ebf1', flyoutOpacity: 1, scrollbarColour: '#64717f', insertionMarkerColour: '#c0ef78', insertionMarkerOpacity: 0.5, cursorColour: '#c0ef78' },
      fontStyle: { family: 'Inter, system-ui, sans-serif', weight: '500', size: 11 },
      startHats: true,
    });
    const workspace = Blockly.inject(hostRef.current, {
      toolbox, theme, renderer: 'zelos', trashcan: true, sounds: false,
      move: { scrollbars: true, drag: true, wheel: true },
      zoom: { controls: true, wheel: true, startScale: 0.8, minScale: 0.4, maxScale: 1.5, scaleSpeed: 1.15 },
      grid: { spacing: 24, length: 2, colour: '#303844', snap: false },
    });
    workspaceRef.current = workspace;
    parameterMenus.set(workspace, projectRef.current.parameters);
    const flyoutWorkspace = workspace.getFlyout()?.getWorkspace();
    if (flyoutWorkspace) {
      parameterMenus.set(flyoutWorkspace, projectRef.current.parameters);
      for (const block of flyoutWorkspace.getAllBlocks(false)) {
        if (block.type === 'anyvis_animate' && projectRef.current.parameters[0]) block.setFieldValue(projectRef.current.parameters[0].id, 'PARAM');
      }
    }
    defaultStateRef.current = null;
    const load = projectRef.current.blockly ?? makeStarter(projectRef.current.parameters[0]);
    Blockly.Events.disable();
    try { Blockly.serialization.workspaces.load(load, workspace); }
    catch { workspace.clear(); Blockly.serialization.workspaces.load(makeStarter(projectRef.current.parameters[0]), workspace); }
    finally { Blockly.Events.enable(); }
    const initialState = Blockly.serialization.workspaces.save(workspace);
    lastSavedRef.current = JSON.stringify(initialState);
    if (!projectRef.current.blockly) defaultStateRef.current = initialState;
    const listener = (event: Blockly.Events.Abstract) => {
      if (event.isUiEvent || event.type === Blockly.Events.FINISHED_LOADING) return;
      const state = Blockly.serialization.workspaces.save(workspace);
      const serialized = JSON.stringify(state);
      if (serialized === lastSavedRef.current) return;
      lastSavedRef.current = serialized;
      setMessage('积木已保存。点击“应用到时间轴”更新播放内容。');
      setHasError(false);
      onChangeRef.current({ ...projectRef.current, blockly: state });
    };
    workspace.addChangeListener(listener);
    const observer = new ResizeObserver(() => Blockly.svgResize(workspace));
    observer.observe(hostRef.current);
    const resizeFrame = requestAnimationFrame(() => Blockly.svgResize(workspace));
    return () => {
      cancelAnimationFrame(resizeFrame); observer.disconnect(); workspace.removeChangeListener(listener);
      parameterMenus.delete(workspace); if (flyoutWorkspace) parameterMenus.delete(flyoutWorkspace);
      workspace.dispose(); workspaceRef.current = null;
    };
  }, [project.id]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (workspace) {
      parameterMenus.set(workspace, project.parameters);
      const flyoutWorkspace = workspace.getFlyout()?.getWorkspace();
      if (flyoutWorkspace) {
        parameterMenus.set(flyoutWorkspace, project.parameters);
        for (const block of flyoutWorkspace.getAllBlocks(false)) {
          if (block.type === 'anyvis_animate' && project.parameters[0] && !project.parameters.some((parameter) => parameter.id === block.getFieldValue('PARAM'))) block.setFieldValue(project.parameters[0].id, 'PARAM');
        }
      }
    }
  }, [project.parameters]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const state = project.blockly ?? defaultStateRef.current ?? makeStarter(projectRef.current.parameters[0]);
    const serialized = JSON.stringify(state);
    if (serialized === lastSavedRef.current) return;
    Blockly.Events.disable();
    try {
      Blockly.serialization.workspaces.load(state, workspace);
      const restored = Blockly.serialization.workspaces.save(workspace);
      lastSavedRef.current = JSON.stringify(restored);
      if (!project.blockly) defaultStateRef.current = restored;
      setMessage('已恢复项目中的积木编排。'); setHasError(false);
    } catch {
      setMessage('积木数据无法读取，请重新搭建编排。'); setHasError(true);
    } finally { Blockly.Events.enable(); }
  }, [project.blockly]);

  const apply = () => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    try {
      const result = compileWorkspace(workspace, projectRef.current.parameters);
      const state = Blockly.serialization.workspaces.save(workspace);
      lastSavedRef.current = JSON.stringify(state);
      onChangeRef.current({ ...projectRef.current, ...result, blockly: state });
      setMessage(`已更新：${result.clips.length} 个动画，${result.cues.length} 个交互节点，共 ${result.duration.toFixed(1)} 秒。`);
      setHasError(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : '积木编译失败。'); setHasError(true); }
  };

  return <div className="anyvis-block-editor">
    <div className="anyvis-block-toolbar">
      <span>拖动积木 · 编排过程</span>
      <button type="button" className="anyvis-block-apply" onClick={apply}>应用到时间轴 ↗</button>
    </div>
    <div ref={hostRef} className="anyvis-block-workspace" aria-label="积木编排工作区" />
    <div className={`anyvis-block-status${hasError ? ' is-error' : ''}`} role="status">{message}</div>
  </div>;
}

export default BlockEditor;
