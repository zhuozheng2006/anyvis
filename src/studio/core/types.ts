/** Versioned authoring model. Blockly coordinates are optional editor metadata. */
export type FieldValue = string | number | boolean;
export interface Action {
  id: string;
  type: string;
  fields: Record<string, FieldValue>;
  children?: Action[];
  branches?: Action[][];
}
export interface Project {
  schemaVersion: 2;
  id: string;
  name: string;
  scene: { dimension: '2d' | '3d'; background: string; width: number; height: number; fps: number };
  actions: Action[];
  workspace?: unknown;
}
export type FieldKind = 'number' | 'text' | 'color' | 'select' | 'object' | 'expression' | 'multiline';
export interface FieldDefinition {
  name: string;
  label: string;
  type: FieldKind;
  default: FieldValue;
  options?: [string, string][];
  min?: number;
  max?: number;
  step?: number;
  description?: string;
  reference?: 'object' | 'object-list' | 'expression';
}
export interface BlockDefinition {
  type: string;
  label: string;
  category: string;
  colour: string;
  tooltip: string;
  fields: FieldDefinition[];
  container?: 'sequence' | 'parallel' | 'repeat';
  createsObject?: boolean;
  objectKind?: string;
  requires3d?: boolean;
  requiresTrust?: boolean;
  keywords?: string[];
}
export interface Diagnostic { blockId?: string; message: string; severity: 'error' | 'warning' }
export interface CompileResult {
  code: string;
  sourceMap: Record<number, string>;
  duration: number | null;
  diagnostics: Diagnostic[];
  requiresTrust: boolean;
}
