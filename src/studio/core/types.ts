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
  /** Unit or short qualifier shown after the input, never stored in project values. */
  suffix?: string;
  /** Exact catalogue objectKind allow-list for reference pickers; not an inheritance test. */
  objectKinds?: string[];
  /** Whether an object picker may explicitly select the empty string. */
  optional?: boolean;
  /** Human-readable meaning of the optional empty choice. */
  emptyLabel?: string;
  /** Optional richer editor; underlying serialized field type stays unchanged. */
  editor?: 'matrix';
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
