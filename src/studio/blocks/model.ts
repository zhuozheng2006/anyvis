import * as Blockly from 'blockly/core';
import * as Chinese from 'blockly/msg/zh-hans';
import { BLOCK_CATALOG, CURATED_BLOCK_CATALOG, getBlockDefinition } from '../core/catalog';
import type { Action, BlockDefinition, FieldDefinition, FieldValue, MediaAsset, Project } from '../core/types';
import { planObjectRename } from './rename';
import { ColourField } from './colour-field';
import { MultilineCodeField } from './multiline-code-field';
import { createMatrixField } from './matrix-field';
import { ApiValueField } from './api-value-field';
import { ObjectListField } from './object-list-field';
import { managedDefinition } from '../authoring';

export const START_TYPE = 'anyvis2_start';
const PREFIX = 'anyvis2_';
interface ReferenceObject { name: string; kind: string; blockId: string; connected: boolean; enabled: boolean }
const referenceObjects = new WeakMap<Blockly.Workspace, Map<string, ReferenceObject>>();
const emptyReferences = new Map<string, ReferenceObject>();
const referenceMenus = new WeakMap<Blockly.FieldDropdown, { objects: Map<string, ReferenceObject>; value: string | null; sourceId?: string; options: [string, string][] }>();
const renameFeedback = new WeakMap<Blockly.Workspace, (error: string | null) => void>();
let registered = false;

type BlockState = Blockly.serialization.blocks.State;
type ContainerBlock = Blockly.Block & { anyvisBranchCount?: number; anyvisDetails?: boolean };
export type StudioWorkspaceState = { version: 1; actionSignature: string; blockly: object };

const workspaceAssets = new WeakMap<Blockly.Workspace, MediaAsset[]>();
const objectPresentation = new WeakSet<Blockly.Workspace>();
export function setWorkspaceAssets(workspace: Blockly.Workspace, assets: MediaAsset[]): void { workspaceAssets.set(workspace, assets); }
export function setObjectPresentation(workspace: Blockly.Workspace, enabled: boolean): void {
  if (enabled) objectPresentation.add(workspace); else objectPresentation.delete(workspace);
}
export function actionSignature(actions: Action[]): string {
  return JSON.stringify(actions);
}

export function blockType(type: string): string {
  return PREFIX + type;
}

function walkActions(actions: Action[], visit: (action: Action) => void) {
  for (const action of actions) {
    visit(action);
    if (action.children) walkActions(action.children, visit);
    action.branches?.forEach((branch) => walkActions(branch, visit));
  }
}

