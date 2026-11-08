import { apiEvidenceSources } from '../../../scripts/api-evidence.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverPython } from '../../../server/server.mjs';
import { createAction } from './catalog.ts';
import { compileProject } from './compiler.ts';
import { createEmptyProject } from './project.ts';

const execute = promisify(execFile);
const fixture = 'src/studio/core/api-opengl-render.native.spec-node.mjs';
const prefix = 'ANYVIS_OPENGL_RENDER ';

// This is renderer evidence, not per-API behavioral coverage. Context creation
// alone can never set passed/renderValidated; both require actual scene pixels.
test('AnyVis OpenGL scene renders a red square moving across real frames', { timeout:120_000 }, async t => {
  const requireOpenGL = process.env.ANYVIS_REQUIRE_OPENGL === '1';
  const reportPath = path.resolve(process.env.ANYVIS_OPENGL_RENDER_REPORT || 'artifacts/api/opengl-render-evidence.json');
  const health = await discoverPython();
  const evidence = {
    fixture, sourceFiles: await apiEvidenceSources(fixture),
    registrySha256: createHash('sha256').update(await readFile(new URL('./api-registry.json', import.meta.url))).digest('hex'),
    engineVersion: health.version || null, renderer:'opengl',
    passed:false, renderValidated:false, apiIds:[], status:'pending',
    checks:'Actual compileProject output through OpenGL Scene.render; red pixel area, initial/final centroids, intermediate motion and frame dimensions. No API coverage is claimed.'
  };
  const save = async extra => {
    Object.assign(evidence, extra);
    await mkdir(path.dirname(reportPath), { recursive:true });
    await writeFile(reportPath, JSON.stringify(evidence, null, 2) + '\n');
  };
  // Immediately overwrite any stale success from a previous host/run.
  await save({ status:'probing' });
  if (!health.available) {
    const reason = 'An installed Manim runtime is required for the OpenGL render test.';
    await save({ status:'unavailable', reason });
    if (requireOpenGL) assert.fail(reason);
    t.skip(reason); return;
  }
  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-opengl-render-'));
  try {
    const project = createEmptyProject();
    project.scene = { ...project.scene, dimension:'2d', renderer:'opengl', width:320, height:180, fps:12, background:'#000000', backgroundMusic:'none' };
    project.actions = [
      createAction('square', { name:'moving-square', side:1.4, color:'#FF0000', fill:1, x:-2, y:0, z:0, appear:'none' }),
      createAction('wait', { duration:0.25 }),
      createAction('shift', { target:'moving-square', dx:4, dy:0, dz:0, duration:0.5, easing:'linear' }),
      createAction('wait', { duration:0.25 }),
    ];
    const compiled = compileProject(project);
    assert.deepEqual(compiled.diagnostics, []);
    assert.equal(compiled.requiresTrust, false);
    assert.equal(compiled.duration, 1);
    const scenePath = path.join(directory, 'generated_scene.py');
    await writeFile(scenePath, compiled.code);
    evidence.generatedSourceSha256 = createHash('sha256').update(compiled.code).digest('hex');

    // Match Manim's own offscreen context selection (default, then EGL).
    // Probe and render run in separate processes, each releasing its context.
    const probePath = path.join(directory, 'probe.py');
    await writeFile(probePath, `import json
result={'available':False,'attempts':[]}
try:
    import moderngl
    for backend in [None,'egl']:
        context=None
        try:
            kwargs={'standalone':True}
            if backend: kwargs['backend']=backend
            context=moderngl.create_context(**kwargs)
            result.update(available=True,backend=backend or 'default',versionCode=context.version_code,device=context.info.get('GL_RENDERER'),version=context.info.get('GL_VERSION'))
            break
        except Exception as error:
            result['attempts'].append({'backend':backend or 'default','error':type(error).__name__+': '+str(error)[:400]})
        finally:
            if context is not None: context.release()
except Exception as error:
    result['attempts'].append({'backend':'import','error':type(error).__name__+': '+str(error)[:400]})
print('ANYVIS_GL_PROBE '+json.dumps(result))
`);
    const probeOutput = await execute(health.python, [probePath], { cwd:directory, timeout:30_000, maxBuffer:1024*1024 });
    const probeLine = probeOutput.stdout.split('\n').find(line => line.startsWith('ANYVIS_GL_PROBE '));
    assert.ok(probeLine, probeOutput.stdout);
    const contextProbe = JSON.parse(probeLine.slice('ANYVIS_GL_PROBE '.length));
    await save({ contextProbe });
    if (!contextProbe.available) {
      const reason = 'OpenGL offscreen context unavailable: ' + contextProbe.attempts.map(attempt => `${attempt.backend}: ${attempt.error}`).join('; ');
      await save({ status:'unavailable', reason });
      if (requireOpenGL) assert.fail(reason);
      t.skip(reason); return;
    }

    const runnerPath = path.join(directory, 'render.py');
    await writeFile(runnerPath, `import importlib.util,json
import numpy as np
from manim import tempconfig,RendererType
from manim.renderer.opengl_renderer import OpenGLRenderer
frames=[]
write_calls=[]
renderer=None
try:
    with tempconfig({'renderer':'opengl','pixel_width':320,'pixel_height':180,'frame_width':8,'frame_height':4.5,'frame_rate':12,'background_color':'#000000','background_opacity':1,'write_to_movie':False,'save_last_frame':False,'preview':False,'force_window':False,'show_in_file_browser':False,'disable_caching':True,'media_dir':'media','progress_bar':'none','verbosity':'ERROR'}):
        spec=importlib.util.spec_from_file_location('anyvis_gl_fixture','generated_scene.py')
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        renderer=OpenGLRenderer()
        scene=module.AnyVisScene(renderer=renderer)
        assert isinstance(scene.renderer,OpenGLRenderer)
        assert renderer.window is None
        # Frozen waits bypass renderer.render and submit one framebuffer with
        # num_frames > 1. Observe the writer boundary used by both paths.
        original_write_frame=renderer.file_writer.write_frame
        def capture_frame(frame_or_renderer,num_frames=1):
            result=original_write_frame(frame_or_renderer,num_frames=num_frames)
            assert frame_or_renderer is renderer
            assert isinstance(num_frames,int) and num_frames>0, num_frames
            frame=renderer.get_frame().copy()
            frames.extend(frame.copy() for _ in range(num_frames))
            write_calls.append(num_frames)
            return result
        renderer.file_writer.write_frame=capture_frame
        scene.render()
        assert len(frames)==12, f'Expected 12 submitted frames including both waits, got {len(frames)}'
        assert abs(scene.time-1)<1e-6, scene.time
        samples=[]
        for index,frame in enumerate(frames):
            assert frame.shape==(180,320,4), frame.shape
            assert frame.dtype==np.uint8, frame.dtype
            mask=(frame[:,:,0]>200)&(frame[:,:,1]<40)&(frame[:,:,2]<40)
            ys,xs=np.where(mask)
            assert 2500<=len(xs)<=4500, (index,len(xs))
            assert np.max(frame[0,0,:3])<20, (index,frame[0,0].tolist())
            samples.append({'frame':index,'redPixels':int(len(xs)),'x':float(xs.mean()),'y':float(ys.mean())})
        first,last=samples[0],samples[-1]
        assert 76<=first['x']<=84, first
        assert 236<=last['x']<=244, last
        displacement=last['x']-first['x']
        assert 156<=displacement<=164, displacement
        assert all(86<=sample['y']<=94 for sample in samples), samples
        assert any(120<sample['x']<200 for sample in samples), 'No intermediate animation position was rendered'
        assert min(np.diff([sample['x'] for sample in samples]))>=-1.5, samples
        metrics={'frameCount':len(frames),'writeCalls':write_calls,'width':320,'height':180,'seconds':float(scene.time),'initial':first,'final':last,'horizontalDisplacement':displacement,'minRedPixels':min(sample['redPixels'] for sample in samples),'maxRedPixels':max(sample['redPixels'] for sample in samples),'samples':samples,'device':renderer.context.info.get('GL_RENDERER'),'version':renderer.context.info.get('GL_VERSION')}
        print('${prefix}'+json.dumps(metrics))
finally:
    if renderer is not None:
        framebuffer=getattr(renderer,'frame_buffer_object',None)
        if framebuffer is not None: framebuffer.release()
        context=getattr(renderer,'context',None)
        if context is not None: context.release()
`);
    const output = await execute(health.python, [runnerPath], { cwd:directory, timeout:75_000, maxBuffer:4*1024*1024 });
    const line = output.stdout.split('\n').find(row => row.startsWith(prefix));
    assert.ok(line, output.stdout);
    const metrics = JSON.parse(line.slice(prefix.length));
    await save({ passed:true, renderValidated:true, status:'verified', metrics });
    t.diagnostic(`${metrics.frameCount} OpenGL frames; red-square displacement ${metrics.horizontalDisplacement.toFixed(2)} px; ${metrics.device}.`);
  } catch (error) {
    // Once a context exists, render/geometry/pixel failures are never skips.
    await save({ passed:false, renderValidated:false, status:evidence.status === 'unavailable' ? 'unavailable' : 'failed', reason:String(error?.stderr || error?.message || error).slice(0,4000) });
    throw error;
  } finally {
    await rm(directory, { recursive:true, force:true });
  }
});
