import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverPython } from '../../../server/server.mjs';
import { PIANO_RUNTIME } from './piano.ts';

const execute = promisify(execFile);

test('procedural piano synthesizer generates valid AudioSegment with correct metrics', { timeout: 120_000 }, async t => {
  const health = await discoverPython();
  if (!health.available) {
    t.skip('Manim/Python environment required');
    return;
  }

  assert.ok(typeof PIANO_RUNTIME === 'string' && PIANO_RUNTIME.length > 500, 'PIANO_RUNTIME must be a non-empty string');
  assert.ok(PIANO_RUNTIME.includes('def _anyvis_piano_segment(duration'), 'PIANO_RUNTIME must declare _anyvis_piano_segment');

  const directory = await mkdtemp(path.join(tmpdir(), 'anyvis-piano-test-'));
  try {
    const previewFile = path.join(directory, 'piano-preview.wav');
    const runnerScript = `
import json, time, sys, os
from pathlib import Path
import numpy as np

${PIANO_RUNTIME}

results = {}

# Test 1: Duration accuracy across various durations
durations = [0.1, 0.5, 1.234, 5.0, 15.0]
duration_checks = []
for d in durations:
    seg = _anyvis_piano_segment(d)
    expected_ms = int(round(d * 1000.0))
    duration_checks.append({
        "input_s": d,
        "actual_ms": len(seg),
        "expected_ms": expected_ms,
        "exact": len(seg) == expected_ms
    })
results["durations"] = duration_checks

# Test 2: Audio levels (Peak <= 0.8, RMS ~ 0.12 - 0.20)
seg_10s = _anyvis_piano_segment(10.0)
pcm = np.frombuffer(seg_10s.raw_data, dtype=np.int16).astype(np.float32) / 32767.0
peak = float(np.max(np.abs(pcm)))
rms = float(np.sqrt(np.mean(pcm ** 2)))
results["levels"] = {
    "peak": peak,
    "peak_ok": peak <= 0.8,
    "rms": rms,
    "rms_ok": 0.10 <= rms <= 0.22,
    "channels": seg_10s.channels,
    "frame_rate": seg_10s.frame_rate
}

# Test 3: 100% Determinism with fixed seed
seg_a = _anyvis_piano_segment(5.0)
seg_b = _anyvis_piano_segment(5.0)
results["determinism"] = (seg_a.raw_data == seg_b.raw_data)

# Test 4: Smooth start and end (fade-in & fade-out)
first_sample = float(np.abs(pcm[:2]).max())
last_sample = float(np.abs(pcm[-2:]).max())
results["boundary"] = {
    "first_sample": first_sample,
    "last_sample": last_sample,
    "smooth": (first_sample <= 0.01 and last_sample <= 0.01)
}

# Test 5: Long-generation performance (60 seconds)
t0 = time.time()
seg_60s = _anyvis_piano_segment(60.0)
dt_60s = time.time() - t0
results["perf_60s"] = {
    "duration_ms": len(seg_60s),
    "time_sec": dt_60s,
    "fast": dt_60s < 30.0
}

# Exercise the supported ten-minute upper bound as well.
t0 = time.time()
seg_long = _anyvis_piano_segment(600.0)
assert len(seg_long) == 600000
assert abs(seg_long.get_array_of_samples()[-1]) < 328
results["perf_600s"] = time.time() - t0
del seg_long

# Test 6: Export a disposable preview file
preview_path = Path(sys.argv[1])
preview_path.parent.mkdir(parents=True, exist_ok=True)
preview_seg = _anyvis_piano_segment(15.0)
preview_seg.export(str(preview_path), format="wav")
results["preview_exported"] = preview_path.exists() and preview_path.stat().st_size > 100_000

print("PIANO_TEST_RESULT " + json.dumps(results))
`;

    const pyFile = path.join(directory, 'test_piano.py');
    await writeFile(pyFile, runnerScript);

    const execResult = await execute(health.python, [pyFile, previewFile], {
      cwd: directory,
      timeout: 60_000,
      env: { ...process.env, PATH: `${path.dirname(health.python)}:${process.env.PATH || ''}` }
    });

    const line = execResult.stdout.split('\n').find(l => l.startsWith('PIANO_TEST_RESULT '));
    assert.ok(line, `Python runner failed to produce expected output: ${execResult.stderr}\n${execResult.stdout}`);
    const results = JSON.parse(line.slice('PIANO_TEST_RESULT '.length));

    // Verify all durations match expected milliseconds
    for (const check of results.durations) {
      assert.strictEqual(
        check.actual_ms,
        check.expected_ms,
        `Duration mismatch for ${check.input_s}s: expected ${check.expected_ms}ms, got ${check.actual_ms}ms`
      );
    }

    // Verify levels
    assert.ok(results.levels.peak_ok, `Peak amplitude exceeds 0.8: ${results.levels.peak}`);
    assert.ok(results.levels.rms_ok, `RMS not in expected 0.10-0.22 range: ${results.levels.rms}`);
    assert.strictEqual(results.levels.channels, 2, 'Must be stereo (2 channels)');
    assert.ok(results.levels.frame_rate === 22050 || results.levels.frame_rate === 24000, 'Sample rate must be 22050 or 24000');

    // Verify determinism
    assert.strictEqual(results.determinism, true, 'Synthesizer must be 100% deterministic with default seed');

    // Verify boundary smoothness
    assert.ok(results.boundary.smooth, `Boundary not smooth: first=${results.boundary.first_sample}, last=${results.boundary.last_sample}`);

    // Verify performance
    assert.ok(results.perf_60s.fast, `60s generation was too slow: took ${results.perf_60s.time_sec}s`);

    // Verify preview artifact
    assert.strictEqual(results.preview_exported, true, 'Preview WAV file must be exported');
    const previewStat = await stat(previewFile);
    assert.ok(previewStat.size > 500_000, `Preview file too small: ${previewStat.size} bytes`);

    t.diagnostic(`Piano synthesizer verified: Peak=${results.levels.peak.toFixed(4)}, RMS=${results.levels.rms.toFixed(4)}, 60s in ${results.perf_60s.time_sec.toFixed(3)}s`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