/** Track declarations, not references: an unresolved name must not become a valid choice. */
export function setReferenceNames(workspace: Blockly.Workspace, actions: Action[]): void {
  const objects = new Map<string, ReferenceObject>();
  const blocks = workspace.getAllBlocks(false);
  if (blocks.length) {
    const enabled = new Set<string>();
    const connected = new Set<string>();
    // Walk connections once, without serializing every unrelated field. A
    // disabled statement skips its body, but not the following statement.
    const visit = (first: Blockly.Block | null, active: boolean) => {
      let block = first;
      while (block && !connected.has(block.id)) {
        connected.add(block.id);
        const executes = active && block.isEnabled();
        if (executes) enabled.add(block.id);
        for (const input of block.inputList) {
          const child = input.connection?.targetBlock();
          if (child) visit(child, executes);
        }
        block = block.getNextBlock();
      }
    };
    for (const start of workspace.getTopBlocks(false).filter(block => block.type === START_TYPE)) {
      connected.add(start.id);
      visit(start.getNextBlock(), true);
    }
    // Once loaded, the actual workspace wins over a lagging React snapshot,
    // including immediately after deleting or renaming a constructor.
    for (const block of blocks) {
      const definition = getBlockDefinition(block.type.slice(PREFIX.length));
      const name = block.getFieldValue('name');
      if (definition?.createsObject && typeof name === 'string' && name) {
        objects.set(name, { name, kind: definition.apiId && ['play','animate'].includes(String(block.getFieldValue('mode'))) ? 'animation' : definition.objectKind || 'mobject', blockId: block.id, connected: connected.has(block.id), enabled: enabled.has(block.id) });
      }
    }
  } else {
    // Imported fields need their options before Blockly creates any blocks.
    walkActions(actions, (action) => {
      const definition = getBlockDefinition(action.type);
      const name = action.fields.name;
      if (definition?.createsObject && typeof name === 'string' && name) {
        objects.set(name, { name, kind: definition.apiId && ['play','animate'].includes(String(action.fields.mode)) ? 'animation' : definition.objectKind || 'mobject', blockId: action.id, connected: true, enabled: true });
      }
    });
  }
  const previous = referenceObjects.get(workspace);
  // Keep the same index identity for geometry/text/timing-only edits. Menus
  // invalidate only when declaration names, kinds or execution status change.
  if (previous?.size === objects.size && [...objects].every(([name, object]) => {
    const old = previous.get(name);
    return old?.blockId === object.blockId && old.kind === object.kind && old.connected === object.connected && old.enabled === object.enabled;
  })) return;
  referenceObjects.set(workspace, objects);
  for (const block of blocks) for (const input of block.inputList) for (const field of input.fieldRow) {
    if (field instanceof ObjectReferenceField) field.refreshLabel();
  }
}

export function releaseReferenceNames(workspace: Blockly.Workspace): void {
  referenceObjects.delete(workspace);
  renameFeedback.delete(workspace);
}

export function setRenameErrorHandler(workspace: Blockly.Workspace, handler: (error: string | null) => void): void {
  renameFeedback.set(workspace, handler);
}

function workspaceActionsSnapshot(workspace: Blockly.Workspace): Action[] {
  return workspace.getAllBlocks(false).flatMap((block) => {
    if (!block.type.startsWith(PREFIX)) return [];
    const definition = getBlockDefinition(block.type.slice(PREFIX.length));
    if (!definition) return [];
    return [{ id: block.id, type: definition.type, fields: Object.fromEntries(definition.fields.map((field) => [field.name, block.getFieldValue(field.name) ?? field.default])) }];
  });
}

