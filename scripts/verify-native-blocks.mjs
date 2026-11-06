#!/usr/bin/env node
/** Reproducible native renders for the first coverage expansion. No install/server. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createAction } from '../src/studio/core/catalog.ts';
import { compileProject } from '../src/studio/core/compiler.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (key, fallback) => { const at = args.indexOf(key); return at < 0 ? fallback : args[at + 1]; };
const python = arg('--python', process.env.ANYVIS_PYTHON || 'python');
const out = path.resolve(arg('--output', path.join(root, '.anyvis-cache/native-coverage-batch-1')));
const evidenceFile = arg('--evidence', null);
const dryRun = args.includes('--generate-only');
fs.mkdirSync(out, { recursive: true });
function builder(id) {
  let index = 0;
  const a = (type, fields = {}) => ({ ...createAction(type, fields), id: `${id}-${++index}` });
  const text = (name, value, x, y, size = 24) => a('text', { name, text: value, x, y, fontSize: size, color: '#E5EDF8', duration: 0.2 });
  const p = (actions) => ({ schemaVersion: 2, id, name: id, scene: { dimension: '2d', background: '#0B1020', width: 640, height: 360, fps: 15 }, actions });
  return { a, text, p };
}
function geometrySuite() {
  const {a, text, p} = builder('coverage-geometry');
  return {
    id: 'geometry', types: ['annulus', 'sector', 'annular_sector', 'star', 'dashed_line', 'brace', 'surrounding_rectangle', 'underline'],
    apis: ['Annulus', 'Sector', 'AnnularSector', 'Star', 'DashedLine', 'Brace', 'SurroundingRectangle', 'Underline'],
    project: p([
      text('标题', '更多图形，也是一块积木', 0, 3.1, 35),
      a('annulus', { name: '圆环', innerRadius: 0.4, outerRadius: 0.8, x: -4.5, y: 1.2, fill: 0.55, color: '#64D9C1', duration: 0.5 }),
      a('sector', { name: '扇形', radius: 0.9, angle: 120, x: -1.5, y: 1.2, fill: 0.55, color: '#AA9CF4', duration: 0.5 }),
      a('annular_sector', { name: '环形扇区', innerRadius: 0.4, outerRadius: 0.9, angle: 120, x: 1.5, y: 1.2, fill: 0.55, color: '#F2CB80', duration: 0.5 }),
      a('star', { name: '星形', innerRadius: 0.4, outerRadius: 0.85, x: 4.5, y: 1.2, fill: 0.55, color: '#F9A8D4', duration: 0.5 }),
      ...['圆环', '扇形', '环形扇区', '星形'].map((label, i) => text(`上标${i}`, label, -4.5 + i * 3, -0.1)),
      a('dashed_line', { name: '虚线', x1: -5.3, x2: -3.7, y1: -1.5, y2: -1.5, color: '#64D9C1', duration: 0.5 }),
      a('rectangle', { name: '括号目标', width: 1.6, height: 0.6, x: -1.5, y: -1.2, color: '#64748B', appear: 'none' }),
      a('brace', { name: '括号', target: '括号目标', direction: 'DOWN', color: '#AA9CF4', duration: 0.5 }),
      a('circle', { name: '边框目标', radius: 0.5, x: 1.5, y: -1.35, color: '#64748B', appear: 'none' }),
      a('surrounding_rectangle', { name: '边框', target: '边框目标', color: '#F2CB80', duration: 0.5 }),
      a('text', { name: '下划线目标', text: '强调', fontSize: 30, x: 4.5, y: -1.25, appear: 'none' }),
      a('underline', { name: '下划线', target: '下划线目标', color: '#F9A8D4', duration: 0.5 }),
      ...['虚线', '大括号', '边框', '下划线'].map((label, i) => text(`下标${i}`, label, -4.5 + i * 3, -2.4)),
      a('wait', { duration: 0.8 }),
    ]),
    assertions: [
      'assert np.isclose(objects["圆环"].width, 1.6, atol=0.01)',
      'assert objects["括号"].get_top()[1] < objects["括号目标"].get_bottom()[1]',
      'assert objects["边框"].width > objects["边框目标"].width',
      'assert objects["下划线"].get_top()[1] < objects["下划线目标"].get_bottom()[1]',
    ],
  };
}
function animationSuite() {
  const {a, text, p} = builder('coverage-animation');
  return {
    id: 'animation', types: ['focus_on', 'wave', 'passing_flash', 'transform_from_copy', 'shrink', 'grow_from_edge', 'grow_from_point', 'spin_in', 'reveal_group', 'type_text', 'set_layer'],
    apis: ['FocusOn', 'ApplyWave', 'ShowPassingFlash', 'TransformFromCopy', 'ShrinkToCenter', 'GrowFromEdge', 'GrowFromPoint', 'SpinInFromNothing', 'ShowIncreasingSubsets', 'AddTextLetterByLetter', 'Mobject.set_z_index'],
    project: p([
      text('标题', '动画，来自真正的 Manim', 0, 3.1, 35),
      a('circle', { name: '源对象', radius: 0.9, x: -2.7, y: 0.7, color: '#64D9C1', fill: 0.15, appear: 'none' }),
      a('square', { name: '目标对象', side: 1.6, x: 2.7, y: 0.7, color: '#AA9CF4', fill: 0.25, appear: 'hidden' }),
      a('focus_on', { target: '源对象', duration: 0.6 }),
      a('wave', { target: '源对象', duration: 0.8, amplitude: 0.15, ripples: 2 }),
      a('passing_flash', { target: '源对象', duration: 0.8, timeWidth: 0.3 }),
      a('transform_from_copy', { target: '源对象', destination: '目标对象', duration: 0.8 }),
      a('remove', { target: '目标对象' }),
      a('grow_from_edge', { target: '目标对象', direction: 'RIGHT', duration: 0.6 }),
      a('remove', { target: '目标对象' }),
      a('grow_from_point', { target: '目标对象', x: 0, y: -0.5, duration: 0.6 }),
      a('remove', { target: '目标对象' }),
      a('spin_in', { target: '目标对象', angle: 180, duration: 0.8 }),
      a('copy', { name: '缩小样本', target: '目标对象', x: 0, y: 0.7, appear: 'none' }),
      a('shrink', { target: '缩小样本', duration: 0.6 }),
      ...[-1.2, 0, 1.2].map((x, i) => a('circle', { name: `成员${i}`, radius: 0.22, x, y: -1.25, color: ['#64D9C1', '#F2CB80', '#AA9CF4'][i], fill: 1, appear: 'hidden' })),
      a('group', { name: '组合', members: '成员0,成员1,成员2' }),
      a('reveal_group', { target: '组合', duration: 0.9, easing: 'linear' }),
      a('text', { name: '逐字标题', text: '组合动作，保持每一步可编辑', fontSize: 27, x: 0, y: -2.5, appear: 'hidden' }),
      a('type_text', { target: '逐字标题', duration: 1.1, easing: 'linear' }),
      a('set_layer', { target: '源对象', layer: 4 }),
      a('wait', { duration: 0.8 }),
    ]),
    assertions: [
      'assert objects["源对象"] in self.mobjects',
      'assert np.allclose(objects["源对象"].get_center(), [-2.7, 0.7, 0])',
      'assert np.isclose(objects["源对象"].width, 1.8, atol=0.01)',
      'assert objects["目标对象"] in self.mobjects',
      'assert np.allclose(objects["目标对象"].get_center(), [2.7, 0.7, 0])',
      'assert np.isclose(objects["目标对象"].width, 1.6, atol=0.01)',
      'assert np.isclose(objects["缩小样本"].width, 0, atol=0.001)',
      'assert len(objects["组合"].submobjects) == 3',
      'assert objects["源对象"].z_index == 4',
      'assert np.isclose(objects["源对象"].get_center()[2], 0)',
    ],
  };
}
const inspectMedia = String.raw`
from pathlib import Path
import av,json,sys
from PIL import Image,ImageDraw
import manim
root=Path(sys.argv[1]); videos=list((root/'media').rglob('AnyVisScene.webm'))
if len(videos)!=1: raise RuntimeError('Expected one rendered movie')
with av.open(str(videos[0])) as container:
    stream=container.streams.video[0]
    frames=list(container.decode(stream))
    indexes=sorted(set([0,len(frames)//4,len(frames)//2,3*len(frames)//4,len(frames)-1]))
    sheet=Image.new('RGB',(640,3*204),'#0B1020');draw=ImageDraw.Draw(sheet)
    for i,index in enumerate(indexes):
        frame=frames[index];picture=frame.to_image();picture.thumbnail((320,180));x=(i%2)*320;y=(i//2)*204
        sheet.paste(picture,(x,y));draw.text((x+8,y+184),f'{float(frame.time or 0):.2f}s',fill='#E5EDF8')
    sheet.save(root/'keyframes.png')
    result={'engine':manim.__version__,'renderer':'cairo','format':'webm','codec':stream.codec_context.name,'width':stream.width,'height':stream.height,'fps':str(stream.average_rate),'decodedFrames':len(frames),'durationSeconds':len(frames)/float(stream.average_rate),'keyframes':indexes}
    assert (stream.width,stream.height)==(640,360)
    # WebM's millisecond time base may report 15000/1001 for requested 15 fps.
    assert abs(float(stream.average_rate)-15)<0.03
    assert len(frames)>30
print(json.dumps(result))
`;
const results = [];
for (const suite of [geometrySuite(), animationSuite()]) {
  const folder = path.join(out, suite.id); fs.mkdirSync(folder, { recursive: true });
  const compiled = compileProject(suite.project);
  const errors = compiled.diagnostics.filter(d => d.severity === 'error');
  if (errors.length || compiled.requiresTrust) throw new Error(JSON.stringify(errors));
  const source = compiled.code + suite.assertions.map(line => '        ' + line).join('\n') + '\n';
  fs.writeFileSync(path.join(folder, 'scene.py'), source);
  fs.writeFileSync(path.join(folder, 'project.json'), JSON.stringify(suite.project, null, 2));
  if (dryRun) { console.log(`Generated ${suite.id}`); continue; }
  console.log(`Rendering ${suite.id} with real Manim…`);
  const rendered = spawnSync(python, ['-m', 'manim', 'render', '--renderer', 'cairo', '--format', 'webm', '--fps', '15', '-r', '640,360', '--media_dir', path.join(folder, 'media'), '--disable_caching', '--progress_bar', 'none', path.join(folder, 'scene.py'), 'AnyVisScene'], { encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024, cwd: root });
  fs.writeFileSync(path.join(folder, 'render.log'), (rendered.stdout || '') + (rendered.stderr || ''));
  if (rendered.status !== 0) throw new Error(`${suite.id} failed. See ${path.relative(root, path.join(folder, 'render.log'))}: ${rendered.error?.message || ''}`);
  const inspected = spawnSync(python, ['-c', inspectMedia, folder], { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
  if (inspected.status !== 0) throw new Error(inspected.stderr || 'Media inspection failed');
  const metadata = JSON.parse(inspected.stdout);
  results.push({ suite: suite.id, blockTypes: suite.types, apiRefs: suite.apis, status: 'rendered-and-decoded', sourceSha256: createHash('sha256').update(compiled.code).digest('hex'), harnessSha256: createHash('sha256').update(source).digest('hex'), assertionsPassed: suite.assertions.length, visualReview: 'not-assumed-by-script', media: metadata });
  console.log(`${suite.id}: ${metadata.width}x${metadata.height}, ${metadata.fps} fps, ${metadata.decodedFrames} frames, assertions passed`);
}
if (!dryRun) {
  const coverageEvidence = results.map(suite => ({
    id: `native-blocks-batch-1-${suite.suite}`,
    engine_version: suite.media.engine,
    renderer: 'cairo',
    mode: 'native_video',
    block_types: suite.blockTypes,
    api_refs: suite.apiRefs,
    checks: [`${suite.assertionsPassed} native scene assertions passed`, `${suite.media.decodedFrames} frames fully decoded with PyAV`, '640x360 requested at 15 fps; WebM reported rate within 0.03 fps', 'Source and assertion-harness SHA256 recorded in this bundle'],
    limitations: ['Selected parameters only, not all options of these APIs', 'Cairo only; no OpenGL validation', 'Automated success does not imply manual visual approval'],
    source: 'scripts/verify-native-blocks.mjs',
  }));
  const report = { schemaVersion: 1, scope: 'Selected native blocks on Manim CE / Cairo. Not full parameter or renderer coverage.', reproducibleCommand: 'node scripts/verify-native-blocks.mjs --python <MANIM_PYTHON> --evidence docs/research/native-blocks-batch-1-evidence.json', suites: results, coverageEvidence };
  fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(report, null, 2) + '\n');
  if (evidenceFile) { const filename = path.resolve(evidenceFile); fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, JSON.stringify(report, null, 2) + '\n'); }
}
