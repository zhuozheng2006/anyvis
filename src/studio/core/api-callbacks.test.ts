import { describe, it, expect } from 'vitest';
import { createApiCompiler } from './api-compiler';
import { compileApiValue } from './api-values';
const compile = (v: unknown) => createApiCompiler().value(JSON.stringify(v), new Set(['c']), {});
describe('structured callback operations', () => {
    it('supports object methods, properties, comparisons and conditional return values', () => {
        const width = { $property: { api: 'Mobject.width', receiver: { $local: 'm' } } };
        const result = compile({ $lambda: { params: ['m'], body: { $if: [{ $op: ['>', width, 2] }, 'large', 'small'] } } });
        expect(result.code).toContain('_av_receiver(m,');
        expect(result.code).toContain('> (2)');
        expect(result.code).toContain('else ("small")');
    });
    it('propagates references and permission requirements through callback branches', () => {
        const result = compile({ $if: [true, { $ref: 'c' }, { $call: { api: 'Tex', args: ['x'] } }] });
        expect(result.references).toEqual(['c']);
        expect(result.requiresTrust).toBe(true);
    });
    it('rejects arbitrary attribute and operator injection', () => {
        for (const value of [{ $property: { api: '__class__', receiver: { $ref: 'c' } } }, { $op: ['; import os', 1, 2] }, { $call: { api: '__import__', args: ['os'] } }, { $call: { api: 'Circle', receiver: { $ref: 'c' } } }, { $call: { api: 'Circle', command: 'bad' } }, { $if: [true, 1] }])
            expect(() => compile(value)).toThrow();
    });
    it('supports Python identifier underscores but prevents builtin shadowing', () => {
        expect(compile({ $lambda: { params: ['delta_t'], body: { $expr: 'delta_t*2' } } }).code).toContain('lambda delta_t:');
        for (const name of ['complex', 'abs', 'min', 'max'])
            expect(() => compile({ $lambda: { params: [name], body: 0 } })).toThrow('保留');
    });
    it('requires explicit method receivers and scoped callback locals', () => {
        expect(() => compile({ $call: { api: 'Mobject.shift', args: [] } })).toThrow('receiver');
        expect(() => compile({ $call: { api: 'Mobject.shift', receiver: { $local: 'm' }, args: [] } })).toThrow('作用域');
    });
    it('keeps false and true branches lazy in Python and supports boolean negation', () => {
        const ctx = { references: new Set<string>(), constants: {}, callables: {} };
        expect(compileApiValue({ $not: { $op: ['==', 1, 2] } }, ctx).code).toBe('(not (((1) == (2))))');
    });
});