const kindLabels: Record<string, string> = {
  mobject: '图形', text: '文字', formula: '公式', number: '数值对象', axes: '二维坐标系',
  number_line: '数轴', curve: '曲线', matrix: '矩阵', graph: '图结构', tracker: '参数', axes3d: '三维坐标系',
};
function referenceMap(field: Blockly.Field): Map<string, ReferenceObject> {
  const workspace = field.getSourceBlock()?.workspace;
  const main = workspace?.isFlyout ? (workspace as Blockly.WorkspaceSvg).targetWorkspace : workspace;
  return main ? referenceObjects.get(main) || emptyReferences : emptyReferences;
}
function expectedKind(field: FieldDefinition): string {
  return field.objectKinds?.length === 1 ? kindLabels[field.objectKinds[0]] || '对象' : '图形对象';
}
function compatibleReference(input: Blockly.Field, definition: FieldDefinition, value: ReferenceObject): boolean {
  return value.connected && value.enabled && (!definition.objectKinds || definition.objectKinds.includes(value.kind)) && value.blockId !== input.getSourceBlock()?.id;
}
function referenceLabel(input: Blockly.FieldDropdown, definition: FieldDefinition, value: string): string {
  if (!value) {
    if (definition.optional) return definition.emptyLabel || '不使用对象';
    const available = [...referenceMap(input).values()].some(object => compatibleReference(input, definition, object));
    return `${available ? '选择' : '先创建'}${expectedKind(definition)}`;
  }
  if (definition.name === 'receiver' && ['@scene','@camera','@frame','@renderer'].includes(value)) return value;
  const object = referenceMap(input).get(value);
  if (!object) return `⚠ 已缺失：${value}`;
  if (!object.connected) return `⚠ 未连接：${value}`;
  if (!object.enabled) return `⚠ 已禁用：${value}`;
  if (object.blockId === input.getSourceBlock()?.id) return `⚠ 不能引用自身：${value}`;
  return compatibleReference(input, definition, object) ? value : `⚠ 类型不符：${value}`;
}
function referenceOptions(input: Blockly.FieldDropdown, definition: FieldDefinition): [string, string][] {
  const objects = referenceMap(input);
  const current = input.getValue();
  const sourceId = input.getSourceBlock()?.id;
  const cached = referenceMenus.get(input);
  if (cached?.objects === objects && cached.value === current && cached.sourceId === sourceId) return cached.options;
  const options: [string, string][] = [[referenceLabel(input, definition, ''), '']];
  if (definition.name === 'receiver') for (const name of ['@scene','@camera','@frame','@renderer']) options.push([name,name]);
  for (const object of objects.values()) {
    if (compatibleReference(input, definition, object)) options.push([object.name, object.name]);
  }
  if (current && !options.some(option => option[1] === current)) options.push([referenceLabel(input, definition, current), current]);
  referenceMenus.set(input, { objects, value: current, sourceId, options });
  return options;
}
class ObjectReferenceField extends Blockly.FieldDropdown {
  private readonly definition?: FieldDefinition;
  constructor(definition: FieldDefinition) {
    super(function (this: Blockly.FieldDropdown) { return referenceOptions(this, definition); });
    this.definition = definition;
  }
  protected override doClassValidation_(value?: string): string | null {
    if (typeof value !== 'string') return null;
    // Undo, import and semantic renames can refer to a name that was not in the
    // last open menu. Preserve it and let the compiler report missing objects.
    const options = this.getOptions(false);
    if (!options.some((option) => Array.isArray(option) && option[1] === value)) {
      options.push([this.definition ? referenceLabel(this, this.definition, value) : value || '未选择', value]);
    }
    return value;
  }
  refreshLabel(): void {
    const previous = this.getText();
    if (this.definition && previous === referenceLabel(this, this.definition, this.getValue() || '')) return;
    this.setValue(this.getValue(), false);
    if (this.getText() !== previous) this.forceRerender();
  }
}

class AssetReferenceField extends Blockly.FieldDropdown {
  constructor(kind: 'image' | 'audio') {
    super(function (this: Blockly.FieldDropdown) {
      const ws = this.getSourceBlock()?.workspace;
      const assets = ws ? workspaceAssets.get(ws) || [] : [];
      const options: [string, string][] = [['选择已上传素材', ''], ...assets.filter(a => a.kind === kind).map(a => [a.name, a.id] as [string, string])];
      const current = this.getValue();
      if (current && !options.some(o => o[1] === current)) options.push(['素材缺失 · 请重新上传', current]);
      return options;
    });
  }
  protected override doClassValidation_(value?: string): string | null {
    if (typeof value !== 'string') return null;
    const options = this.getOptions(false);
    if (!options.some(o => Array.isArray(o) && o[1] === value)) options.push(['素材缺失 · 请重新上传', value]);
    return value;
  }
}

/** Apply reference edits to the originating Blockly undo transaction. */
export function applyWorkspaceRename(workspace: Blockly.Workspace, event: Blockly.Events.BlockChange): void {
  if (!event.recordUndo || event.element !== 'field' || event.name !== 'name' || !event.blockId) return;
  const block = workspace.getBlockById(event.blockId);
  const definition = block && getBlockDefinition(block.type.slice(PREFIX.length));
  if (!definition?.createsObject || typeof event.oldValue !== 'string' || typeof event.newValue !== 'string') return;
  const actions = workspaceActionsSnapshot(workspace).map((action) => action.id === event.blockId ? { ...action, fields: { ...action.fields, name: event.oldValue as string } } : action);
  const patches = planObjectRename(actions, event.blockId, event.newValue);
  if (!patches.length) return;
  // The event already belongs to the undo stack by the time listeners run.
  // Keeping its group on all generated field events makes one undo atomic.
  event.group ||= crypto.randomUUID();
  const previousGroup = Blockly.Events.getGroup();
  Blockly.Events.setGroup(event.group);
  try {
    setReferenceNames(workspace, actions);
    for (const patch of patches) workspace.getBlockById(patch.blockId)?.setFieldValue(String(patch.value), patch.field);
  } finally { Blockly.Events.setGroup(previousGroup); }
}

