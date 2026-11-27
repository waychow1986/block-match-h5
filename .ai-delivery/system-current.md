# 系统现状：block-match-h5（交换三消小游戏“方块换换”）

本文只记录仓库代码中已有的事实，每条标注出处（仓库相对路径）。依据：交付 DLV-20261127-5E1CB775C860 V1（`.ai-delivery/features/002-v1/`）分支上的代码；该交付把原“点击相连同色方块消除”玩法整体替换为交换三消玩法，原玩法的代码已不存在。

## 1. 系统概览

- 纯前端浏览器小游戏（单页静态站点），没有后端服务、没有数据库、没有外部依赖与机密；页面标题“方块换换”，`lang="zh-CN"`（出处：`index.html`、`docs/dependencies.json`）。
- 游戏名常量 `GAME_NAME = '方块换换'`，作为页面一级标题显示（出处：`src/ui/intro.ts`）。
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
- 浏览器能力：Pointer Events 与指针捕获（`setPointerCapture`）、`elementFromPoint`、Web Audio（`AudioContext`/`webkitAudioContext`）、`localStorage`、`crypto.getRandomValues`、`requestAnimationFrame`、CSS 动画与过渡、`conic-gradient`、`clip-path`、CSS 容器查询单位（`cqw`/`cqh`）与 `dvh`（出处：`src/ui/input.ts`、`src/audio/sound.ts`、`src/storage/highScore.ts`、`src/game/rng.ts`、`src/ui/hud.ts`、`src/styles/main.css`）。

## 3. 目录与模块

| 路径 | 职责 | 出处 |
|---|---|---|
| `src/main.ts` | 页面入口：引入样式并挂载游戏 | `src/main.ts` |
| `src/app.ts` | `mountGame(root, { rng?, storage? })`：创建随机数发生器（默认 `mulberry32(randomSeed())`）、存储（默认 `browserStorage()`，可注入，`null` 表示不可用）、最高分与已到达关卡两个存储及 `GameController`，返回 `{ state, destroy() }` | `src/app.ts` |
| `src/game/board.ts` | 棋盘数据结构与规则：`Tile`/`Grid`/`Pos`/`Line`/`Move` 类型，`findLines`、`swapped`、`isValidSwap`、`findMoves`、`hasMove`、`isPlayable`、`generateGrid`、`shuffleGrid`、`randomColor`、`parseGrid`/`gridText`（测试与样例用的文本棋盘）、`tileAt`、`cloneGrid`、`samePos`、`isAdjacent` | `src/game/board.ts` |
| `src/game/cascade.ts` | 一次有效交换的逐轮结算：`resolveSwap`（消除、特殊方块触发与生成、下落、补充、无可走时洗牌）、`refillStart`、`MAX_ROUNDS` | `src/game/cascade.ts` |
| `src/game/game.ts` | 游戏状态机：`createGame`、`swapTiles`、`nextLevel`、`retryLevel`、`hintMove` | `src/game/game.ts` |
| `src/game/levels.ts` | 棋盘尺寸与关卡参数：`COLS`、`ROWS`、`MAX_COLORS`、`MIN_MOVES`、`colorsFor`、`movesFor`、`targetFor` | `src/game/levels.ts` |
| `src/game/scoring.ts` | 计分：`pointsFor(tiles, round)` | `src/game/scoring.ts` |
| `src/game/rng.ts` | 随机数：`mulberry32(seed)`、`randomSeed()` | `src/game/rng.ts` |
| `src/storage/highScore.ts` | 本机存储：通用只增整数存储 `createMaxStore`，及其实例 `createHighScoreStore`（历史最高分）、`createLevelStore`（已到达关卡）；`browserStorage`、`HIGH_SCORE_KEY`、`LEVEL_KEY`、`StorageLike` | `src/storage/highScore.ts` |
| `src/audio/sound.ts` | Web Audio 合成音效、音频解锁/恢复与静音：`createSound` | `src/audio/sound.ts` |
| `src/ui/controller.ts` | `GameController`：把规则、棋盘视图、信息栏、提示层、输入、空闲提示与音效连在一起 | `src/ui/controller.ts` |
| `src/ui/boardView.ts` | `BoardView`：以按钮渲染方块（按 id 复用）、选中、提示标记、移动与消除动画；`COLOR_NAMES`、`tileLabel` | `src/ui/boardView.ts` |
| `src/ui/hud.ts` | `Hud`：顶部信息栏（当前关卡、本关得分、本关目标分数、剩余步数、历史最高分）与得分滚动 | `src/ui/hud.ts` |
| `src/ui/input.ts` | `attachSwapInput`：Pointer Events 拖动/滑动交换与轻点识别；`DRAG_RATIO`、`DRAG_MIN_PX` | `src/ui/input.ts` |
| `src/ui/intro.ts` | 游戏标题 `createTitle`/`GAME_NAME` 与“怎么玩”说明 `createIntro` | `src/ui/intro.ts` |
| `src/ui/overlay.ts` | `Overlay`：过关/本关失败的覆盖提示层 | `src/ui/overlay.ts` |
| `src/ui/timing.ts` | 各动画时长与空闲提示延时常量 | `src/ui/timing.ts` |
| `src/ui/anim.ts` | `animate()`：Web Animations API 的安全包装；当前 `src/` 中没有模块引入它 | `src/ui/anim.ts` |
| `src/styles/main.css` | 全部样式：首屏布局、标题与说明、方块立体效果、六种配色、特殊方块外观、选中/提示/消除动画、提示层 | `src/styles/main.css` |
| `tests/unit/` | 单元测试（node 环境）：board、cascade、game、highScore、levels、rng、scoring | `tests/unit/*.test.ts`、`vite.config.ts` |
| `tests/integration/` | 集成测试（happy-dom）：audio、controller、intro、swap，辅助 `helpers.ts` | `tests/integration/*`、`vite.config.ts` |
| `e2e/` | Playwright 端到端用例：play、highscore、effects、mute、mobile-audio、layout、intro，辅助 `helpers.ts`、`audio-policy.ts` | `e2e/*`、`playwright.config.ts` |
| `deploy/nginx.conf` | 容器内 nginx 站点配置 | `deploy/nginx.conf` |
| `docs/deployment.json`、`docs/dependencies.json` | 部署声明与依赖声明 | `docs/*.json` |

