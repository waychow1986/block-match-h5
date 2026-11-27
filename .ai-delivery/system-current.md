# 系统现状：block-match-h5（方块消除小游戏）

本文只记录仓库代码中已有的事实，每条标注出处（仓库相对路径）。依据：交付 DLV-20261126-14798E1AFEC3 V1（`.ai-delivery/features/001-v1/`）分支上的代码。

## 1. 系统概览

- 纯前端浏览器小游戏（单页静态站点），没有后端服务、没有数据库、没有外部依赖与机密；页面标题“消除方块”，`lang="zh-CN"`（出处：`index.html`、`docs/dependencies.json`）。
- 入口 `src/main.ts` 引入样式 `src/styles/main.css` 并调用 `mountGame(document.body)`（出处：`src/main.ts`）。
- 构建产物为 `dist/` 下的静态文件，由容器内的 nginx 提供（出处：`vite.config.ts`、`Dockerfile`、`deploy/nginx.conf`）。

## 2. 技术栈与版本

- 语言：TypeScript 5.9.3，`strict`、`noUncheckedIndexedAccess`、`target`/`lib` 为 ES2022 + DOM，`moduleResolution: Bundler`，`noEmit`（出处：`package.json`、`tsconfig.json`）。
- 构建：Vite 8.4.0，输出目录 `dist`（出处：`package.json`、`vite.config.ts`）。
- 单元/集成测试：Vitest 5.1.2，集成测试环境 happy-dom 21.0.4（出处：`package.json`、`vite.config.ts`）。
- 端到端测试：@playwright/test 1.65.1（出处：`package.json`、`playwright.config.ts`）。
- 其他开发依赖：@types/node 22.20.7（出处：`package.json`）。
- 运行时依赖：无（`package.json` 只有 `devDependencies`）；锁文件 `package-lock.json`，`lockfileVersion: 3`（出处：`package.json`、`package-lock.json`）。
- 包为 ES 模块（`"type": "module"`），`private: true`，版本 0.1.0（出处：`package.json`）。
- 浏览器能力：Pointer Events、Web Animations API（缺失时只失去视觉效果）、Web Audio（`AudioContext`/`webkitAudioContext`）、`localStorage`、`crypto.getRandomValues`、CSS 容器查询单位（`cqw`/`cqh`）与 `dvh`（出处：`src/ui/input.ts`、`src/ui/anim.ts`、`src/audio/sound.ts`、`src/storage/highScore.ts`、`src/game/rng.ts`、`src/styles/main.css`）。

## 3. 目录与模块