function makeField(field: FieldDefinition, definition: BlockDefinition): Blockly.Field {
  if (field.name === 'asset' && ['image_asset', 'audio_play'].includes(definition.type)) return new AssetReferenceField(definition.type === 'image_asset' ? 'image' : 'audio');
  if (field.type === 'api-value') {
    const input: ApiValueField = new ApiValueField(field, () => [...referenceMap(input).values()].filter(o => o.connected && o.enabled && o.blockId !== input.getSourceBlock()?.id).map(o => o.name));
    return input;
  }
  if (field.reference === 'object-list') {
    const input: ObjectListField = new ObjectListField(String(field.default), () => [...referenceMap(input).values()]
      .filter(object => compatibleReference(input, field, object)).map(object => object.name));
    return input;
  }
  if (field.editor === 'matrix') return createMatrixField(String(field.default), definition.type === 'apply_matrix' ? 2 : undefined);
  if (field.type === 'number') {
    // Blockly precision rounds values on load; an HTML input step is not a
    // rounding contract. Preserve fractional defaults and imported parameters.
    return new Blockly.FieldNumber(Number(field.default), field.min, field.max, field.step === 1 ? 1 : 0);
  }
  if (field.type === 'select' && field.options?.length) {
    const dropdown = new Blockly.FieldDropdown(field.options);
    dropdown.setValue(String(field.default));
    return dropdown;
  }
  if (field.type === 'object') {
    return new ObjectReferenceField(field);
  }
  if (field.type === 'color') return new ColourField(String(field.default));
  if (field.type === 'multiline') return new MultilineCodeField(String(field.default));
  const input = new Blockly.FieldTextInput(String(field.default));
  if (field.type === 'expression') input.setSpellcheck(false);
  return input;
}

function conciseFields(definition: BlockDefinition): Set<string> {
  // Blocks without a details toggle must never hide a field (notably the
  // value/context fields of the small API helper blocks).
  if (definition.fields.length <= 4) return new Set(definition.fields.map(f => f.name));
  if (definition.apiId) {
    const keys=definition.fields.filter(f=>['name','receiver','mode','setValue'].includes(f.name)||f.apiParameter?.required||f.apiParameter?.kind==='var_positional').map(f=>f.name);
    for (const f of definition.fields) if(keys.length<5 && !keys.includes(f.name) && f.apiParameter && !['var_keyword','var_positional'].includes(f.apiParameter.kind)) keys.push(f.name);
    return new Set(keys);
  }
  const names = definition.fields.map((field) => field.name);
  // Catalog order describes the object: keep a formula's LaTeX, a matrix's
  // values, or a surface's functions visible before generic placement fields.
  const secondary = new Set(['x', 'y', 'z', 'appear', 'fill', 'easing']);
  const chosen = names.filter((name) => !secondary.has(name)).slice(0, 4);
  for (const name of names) if (chosen.length < 4 && !chosen.includes(name)) chosen.push(name);
  return new Set(chosen);
}