## 4. 命令

| 命令 | 作用 | 出处 |
|---|---|---|
| `npm ci` | 安装依赖 | `README.md`、`.ai-delivery/features/002-v1/runtime/deployment.json` |
| `npm run dev` | `vite` 本地开发服务器 | `package.json` |
| `npm run build` | `vite build`，输出 `dist/` | `package.json`、`vite.config.ts` |
| `npm run preview` | `vite preview` | `package.json` |
| `npm run typecheck` | `tsc --noEmit` | `package.json` |
| `npm run test:unit` | `vitest run --project unit`（`tests/unit/**/*.test.ts`，node 环境） | `package.json`、`vite.config.ts` |
| `npm run test:integration` | `vitest run --project integration`（`tests/integration/**/*.test.ts`，happy-dom 环境） | `package.json`、`vite.config.ts` |
| `npm run test:e2e` | `playwright test`（`e2e/` 目录） | `package.json`、`playwright.config.ts` |

- 本交付声明的开发者检查：准备 `npm ci`；静态检查 `npm run typecheck`；构建 `npm run build`；开发者测试 `npm run test:unit`；集成测试 `npm run test:integration`（出处：`.ai-delivery/features/002-v1/runtime/deployment.json`）。
- Playwright 配置：两个项目 `desktop`（Desktop Chrome）与 `mobile`（Pixel 7）；单用例超时 6 分钟，`fullyParallel`；未设置 `E2E_BASE_URL` 时先执行 `npm run build && npx vite preview --port <E2E_PORT> --strictPort`（`E2E_PORT` 默认 4173），设置时直接以其为 `baseURL`（出处：`playwright.config.ts`）。

## 5. 领域与数据模型

### 5.1 棋盘与方块

