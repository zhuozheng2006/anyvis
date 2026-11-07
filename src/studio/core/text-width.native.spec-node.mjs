import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverPython } from '../../../server/server.mjs';
import { createAction } from './catalog.ts';
import { compileProject } from './compiler.ts';
import { createEmptyProject } from './project.ts';

const execute = promisify(execFile);

test('native Manim measures capped Chinese text while keeping default, short and multiline text intact', { timeout: 30_000 }, async t => {
  const health = await discoverPython();
  if (!health.available || !health.chineseFont) { t.skip('A Manim environment with Chinese fonts is required.'); return; }
  const temporary = await mkdtemp(path.join(tmpdir(), 'anyvis-text-width-'));
  try {
    const longText = '这是一段用于讲解数学动画的较长中文字幕，需要限制最大宽度以避免超出画面边界';
    const legacy = createAction('text', { name: 'legacy', text: longText, appear: 'none' });
    delete legacy.fields.maxWidth;
    const project = createEmptyProject();
    project.actions = [legacy,
      createAction('text', { name: 'bounded', text: longText, maxWidth: 8, x: 1, y: -2, appear: 'none' }),
      createAction('text', { name: 'short', text: '短句', appear: 'none' }),
      createAction('text', { name: 'short_bounded', text: '短句', maxWidth: 8, appear: 'none' }),
      createAction('text', { name: 'multiline', text: '第一行中文\n第二行中文', maxWidth: 8, appear: 'none' }),
      createAction('text', { name: 'singleline', text: '第一行中文第二行中文', appear: 'none' }),
      createAction('code', { code: `import json\nreference = Text(${JSON.stringify(longText)}, font=_font, font_size=42)\nmeasurements = {"legacy": float(objects["legacy"].width), "reference": float(reference.width), "bounded": float(objects["bounded"].width), "short": float(objects["short"].width), "short_bounded": float(objects["short_bounded"].width), "multiline_height": float(objects["multiline"].height), "singleline_height": float(objects["singleline"].height), "bounded_center": objects["bounded"].get_center().tolist()}\nprint("ANYVIS_TEXT_WIDTH " + json.dumps(measurements))` }),
    ];
    const compiled = compileProject(project);
    assert.deepEqual(compiled.diagnostics.filter(diagnostic => diagnostic.severity === 'error'), []);
    assert.equal(compiled.requiresTrust, true); // The fixed test fixture inspects its own generated objects.
    const source = `${compiled.code}\nif __name__ == "__main__":\n    with tempconfig({"write_to_movie": False, "save_last_frame": False, "media_dir": "media", "progress_bar": "none"}):\n        AnyVisScene().construct()\n`;
    const filename = path.join(temporary, 'measure.py');
    await writeFile(filename, source, 'utf8');
    const { stdout } = await execute(health.python, [filename], { cwd: temporary, timeout: 20_000, maxBuffer: 1024 * 1024 });
    const record = stdout.split(/\r?\n/).find(line => line.startsWith('ANYVIS_TEXT_WIDTH '));
    assert.ok(record, stdout);
    const widths = JSON.parse(record.slice('ANYVIS_TEXT_WIDTH '.length));
    assert.ok(widths.legacy > 8, JSON.stringify(widths));
    assert.ok(Math.abs(widths.legacy - widths.reference) < 1e-9);
    assert.ok(widths.bounded <= 8 + 1e-9 && widths.bounded > 7.99);
    assert.ok(Math.abs(widths.short_bounded - widths.short) < 1e-9);
    assert.ok(widths.multiline_height > widths.singleline_height * 1.5);
    assert.ok(Math.abs(widths.bounded_center[0] - 1) < 1e-9 && Math.abs(widths.bounded_center[1] + 2) < 1e-9);
    t.diagnostic(JSON.stringify(widths));
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
