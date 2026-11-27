#!/usr/bin/env bash
# 独立测试入口：在当前（可写、空的）工作目录安装浏览器驱动，然后执行驱动层 qa/main.mjs。
# 结果写到 QA_RESULT_PATH，证据写到 QA_EVIDENCE_DIR；写出有效结果后以 0 退出。
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/ms-playwright}"
export QA_EVIDENCE_DIR="${QA_EVIDENCE_DIR:-$PWD/evidence}"
mkdir -p "$QA_EVIDENCE_DIR"
if [ ! -d node_modules/playwright-core ]; then
  [ -f package.json ] || npm init -y >/dev/null 2>&1
  npm install --no-audit --no-fund --silent playwright-core@1.65.1 >"$QA_EVIDENCE_DIR/npm-install.log" 2>&1 \
    || echo "npm install failed, see npm-install.log"
fi
node "$HERE/qa/main.mjs" </dev/null
exit 0