| 路径 | 职责 | 出处 |
|---|---|---|
| `src/main.ts` | 页面入口：引入样式并挂载游戏 | `src/main.ts` |
| `src/app.ts` | `mountGame(root, { rng? })`：创建随机数发生器（默认 `mulberry32(randomSeed())`）、最高分存储与 `GameController`，返回 `{ state, destroy() }` | `src/app.ts` |
| `src/game/board.ts` | 棋盘数据结构与规则：`findGroup`、`hasMoves`、`removeGroup`、`generateBoard`、`makeBoard`、`tileAt` | `src/game/board.ts` |
| `src/game/game.ts` | 游戏状态机：`createGame`、`tryRemove`、`levelOutcome`、`nextLevel`、`restart` | `src/game/game.ts` |
| `src/game/levels.ts` | 棋盘尺寸与关卡参数：`COLS`、`ROWS`、`MAX_COLORS`、`colorsFor`、`targetFor` | `src/game/levels.ts` |
| `src/game/scoring.ts` | 计分：`scoreFor(n)` | `src/game/scoring.ts` |
| `src/game/rng.ts` | 随机数：`mulberry32(seed)`、`randomSeed()` | `src/game/rng.ts` |
| `src/storage/highScore.ts` | 历史最高分的读写：`createHighScoreStore`、`browserStorage`、`HIGH_SCORE_KEY` | `src/storage/highScore.ts` |
| `src/audio/sound.ts` | Web Audio 合成音效与静音：`createSound` | `src/audio/sound.ts` |
| `src/ui/controller.ts` | `GameController`：把规则、棋盘视图、信息栏、提示层、输入与音效连在一起 | `src/ui/controller.ts` |
| `src/ui/boardView.ts` | `BoardView`：以按钮渲染方块、高亮、分阶段动画；`COLOR_NAMES`、`tileLabel` | `src/ui/boardView.ts` |
| `src/ui/hud.ts` | `Hud`：顶部信息栏（当前关卡、当前分数、本关目标分数、历史最高分）与分数滚动 | `src/ui/hud.ts` |
| `src/ui/input.ts` | `attachTapInput`：Pointer Events 轻点识别与高亮请求 | `src/ui/input.ts` |
| `src/ui/overlay.ts` | `Overlay`：过关/游戏结束的覆盖提示层 | `src/ui/overlay.ts` |
| `src/ui/anim.ts` | `animate()`：Web Animations API 的安全包装 | `src/ui/anim.ts` |
| `src/ui/timing.ts` | 各动画时长常量 | `src/ui/timing.ts` |
| `src/styles/main.css` | 全部样式：布局、方块立体效果、配色、高亮、动画、提示层 | `src/styles/main.css` |
| `tests/unit/` | 单元测试（node 环境）：board、game、highScore、levels、rng、scoring | `tests/unit/*.test.ts`、`vite.config.ts` |
| `tests/integration/` | 集成测试（happy-dom）：audio、controller、effects，辅助 `helpers.ts` | `tests/integration/*`、`vite.config.ts` |
| `e2e/` | Playwright 端到端用例：play、highscore、effects、mute、layout，辅助 `helpers.ts` | `e2e/*`、`playwright.config.ts` |
| `deploy/nginx.conf` | 容器内 nginx 站点配置 | `deploy/nginx.conf` |
| `docs/deployment.json`、`docs/dependencies.json` | 部署声明与依赖声明 | `docs/*.json` |

## 4. 命令

| 命令 | 作用 | 出处 |
|---|---|---|
| `npm ci` | 安装依赖 | `README.md`、`.ai-delivery/features/001-v1/runtime/deployment.json` |
| `npm run dev` | `vite` 本地开发服务器 | `package.json` |
| `npm run build` | `vite build`，输出 `dist/` | `package.json`、`vite.config.ts` |
| `npm run preview` | `vite preview` | `package.json` |
| `npm run typecheck` | `tsc --noEmit` | `package.json` |
| `npm run test:unit` | `vitest run --project unit`（`tests/unit/**/*.test.ts`，node 环境） | `package.json`、`vite.config.ts` |
| `npm run test:integration` | `vitest run --project integration`（`tests/integration/**/*.test.ts`，happy-dom 环境） | `package.json`、`vite.config.ts` |
| `npm run test:e2e` | `playwright test`（`e2e/` 目录） | `package.json`、`playwright.config.ts` |

- 本交付声明的开发者检查：准备 `npm ci`；静态检查 `npm run typecheck`；构建 `npm run build`；开发者测试 `npm run test:unit`；集成测试 `npm run test:integration`（出处：`.ai-delivery/features/001-v1/runtime/deployment.json`）。
- Playwright 配置：两个项目 `desktop`（Desktop Chrome）与 `mobile`（Pixel 7）；单用例超时 6 分钟，`fullyParallel`；未设置 `E2E_BASE_URL` 时先执行 `npm run build && npx vite preview --port <E2E_PORT> --strictPort`（`E2E_PORT` 默认 4173），设置时直接以其为 `baseURL`（出处：`playwright.config.ts`）。

## 5. 领域与数据模型

### 5.1 棋盘