- 棋盘固定 8 行 × 8 列（`ROWS = 8`、`COLS = 8`），最多 6 种颜色（`MAX_COLORS = 6`），颜色编号 `ColorId` 为 0–5，依次对应红、黄、绿、蓝、紫、橙（出处：`src/game/levels.ts`、`src/game/board.ts`、`src/ui/boardView.ts` `COLOR_NAMES`）。
- `Tile = { id, kind, color }`，`kind` 取 `'normal' | 'row' | 'col' | 'rainbow'`：`row` 消除整行、`col` 消除整列，二者带颜色；`rainbow`（彩色消除方块）`color` 为 `null`（出处：`src/game/board.ts`）。
- `Grid = Tile[][]` 按行存储：`grid[row][col]`，第 0 行为最上一行，棋盘始终填满（出处：`src/game/board.ts`）。
- 方块 `id` 在一次页面会话内唯一：`GameState.nextId` 记录下一个未用编号，新关卡棋盘、新生成的特殊方块与补充方块都从它继续编号（出处：`src/game/game.ts`、`src/game/cascade.ts`）。
- `findLines`：找出横向与纵向所有极大的 ≥3 个同色连续段，每段记方向 `h`/`v`、颜色与格子；彩色消除方块（`color` 为 `null`）不参与成线；带颜色的 `row`/`col` 方块按其颜色参与成线（出处：`src/game/board.ts`）。
- `isValidSwap`：两格都在棋盘内且上下左右相邻；两个彩色消除方块不能交换；恰有一方是彩色消除方块时即为有效交换；否则交换后能形成至少一条线才有效（出处：`src/game/board.ts`）。
- `findMoves`：按行优先扫描，每格先试向右、再试向下，列出全部有效交换；`hasMove` 为其非空；`isPlayable` 为“棋盘上没有成线且至少有一个有效交换”（出处：`src/game/board.ts`）。
- `generateGrid`：逐格随机颜色，避免与左侧两格或上方两格同色成线；最多掷 100 次直到 `isPlayable`，仍不满足时调用 `shuffleGrid`（出处：`src/game/board.ts`）。
- `shuffleGrid`：用 Fisher–Yates 重排现有方块，最多 500 次直到 `isPlayable`；仍不满足时在原位置给普通方块重新随机着色（特殊方块位置不变），同样最多 500 次（出处：`src/game/board.ts`）。

### 5.2 交换结算与连锁

- `resolveSwap(grid, a, b, ctx)`：先交换两格，再逐轮结算直到没有成线，最多 `MAX_ROUNDS = 100` 轮；每轮记录 `RoundStep = { round, removed, triggered, spawned, falls, refills, gained, grid }`（出处：`src/game/cascade.ts`）。
- 彩色消除方块的交换：第 1 轮以彩色消除方块自身加上全场与被交换方块同色的所有方块为消除起点，不看成线；之后各轮按成线结算（出处：`src/game/cascade.ts`）。
- 其他轮次：本轮全部成线的格子为消除起点；被消除的 `row`/`col` 方块会把所在整行/整列加入消除（可连锁触发其他 `row`/`col` 方块），触发的特殊方块记入 `triggered`（出处：`src/game/cascade.ts`）。
- 特殊方块生成（`planSpawns`）：每轮中恰为 4 个的线生成同色的 `row`（横线）或 `col`（纵线）方块，≥5 个的线生成彩色消除方块；第 1 轮优先放在线中被交换移动过的格子（先 `b` 后 `a`），否则放在线内下标 `⌊(n−1)/2⌋` 处，被占用时沿线循环后移；连锁中的后续轮次同样生成（出处：`src/game/cascade.ts`）。
- 下落与补充（`collapse`）：每列剩余方块下落到底部，空位从顶部补充随机颜色的普通方块；`refills` 记录每个新方块从棋盘上方第 `dropFrom` 格开始落入，`refillStart` 给出其起点（出处：`src/game/cascade.ts`）。
- 结算结束后棋盘不满足 `isPlayable` 时自动 `shuffleGrid`，结果中 `shuffle` 给出洗牌后的棋盘与每个方块的新位置；洗牌不计分（出处：`src/game/cascade.ts`）。

### 5.3 计分与关卡

