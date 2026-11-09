import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReleaseBuild, expectedReleaseAssets, selectReleaseAssets } from './release-plan.mjs';
const repository = 'zhuozheng2006/anyvis';
const build = { repository: { full_name: repository }, head_repository: { full_name: repository }, path: '.github/workflows/desktop.yml', event: 'push', head_branch: 'main', head_sha: 'a'.repeat(40), status: 'completed', conclusion: 'success' };
const native = { ...build, path: '.github/workflows/native-api.yml' };
test('publishes only a successful main desktop build with matching native evidence', () => {
  assert.equal(validateReleaseBuild(build, [native], repository), build.head_sha);
  for (const change of [{ conclusion: 'failure' }, { status: 'in_progress' }, { event: 'pull_request' }, { head_branch: 'other' }, { path: '.github/workflows/other.yml' }, { head_repository: { full_name: 'other/repo' } }]) {
    assert.throws(() => validateReleaseBuild({ ...build, ...change }, [native], repository));
  }
  for (const change of [{ head_sha: 'b'.repeat(40) }, { conclusion: 'failure' }, { status: 'in_progress' }, { event: 'pull_request' }, { path: '.github/workflows/other.yml' }]) {
    assert.throws(() => validateReleaseBuild(build, [{ ...native, ...change }], repository));
  }
});
test('rejects missing, duplicate, wrong-version and extra installers', () => {
  // Use the actual electron-builder names; Linux targets normalize arch names.
  const names = ['AnyVis-0.5.1-mac-arm64.dmg', 'AnyVis-0.5.1-mac-arm64.zip',
    'AnyVis-0.5.1-mac-x64.dmg', 'AnyVis-0.5.1-mac-x64.zip', 'AnyVis-0.5.1-win-x64.exe',
    'AnyVis-0.5.1-linux-x86_64.AppImage', 'AnyVis-0.5.1-linux-amd64.deb'];
  assert.deepEqual(expectedReleaseAssets('0.5.1'), names);
  const files = names.map(name => `artifacts/${name}`);
  assert.deepEqual(selectReleaseAssets('0.5.1', [...files, 'checks/smoke.json']), files);
  for (const invalid of [files.slice(1), [...files, files[0]], files.map(p => p.replace('0.5.1', '0.5.0')), [...files, 'other.exe']]) {
    assert.throws(() => selectReleaseAssets('0.5.1', invalid));
  }
  assert.throws(() => expectedReleaseAssets('../invalid'));
});