- 棋盘固定 10 列 × 10 行（`COLS = 10`、`ROWS = 10`），最多 5 种颜色（`MAX_COLORS = 5`），颜色编号 `ColorId` 为 0–4（出处：`src/game/levels.ts`、`src/game/board.ts`）。
- `Tile = { id, color }`；`Board = Tile[][]` 按列存储：`board[col][rowFromBottom]`，只保留非空列，每列从底部紧密排列（出处：`src/game/board.ts`）。
- 方块 `id` 在一次页面会话内唯一：`GameState.nextId` 记录下一个未用编号，每关新棋盘从它开始编号（出处：`src/game/game.ts`）。
- `findGroup`：从给定位置按上下左右四邻域找同色相连的全部方块（出处：`src/game/board.ts`）。
- `hasMoves`：棋盘上存在上下或左右相邻的同色方块即为还有可消除的组（出处：`src/game/board.ts`）。
- `removeGroup`：所在组少于 2 个时返回 `null`（不消除）；否则删除该组，每列剩余方块下落补位，整列变空的列被移除、右侧列向左靠拢；返回 `removed`（被删方块的 id 与位置）、`moved`（位置变化的方块，含 `from`、下落后的 `afterFall`、最终 `to`）、`gained`、新 `board` 与 `levelEnded = !hasMoves(新棋盘)`（出处：`src/game/board.ts`）。
- `generateBoard`：按随机数生成满盘棋盘，要求至少 2 种颜色且至少有一组可消除；最多重试 50 次，仍不满足时把左下角改成一对同色并把右上角改成另一种颜色（出处：`src/game/board.ts`）。

### 5.2 计分与关卡

- 一次消除 n 个方块得分 `scoreFor(n) = 10 × n²`（出处：`src/game/scoring.ts`）。
- 第 L 关（从 1 开始）的颜色数 `colorsFor(L) = min(2 + L, 5)`，即 3、4、5、5……（出处：`src/game/levels.ts`）。
- 第 L 关的目标分数是累计总分门槛 `targetFor(L) = 2000·L + 250·L·(L−1)`，即每关新增门槛 `2000 + 500·(L−1)`；关卡数不设上限（出处：`src/game/levels.ts`、`src/game/game.ts`）。
- 游戏状态 `GameState = { level, score, target, colors, board, phase, nextId }`，`phase` 取 `'playing' | 'levelCleared' | 'gameOver'`（出处：`src/game/game.ts`）。
- `createGame`：第 1 关、分数 0（出处：`src/game/game.ts`）。
- `tryRemove`：仅在 `playing` 时生效；消除成功后分数累加，若本关已无可消除的组则由 `levelOutcome` 判定：`score >= target` 为 `levelCleared`，否则 `gameOver`（出处：`src/game/game.ts`）。
- `nextLevel`：关卡 +1，分数保留（累计）；`restart`：回到第 1 关、分数清零（出处：`src/game/game.ts`）。
- 随机数：`mulberry32(seed)` 确定性发生器；页面默认种子来自 `crypto.getRandomValues`；`mountGame` 的 `rng` 选项可注入（出处：`src/game/rng.ts`、`src/app.ts`）。
- 进行中的关卡、分数与棋盘不做持久化，页面重新加载后从第 1 关开始（出处：`src/app.ts`、`src/ui/controller.ts`，仅最高分写入存储）。

### 5.3 历史最高分（本机存储）

- 存于 `window.localStorage`，键 `block-match.highScore`，值为十进制非负整数字符串；读取到的值不是纯数字或不是安全整数时按 0 处理（出处：`src/storage/highScore.ts`）。
- `offer(score)`：先重新读取存储取较大值，分数严格高于当前最高分时更新内存值并写入存储；`localStorage` 不可用或读写抛错时只保留内存中的值（出处：`src/storage/highScore.ts`）。
- 每次消除成功后立即调用 `offer(当前分数)`，不等到游戏结束（出处：`src/ui/controller.ts` `onTap`）。

## 6. 界面与交互约定

### 6.1 页面结构与可访问名称

