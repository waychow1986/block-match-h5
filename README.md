# block-match-h5
AIDelivery Hub project: 浏览器里玩的消除方块小游戏，有计分和关卡

## 开发

```bash
npm ci
npm run dev              # 本地开发服务器
npm run typecheck        # TypeScript 类型检查
npm run build            # 产出静态文件到 dist/
npm run test:unit        # 单元测试（tests/unit，含开发者检查 TS-11/16/19）
npm run test:integration # 集成测试（tests/integration，happy-dom）
npx playwright test e2e/play.spec.ts   # 端到端用例（桌面与手机两个项目）
npx playwright test e2e/mute.spec.ts -g "AC-14" --project=desktop   # 单独运行某个用例
```

端到端测试默认先构建并在 `E2E_PORT`（默认 4173）上启动预览服务；设置 `E2E_BASE_URL` 时直接针对该地址运行。

端到端用例：`play.spec.ts`（基本玩法与关卡）、`highscore.spec.ts`（最高分）、`effects.spec.ts`（高亮与动画）、`mute.spec.ts`（音效与静音）、`layout.spec.ts`（各尺寸布局与无横向滚动）。

## 玩法与界面

- 点击（或轻触）两个及以上相连的同色方块即可消除，得分为 10 × 数量²；达到本关目标分数后进入下一关。
- 鼠标悬停或按住方块时，整组同色相连方块会高亮；单个方块不高亮。
- 消除、下落、左移、分数增加都有过渡动画，并在棋盘上显示“+得分”。
- 消除、过关和游戏结束有音效（Web Audio 合成，首次触碰页面后才会发声）；顶部信息栏中的“静音”按钮可随时关闭或恢复，刷新页面后恢复为有声。
- 页面适配桌面浏览器和手机竖屏，棋盘按可用空间缩放，不出现横向滚动条。

## 构建容器与部署

```bash
docker build -t block-match-h5 .
docker run --rm -p 8080:8080 block-match-h5
# 浏览器打开 http://localhost:8080 ；健康检查：curl http://localhost:8080/healthz  → ok
```

- `Dockerfile`：先在 `node:22-alpine` 中执行 `npm ci && npm run build`，再把 `dist/` 复制到 `nginxinc/nginx-unprivileged:1.28-alpine`，以非 root 用户（UID 101）运行，监听 8080。
- `deploy/nginx.conf`：`/healthz` 返回 `200 ok`；`index.html` 不缓存，`/assets/*` 长期缓存；附加 CSP、`X-Content-Type-Options`、`Referrer-Policy` 安全响应头。
- 测试环境按 `docs/deployment.json` 部署（服务 `web`，端口 8080，健康检查 `/healthz`）。
