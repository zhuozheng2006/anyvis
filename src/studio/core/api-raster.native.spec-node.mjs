import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getApiEntry } from './api-registry.ts';
import { createApiCompiler, API_RUNTIME } from './api-compiler.ts';
import { createAction } from './catalog.ts';
import { IMAGE_COMPAT, compileProject } from './compiler.ts';
import { createEmptyProject } from './project.ts';
import { discoverPython } from '../../../server/server.mjs';
import { apiEvidenceSources, nativeExecutionEnvironment } from '../../../scripts/api-evidence.mjs';

const execute = promisify(execFile);
const ref = name => ({ $ref: name });
const array = value => ({ $array: value });
const cases = [];
// Every case invokes a registry-compiled API and checks an observable postcondition.
// Setup calls do not count as evidence. AbstractImageMobject's pixel/color entries
// verify dispatch through those user-selectable entries to ImageMobject overrides;
// they do not claim that the abstract base implementations are directly usable.
const add = (id, setup, params, check, fields = {}) => cases.push({ id, setup, params, check, fields });
const image = 'manim.mobject.types.image_mobject.';
const camera = 'manim.camera.camera.Camera.';
const moving = 'manim.camera.moving_camera.MovingCamera.';
const three = 'manim.camera.three_d_camera.ThreeDCamera.';

add(image + 'ImageMobject', '', { filename_or_array: ref('pixels'), scale_to_resolution: 2 },
  'eq(result.get_pixel_array(), pixels); close(result.height, 4); close(result.width, 4); assert result.get_pixel_array().dtype == np.uint8');
add(image + 'ImageMobject', 'Image.fromarray(pixels).save("fixture.png")', { filename_or_array: { $path: 'fixture.png' }, invert: true },
  'eq(result.get_pixel_array()[:, :, :3], 255-pixels[:, :, :3]); eq(result.get_pixel_array()[:, :, 3], pixels[:, :, 3])');
add(image + 'ImageMobject.get_pixel_array', 's = make_image()', {}, 'eq(result, pixels); assert result is s.pixel_array');
add(image + 'AbstractImageMobject.get_pixel_array', 's = make_image()', {}, 'eq(result, pixels)');
add(image + 'ImageMobject.set_color', 's = make_image()', { color: '#204060', alpha: 0.5 },
  'eq(s.pixel_array[:, :, :3], np.tile([32,64,96], (2,2,1))); eq(s.pixel_array[:, :, 3], np.full((2,2),127)); assert result is s');
add(image + 'AbstractImageMobject.set_color', 's = make_image()', { color: '#204060' },
  'eq(s.pixel_array[:, :, :3], np.tile([32,64,96], (2,2,1))); eq(s.pixel_array[:, :, 3], pixels[:, :, 3])');
add(image + 'ImageMobject.set_opacity', 's = make_image()', { alpha: 0.5 },
  'eq(s.pixel_array[:, :, 3], [[0,32],[64,127]]); eq(s.pixel_array[:, :, :3], pixels[:, :, :3]); assert result is s');
add(image + 'ImageMobject.fade', 's = make_image()', { darkness: 0.75 },
  'eq(s.pixel_array[:, :, 3], [[0,16],[32,63]]); assert result is s');
add(image + 'ImageMobject.get_style', 's = make_image().set_color("#204060")', {},
  'assert result["fill_color"] == "#204060"; close(result["fill_opacity"], 1)');
add(image + 'ImageMobject.interpolate_color', 's = make_image(); objects["a"] = make_image().set_color(BLACK, alpha=0); objects["b"] = make_image().set_color(WHITE, alpha=1)',
  { mobject1: ref('a'), mobject2: ref('b'), alpha: 0.25 }, 'eq(s.pixel_array, np.full((2,2,4), 63)); assert result is None');
add(image + 'AbstractImageMobject.reset_points', 's = make_image().shift(RIGHT*3).scale(2)', {},
  'close(s.get_center(), ORIGIN); close(s.height, 4); assert result is s');
add(image + 'AbstractImageMobject.set_resampling_algorithm', 's = make_image()', { resampling_algorithm: 0 },
  'assert s.resampling_algorithm == 0; assert result is s');
add(image + 'ImageMobjectFromCamera', 'objects["cam"] = make_camera(MovingCamera); objects["cam"].pixel_array[:] = [20,40,60,255]',
  { camera: ref('cam') }, 'eq(result.get_pixel_array()[0,0], [20,40,60,255]); close(result.height, 3); close(result.width, 6)');