- 每轮得分 `pointsFor(tiles, round) = 10 × 本轮消除方块数 × 轮次`（轮次从 1 开始）；特殊方块效果消除的方块计入本轮消除数（出处：`src/game/scoring.ts`、`src/game/cascade.ts`）。
- 第 L 关（从 1 开始）颜色数 `colorsFor(L)`：第 1–5 关 5 种，之后 6 种（出处：`src/game/levels.ts`）。
- 限定步数 `movesFor(L) = max(20, 32 − 2L)`，即 30、28、26、24、22，之后保持 `MIN_MOVES = 20`（出处：`src/game/levels.ts`）。
- 本关目标分数 `targetFor(L)`：第 1–5 关 `1250 + 250L`（1500…2500），之后 `1850 + 150L`（2750、2900……）；关卡数不设上限（出处：`src/game/levels.ts`）。
- 游戏状态 `GameState = { level, score, target, movesLeft, colors, grid, phase, nextId }`，`phase` 取 `'playing' | 'levelCleared' | 'levelFailed'`；`score` 为本关得分（出处：`src/game/game.ts`）。
- `createGame(rng, level = 1, firstId = 0)`：指定关卡、得分 0、步数为本关限定步数、生成新棋盘（出处：`src/game/game.ts`）。
- `swapTiles`：不在 `playing`、步数为 0 或交换无效时返回 `{ kind: 'invalid' }`，状态不变、不扣步数；有效时调用 `resolveSwap`，得分加上全部轮次得分，步数减 1；全部连锁与洗牌后判定：`score >= target` 为 `levelCleared`（含用掉最后一步的情况），否则步数为 0 时为 `levelFailed`，其余仍为 `playing`（出处：`src/game/game.ts`）。
- `nextLevel`：进入下一关，本关得分从 0 开始；`retryLevel`：同一关重新开始，得分清零、步数恢复、换新棋盘（出处：`src/game/game.ts`）。
- `hintMove`：返回 `findMoves` 的第一个有效交换（出处：`src/game/game.ts`）。
- 随机数：`mulberry32(seed)` 确定性发生器；页面默认种子来自 `crypto.getRandomValues`；`mountGame` 的 `rng` 选项可注入（出处：`src/game/rng.ts`、`src/app.ts`）。
- 进行中关卡的得分、步数与棋盘不做持久化；页面重新加载后从已到达关卡开始，该关得分与步数重新开始（出处：`src/ui/controller.ts` 构造函数、`src/storage/highScore.ts`）。

### 5.4 本机存储（历史最高分与已到达关卡）

- 存于 `window.localStorage`（`browserStorage()` 取不到时为 `null`）；两个键：`swap-match.highScore`（历史最高分，最小值 0）与 `swap-match.level`（已到达关卡，最小值 1）（出处：`src/storage/highScore.ts`）。
- 上一版的键 `block-match.highScore` 不再读取（出处：`src/storage/highScore.ts`，代码中只有 `swap-match.*` 两个键）。
- 值为十进制非负整数字符串；不是纯数字、不是安全整数或缺失时按最小值处理，小于最小值时取最小值（出处：`src/storage/highScore.ts` `parse`）。
- `createMaxStore(storage, key, min)` 的 `offer(n)`：先重新读取存储取较大值，`n` 严格大于当前值时更新内存值并写入存储；读写抛错或存储不可用时只保留内存中的值（出处：`src/storage/highScore.ts`）。
- 历史最高分记单关得分：每次有效交换后立即 `offer(本关得分)`，不等动画结束或关卡结束（出处：`src/ui/controller.ts` `trySwap`）。
- 已到达关卡：本关判定为 `levelCleared` 时 `offer(当前关卡 + 1)`；页面打开时以 `max(1, 已到达关卡)` 创建游戏（出处：`src/ui/controller.ts`）。

## 6. 界面与交互约定

### 6.1 页面结构与可访问名称

