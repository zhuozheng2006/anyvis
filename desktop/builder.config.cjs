const { devDependencies } = require('./package.json')

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'io.anyvis.studio',
  productName: 'AnyVis',
  electronVersion: devDependencies.electron,
  directories: {
    app: 'desktop-build/app',
    output: 'release',
  },
  // Only the prepared, bundled application enters the package.
  files: [
    'main.cjs',
    'host.mjs',
    'preload.cjs',
    'settings.html',
    'settings.js',
    'settings.css',
    'server.mjs',
    'package.json',
    'dist/**/*',
  ],
  extraResources: [{ from: 'server/worker.py', to: 'runtime/worker.py' }],
  asar: true,
  npmRebuild: false,
  artifactName: 'AnyVis-${version}-${os}-${arch}.${ext}',
  publish: null,
  mac: {
    category: 'public.app-category.education',
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'zip', arch: ['arm64', 'x64'] },
    ],
    // Local ad-hoc signing permits Apple Silicon launch. No Developer ID or notarization.
    identity: '-',
    hardenedRuntime: false,
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
  },
  linux: {
    target: [
      { target: 'AppImage', arch: ['x64'] },
      { target: 'deb', arch: ['x64'] },
    ],
    category: 'Education',
    maintainer: 'AnyVis contributors',
  },
}