add(image + 'ImageMobjectFromCamera.get_pixel_array', 'cam = make_camera(MovingCamera); s = ImageMobjectFromCamera(cam); cam.pixel_array[:] = [20,40,60,255]', {},
  'assert result is cam.pixel_array; eq(result[0,0], [20,40,60,255])');
add(image + 'ImageMobjectFromCamera.add_display_frame', 's = ImageMobjectFromCamera(make_camera(MovingCamera))', { kwargs: { stroke_color: '#FF0000', stroke_width: 7 } },
  'assert s.display_frame in s.submobjects; close(s.display_frame.get_stroke_width(), 7); assert s.display_frame.get_stroke_color() == ManimColor("#FF0000"); assert result is s');

add(camera + 'convert_pixel_array', 's = make_camera()', { pixel_array: array([[[0.25,0.5,1,1]]]), convert_from_floats: true },
  'eq(result, [[[63,127,255,255]]]); assert result.dtype == np.uint8');
for (const method of ['set_pixel_array', 'set_background', 'set_frame_to_background']) {
  add(camera + method, 's = make_camera(); objects["a"] = np.full((32,64,4), [20,40,60,255], dtype=np.uint8)',
    { [method === 'set_frame_to_background' ? 'background' : 'pixel_array']: ref('a') },
    `eq(s.${method === 'set_background' ? 'background' : 'pixel_array'}, objects["a"]); assert result is None`);
}
add(camera + 'reset', 's = make_camera(); s.pixel_array[:] = [255,0,0,255]', {}, 'eq(s.pixel_array, s.background); assert result is s');
add(camera + 'init_background', 's = make_camera(); s.background_color = "#204060"', {}, 'eq(s.background[0,0], [32,64,96,255])');
add(camera + 'reset_pixel_shape', 's = make_camera()', { new_height: 24, new_width: 72 },
  'assert s.pixel_array.shape == (24,72,4); close(s.frame_width/s.frame_height, 3)');
add(camera + 'resize_frame_shape', 's = make_camera(); s.frame_width = 3', { fixed_dimension: 1 }, 'close(s.frame_width, 8); close(s.frame_height, 4)');
add(camera + 'get_image', 's = make_camera()', { pixel_array: ref('pixels') }, 'assert result.size == (2,2); eq(np.asarray(result), pixels)');
add(camera + 'get_coords_of_all_pixels', 's = make_camera()', {}, 'assert result.shape == (32,64,2); close(result[0,0], [-4,2]); close(result[16,32], [0,0])');
for (const method of ['points_to_pixel_coords', 'points_to_subpixel_coords']) {
  add(camera + method, 's = make_camera(); objects["a"] = Square()', { mobject: ref('a'), points: array([[0,0,0],[1,1,0],[-4,2,0]]) },
    'close(result, [[32,16],[40,8],[0,0]])');
}
add(camera + 'on_screen_pixels', 's = make_camera()', { pixel_coords: array([[0,0],[63,31],[64,0],[-1,0],[0,32]]) }, 'eq(result, [True,True,False,False,False])');
add(camera + 'get_fill_rgbas', 's = make_camera(); objects["a"] = Square().set_fill("#204060", opacity=0.25)', { vmobject: ref('a') }, 'close(result, [[32/255,64/255,96/255,0.25]])');
add(camera + 'get_stroke_rgbas', 's = make_camera(); objects["a"] = Square().set_stroke("#204060", opacity=0.75)', { vmobject: ref('a') }, 'close(result, [[32/255,64/255,96/255,0.75]])');
add(camera + 'get_mobjects_to_display', 's = make_camera(); a = Square().set_z_index(2); b = Circle().set_z_index(1); objects.update(a=a, b=b, group=VGroup(a,b))',
  { mobjects: [ref('group')], excluded_mobjects: [ref('a')] }, 'assert result == [b]');
add(camera + 'is_in_frame', 's = make_camera(); objects["a"] = Square().shift(RIGHT*20)', { mobject: ref('a') }, 'assert not result');
add(camera + 'transform_points_pre_display', 's = make_camera(); objects["a"] = Square()', { mobject: ref('a'), points: array([[1,2,0],[-1,0,0]]) }, 'close(result, [[1,2,0],[-1,0,0]])');
add(camera + 'type_or_raise', 's = make_camera(); objects["a"] = make_image()', { mobject: ref('a') }, 'assert result is AbstractImageMobject');
add(camera + 'get_thickening_nudges', 's = make_camera()', { thickness: 3 }, 'assert set(map(tuple,result)) == {(x,y) for x in [-1,0,1] for y in [-1,0,1]}');
add(camera + 'thickened_coordinates', 's = make_camera()', { pixel_coords: array([[5,7]]), thickness: 3 }, 'assert set(map(tuple,result)) == {(x,y) for x in [4,5,6] for y in [6,7,8]}');
add(camera + 'adjust_out_of_range_points', 's = make_camera(); s.max_allowable_norm = 5', { points: array([[6,8,0],[1,2,0]]) }, 'close(result, [[3,4,0],[1,2,0]])');
add(camera + 'adjusted_thickness', 's = Camera(pixel_width=32, pixel_height=16, frame_width=8, frame_height=4, background_color=BLACK)', { thickness: 3 }, 'close(result, 5)');

