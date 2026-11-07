import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { API_ENTRIES, getApiEntry, searchApi } from './api-registry.ts';
import { createAction, getBlockDefinition } from './catalog.ts';
import { compileProject } from './compiler.ts';
import { createEmptyProject, validateProject } from './project.ts';
import { renameProjectObject } from '../blocks/rename.ts';
import { buildPrompt, parseAIProject } from '../ai/project-assistant.ts';
import { exportStandalonePython } from './export.ts';
import type { Action, FieldValue } from './types.ts';
const api = (key: string, name: string, params: Record<string, unknown> = {}, fields: Record<string, FieldValue> = {}) => {
    const entry = getApiEntry(key);
    if (!entry)
        throw Error(key);
    return createAction(entry.type, { name, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [`p_${k}`, JSON.stringify(v)])), ...fields });
};
const project = (...actions: Action[]) => ({ ...createEmptyProject(), actions });
const errors = (...actions: Action[]) => compileProject(project(...actions)).diagnostics.filter(d => d.severity === 'error');
describe('signature-driven API integration', () => {
    it('covers every entry in the previous bounded public inventory with a concrete descriptor', () => {
        const previous = JSON.parse(gunzipSync(readFileSync(new URL('../../../docs/research/manim-ce-0.20.1-coverage.json.gz', import.meta.url))).toString());
        const ids = new Set(API_ENTRIES.map(e => e.id));
        expect(previous.api_entries.length).toBe(1660);
        expect(previous.api_entries.filter((e: {
            id: string;
        }) => !ids.has(e.id))).toEqual([]);
    });
    it('exposes all inspected parameters once and preserves class/function/method/property identity', () => {
        expect(new Set(API_ENTRIES.map(e => e.type)).size).toBe(API_ENTRIES.length);
        for (const entry of API_ENTRIES) {
            const block = getBlockDefinition(entry.type)!;
            expect(block.apiId).toBe(entry.id);
            expect(new Set(block.fields.map(f => f.name)).size).toBe(block.fields.length);
            for (const param of [...entry.parameters, ...entry.inheritedParameters])
                expect(block.fields.some(f => f.name === `p_${param.name}` && f.type === 'api-value')).toBe(true);
        }
    });
    it('finds inherited APIs by the subclass name people use in Manim examples', () => {
        expect(getApiEntry('Axes.plot')?.id).toBe(getApiEntry('CoordinateSystem.plot')?.id);
        expect(searchApi('Axes.plot')[0].id).toBe(getApiEntry('CoordinateSystem.plot')?.id);
    });
    it('keeps curated lowercase block types distinct from names in the API registry', () => {
        const p = project(createAction('camera', { duration: 0 }));
        p.scene.dimension = '3d';
        const result = compileProject(p);
        expect(result.diagnostics).toEqual([]);
        expect(result.code).not.toContain('_av_invoke');
    });
    it('rejects missing required arguments and missing object references before execution', () => {
        expect(errors(api('Transform', 'animation'))[0].message).toContain('mobject');
        expect(errors(api('Create', 'animation', { mobject: { $ref: 'missing' } }))[0].message).toContain('missing');
        expect(errors(api('Mobject.scale', 'result', { scale_factor: 2 }, { receiver: 'missing' }))[0].message).toContain('操作对象');
    });
    it('compiles nested callbacks, inherited kwargs and vector arguments without arbitrary Python', () => {
        const rotation = { $call: { api: 'Mobject.rotate', receiver: { $local: 'm' }, args: [{ $expr: 'dt' }] } };
        const updater = { $lambda: { params: ['m', 'dt'], body: rotation } };
        const result = compileProject(project(api('Circle', '圆', { fill_opacity: 0.3 }), api('Mobject.add_updater', '旋转器', { update_function: updater }, { receiver: '圆' })));
        expect(result.diagnostics).toEqual([]);
        expect(result.code).toContain('_av_method(m,');
        expect(result.code).toContain('"fill_opacity": 0.3');
        expect(result.requiresTrust).toBe(false);
    });
    it('keeps permission requirements through nested callbacks and constants', () => {
        const result = compileProject(project(createAction('api_value', { name: 'callback', value: JSON.stringify({ $lambda: { params: [], body: { $call: { api: 'Tex', args: ['x'] } } } }) })));
        expect(result.diagnostics).toEqual([]);
        expect(result.requiresTrust).toBe(true);
    });
    it('requires trust for module execution even through positional nested calls or deferred callbacks', () => {
        const entry = getApiEntry('manim.utils.module_ops.get_module')!;
        expect(entry.requiresTrust).toBe(true);
        for (const value of [
            { $call: { api: entry.id, args: ['-'] } },
            { $lambda: { params: [], body: { $call: { api: entry.id, args: ['-'] } } } },
        ]) {
            const result = compileProject(project(createAction('api_value', { name: 'loader', value: JSON.stringify(value) })));
            expect(result.diagnostics).toEqual([]);
            expect(result.requiresTrust).toBe(true);
        }
    });
    it('requires permission for optional file inputs even on otherwise ordinary geometry APIs', () => {
        expect(compileProject(project(api('Circle', 'circle'))).requiresTrust).toBe(false);
        expect(compileProject(project(api('Circle', 'circle', { background_image: '/tmp/image.png' }))).requiresTrust).toBe(true);
        const nested = createAction('api_value', { name: 'circle', value: JSON.stringify({ $call: { api: 'Circle', kwargs: { background_image: '/tmp/image.png' } } }) });
        expect(compileProject(project(nested)).requiresTrust).toBe(true);
    });
    it('retains primitive return values and edits references without rewriting literal text or lambda locals', () => {
        const source = api('Circle', 'source');
        const output = createAction('api_value', { name: 'data', value: JSON.stringify([{ $ref: 'source' }, 'source']) });
        const changed = renameProjectObject(project(source, output), source.id, 'renamed');
        expect(JSON.parse(String(changed.actions[1].fields.value))).toEqual([{ $ref: 'renamed' }, 'source']);
        expect(compileProject(changed).diagnostics).toEqual([]);
    });
    it('preserves omitted defaults separately from false, zero, empty string and null', () => {
        const a = api('Text', 'text', { text: '', disable_ligatures: false, font_size: 0 });
        const p = validateProject(project(a));
        expect(p.actions[0].fields.p_text).toBe('""');
        expect(p.actions[0].fields.p_font).toBe('');
        const result = compileProject(p);
        expect(result.code).toContain('"disable_ligatures": False');
        expect(result.code).toContain('"font_size": 0');
    });
    it('compiles writable properties, class methods and context managers as native operations', () => {
        const context = createAction('api_context', { context: JSON.stringify({ $call: { api: 'tempconfig', args: [{ background_color: '#000000' }] } }) });
        context.children = [api('Circle', 'circle')];
        const result = compileProject(project(context, api('Mobject.width', 'width', {}, { receiver: 'circle', mode: 'set', setValue: '2' }), api('ManimColor.from_rgb', 'colour', { rgb: [1, 0, 0] })));
        expect(result.diagnostics).toEqual([]);
        expect(result.code).toContain('with ');
        expect(result.code).toContain('objects["circle"].width = 2');
        expect(result.requiresTrust).toBe(true);
    });
    it('does not invent a duration for scene methods and does not import unused OpenGL modules', () => {
        const result = compileProject(project(api('Scene.wait', 'wait', { duration: 0.4 }, { receiver: '@scene' })));
        expect(result.diagnostics).toEqual([]);
        expect(result.duration).toBeNull();
        expect(result.code).not.toMatch(/^import .*opengl/m);
    });
    it('requires an explicit renderer selection and carries it into standalone exports', () => {
        const entry = API_ENTRIES.find(e => e.renderer === 'opengl' && e.kind === 'class' && e.name === 'OpenGLDot')!;
        const p = project(createAction(entry.type, { name: 'dot' }));
        expect(compileProject(p).diagnostics[0].message).toContain('OpenGL');
        p.scene.renderer = 'opengl';
        expect(compileProject(p).diagnostics).toEqual([]);
        expect(exportStandalonePython(p)).toContain('config.renderer = "opengl"');
        expect(validateProject(p).scene.renderer).toBe('opengl');
    });
    it('bounds AI context to relevant APIs instead of injecting the whole registry', () => {
        const prompt = buildPrompt(project(), 'Use Circle and Axes.plot');
        expect(prompt.length).toBeLessThan(180000);
        expect(prompt).toContain(getApiEntry('Axes.plot')!.type);
        expect(prompt).not.toContain(getApiEntry('Mobject.match_depth')!.type);
    });
    it('imports structured privileged APIs without dropping the renderer permission gate', () => {
        const p = project(api('Tex', 'formula', { tex_strings: ['x^2'] }));
        const imported = parseAIProject(JSON.stringify(p));
        expect(compileProject(imported).requiresTrust).toBe(true);
        expect(() => parseAIProject(JSON.stringify(project(createAction('code', { code: 'print(1)' }))))).toThrow('Python');
    });
    it('can repeat API methods while still rejecting two distinct declarations with the same name', () => {
        const circle = api('Circle', 'circle');
        const method = api('Mobject.scale', 'scaled', { scale_factor: 1.1 }, { receiver: 'circle', mode: 'animate' });
        const repeat = createAction('repeat', { count: 3 });
        repeat.children = [method];
        expect(errors(circle, repeat)).toEqual([]);
        expect(errors(circle, api('Square', 'circle'))[0].message).toContain('已存在');
    });
    it('does not suggest inherited parameters consumed by intermediate constructors', () => {
        expect(getBlockDefinition(getApiEntry('FadeOut')!.type)!.fields.some(f => f.name === 'p_mobject')).toBe(false);
        expect(getBlockDefinition(getApiEntry('Square')!.type)!.fields.some(f => f.name === 'p_color')).toBe(true);
    });
});
