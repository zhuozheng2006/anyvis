import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileBlockProgram } from '../src/core/blockProgram.ts';

const parameters = [
  { id: 'radius', name: '半径', value: 1, min: 0.2, max: 4, step: 0.1, color: '#b5ec78' },
  { id: 'speed', name: '速度', value: 1, min: 0, max: 10, step: 0.1, color: '#b5ec78' },
];
const animate = (changes = {}) => ({ kind: 'animate', parameterId: 'radius', from: 1, to: 2, duration: 2, easing: 'linear', ...changes });
const wait = (seconds) => ({ kind: 'wait', seconds });
const pause = (title = '观察半径') => ({ kind: 'pause', title });

test('repeat expands into deterministic sequential clips and a terminal interaction', () => {
  const program = [{ kind: 'repeat', count: 3, body: [animate(), wait(1)] }, pause()];
  const result = compileBlockProgram(program, parameters);
  assert.deepEqual(result.clips.map((clip) => clip.start), [0, 3, 6]);
  assert.equal(result.cues[0].time, 9);
  assert.equal(result.duration, 10);
  assert.deepEqual(result, compileBlockProgram(JSON.parse(JSON.stringify(program)), parameters));
  const ids = [...result.clips, ...result.cues].map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(id)));
});

test('parallel starts branches together and joins at the longer branch', () => {
  const result = compileBlockProgram([{ kind: 'parallel', branches: [[animate()], [animate({ parameterId: 'speed', duration: 4 })]] }, animate()], parameters);
  assert.deepEqual(result.clips.map((clip) => clip.start), [0, 0, 4]);
  assert.equal(result.duration, 6);
});

test('parallel cannot write the same parameter during overlapping time intervals', () => {
  assert.throws(() => compileBlockProgram([{ kind: 'parallel', branches: [[animate()], [wait(1), animate()]] }], parameters), /同时修改/);
  assert.doesNotThrow(() => compileBlockProgram([{ kind: 'parallel', branches: [[animate()], [wait(2), animate()]] }], parameters));
});

test('invalid values and removed parameter references fail before a timeline is returned', () => {
  assert.throws(() => compileBlockProgram([animate()], []), /已删除/);
  assert.throws(() => compileBlockProgram([animate({ to: 5 })], parameters), /范围内/);
  assert.throws(() => compileBlockProgram([animate({ from: Infinity })], parameters), /无效数值/);
  assert.throws(() => compileBlockProgram([animate({ duration: 0 })], parameters), /时长/);
  assert.throws(() => compileBlockProgram([wait(-1)], parameters), /等待时间/);
  assert.throws(() => compileBlockProgram([{ kind: 'repeat', count: 1.5, body: [animate()] }], parameters), /整数/);
});

test('interactions can occur at zero, but not twice at the same time', () => {
  const result = compileBlockProgram([pause('试一试'), animate()], parameters);
  assert.equal(result.cues[0].time, 0);
  assert.equal(result.cues[0].title, '试一试');
  assert.throws(() => compileBlockProgram([pause(), pause()], parameters), /同一时刻/);
});

test('clip count matches project import limit of 500', () => {
  const repeated = { kind: 'repeat', count: 100, body: Array.from({ length: 5 }, () => animate({ duration: 0.1 })) };
  assert.equal(compileBlockProgram([repeated], parameters).clips.length, 500);
  assert.throws(() => compileBlockProgram([repeated, animate()], parameters), /500/);
});

test('cue count matches project import limit of 100', () => {
  const repeated = { kind: 'repeat', count: 100, body: [pause(), wait(0.1)] };
  assert.equal(compileBlockProgram([repeated], parameters).cues.length, 100);
  assert.throws(() => compileBlockProgram([repeated, pause()], parameters), /100/);
});

test('nested repeat expansion has an execution budget', () => {
  assert.throws(() => compileBlockProgram([{ kind: 'repeat', count: 100, body: [{ kind: 'repeat', count: 100, body: [wait(0)] }] }], parameters), /1000/);
});

test('total time and terminal interaction padding fit the saved project limits', () => {
  assert.equal(compileBlockProgram([wait(3600)], parameters).duration, 3600);
  assert.throws(() => compileBlockProgram([wait(3600), pause()], parameters), /末尾交互/);
  assert.throws(() => compileBlockProgram([wait(3600), wait(1)], parameters), /总时长/);
});

test('floating point durations fit the exact serialized timeline interval', () => {
  const result = compileBlockProgram(Array.from({ length: 18 }, () => animate({ duration: 0.1 })), parameters);
  for (const clip of result.clips) assert.ok(clip.duration <= result.duration - clip.start);
});
