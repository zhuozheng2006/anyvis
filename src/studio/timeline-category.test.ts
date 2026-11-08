import { describe, expect, it } from 'vitest';
import { classifyActionCategory } from './timeline-category';
import type { Action } from './core/types';

describe('classifyActionCategory', () => {
  it('returns default category when given null or undefined', () => {
    expect(classifyActionCategory(null).type).toBe('default');
    expect(classifyActionCategory(undefined).type).toBe('default');
  });

  it('correctly classifies entrance actions', () => {
    expect(classifyActionCategory({ type: 'draw' }).type).toBe('entrance');
    expect(classifyActionCategory({ type: 'write' }).type).toBe('entrance');
    expect(classifyActionCategory({ type: 'fade_in' }).type).toBe('entrance');
    expect(classifyActionCategory({ type: 'grow' }).type).toBe('entrance');
    expect(classifyActionCategory({ type: 'spin_in' }).type).toBe('entrance');
    expect(classifyActionCategory({ type: 'type_text' }).type).toBe('entrance');
    expect(classifyActionCategory({ type: 'reveal_group' }).type).toBe('entrance');
  });

  it('correctly classifies managed objects based on appear mode', () => {
    const visibleCircle: Action = {
      id: 'c1',
      type: 'circle',
      fields: { name: '圆1', appear: 'fade' },
    };
    expect(classifyActionCategory(visibleCircle).type).toBe('entrance');

    const hiddenCircle: Action = {
      id: 'c2',
      type: 'circle',
      fields: { name: '圆2', appear: 'hidden' },
    };
    expect(classifyActionCategory(hiddenCircle).type).toBe('style');
  });

  it('correctly classifies transform and motion actions', () => {
    expect(classifyActionCategory({ type: 'move' }).type).toBe('transform');
    expect(classifyActionCategory({ type: 'shift' }).type).toBe('transform');
    expect(classifyActionCategory({ type: 'rotate' }).type).toBe('transform');
    expect(classifyActionCategory({ type: 'scale' }).type).toBe('transform');
    expect(classifyActionCategory({ type: 'transform' }).type).toBe('transform');
    expect(classifyActionCategory({ type: 'replacement_transform' }).type).toBe('transform');
    expect(classifyActionCategory({ type: 'apply_matrix' }).type).toBe('transform');
  });

  it('correctly classifies emphasis actions', () => {
    expect(classifyActionCategory({ type: 'indicate' }).type).toBe('emphasis');
    expect(classifyActionCategory({ type: 'circumscribe' }).type).toBe('emphasis');
    expect(classifyActionCategory({ type: 'wiggle' }).type).toBe('emphasis');
    expect(classifyActionCategory({ type: 'flash' }).type).toBe('emphasis');
  });

  it('correctly classifies exit actions', () => {
    expect(classifyActionCategory({ type: 'fade_out' }).type).toBe('exit');
    expect(classifyActionCategory({ type: 'uncreate' }).type).toBe('exit');
    expect(classifyActionCategory({ type: 'shrink_to_center' }).type).toBe('exit');
  });

  it('correctly classifies wait, audio and music', () => {
    expect(classifyActionCategory({ type: 'wait' }).type).toBe('wait');
    expect(classifyActionCategory({ type: 'audio_play' }).type).toBe('audio');
    expect(classifyActionCategory({ id: 'anyvis:default-piano', type: 'audio' }).type).toBe('music');
  });

  it('correctly classifies camera controls', () => {
    expect(classifyActionCategory({ type: 'camera' }).type).toBe('camera');
    expect(classifyActionCategory({ type: 'ambient_rotation' }).type).toBe('camera');
  });

  it('returns appropriate color and label metadata for each category', () => {
    const entrance = classifyActionCategory({ type: 'draw' });
    expect(entrance.label).toBe('入场');
    expect(entrance.color).toBe('#10b981');

    const transform = classifyActionCategory({ type: 'rotate' });
    expect(transform.label).toBe('变换');
    expect(transform.color).toBe('#3b82f6');

    const emphasis = classifyActionCategory({ type: 'indicate' });
    expect(emphasis.label).toBe('强调');
    expect(emphasis.color).toBe('#f59e0b');

    const exit = classifyActionCategory({ type: 'fade_out' });
    expect(exit.label).toBe('退场');
    expect(exit.color).toBe('#f43f5e');
  });
});