function setDetails(block: ContainerBlock, definition: BlockDefinition, expanded: boolean): void {
  if (objectPresentation.has(block.workspace) && managedDefinition(definition)) {
    for (const field of definition.fields) block.getInput(`FIELD_${field.name}`)?.setVisible(['name', 'appear', 'duration', 'mode'].includes(field.name));
    block.getField('name')?.setEnabled(false);
    block.anyvisDetails = false;
    if (block instanceof Blockly.BlockSvg) void block.queueRender();
    return;
  }
  const common = conciseFields(definition);
  block.anyvisDetails = expanded;
  for (const field of definition.fields) {
    const input = block.getInput(`FIELD_${field.name}`);
    if (input && !common.has(field.name)) input.setVisible(expanded);
  }
  // BlockSvg.rendered means "SVG workspace", not "initialization complete".
  // Calling render() here flushes the global queue during EVERY block init and
  // extra-state load, repeatedly measuring the growing connected tree.
  if (block instanceof Blockly.BlockSvg) void block.queueRender();
}

function configureBranches(block: ContainerBlock, count: number): void {
  const current = block.anyvisBranchCount ?? 0;
  if (current === count && block.getInput(count ? 'BRANCH_0' : 'BODY')) return;
  if (block.getInput('BODY')) block.removeInput('BODY');
  for (let index = 0; index < current; index++) if (block.getInput(`BRANCH_${index}`)) block.removeInput(`BRANCH_${index}`);
  block.anyvisBranchCount = count;
  if (count) {
    for (let index = 0; index < count; index++) block.appendStatementInput(`BRANCH_${index}`).appendField(`分支 ${index + 1}`);
  } else {
    block.appendStatementInput('BODY').appendField('执行');
  }
}

export function registerStudioBlocks(): void {
  if (registered) return;
  registered = true;
  Blockly.setLocale(Object.fromEntries(
    Object.entries(Chinese).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  ));
  Blockly.Blocks[START_TYPE] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('当动画开始');
      this.setNextStatement(true);
      this.setColour('#e9a526');
      this.setDeletable(false);
      this.setTooltip('从这里开始，按顺序播放连接在下方的积木。');
    },
  };
  for (const definition of BLOCK_CATALOG) {
    Blockly.Blocks[blockType(definition.type)] = {
      init(this: ContainerBlock) {
        const objectCue = objectPresentation.has(this.workspace) && managedDefinition(definition);
        const heading = this.appendDummyInput('HEADING').appendField(objectCue ? '对象出现 / 准备' : definition.label);
        if (definition.requires3d) heading.appendField(' · 3D');
        if (definition.fields.length > 4 && !objectCue) {
          heading.appendField(new Blockly.FieldDropdown([
            ['常用参数', 'compact'], ['全部参数', 'expanded'],
          ], (value) => {
            setDetails(this, definition, value === 'expanded');
            return value;
          }), '__details');
        }
        const common = objectCue ? new Set<string>() : conciseFields(definition);
        let row: Blockly.Input | undefined;
        let fieldsInRow = 0;
        for (const field of definition.fields.filter((item) => common.has(item.name))) {
          const wide = field.type === 'expression' || field.type === 'multiline'
            || (field.type === 'text' && String(field.default).length > 14);
          if (!row || fieldsInRow >= 2 || wide) { row = this.appendDummyInput(`FIELD_${field.name}`); fieldsInRow = 0; }
          row.appendField(field.label).appendField(makeField(field, definition), field.name);
          if (field.suffix) row.appendField(field.suffix, `__unit_${field.name}`);
          fieldsInRow++;
          if (wide) row = undefined;
        }
        for (const field of definition.fields.filter((item) => !common.has(item.name))) {
          const input = this.appendDummyInput(`FIELD_${field.name}`).appendField(field.label).appendField(makeField(field, definition), field.name);
          if (field.suffix) input.appendField(field.suffix, `__unit_${field.name}`);
        }
        if (definition.createsObject) {
          this.getField('name')?.setValidator((value) => {
            const report = renameFeedback.get(this.workspace);
            if (!report || this.workspace.isFlyout || !Blockly.Events.isEnabled() || !Blockly.Events.getRecordUndo()) return value;
            try {
              planObjectRename(workspaceActionsSnapshot(this.workspace), this.id, String(value));
              report(null);
              return String(value).trim();
            } catch (cause) {
              report(cause instanceof Error ? cause.message : '名称无法使用。');
              return null;
            }
          });
        }
        if (definition.container) configureBranches(this, 0);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setInputsInline(false);
        this.setColour(definition.colour);
        this.setTooltip(definition.tooltip);
        setDetails(this, definition, false);
      },
      saveExtraState(this: ContainerBlock) {
        return { branchCount: this.anyvisBranchCount ?? 0, expanded: Boolean(this.anyvisDetails) };
      },
      loadExtraState(this: ContainerBlock, state: { branchCount?: number; expanded?: boolean } | null) {
        if (definition.container) configureBranches(this, Math.min(20, Math.max(0, Number(state?.branchCount) || 0)));
        setDetails(this, definition, Boolean(state?.expanded));
        if (this.getField('__details')) this.setFieldValue(state?.expanded ? 'expanded' : 'compact', '__details');
      },
    };
  }
}