- 根元素 `<main class="game">`，包含信息栏 `<header class="hud">` 与 `.board-area > .board-wrap > .board`（出处：`src/ui/controller.ts`、`src/ui/hud.ts`）。
- 信息栏 4 项，各为 `role="status"` 的 `<output>`，可访问名称依次为“当前关卡”“当前分数”“本关目标分数”“历史最高分”（出处：`src/ui/hud.ts`）。
- 静音按钮 `button.mute`，可访问名称“静音”，`aria-pressed` 表示是否静音，图标为内联 SVG（出处：`src/ui/controller.ts`）。
- 棋盘为 `role="group"`、名称“棋盘”的容器，动画进行中 `aria-busy="true"`，结束后为 `"false"`（出处：`src/ui/boardView.ts`、`src/ui/controller.ts`）。
- 每个方块是 `<button class="tile color-{n}">`，`data-color` 为颜色编号，可访问名称 `{颜色}色方块，第{行}行第{列}列`；颜色名依次为红、黄、绿、蓝、紫，行号从顶部为 1、列号从左为 1（出处：`src/ui/boardView.ts` `COLOR_NAMES`、`tileLabel`）。
- 高亮的方块带 `data-state="highlighted"`（出处：`src/ui/boardView.ts`）。
- 关卡结束提示层为 `role="dialog"`、`aria-modal="true"` 的 `.overlay`，覆盖在 `.board-wrap` 之上；过关：标题与名称“过关”、按钮“下一关”；游戏结束：标题与名称“游戏结束”、按钮“重新开始”；正文“得分 {总分}”；显示时按钮获得焦点（出处：`src/ui/overlay.ts`）。
- 点“下一关”进入下一关（分数保留），点“重新开始”回到第 1 关、分数清零（出处：`src/ui/controller.ts` `showOutcome`）。

### 6.2 输入

- 使用 Pointer Events：按下与抬起在同一方块上才算一次轻点；在其他位置抬起或 `pointercancel` 则取消；非主键按下被忽略；抬起事件在 document 上监听（出处：`src/ui/input.ts`）。
- 高亮：鼠标悬停请求高亮指针下的方块，任何指针类型按下时请求高亮按下的方块；控制器只在所在组至少 2 个、非忙碌且 `playing` 时高亮整组，否则清除（出处：`src/ui/input.ts`、`src/ui/controller.ts` `highlight`）。
- 动画进行中（忙碌）的输入直接忽略、不排队；提示层显示期间不接受消除（出处：`src/ui/controller.ts`）。

### 6.3 动画与时长

- 时长（毫秒）：消除 180、下落 240、左移 200、分数滚动 400、“+得分”浮字 700、新方块出现 220；整段移动 `MOVE_SETTLE_MS = 620`；本关最后一步后再停 300 毫秒显示提示层（出处：`src/ui/timing.ts`）。
- 方块以绝对定位按钮按 id 复用，位置由 CSS 变量 `--c`/`--r` 决定；移动按 消除 → 下落（到 `afterFall`）→ 左移（到 `to`）分阶段，过渡时长由 `--move-ms` 控制（出处：`src/ui/boardView.ts`、`src/styles/main.css`）。
- 被消除的方块改为 `.tile-ghost`（`aria-hidden`、不可点）缩小淡出后移除；可访问名称与命中检测始终对应最终棋盘（出处：`src/ui/boardView.ts`）。
- 当前分数按动画帧从旧值滚动到新值；忙碌结束（`aria-busy="false"`）时信息栏已是最终值（出处：`src/ui/hud.ts`、`src/ui/controller.ts` `setBusy`）。
- 在被消除组的中心显示 `.score-float` “+得分”（出处：`src/ui/controller.ts` `showGain`、`src/styles/main.css`）。

### 6.4 音效