// Real Cairo/Pillow drawing, not merely constructing a class or counting frames.
for (const method of ['capture_mobject', 'capture_mobjects', 'display_vectorized', 'display_multiple_vectorized_mobjects', 'display_multiple_non_background_colored_vmobjects']) {
  const key = method === 'capture_mobject' ? 'mobject' : method === 'capture_mobjects' ? 'mobjects' : method === 'display_vectorized' ? 'vmobject' : 'vmobjects';
  add(camera + method, 's = make_camera(); objects["a"] = Square(side_length=2, fill_color="#FF0000", fill_opacity=1, stroke_width=0)',
    { [key]: ['mobject','vmobject'].includes(key) ? ref('a') : [ref('a')], ...(['capture_mobject','capture_mobjects'].includes(method) ? {} : method === 'display_vectorized' ? { ctx: ref('ctx') } : { pixel_array: ref('buffer') }) },
    'assert_red_frame(s.pixel_array)');
}
for (const method of ['display_image_mobject','display_multiple_image_mobjects']) {
  add(camera + method, 's = make_camera(); objects["a"] = ImageMobject(np.full((4,4,4), [255,0,0,255], dtype=np.uint8)).set_height(2)',
    { [method === 'display_image_mobject' ? 'image_mobject' : 'image_mobjects']: method === 'display_image_mobject' ? ref('a') : [ref('a')], pixel_array: ref('buffer') },
    'assert_red_frame(s.pixel_array)');
}
for (const method of ['overlay_rgba_array', 'overlay_PIL_image']) {
  add(camera + method, 's = make_camera(); data = np.full((32,64,4), [255,0,0,128], dtype=np.uint8); objects["a"] = data; objects["pil"] = Image.fromarray(data)',
    { pixel_array: ref('buffer'), [method === 'overlay_rgba_array' ? 'new_array' : 'image']: ref(method === 'overlay_rgba_array' ? 'a' : 'pil') },
    'eq(s.pixel_array[16,32], [128,0,0,255]); eq(s.pixel_array[0,0], [128,0,0,255])');
}
const backgroundFn = { $lambda: { params: ['p'], body: array([0.25,0.5,1,1]) } };
add(camera + 'make_background_from_func', 's = make_camera()', { coords_to_colors_func: backgroundFn }, 'assert result.shape == (32,64,4); eq(result[0,0], [63,127,255,255])');
add(camera + 'set_background_from_func', 's = make_camera()', { coords_to_colors_func: backgroundFn }, 'eq(s.background[0,0], [63,127,255,255])');

add(moving + 'auto_zoom', 's = make_camera(MovingCamera); objects["a"] = Square(side_length=2).shift(RIGHT*2)',
  { mobjects: [ref('a')], margin: 1, animate: false }, 'close(s.frame.get_center(), [2,0,0]); close(s.frame.height, 3); close(s.frame.width, 6); assert result is s.frame');
for (const [name, val, check] of [['frame_width', 6, 'close(s.frame.width, 6)'], ['frame_height', 3, 'close(s.frame.height, 3)'], ['frame_center', array([2,1,0]), 'close(s.frame.get_center(), [2,1,0])']]) {
  add(moving + name, 's = make_camera(MovingCamera)', {}, check, { mode: 'set', setValue: JSON.stringify(val) });
}
add(moving + 'get_mobjects_indicating_movement', 's = make_camera(MovingCamera)', {}, 'assert s.frame in result');