- 根元素 `<main class="game">`，内含首屏 `.first-screen`（依次为一级标题 `h1.game-title`“方块换换”、信息栏 `<header class="hud">`、`.board-area > .board-wrap > .board`）以及其下方的“怎么玩”说明 `section.intro`（出处：`src/ui/controller.ts` 构造函数、`src/ui/intro.ts`）。
- “怎么玩”说明：`h2#intro-title`“怎么玩”加 4 条列表，内容为交换相邻方块（拖动、滑动或先后点选）使 3 个及以上同色连成一线消除、无效交换弹回不扣步数；4 连生成条纹消除方块清整行或整列、5 连生成带星的彩色消除方块，与相邻方块交换消除全场该颜色；步数用完前本关得分达到目标即过关、连锁得分更高；“静音”按钮说明，以及“手机处于静音模式等系统原因时听不到声音”（出处：`src/ui/intro.ts` `RULES`）。
- 信息栏 5 项，各为 `role="status"` 的 `<output>`，可访问名称依次为“当前关卡”“本关得分”“本关目标分数”“剩余步数”“历史最高分”；之后是静音按钮（出处：`src/ui/hud.ts`、`src/ui/controller.ts`）。
- 静音按钮 `button.mute`，可访问名称“静音”，`aria-pressed` 表示是否静音，图标为内联 SVG（出处：`src/ui/controller.ts`）。
- 棋盘为 `role="group"`、名称“棋盘”的容器，动画进行中 `aria-busy="true"`，结束后为 `"false"`（出处：`src/ui/boardView.ts`、`src/ui/controller.ts`）。
- 每个方块是 `<button class="tile color-{n}">`，`data-kind` 为方块种类，`data-color` 为颜色编号（彩色消除方块无 `data-color`、无 `color-*` 类）；`aria-pressed` 表示是否被选中（出处：`src/ui/boardView.ts`）。
- 方块可访问名称（行号从顶部为 1、列号从左为 1）：普通 `{颜色}色方块，第{行}行第{列}列`；`row` 为 `{颜色}色横向消除方块，…`；`col` 为 `{颜色}色纵向消除方块，…`；彩色消除方块为 `彩色消除方块，…`（出处：`src/ui/boardView.ts` `tileLabel`）。
- 空闲提示的两个方块带 `data-state="hint"`，并以 `aria-describedby` 指向棋盘内隐藏文字“可交换提示”（出处：`src/ui/boardView.ts` `showHint`）。
- 关卡结束提示层为 `role="dialog"`、`aria-modal="true"` 的 `.overlay`，覆盖在 `.board-wrap` 之上，`data-kind` 为 `levelCleared`/`levelFailed`；过关：标题与名称“过关”、按钮“下一关”；本关失败：标题与名称“本关失败”、按钮“重玩本关”；正文为“第 {关卡} 关”与“本关得分 {得分}”；显示时按钮获得焦点（出处：`src/ui/overlay.ts`）。
- 点“下一关”调用 `nextLevel`，点“重玩本关”调用 `retryLevel`（出处：`src/ui/controller.ts` `showOutcome`）。

### 6.2 输入

- `attachSwapInput`（Pointer Events）：在方块上按下（非主键忽略）开始一次手势，阻止默认行为并对棋盘做指针捕获；移动距离超过 `max(8px, 方块边长 × 0.35)` 后按主方向确定相邻目标并结束手势，目标在棋盘外时不交换；未超过阈值且在同一方块上抬起算轻点；`pointercancel` 取消手势；移动与抬起在 document 上监听（出处：`src/ui/input.ts`）。
- 轻点选择：第一次轻点选中该方块；再点同一方块取消选中；点相邻方块尝试交换并清除选中；点不相邻方块改为选中新方块、不交换（出处：`src/ui/controller.ts` `onTap`）。
- 拖动/滑动交换时清除已有的轻点选中（出处：`src/ui/controller.ts` `onDragSwap`）。
- 单独轻点一个方块只改变选中状态，不消除方块（出处：`src/ui/controller.ts` `onTap`）。
- 动画进行中（忙碌）或不在 `playing` 时输入直接忽略、不排队（出处：`src/ui/controller.ts`）。
- 空闲提示：不忙碌且 `playing` 时开始计时 `HINT_DELAY_MS = 5000` 毫秒，到时以 `hintMove` 标记一处有效交换；document 上任何 `pointerdown`/`keydown`（捕获阶段）都重新计时，`pointerdown` 同时清除已显示的提示；忙碌状态变化时也重新计时（出处：`src/ui/controller.ts` `restartHint`、`onActivity`、`setBusy`、`src/ui/timing.ts`）。

### 6.3 动画与时长

