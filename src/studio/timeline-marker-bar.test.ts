import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './core/project';
import { addMarker, clearMarkers, findNearestMarker, removeMarker, snapTimeToMarkers, updateMarker } from './TimelineMarkerBar';

describe('TimelineMarkerBar functions', () => {
  it('adds, updates, removes and clears timeline markers with chronological sorting and frame snapping', () => {
    let p = createEmptyProject();
    expect(p.scene.markers).toBeUndefined();

    const res1 = addMarker(p, 2.51, '引出概念');
    p = res1.project;
    expect(p.scene.markers).toHaveLength(1);
    expect(p.scene.markers?.[0].label).toBe('引出概念');
    expect(p.scene.markers?.[0].time).toBe(2.5);

    const res2 = addMarker(p, 1.0, '开头');
    p = res2.project;
    expect(p.scene.markers).toHaveLength(2);
    // Should be sorted chronologically
    expect(p.scene.markers?.map(m => m.label)).toEqual(['开头', '引出概念']);

    p = updateMarker(p, res1.marker.id, { label: '重要定理' });
    expect(p.scene.markers?.find(m => m.id === res1.marker.id)?.label).toBe('重要定理');

    p = removeMarker(p, res2.marker.id);
    expect(p.scene.markers).toHaveLength(1);
    expect(p.scene.markers?.[0].label).toBe('重要定理');

    p = clearMarkers(p);
    expect(p.scene.markers).toEqual([]);
  });

  it('finds nearest marker and snaps time when within threshold', () => {
    const markers = [
      { id: 'm1', time: 1.0, label: 'M1' },
      { id: 'm2', time: 5.0, label: 'M2' },
    ];

    expect(findNearestMarker(markers, 1.04, 0.05)).toMatchObject({ id: 'm1' });
    expect(findNearestMarker(markers, 1.15, 0.05)).toBeNull();

    expect(snapTimeToMarkers(markers, 1.03, 0.05)).toBe(1.0);
    expect(snapTimeToMarkers(markers, 2.0, 0.05)).toBe(2.0);
    expect(snapTimeToMarkers(markers, 4.98, 0.05)).toBe(5.0);
  });
});
