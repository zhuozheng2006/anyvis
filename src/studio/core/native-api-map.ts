/**
 * Explicit native API entry-point map. An entry means an editable block calls
 * this public API; it is NOT a claim that every argument or behavior is exposed.
 * audit-manim-coverage.py resolves inherited methods to their declaring class.
 * Python extensions and language-only sequence/repeat are deliberately unmapped.
 */
export const NATIVE_API_MAP: Record<string, string[]> = {
  image_asset: ['ImageMobject', 'SVGMobject'], audio_play: ['SceneFileWriter.add_audio_segment'], audio_stop: [],
  circle: ['Circle'], square: ['Square'], rectangle: ['Rectangle'], rounded_rectangle: ['RoundedRectangle'],
  triangle: ['Triangle'], polygon: ['RegularPolygon'], ellipse: ['Ellipse'], dot: ['Dot'],
  line: ['Line'], arrow: ['Arrow'], arc: ['Arc'],
  annulus: ['Annulus'], sector: ['Sector'], annular_sector: ['AnnularSector'], star: ['Star'],
  dashed_line: ['DashedLine'], brace: ['Brace'], surrounding_rectangle: ['SurroundingRectangle'], underline: ['Underline'],
  text: ['Text'], formula: ['MathTex'], decimal: ['DecimalNumber'],
  axes: ['Axes'], plane: ['NumberPlane'], number_line: ['NumberLine'],
  function_plot: ['Axes.plot'], parametric_curve: ['ParametricFunction'], area: ['Axes.get_area'], riemann: ['Axes.get_riemann_rectangles'],
  tangent: ['always_redraw', 'Axes.c2p', 'Line'],
  matrix: ['Matrix'], graph: ['Graph'], graph_highlight: ['Mobject.animate', 'VMobject.set_fill', 'VMobject.set_stroke', 'Mobject.set_color'],
  bar_chart: ['BarChart'], tracker: ['ValueTracker'], animate_value: ['Mobject.animate', 'ValueTracker.set_value'],
  dynamic_dot: ['always_redraw', 'Dot', 'Axes.c2p', 'ValueTracker.get_value'],
  dynamic_line: ['always_redraw', 'Line', 'Axes.c2p', 'ValueTracker.get_value'],
  dynamic_plot: ['always_redraw', 'Axes.plot', 'ValueTracker.get_value'],
  dynamic_number: ['always_redraw', 'DecimalNumber', 'ValueTracker.get_value'],
  trace: ['TracedPath', 'Mobject.get_center'], follow: ['Mobject.add_updater', 'Mobject.move_to', 'Mobject.get_center'],
  stop_updaters: ['Mobject.clear_updaters'],
  three_axes: ['ThreeDAxes'], sphere: ['Sphere'], cube: ['Cube'], cylinder: ['Cylinder'], surface: ['Surface'],
  camera: ['ThreeDScene.set_camera_orientation', 'ThreeDScene.move_camera'],
  ambient_rotation: ['ThreeDScene.begin_ambient_camera_rotation', 'ThreeDScene.stop_ambient_camera_rotation'],
  fixed_in_frame: ['ThreeDScene.add_fixed_in_frame_mobjects'],
  group: ['VGroup'], copy: ['Mobject.copy'], set_position: ['Mobject.move_to'],
  set_style: ['Mobject.set_color', 'VMobject.set_fill', 'VMobject.set_stroke'],
  set_layer: ['Mobject.set_z_index'], next_to: ['Mobject.next_to'], arrange: ['Mobject.arrange'], add: ['Scene.add'], remove: ['Scene.remove'],
  create: ['Create'], write: ['Write'], fade_in: ['FadeIn'], fade_out: ['FadeOut'], uncreate: ['Uncreate'],
  grow: ['GrowFromCenter'], draw_border: ['DrawBorderThenFill'],
  transform: ['Transform'], replacement_transform: ['ReplacementTransform'], matching_tex: ['TransformMatchingTex'],
  transform_from_copy: ['TransformFromCopy'],
  move: ['Mobject.animate', 'Mobject.move_to'], shift: ['Mobject.animate', 'Mobject.shift'], rotate: ['Rotate'],
  scale: ['Mobject.animate', 'Mobject.scale'], color: ['Mobject.animate', 'Mobject.set_color'], opacity: ['Mobject.animate', 'VMobject.set_opacity'],
  indicate: ['Indicate'], circumscribe: ['Circumscribe'], flash: ['Flash'], wiggle: ['Wiggle'],
  focus_on: ['FocusOn'], wave: ['ApplyWave'], grow_from_point: ['GrowFromPoint'], grow_from_edge: ['GrowFromEdge'],
  spin_in: ['SpinInFromNothing'], shrink: ['ShrinkToCenter'], passing_flash: ['ShowPassingFlash'],
  reveal_group: ['ShowIncreasingSubsets'], type_text: ['AddTextLetterByLetter'],
  path_move: ['MoveAlongPath'], apply_matrix: ['Mobject.animate', 'Mobject.apply_matrix'],
  wait: ['Scene.wait', 'Wait'], parallel: ['AnimationGroup'],
  sequence: [], repeat: [], code: [],
};

/** Runtime/compiler plumbing, tracked separately from author-facing blocks. */
export const NATIVE_RUNTIME_APIS = [
  'Scene', 'MovingCameraScene', 'ThreeDScene', 'Scene.play',
  'smooth', 'linear', 'rate_functions.ease_in_sine', 'rate_functions.ease_out_sine', 'there_and_back',
];