- 时长（毫秒）：交换 `SWAP_MS = 160`、无效交换往返 320、消除 180、下落与补充 260、洗牌 420、“+得分”浮字 700、新方块出现 220；每轮连锁 `MOVE_SETTLE_MS = 440`（消除 + 下落），每轮得分滚动同为 440；本关最后一步后再停 `LEVEL_END_PAUSE_MS = 300` 显示提示层（出处：`src/ui/timing.ts`）。
- 方块以绝对定位按钮按 id 复用，位置由 CSS 变量 `--c`/`--r`（`transform: translate`）决定，过渡时长由棋盘上的 `--move-ms` 控制（出处：`src/ui/boardView.ts`、`src/styles/main.css`）。
- 无效交换：两个方块移到对方位置再移回，之后解除忙碌；状态、步数与得分不变（出处：`src/ui/controller.ts` `trySwap`）。
- 有效交换：交换动画后，每轮依次为被消除方块加 `.removing`（缩小淡出）、播放消除音效、得分滚动并在本轮消除方块中心显示 `.score-float`“+得分”；随后新生成的特殊方块从其所在格、补充方块从棋盘上方落入，其余方块下落；有洗牌时再以洗牌时长移动到新位置；最后整体重绘并解除忙碌，或停顿后显示提示层（出处：`src/ui/controller.ts` `trySwap`、`playRound`、`showGain`）。
- 剩余步数与历史最高分在有效交换开始时即更新；得分按动画帧从旧值滚动到新值，忙碌结束（`aria-busy="false"`）时信息栏已是最终值（出处：`src/ui/controller.ts`、`src/ui/hud.ts`）。
- 可访问名称、`data-*` 与命中检测始终对应最后一次 `sync` 的棋盘；交换动画中的 `moveTo` 只改视觉位置（出处：`src/ui/boardView.ts`）。

### 6.4 音效

- Web Audio 三角波合成，所有声音经同一主音量节点（音量 0.25）；`AudioContext` 可在手势外创建（处于 suspended），之后在用户激活事件中恢复（出处：`src/audio/sound.ts`）。
- 音频解锁：document 上以捕获方式监听 `touchend`、`pointerup`、`click`、`keydown`、`mousedown`，在其中同步调用 `unlock()`（创建/恢复 `AudioContext` 并播放一帧静音缓冲）；`visibilitychange` 到可见时调用 `resume()`（出处：`src/ui/controller.ts` `UNLOCK_EVENTS`、`src/audio/sound.ts`）。
- 消除：单音 440Hz 起，连锁每轮升 3 个半音，最多升两个八度；第 1 轮消除音在交换开始时即播放，后续各轮在该轮消除时播放；过关：上行三音；本关失败：下行三音（出处：`src/audio/sound.ts`、`src/ui/controller.ts`）。
- 静音：主音量置 0、停止所有正在播放的声音，并且不再创建新声音；取消静音只恢复主音量。静音状态只在内存中，刷新页面后恢复为有声（出处：`src/audio/sound.ts`、`README.md`）。

### 6.5 布局与样式

- `html`/`body` 设置 `overflow-x: hidden`、`max-width: 100%`；首屏 `.first-screen` 高度 `100dvh`（回退 `100vh`），“怎么玩”在其下方，页面只纵向滚动（出处：`src/styles/main.css`）。
- `.board-area` 为尺寸容器（`container-type: size`），棋盘容器边长 `min(100cqw, 100cqh, 640px)`、正方形，随可用空间缩放；不支持容器查询单位时回退为 `min(92vw, calc(100dvh - 140px), 640px)`；棋盘 `touch-action: none`（出处：`src/styles/main.css`）。
- 页面 `viewport` 为 `width=device-width, initial-scale=1, viewport-fit=cover`，内边距考虑 `safe-area-inset`（出处：`index.html`、`src/styles/main.css`）。
- 方块边长为棋盘的 12.5%；立体效果为上下渐变（`--hi`/`--base`/`--lo`）加内高光与内阴影；六种配色定义在 `.color-0` 至 `.color-5`（第 6 种为橙色）；选中（`aria-pressed="true"`）时放大 1.06、提亮并加外发光；提示时循环放大脉动（出处：`src/styles/main.css`）。
- 特殊方块外观：`row` 叠加一条白色横纹、`col` 叠加一条白色竖纹；彩色消除方块为六色锥形渐变底，中央白色五角星（出处：`src/styles/main.css`）。
- 样式中仍保留 `.tile-ghost` 与 `.tile[data-state='highlighted']` 规则，当前 `src/` 代码不再产生这两种元素/状态（出处：`src/styles/main.css`、`src/ui/boardView.ts`）。