function sequenceState(actions: Action[]): BlockState | undefined {
  let next: BlockState | undefined;
  for (let index = actions.length - 1; index >= 0; index--) {
    const action = actions[index];
    const definition = getBlockDefinition(action.type);
    if (!definition) throw new Error(`暂不支持积木“${action.type}”，请先更新应用。`);
    const fields: Record<string, FieldValue> = {};
    for (const field of definition.fields) fields[field.name] = action.fields[field.name] ?? field.default;
    const state: BlockState = { type: blockType(action.type), id: action.id, fields };
    if (action.type === 'sequence' && String(fields.label || '').trim()) state.collapsed = true;
    if (definition.container) {
      state.inputs = {};
      if (action.branches?.length) {
        state.extraState = { branchCount: action.branches.length };
        action.branches.forEach((branch, index) => {
          const child = sequenceState(branch);
          if (child) state.inputs![`BRANCH_${index}`] = { block: child };
        });
      } else {
        const child = sequenceState(action.children ?? []);
        if (child) state.inputs.BODY = { block: child };
      }
    }
    if (next) state.next = { block: next };
    next = state;
  }
  return next;
}

export function actionsToWorkspace(actions: Action[]): object {
  const first = sequenceState(actions);
  return { blocks: { languageVersion: 0, blocks: [{
    type: START_TYPE, id: 'anyvis-scene-start', x: 44, y: 42,
    ...(first ? { next: { block: first } } : {}),
  }] } };
}

export function loadProjectWorkspace(project: Project, workspace: Blockly.Workspace): void {
  workspaceAssets.set(workspace, project.assets || []);
  registerStudioBlocks();
  const saved = project.workspace as Partial<StudioWorkspaceState> | undefined;
  const usable = saved?.version === 1 && saved.actionSignature === actionSignature(project.actions) && saved.blockly;
  const state = usable ? saved.blockly! : actionsToWorkspace(project.actions);
  const recordUndo = Blockly.Events.getRecordUndo();
  const eventGroup = Blockly.Events.getGroup();
  Blockly.Events.disable();
  try {
    workspace.clear();
    setReferenceNames(workspace, project.actions);
    try {
      Blockly.serialization.workspaces.load(state, workspace);
      const loadedActions = workspaceToActions(workspace);
      if (usable && actionSignature(loadedActions) !== actionSignature(project.actions)) {
        throw new Error('编辑布局与作品步骤不一致，已从作品步骤重建。');
      }
    } catch (error) {
      if (!usable) throw error;
      workspace.clear();
      setReferenceNames(workspace, project.actions);
      Blockly.serialization.workspaces.load(actionsToWorkspace(project.actions), workspace);
    }
    setReferenceNames(workspace, project.actions);
    workspace.clearUndo();
  } finally {
    // Blockly's loader can throw before restoring its global event settings.
    // A bad saved layout must not disable undo for subsequent user edits.
    Blockly.Events.setRecordUndo(recordUndo);
    Blockly.Events.setGroup(eventGroup);
    Blockly.Events.enable();
  }
}

