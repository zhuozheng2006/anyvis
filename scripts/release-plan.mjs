import { createHash } from 'node:crypto';
import { readFile, writeFile, appendFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function validateReleaseBuild(build, nativeRuns, repository) {
  if (build.repository?.full_name !== repository || build.head_repository?.full_name !== repository
      || build.path !== '.github/workflows/desktop.yml' || build.event !== 'push'
      || build.head_branch !== 'main' || build.status !== 'completed' || build.conclusion !== 'success'
      || !/^[a-f0-9]{40}$/.test(build.head_sha)) {
    throw new Error('Release requires a successful main-branch desktop push build from this repository.');
  }
  if (!nativeRuns.some(run => run.head_sha === build.head_sha && run.head_branch === 'main'
      && run.event === 'push' && run.status === 'completed' && run.conclusion === 'success'
      && run.path === '.github/workflows/native-api.yml')) {
    throw new Error('The same commit must pass the native Manim workflow before publication.');
  }
  return build.head_sha;
}

export function expectedReleaseAssets(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a stable semantic version.');
  return ['mac-arm64.dmg', 'mac-arm64.zip', 'mac-x64.dmg', 'mac-x64.zip', 'win-x64.exe', 'linux-x86_64.AppImage', 'linux-amd64.deb']
    .map(suffix => `AnyVis-${version}-${suffix}`);
}

export function selectReleaseAssets(version, files) {
  const expected = expectedReleaseAssets(version);
  const installers = files.filter(file => /\.(dmg|zip|exe|AppImage|deb)$/.test(file));
  if (installers.length !== expected.length || expected.some(name => installers.filter(file => path.basename(file) === name).length !== 1)) {
    throw new Error(`Expected exactly seven installers for this version, including both macOS architectures. Found: ${installers.map(file => path.basename(file)).join(', ')}`);
  }
  return expected.map(name => installers.find(file => path.basename(file) === name));
}

async function github(endpoint) {
  const response = await fetch(`https://api.github.com/repos/${process.env.GH_REPO}/${endpoint}`, {
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`GitHub ${endpoint}: ${response.status}`);
  return response.json();
}
async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? filesUnder(path.join(directory, entry.name)) : [path.join(directory, entry.name)]))).flat();
}
async function main() {
  if (process.argv[2] === 'plan') {
    const id = process.env.BUILD_RUN_ID;
    if (!/^\d+$/.test(id || '')) throw new Error('Invalid desktop run ID.');
    const build = await github(`actions/runs/${id}`);
    const native = await github(`actions/workflows/native-api.yml/runs?head_sha=${encodeURIComponent(build.head_sha)}&per_page=100`);
    const sha = validateReleaseBuild(build, native.workflow_runs, process.env.GH_REPO);
    await appendFile(process.env.GITHUB_OUTPUT, `sha=${sha}\n`);
  } else if (process.argv[2] === 'assets') {
    const { version } = JSON.parse(await readFile('package.json', 'utf8'));
    const files = selectReleaseAssets(version, await filesUnder('release-downloads'));
    const checksums = [];
    for (const file of files) {
      if (!(await stat(file)).size) throw new Error(`Empty installer: ${file}`);
      checksums.push(`${createHash('sha256').update(await readFile(file)).digest('hex')}  ${path.basename(file)}`);
    }
    await writeFile('SHA256SUMS.txt', checksums.join('\n') + '\n');
    await writeFile('release-assets.json', JSON.stringify([...files, 'SHA256SUMS.txt']));
    await appendFile(process.env.GITHUB_OUTPUT, `tag=v${version}\n`);
  } else throw new Error('Use plan or assets.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
