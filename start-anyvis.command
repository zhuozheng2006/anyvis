#!/bin/zsh
set -e
cd "${0:A:h}"
if ! command -v npm >/dev/null 2>&1; then
  print '请先安装 Node.js 22.12 或更高版本，然后重新打开此文件。'
  read -k 1 '?按任意键退出'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  print '首次启动正在安装依赖，需要网络连接…'
  npm install --no-fund --no-audit
fi
print 'AnyVis 将在 http://127.0.0.1:5173 启动；请保持此终端打开。'
npm run dev -- --open