export function workspaceToActions(workspace: Blockly.Workspace): Action[] {
  const starts = workspace.getTopBlocks(false).filter((block) => block.type === START_TYPE);
  if (starts.length !== 1) throw new Error('场景需要保留一个“当动画开始”积木。');
  const seen = new Set<string>();
  const read = (first: Blockly.Block | null, depth = 0): Action[] => {
    if (depth > 20) throw new Error('积木嵌套超过 20 层，请拆成更清楚的步骤。');
    const actions: Action[] = [];
    let block = first;
    while (block) {
      if (seen.has(block.id) || seen.size > 2000) throw new Error('积木连接异常或数量过多。');
      seen.add(block.id);
      if (!block.isEnabled()) { block = block.getNextBlock(); continue; }
      const type = block.type.slice(PREFIX.length);
      const definition = getBlockDefinition(type);
      if (!definition || !block.type.startsWith(PREFIX)) throw new Error(`无法读取积木“${block.type}”。`);
      const fields: Record<string, FieldValue> = {};
      for (const field of definition.fields) {
        const value = block.getFieldValue(field.name);
        fields[field.name] = field.type === 'number' ? Number(value) : String(value ?? field.default);
      }
      const action: Action = { id: block.id, type, fields };
      if (definition.container) {
        const branchCount = (block as ContainerBlock).anyvisBranchCount ?? 0;
        if (branchCount) action.branches = Array.from({ length: branchCount }, (_,index) => read(block!.getInputTargetBlock(`BRANCH_${index}`), depth + 1));
        else action.children = read(block.getInputTargetBlock('BODY'), depth + 1);
      }
      actions.push(action);
      block = block.getNextBlock();
    }
    return actions;
  };
  return read(starts[0].getNextBlock());
}

export function saveWorkspace(workspace: Blockly.Workspace, actions: Action[], state?: object): StudioWorkspaceState {
  return { version: 1, actionSignature: actionSignature(actions), blockly: state ?? Blockly.serialization.workspaces.save(workspace) };
}

export function detachedBlockCount(workspace: Blockly.Workspace): number {
  return workspace.getTopBlocks(false).filter((block) => block.type !== START_TYPE).reduce((sum, block) => sum + block.getDescendants(false).length, 0);
}

export function createToolbox(query = '', animationOnly = false): Blockly.utils.toolbox.ToolboxDefinition {
  const normalized = query.toLocaleLowerCase().trim();
  const candidates = (normalized ? BLOCK_CATALOG : CURATED_BLOCK_CATALOG).filter(d => !animationOnly || !managedDefinition(d));
  const definitions = normalized ? candidates.filter((definition) => [
    definition.label, definition.type, definition.category, definition.tooltip, ...(definition.keywords ?? []),
  ].join(' ').toLocaleLowerCase().includes(normalized)).slice(0, 60) : candidates;
  const categories = [...new Set(definitions.map((definition) => definition.category))];
  if (normalized) return { kind: 'categoryToolbox', contents: [{
    kind: 'category', name: definitions.length ? `搜索 · ${definitions.length}` : '没有找到', colour: '#635bdf',
    contents: definitions.length ? definitions.map((definition) => ({ kind: 'block', type: blockType(definition.type) })) : [{ kind: 'label', text: '试试：圆、公式、移动、参数' }],
  }] };
  return { kind: 'categoryToolbox', contents: categories.map((category) => ({
    kind: 'category', name: category, colour: definitions.find((definition) => definition.category === category)!.colour,
    contents: definitions.filter((definition) => definition.category === category).map((definition) => ({ kind: 'block', type: blockType(definition.type) })),
  })) };
}