## 7. 外部依赖与配置

- 外部依赖与机密：无（`dependencies: []`、`secrets: []`）（出处：`docs/dependencies.json`）。
- 应用没有运行时配置项与环境变量；端到端测试读取 `E2E_PORT`、`E2E_BASE_URL`（出处：`src/`、`playwright.config.ts`）。
- 浏览器本机存储键：`swap-match.highScore`、`swap-match.level`（见 5.4）（出处：`src/storage/highScore.ts`）。

## 8. 部署与运行

- 镜像两阶段构建：`node:22-alpine` 中 `npm ci --no-audit --no-fund` 后 `npm run build`；运行阶段 `nginxinc/nginx-unprivileged:1.28-alpine`，复制 `dist/` 到 `/usr/share/nginx/html`，以 UID 101 运行，监听 8080（出处：`Dockerfile`）。
- `.dockerignore` 排除 `.git`、`.ai-delivery`、`node_modules`、`dist`、测试产物等（出处：`.dockerignore`）。
- nginx：监听 8080（IPv4/IPv6）；`/healthz` 返回 `200 ok`（不记访问日志）；`/index.html` `Cache-Control: no-cache`；`/assets/` `public, max-age=31536000, immutable`；各位置统一附加 CSP（`default-src 'self'`、`script-src 'self'`、`style-src 'self' 'unsafe-inline'` 等）、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`；`server_tokens off`（出处：`deploy/nginx.conf`）。
- 部署声明：一个服务 `web`（描述为交换三消小游戏“方块换换”的静态页面），以仓库根为构建上下文、使用 `Dockerfile`，端口 8080，健康检查 `/healthz`，对外暴露；错误日志规则 `nginx-critical`（emerg/alert/crit，高）、`nginx-error`（error，10 分钟内 3 次，中）、`http-5xx`（高）（出处：`docs/deployment.json`）。

## 9. 测试约定

- 单元测试覆盖 `src/game/*`（board、cascade、game、levels、rng、scoring）与 `src/storage/highScore.ts`，在 node 环境运行；棋盘样例用 `parseGrid` 文本表示（`0`–`5` 普通方块、`A`–`F` 横向消除方块、`a`–`f` 纵向消除方块、`*` 彩色消除方块）（出处：`tests/unit/`、`src/game/board.ts`、`vite.config.ts`）。
- 集成测试在 happy-dom 中通过 `mountGame(root, { rng: mulberry32(种子), storage? })` 挂载游戏，按方块可访问名称末尾“第{行}行第{列}列”定位方块，派发 Pointer 事件模拟轻点、先后点选与拖动；用假时钟推进动画，`SETTLE_ALL_MS` 覆盖最长连锁与关卡结束停顿（出处：`tests/integration/helpers.ts`、`tests/integration/*.test.ts`）。
- 集成测试文件：`controller.test.ts`（信息栏、轻点交换、关卡结束与存储）、`swap.test.ts`（拖动、弹回、逐轮动画、提示层、空闲提示）、`audio.test.ts`（音频解锁、音效与静音）、`intro.test.ts`（标题与“怎么玩”）（出处：`tests/integration/*.test.ts`）。
- 端到端用例只通过可访问角色与名称读取棋盘与信息栏（`readGrid` 解析方块名称中的颜色、种类与行列）；用例按验收标准命名：`play.spec.ts`（AC-1、AC-3、AC-5、AC-10、AC-11、AC-12）、`highscore.spec.ts`（AC-18）、`effects.spec.ts`（AC-15、AC-19）、`mute.spec.ts`（AC-20）、`mobile-audio.spec.ts`（AC-21，仅手机项目）、`layout.spec.ts`（AC-22）、`intro.spec.ts`（AC-8、AC-9、AC-16、AC-17）（出处：`e2e/helpers.ts`、`e2e/*.spec.ts`、`README.md`）。
- `e2e/audio-policy.ts` 的 `installStrictAudio` 在页面中模拟严格的自动播放策略（只有在用户激活事件中恢复的 `AudioContext` 才会发声）并记录音频日志，`audioLog` 读取该日志（出处：`e2e/audio-policy.ts`）。
- 测试可通过 `mountGame(root, { rng, storage })` 注入确定性随机数与存储（出处：`src/app.ts`）。
