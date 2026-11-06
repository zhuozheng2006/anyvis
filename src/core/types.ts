export type Dimension = '2d' | '3d';
export interface Parameter { id: string; name: string; value: number; min: number; max: number; step: number; color: string }
export interface SceneObject { id: string; name: string; kind: 'circle' | 'point' | 'vector' | 'curve' | 'cube' | 'sphere'; color: string; visible: boolean; x: number; y: number; z: number; scale: number; rotation: number; expression?: string }
export type BindingProperty = 'x' | 'y' | 'z' | 'scale' | 'rotation';
export interface GraphNode { id: string; kind: 'parameter' | 'time' | 'formula' | 'binding'; label: string; position: {x: number; y: number}; parameterId?: string; expression?: string; objectId?: string; property?: BindingProperty }
export interface GraphEdge { id: string; source: string; target: string; input: 'a' | 'b' }
export interface AnimationClip { id: string; parameterId: string; start: number; duration: number; from: number; to: number; easing: 'linear' | 'smooth' }
export interface Cue { id: string; time: number; title: string; description: string }
export interface Project { version: 1; id: string; name: string; dimension: Dimension; duration: number; parameters: Parameter[]; objects: SceneObject[]; nodes: GraphNode[]; edges: GraphEdge[]; clips: AnimationClip[]; cues: Cue[]; blockly?: object; code: string; codeEnabled: boolean }
export interface Evaluation { parameters: Record<string, number>; objects: SceneObject[]; nodeValues: Record<string, number>; errors: string[] }
export type ProjectChange = (project: Project) => void;