for (const [name, value] of [['phi',0.7],['theta',0.4],['gamma',0.2],['zoom',1.75],['focal_distance',12]]) {
  add(three + 'set_' + name, 's = make_camera(ThreeDCamera)', { value }, `close(s.get_${name}(), ${value}); assert result is None`);
  add(three + 'get_' + name, `s = make_camera(ThreeDCamera); s.set_${name}(${value})`, {}, `close(result, ${value})`);
}
const topDown = 's = make_camera(ThreeDCamera); s.set_phi(0); s.set_theta(-PI/2); s.set_gamma(0); s.reset_rotation_matrix()';
add(three + 'generate_rotation_matrix', topDown + '; s.set_gamma(PI/2)', {}, 'close(result, [[0,-1,0],[1,0,0],[0,0,1]], atol=1e-8)');
add(three + 'get_rotation_matrix', topDown + '; s.set_gamma(PI/2); s.reset_rotation_matrix()', {}, 'close(result, [[0,-1,0],[1,0,0],[0,0,1]], atol=1e-8)');
add(three + 'reset_rotation_matrix', topDown + '; s.set_gamma(PI/2)', {}, 'close(s.rotation_matrix, [[0,-1,0],[1,0,0],[0,0,1]], atol=1e-8)');
add(three + 'project_point', topDown + '; s.set_focal_distance(10); s.set_zoom(2)', { point: array([1,2,5]) }, 'close(result, [4,8,5])');
add(three + 'project_points', topDown + '; s.set_focal_distance(10); s.set_zoom(2)', { points: array([[1,2,5],[1,2,0]]) }, 'close(result, [[4,8,5],[2,4,0]])');
add(three + 'get_value_trackers', 's = make_camera(ThreeDCamera); s.set_phi(0.7); s.set_zoom(1.75)', {}, 'assert len(result) == 5; assert s.phi_tracker in result and s.zoom_tracker in result; close(s.phi_tracker.get_value(), 0.7)');
add(three + 'frame_center', 's = make_camera(ThreeDCamera)', {}, 'close(s.frame_center, [1,2,3])', { mode: 'set', setValue: JSON.stringify(array([1,2,3])) });
for (const kind of ['in_frame', 'orientation']) {
  const member = kind === 'in_frame' ? 'fixed_in_frame_mobjects' : 'fixed_orientation_mobjects';
  add(three + `add_fixed_${kind}_mobjects`, 's = make_camera(ThreeDCamera); objects["a"] = VGroup(Square(), Circle())', { mobjects: [ref('a')] },
    `assert all(m in s.${member} for m in objects["a"].get_family())`);
  add(three + `remove_fixed_${kind}_mobjects`, `s = make_camera(ThreeDCamera); objects["a"] = VGroup(Square(), Circle()); s.add_fixed_${kind}_mobjects(objects["a"])`,
    { mobjects: [ref('a')] }, `assert not s.${member}`);
}

