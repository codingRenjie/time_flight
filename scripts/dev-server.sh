#!/bin/sh
# Time Pilot 开发服务器启动脚本（launchd / 手动通用）
# 用法：sh scripts/dev-server.sh
cd "$(dirname "$0")/.." || exit 1
exec "/Users/renjie/Library/Application Support/Logi/LogiPluginService/PluginHosts/node22/node/bin/node" \
  node_modules/vite/bin/vite.js --host --port 5173 --strictPort
