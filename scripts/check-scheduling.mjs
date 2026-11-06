import assert from 'node:assert/strict';
import { evaluateParameters, nextCue, topologicalSort } from '../src/core/scheduling.ts';

// This intentionally runs the actual dependency-free scheduling module. It does
// not replace npm test, typechecking, mathjs expression tests, or browser tests.
let assertions = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };
const near = (actual, expected) => { assert(Math.abs(actual - expected) < 1e-10); assertions++; };
const rejects = (action, pattern) => { assert.throws(action, pattern); assertions++; };

const nodes = [
  { id: 'clock', kind: 'time', label: 'Time', position: { x: 0, y: 0 } },
  { id: 'radius', kind: 'parameter', label: 'Radius', position: { x: 0, y: 1 }, parameterId: 'radius' },
  { id: 'formula', kind: 'formula', label: 'Formula', position: { x: 1, y: 0 }, expression: 'a*b' },
  { id: 'out', kind: 'binding', label: 'Out', position: { x: 2, y: 0 }, objectId: 'dot', property: 'x' },
];
const edges = [
  { id: 'e1', source: 'clock', target: 'formula', input: 'a' },
  { id: 'e2', source: 'radius', target: 'formula', input: 'b' },
  { id: 'e3', source: 'formula', target: 'out', input: 'a' },
];
const order = topologicalSort(nodes, edges);
for (const edge of edges) { assert(order.indexOf(edge.source) < order.indexOf(edge.target)); assertions++; }
equal(topologicalSort([], []), []);
rejects(() => topologicalSort(nodes, [...edges, { id: 'cycle', source: 'out', target: 'formula', input: 'a' }]), /循环/);
rejects(() => topologicalSort(nodes, [{ id: 'missing', source: 'unknown', target: 'out', input: 'a' }]), /不存在/);
rejects(() => topologicalSort([nodes[0], nodes[0]], []), /重复/);

const parameter = { id: 'radius', name: 'Radius', value: 1, min: 0, max: 10, step: .01, color: '#fff' };
const project = {
  duration: 12, parameters: [parameter], clips: [
    { id: 'first', parameterId: 'radius', start: 2, duration: 2, from: 1, to: 3, easing: 'linear' },
    { id: 'second', parameterId: 'radius', start: 6, duration: 2, from: 3, to: 5, easing: 'linear' },
  ],
};
const before = JSON.stringify(project);
for (const [time, expected] of [[0,1],[2,1],[3,2],[4,3],[5,3],[6,3],[7,4],[8,5],[12,5]]) near(evaluateParameters(project, time).radius, expected);
const samples = [0, .1, 2, 3.28, 5.5, 8, 12].map(time => [time, evaluateParameters(project, time)]);
for (const [time, state] of [...samples].reverse()) equal(evaluateParameters(project, time), state);
equal(JSON.stringify(project), before);
near(evaluateParameters(project, 7, { radius: 2 }).radius, 2);
near(evaluateParameters(project, 7, { radius: -5 }).radius, 0);
near(evaluateParameters(project, 7, { radius: 20 }).radius, 10);
near(evaluateParameters(project, 7, { radius: NaN }).radius, 4);
near(evaluateParameters(project, -100).radius, 1);
near(evaluateParameters(project, Infinity).radius, 1);
near(evaluateParameters(project, 100).radius, 5);
const smooth = { ...project, clips: [{ ...project.clips[0], start: 0, duration: 4, from: 0, to: 4, easing: 'smooth' }] };
near(evaluateParameters(smooth, 1).radius, .625);
near(evaluateParameters(smooth, 2).radius, 2);
const overlap = { ...project, clips: [project.clips[0], { ...project.clips[1], start: 3, duration: 2, from: 4, to: 8 }] };
near(evaluateParameters(overlap, 4).radius, 6);
const sameStart = { ...project, clips: [project.clips[0], { ...project.clips[1], start: 2, duration: 2, from: 4, to: 8 }] };
near(evaluateParameters(sameStart, 3).radius, 6);

const cues = [
  { id: 'eight', time: 8, title: 'Eight', description: '' },
  { id: 'zero', time: 0, title: 'Zero', description: '' },
  { id: 'four', time: 4, title: 'Four', description: '' },
];
equal(nextCue(cues, 0, .01, new Set())?.id, 'zero');
equal(nextCue(cues, 0, .01, new Set(['zero'])), undefined);
equal(nextCue(cues, 3, 9, new Set())?.id, 'four');
equal(nextCue(cues, 4, 9, new Set(['four']))?.id, 'eight');
equal(nextCue(cues, 4, 4.1, new Set())?.id, 'four');
equal(nextCue(cues, 9, 2, new Set()), undefined);
equal(nextCue(cues, 0, 12, new Set(['zero', 'four', 'eight'])), undefined);

console.log(`Passed ${assertions} native Node scheduling assertions: DAG, cycles, clips, seeking, overrides, cues.`);
console.log('Pending: installed-library expression tests, TypeScript typecheck, Vite build, and browser/WebGL QA.');