test('native image and camera APIs preserve pixels, alpha, projection and framing', { timeout: 120_000 }, async t => {
  const health = await discoverPython();
  if (!health.available) { t.skip('Manim required'); return; }
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-api-raster-'));
  try {
    const compiler = createApiCompiler();
    const scope = new Set(['s','pixels','a','b','cam','group','buffer','pil','ctx']);
    const probes = cases.map((c, index) => {
      const entry = getApiEntry(c.id);
      assert.ok(entry, `Unknown API: ${c.id}`);
      const fields = { receiver: 's', mode: 'store', ...c.fields };
      for (const [key, value] of Object.entries(c.params)) fields[`p_${key}`] = JSON.stringify(value);
      const compiled = compiler.compile(createAction(entry.type, fields), entry, scope, {});
      return `def probe_${index}():
    objects = {"pixels": pixels.copy()}
    s = None
${c.setup ? '    ' + c.setup : ''}
    objects["s"] = s
    if isinstance(s, Camera):
        objects["buffer"] = s.pixel_array
        objects["ctx"] = s.get_cairo_context(s.pixel_array)
${compiled.prelude.map(line => '    ' + line).join('\n')}
    result = ${compiled.expression}
    ${c.check}
`;
    });
    const runner = `from manim import *
from manim.mobject.types.image_mobject import AbstractImageMobject
from PIL import Image
import numpy as np
import json, traceback
${API_RUNTIME}
${IMAGE_COMPAT}
_anyvis_image_compat()
${compiler.imports().join('\n')}
pixels = np.array([[[255,0,0,0],[0,255,0,64]],[[0,0,255,128],[255,255,255,255]]], dtype=np.uint8)
eq = np.testing.assert_array_equal
close = np.testing.assert_allclose
def make_image(): return ImageMobject(pixels.copy(), scale_to_resolution=2)
def make_camera(cls=Camera):
    return cls(pixel_width=64, pixel_height=32, frame_width=8, frame_height=4, background_color=BLACK)
def assert_red_frame(frame):
    eq(frame[16,32], [255,0,0,255])
    eq(frame[0,0], [0,0,0,255])
    count = np.count_nonzero((frame[:,:,0] > 200) & (frame[:,:,1] < 10) & (frame[:,:,2] < 10))
    assert 180 <= count <= 324, count
${probes.join('\n')}
results = []
with tempconfig({"renderer":"cairo", "pixel_width":64, "pixel_height":32, "frame_width":8, "frame_height":4, "media_dir":"media", "verbosity":"ERROR"}):
    for api_id, probe in [${cases.map((c,i) => `(${JSON.stringify(c.id)}, probe_${i})`).join(',')}]:
        try:
            probe()
            results.append({"apiId":api_id,"status":"verified"})
        except Exception as error:
            results.append({"apiId":api_id,"status":"failed","reason":traceback.format_exc(limit=3)})
print("ANYVIS_RASTER " + json.dumps(results))
`;
    const script = path.join(directory, 'raster.py');
    await writeFile(script, runner);
    const output = await execute(health.python, [script], { env: nativeExecutionEnvironment(health.python), cwd: directory, timeout: 100_000, maxBuffer: 4 * 1024 * 1024 });
    const line = output.stdout.split('\n').find(row => row.startsWith('ANYVIS_RASTER '));
    assert.ok(line, output.stdout);
    const outcomes = JSON.parse(line.slice('ANYVIS_RASTER '.length));
    assert.equal(outcomes.length, cases.length);
    const failures = outcomes.filter(row => row.status !== 'verified');
    const apiIds = [...new Set(outcomes.filter(row => row.status === 'verified').map(row => row.apiId))].sort();
    const fixture = 'src/studio/core/api-raster.native.spec-node.mjs';
    const reportPath = process.env.ANYVIS_API_RASTER_REPORT || path.resolve('artifacts/api/native-raster-evidence.json');
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify({ fixture, sourceFiles: await apiEvidenceSources(fixture),
      registrySha256: createHash('sha256').update(await readFile(new URL('./api-registry.json', import.meta.url))).digest('hex'),
      passed: failures.length === 0, engineVersion: health.version, renderer: 'cairo', apiIds, outcomes,
      checks: 'Compiled registry calls with explicit RGBA, geometry, real Cairo/Pillow pixels, camera projection and framing assertions. Setup calls are not counted. AbstractImageMobject pixel/color entries verify dynamic dispatch to concrete ImageMobject overrides, not direct execution of abstract base implementations.'
    }, null, 2) + '\n');
    t.diagnostic(`${apiIds.length} image/camera APIs, ${outcomes.length} cases, ${failures.length} failures.`);
    assert.deepEqual(failures, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('standalone API-only image scene renders and moves without an upload block', { timeout: 60_000 }, async t => {
  const health = await discoverPython();
  if (!health.available) { t.skip('Manim required'); return; }
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-api-image-scene-'));
  try {
    const project = createEmptyProject();
    const entry = getApiEntry(image + 'ImageMobject');
    const move = getApiEntry('Mobject.shift');
    project.actions = [
      createAction(entry.type, { name: 'picture', mode: 'show',
        p_filename_or_array: JSON.stringify(array(Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => [255,0,0,255])))), p_scale_to_resolution: '8' }),
      createAction(move.type, { receiver: 'picture', mode: 'animate', duration: 0.3, p_vectors: JSON.stringify([array([1.5,0,0])]) }),
      createAction('wait', { duration: 0.1 }),
    ];
    const compiled = compileProject(project);
    assert.deepEqual(compiled.diagnostics, []);
    const script = path.join(directory, 'scene.py');
    await writeFile(script, compiled.code + `
with tempconfig({"write_to_movie":False,"save_last_frame":False,"renderer":"cairo","media_dir":"media","pixel_width":128,"pixel_height":64,"frame_width":8,"frame_height":4,"frame_rate":10,"progress_bar":"none","verbosity":"ERROR"}):
    scene = AnyVisScene()
    scene.render()
    frame = scene.renderer.get_frame()
    mask = (frame[:,:,0] > 200) & (frame[:,:,1] < 20) & (frame[:,:,2] < 20)
    ys, xs = np.where(mask)
    assert len(xs) > 800, len(xs)
    assert 85 < xs.mean() < 91, xs.mean()
    assert 29 < ys.mean() < 35, ys.mean()
    print("ANYVIS_API_IMAGE_SCENE_OK")
`);
    const output = await execute(health.python, [script], { env: nativeExecutionEnvironment(health.python), cwd: directory, timeout: 45_000, maxBuffer: 1024 * 1024 });
    assert.match(output.stdout, /ANYVIS_API_IMAGE_SCENE_OK/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