- Web Audio 三角波合成，所有声音经同一主音量节点（音量 0.25）；首次在页面上 `pointerdown` 时创建/恢复 `AudioContext`（出处：`src/audio/sound.ts`、`src/ui/controller.ts`）。
- 消除：单音，音高随消除数升高（最多高两个八度）；过关：上行三音；游戏结束：下行三音（出处：`src/audio/sound.ts`）。
- 静音：主音量置 0、停止所有正在播放的声音，并且不再创建新声音；取消静音只恢复主音量。静音状态只在内存中，刷新页面后恢复为有声（出处：`src/audio/sound.ts`、`README.md`）。

### 6.5 布局与样式

- `html`/`body` 设置 `overflow-x: hidden`、`max-width: 100%`，高度 `100dvh`（出处：`src/styles/main.css`）。
- 棋盘容器边长 `min(100cqw, 100cqh, 640px)`、正方形，随可用空间缩放；不支持容器查询单位时回退为 `min(92vw, calc(100dvh - 140px), 640px)`（出处：`src/styles/main.css`）。
- 页面 `viewport` 为 `width=device-width, initial-scale=1, viewport-fit=cover`，内边距考虑 `safe-area-inset`（出处：`index.html`、`src/styles/main.css`）。
- 方块立体效果：上下渐变（`--hi`/`--base`/`--lo`）加内高光与内阴影；五种配色定义在 `.color-0` 至 `.color-4`；高亮时放大 1.06、提亮并加外发光（出处：`src/styles/main.css`）。

## 7. 外部依赖与配置

- 外部依赖与机密：无（`dependencies: []`、`secrets: []`）（出处：`docs/dependencies.json`）。
- 应用没有运行时配置项与环境变量；端到端测试读取 `E2E_PORT`、`E2E_BASE_URL`（出处：`src/`、`playwright.config.ts`）。

## 8. 部署与运行

- 镜像两阶段构建：`node:22-alpine` 中 `npm ci --no-audit --no-fund` 后 `npm run build`；运行阶段 `nginxinc/nginx-unprivileged:1.28-alpine`，复制 `dist/` 到 `/usr/share/nginx/html`，以 UID 101 运行，监听 8080（出处：`Dockerfile`）。
- `.dockerignore` 排除 `.git`、`.ai-delivery`、`node_modules`、`dist`、测试产物等（出处：`.dockerignore`）。
- nginx：监听 8080（IPv4/IPv6）；`/healthz` 返回 `200 ok`（不记访问日志）；`/index.html` `Cache-Control: no-cache`；`/assets/` `public, max-age=31536000, immutable`；各位置统一附加 CSP（`default-src 'self'`、`script-src 'self'`、`style-src 'self' 'unsafe-inline'` 等）、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`；`server_tokens off`（出处：`deploy/nginx.conf`）。
- 部署声明：一个服务 `web`，以仓库根为构建上下文、使用 `Dockerfile`，端口 8080，健康检查 `/healthz`，对外暴露；错误日志规则 `nginx-critical`（emerg/alert/crit，高）、`nginx-error`（error，10 分钟内 3 次，中）、`http-5xx`（高）（出处：`docs/deployment.json`）。

## 9. 测试约定

- 单元测试覆盖 `src/game/*` 与 `src/storage/highScore.ts`，在 node 环境运行（出处：`tests/unit/`、`vite.config.ts`）。
- 集成测试在 happy-dom 中通过 `mountGame(root, { rng: mulberry32(种子) })` 挂载游戏，按方块可访问名称定位方块、派发 Pointer 事件模拟轻点（出处：`tests/integration/helpers.ts`）。
- 端到端用例只通过可访问角色与名称读取棋盘与信息栏（`readGrid` 解析方块名称）；用例按验收标准命名：`play.spec.ts`（AC-1..AC-7）、`highscore.spec.ts`（AC-10）、`effects.spec.ts`（AC-11、AC-12）、`mute.spec.ts`（AC-14）、`layout.spec.ts`（AC-15）（出处：`e2e/helpers.ts`、`e2e/*.spec.ts`）。
- 测试可通过 `mountGame(root, { rng })` 注入确定性随机数（出处：`src/app.ts`）。
