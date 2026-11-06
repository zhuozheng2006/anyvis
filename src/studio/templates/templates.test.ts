import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import previewManifest from '../../../public/templates/rendered/manifest.json';
import { compileProject } from '../core/compiler.ts';
import { validateProject } from '../core/project.ts';
import { getTemplate, templateCatalog } from './index.ts';

describe('editable starter templates', () => {
  for (const template of templateCatalog) {
    it(`${template.id} is a valid native-block project`, () => {
      const project = validateProject(template.project);
      const compiled = compileProject(project);
      expect(compiled.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
      expect(compiled.requiresTrust).toBe(false);
      expect(compiled.duration).toBeGreaterThan(5);
      expect(compiled.code).toContain('class AnyVisScene');
    });
  }

  it('bundled native previews match the current source and checked media', () => {
    for (const template of templateCatalog) {
      const recorded = previewManifest.templates.find((item) => item.id === template.id);
      expect(recorded).toBeDefined();
      const code = compileProject(template.project).code;
      expect(createHash('sha256').update(code).digest('hex')).toBe(recorded!.sourceSha256);
      const project = JSON.stringify({ scene: template.project.scene, actions: template.project.actions });
      expect(createHash('sha256').update(project).digest('hex')).toBe(recorded!.projectSha256);
      for (const media of [recorded!.video, recorded!.poster]) {
        const bytes = readFileSync(new URL(`../../../public/templates/rendered/${media.path}`, import.meta.url));
        expect(bytes.length).toBe(media.bytes);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(media.sha256);
      }
    }
  });

  it('editing a template copy does not change the catalogue or another copy', () => {
    const first = getTemplate('first-animation');
    const second = getTemplate('first-animation');
    const originalName = second.name;
    const originalText = second.actions[0].fields.text;
    first.name = 'my animation';
    first.actions[0].fields.text = 'my heading';
    expect(first.id).not.toBe(second.id);
    expect(second.name).toBe(originalName);
    expect(second.actions[0].fields.text).toBe(originalText);
    expect(templateCatalog[0].project.actions[0].fields.text).toBe(originalText);
  });
});
