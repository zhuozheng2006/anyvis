import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function packagedDesktopExecutable() {
  const release = fileURLToPath(new URL('../release/', import.meta.url));
  const candidates = process.platform === 'darwin'
    ? [path.join(release, process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'AnyVis.app', 'Contents', 'MacOS', 'AnyVis')]
    : process.platform === 'win32'
      ? [path.join(release, 'win-unpacked', 'AnyVis.exe')]
      : ['anyvis-desktop', 'anyvis', 'AnyVis'].map(name => path.join(release, 'linux-unpacked', name));
  const executable = candidates.find(candidate => existsSync(candidate));
  if (!executable) throw new Error(`Packaged application not found: ${candidates.join(', ')}`);
  return executable;
}
