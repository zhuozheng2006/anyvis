#!/bin/zsh
set -e
cd "${0:A:h}/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  print '请先安装 Node.js 22.18 或更高版本。'
  read -k 1 '?按任意键退出'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  print '首次启动需要安装界面依赖，正在执行 npm ci…'
  npm ci --no-fund --no-audit
fi
node scripts/start-studio.mjs
