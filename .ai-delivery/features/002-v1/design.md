# 交换三消：步数关卡与特殊方块 技术方案

- 交付：DLV-20261127-5E1CB775C860（Feature `002-v1`），步骤 S8。
- 依据：已确认的意图第 2 版（AC-1～AC-22、G1 答案 Q1～Q5、R1、R2）、规格 `spec.md`（FR-001～FR-110、假设 A-1～A-24）、系统现状 `.ai-delivery/system-current.md`、仓库代码。G2 第 1 轮决定 I1～I4 与退回意见（第 2 版修订：只按这些决定补记，技术决定不变）。
- 只写本次改什么；现有模块、命令、部署与约定以系统现状为准，下文用“沿用（系统现状 §n）”引用。

## 技术上下文（Technical Context）

### 不确定项与结论

| 编号 | 不确定的技术事实（会改变哪项决定） | 结论 | 证据 |
|---|---|---|---|
| U-1 | 上一版手机浏览器没有音效的根因（决定 TD-010 的解锁方式） | **根因**：音频只在 `document` 的捕获阶段 `pointerdown` 中创建/恢复 `AudioContext`（`src/ui/controller.ts` 第 62–63 行 `doc.addEventListener('pointerdown', this.unlockAudio, true)`；`src/audio/sound.ts` `unlock()`）。HTML 标准规定能产生“用户激活”的输入事件只有 `keydown`（非 Esc）、`mousedown`、`pointerType` 为 `mouse` 的 `pointerdown`、`pointerType` 不是 `mouse` 的 `pointerup`、以及 `touchend`；**手指触摸产生的 `pointerdown` 不是激活事件**。Chrome 的自动播放策略与 WebKit 都只允许在用户激活中启动/恢复 `AudioContext`，所以手机上 `resume()` 始终在非激活事件里调用：iOS Safari 一直处于 `suspended`（全程无声）；Android Chrome 在第一次触摸时同样失败（之后取决于粘性激活，表现不稳定）。电脑上鼠标 `pointerdown` 是激活事件，所以有声。 | HTML Living Standard “User activation · activation triggering input event”；Chrome 开发者文档 “Autoplay policy in Chrome”（Web Audio 一节：须在用户手势后创建或 `resume()`）；WebKit 博客 “New video policies for iOS”/Safari Web Audio 说明（须在用户手势处理函数中启动）；代码出处如左；实验 E-1（在 Pod 中无法复现，见下） |
| U-2 | 能否在 Pod 的 Playwright Chromium 中复现/回归验证手机音频解锁（决定可测性约定的写法） | **不能直接复现**：Pod 中无头 Chromium 即使加 `--autoplay-policy=user-gesture-required`，页面加载时新建的 `AudioContext` 也已是 `running`，CDP 模拟的触摸在 `pointerdown` 时 `navigator.userActivation.isActive` 已为 `true`。因此回归检查改为：①集成测试用替身 `AudioContext` 断言“解锁只在激活事件的处理函数里同步发生”；②端到端测试在页面注入一个按 HTML 标准激活事件表判定的严格策略替身（见“可测性约定”）；③实机表现作为待验证假设 H-1，由业务负责人在验收时用实机确认。 | 实验 E-1 |
| U-3 | 关卡步数、目标分数、颜色数取什么值能同时满足 AC-13、让一般玩家能过前几关、并让测试能稳定观察到“过关”和“本关失败”（决定 TD-006 的数值） | 采用 TD-006 的数值表：第 1～5 关 5 种颜色，第 6 关起 6 种；限定步数 30、28、26、24、22，第 6 关起 20（下限）；目标分数第 1～5 关 `1250 + 250·L`（1500…2500），第 6 关起 `1850 + 150·L`（2750、2900……）。模拟中“每步选得分最高”的策略在第 1～5 关 100% 过关、第 6～12 关 22%～65%；“每步选得分最低”的策略在第 1 关约 55% 过关、第 5 关起 0% 过关。 | 实验 E-2 |
| U-4 | 在随机棋盘上，测试能否在合理步数内找到“一次交换直接连成 4 个/5 个”的位置（决定 AC-8/AC-9 能否在测试环境的公开入口上验证、是否需要额外的测试入口） | 5 种颜色时：能连成 4 个的交换通常开局就有（中位数第 0 步，90% 在 3 步内）；能连成 5 个的交换中位数第 10 步出现，90% 在 47 步内（可跨关或重玩继续找），60 局中有 3 局 60 步内未出现。6 种颜色时一半的局 60 步内都没有。结论：AC-8、AC-9 可在第 1～5 关（5 种颜色）通过公开入口验证，**不需要**为测试增加种子参数或专用入口；确定性用例另由集成测试覆盖（注入随机数）。 | 实验 E-3 |

文档与项目代码已写明、直接引用的事实：

- 被挂起（`suspended`）的 `AudioContext` 的 `currentTime` 不前进，挂起期间已安排的声音在恢复后才开始播放（W3C Web Audio API 规范 `AudioContext.suspend()`/`resume()` 与 `currentTime` 的定义）。TD-010 据此处理“手指还没抬起就已发生第一次消除”的情况。
- iOS 的响铃/静音开关会让 Web Audio 无声（Apple Safari 文档 “Web Audio API” 与 WebKit 说明）；按意图不做的事，只在“怎么玩”里提示。
- `localhost` 是安全上下文、Pod 中可用 Playwright 驱动 Chromium（`runtime/agent-pod.md`）。
- 现有随机数注入、存储容错、测试项目划分（系统现状 §2、§4、§5.3、§9）。

### 待验证假设

- **H-1**：按 TD-010 改为在 `touchend`/`pointerup`/`click`/`keydown` 中同步解锁后，iOS Safari（16 及以上）与 Android Chrome 实机从第一次消除起有声。Pod 中无法验证（U-2）。验证步骤与后备做法见“开放决策”。

## 治理与技术约束

| 约束 | 出处 | 设计响应 |
|---|---|---|
| 保持已批准的意图与范围，选最简单的架构 | 宪章“产品与架构” | 仍是纯前端静态站点；不加后端、不加运行时依赖；只替换 `src/game/` 规则与相关界面模块。 |
| 不记录 secret 或客户内容；验证输入 | 宪章“安全与隐私” | 无凭据、无机密；本机存储读取时校验为非负安全整数（沿用系统现状 §5.3 的容错）；不写日志。 |
| 每项用户可见能力都有可独立执行的验收场景 | 宪章“测试与质量” | 可测性约定给出每条 AC 的公开观察点；实机才能确认的 AC-21 另有严格策略替身与人工验收说明。 |
| 外部集成须用真实测试服务验证 | 宪章“测试与质量” | 本次没有外部集成（`docs/dependencies.json` 仍为空）。 |
| TypeScript strict、Vite、Vitest（unit/integration 两个项目）、Playwright desktop/mobile 两个项目 | 系统现状 §2、§4 | 全部沿用，不新增工具或依赖。 |
| 页面结构可访问名称约定、`aria-busy` 表示动画中、提示层为 `role="dialog"` | 系统现状 §6.1 | 沿用写法，按新玩法调整名称（见“Interface 与契约”）。 |
| 镜像、nginx、健康检查、CSP、错误日志规则 | 系统现状 §8 | 不改 `Dockerfile`、`deploy/nginx.conf`；Web Audio 合成音效不需要 `media-src`，CSP 不变。部署声明只更新服务描述文字。 |
| 现有 CI、部署脚本保持原样 | 本步骤规则 | 仓库没有 CI 定义；`Dockerfile`、`deploy/` 不改。 |

## 架构概览（Architecture）

仍是单页静态站点：`index.html` → `src/main.ts` → `mountGame(document.body)`（系统现状 §1、§3）。本次在同一分层上替换规则层并调整界面层：

```
src/game/            纯规则（无 DOM，可在 node 单元测试）
  levels.ts          8×8、颜色数、限定步数、目标分数（改）
  board.ts           新的格子表示、找一线、找可交换位置、生成棋盘、洗牌（重写）
  cascade.ts         一次交换的完整结算：消除轮次、特殊方块生成与触发、下落、补充（新）
  scoring.ts         每轮得分（改）
  game.ts            关卡状态机：交换、过关/失败、下一关、重玩、提示位置（重写）
  rng.ts             不变
src/storage/         本机记录：历史最高分 + 已到达的最高关卡（改，键名更换）
src/audio/sound.ts   音效：解锁方式修复、静音沿用（改）
src/ui/              控制器、棋盘视图（交换/弹回/逐轮消除下落/洗牌/提示动画）、
                     拖动与点选输入、信息栏（加剩余步数）、提示层（过关/本关失败）、标题与说明（改/新）
```

一次操作的数据流：输入层识别出“交换 a↔b” → 控制器调用 `swapTiles(state, a, b, rng)` → 规则层返回 `invalid`（弹回）或 `valid`（逐轮的结算步骤、是否洗牌、新状态、关卡结果）→ 控制器立即更新最高分与关卡记录，按步骤驱动棋盘视图播放动画、播放音效、滚动分数 → 全部结束后 `aria-busy="false"`，再根据关卡结果显示提示层或启动 5 秒无操作计时。

## 技术决策与替代方案

| 决策 ID | 选择 | 理由 | 已考虑替代方案 | 证据 | 来源 |
|---|---|---|---|---|---|
| TD-001 | 沿用现有技术栈与分层（TypeScript + Vite，DOM 按钮渲染方块，CSS 过渡/Web Animations 做动画），在原位置替换规则层与界面模块；不引入运行时依赖 | 现有分层（纯规则 + 控制器 + 视图）与测试方式可直接承载三消；DOM 按钮天然有可访问角色与名称，测试按角色/名称定位的约定得以沿用 | Canvas/WebGL 渲染（失去可访问名称，测试只能读像素，放弃）；引入游戏引擎（新依赖、包体积，放弃） | 系统现状 §2、§3、§6.1、§9 | FR-001、FR-090 |
| TD-002 | 新格子表示 `Grid = Tile[][]`，按 `grid[row][col]` 存储，`row` 0 为最上一行；`Tile = { id, kind, color }`，`kind` 为 `normal`/`row`/`col`/`rainbow`，`rainbow` 的 `color` 为 `null` | 三消是固定 8×8 满盘、按行列找一线，行优先且从上往下编号与屏幕和可访问名称一致，省去上一版“按列从底部存储”的换算 | 沿用 `board[col][rowFromBottom]`（为“整列靠拢”设计，三消不需要，换算易错，放弃） | `src/game/board.ts`（现状写法） | FR-020 |
| TD-003 | 交换判定：只接受上下左右相邻（曼哈顿距离 1）；交换双方恰好一方为 `rainbow` → 有效；双方都为 `rainbow` → 无效；否则交换后存在任一长度 ≥3 的一线才有效。无效交换不改状态（不扣步、不改分） | 与 FR-013、FR-031、FR-043、A-9 一一对应 | — | 规格 FR-013、FR-031、FR-043、A-9 | FR-011～FR-013、FR-031、FR-043 |
| TD-004 | 结算按“轮”循环（`src/game/cascade.ts`）：第 k 轮 = 找出棋盘上全部一线 → 按一线生成特殊方块（见 TD-005）→ 汇总待消除格并展开特殊效果（`row`/`col` 消除整行/整列，被波及的 `row`/`col` 继续展开，`rainbow` 被波及时只被移除）→ 移除、计分 → 每列剩余方块下落、顶部补充新方块 → 有一线则进入 k+1 轮，否则结束。由 `rainbow` 交换触发时，第 1 轮的待消除格 = 全场与被交换方块同色的方块 + 该 `rainbow` 本身（再按上面规则展开），之后照常连锁 | 一轮内同时处理多处一线（FR-030、术语“一轮消除”），特殊效果可级联（FR-041）；结算结果以逐轮步骤返回，界面逐轮播放动画（AC-6、AC-19） | 每次只消一处一线（与“一轮消除”定义不符，放弃）；规则与动画交织在控制器里（无法在 node 中单元测试，放弃） | 规格 术语表、FR-030、FR-033、FR-041、FR-043、A-8、A-9 | FR-030～FR-036、FR-041、FR-043 |
| TD-005 | 特殊方块生成：每条一线按自身长度判断（A-6）：恰好 4 个 → 横向一线生成 `row`（消除整行），纵向一线生成 `col`（消除整列），颜色取该线颜色；≥5 个 → 生成 `rainbow`。生成位置：第 1 轮中若该线包含被玩家移动的两个格子之一，放在该格子；否则放在该线按从左到右/从上到下排序的第 `⌊(n−1)/2⌋` 格；该格已被本轮另一条线的特殊方块占用时顺延到该线的下一格（循环）。特殊方块在本轮移除之后放入棋盘、不随本轮被消除，之后像普通方块一样下落（FR-045）；一线中已有的特殊方块被消除时照常触发 | 一线方向直接决定“整行/整列”，外观上用条纹方向表达（TD-014），玩家可预期；放在被移动的格子符合 A-7 | 一律消除整行（看不出与连线方向的关系，放弃）；随机方向（不可预测、难测，放弃） | 规格 A-5、A-6、A-7、A-8、FR-044、FR-045 | FR-040～FR-045 |
| TD-006 | 关卡数值（`src/game/levels.ts`）：`COLS = ROWS = 8`；`colorsFor(L) = L ≤ 5 ? 5 : 6`；`movesFor(L) = max(20, 32 − 2L)`（30、28、26、24、22、20、20……，下限 `MIN_MOVES = 20`）；`targetFor(L) = L ≤ 5 ? 1250 + 250L : 1850 + 150L`（1500、1750、2000、2250、2500、2750、2900、3050……）；关卡不设上限 | 满足 AC-13（目标严格递增、步数不增、第 5 关 22 < 第 1 关 30）与 Q2（步数到下限后只提高目标）；模拟显示前 5 关对用心的玩家友好、之后逐步变难，且“每步取最低分”在第 5 关起必然失败，测试能稳定观察过关与失败 | 第 4 关起 6 色、目标每关 +300（第 7 关起强策略过关率骤降到约 25%，难度断崖，放弃）；颜色始终 5 种（后期难度只靠目标与步数，梯度过缓，放弃） | 实验 E-2 | FR-021、FR-060、FR-066、FR-067、AC-2、AC-13 |
| TD-007 | 计分（`src/game/scoring.ts`）：`pointsFor(tiles, round) = 10 × tiles × round`，`tiles` 为该轮移除的全部方块数（含特殊效果波及的方块、被移除的特殊方块本身），`round` 从 1 起。不另设特殊方块奖励分 | 后一轮同样数量的方块得分严格更高，直接满足 AC-7；被特殊效果消除的方块计分满足 FR-036；公式简单，测试可按“+得分”与分数变化核对 | 指数倍率 `2^(round−1)`（后期分数膨胀，目标难以设定，放弃）；按连线长度加奖励（需求未提，放弃） | 规格 FR-035、FR-036、A-2；实验 E-2（数值标定用此公式） | FR-035、FR-036、AC-7 |
| TD-008 | 生成与洗牌（`src/game/board.ts`）：开局逐格随机取色并排除会形成 3 连的颜色，再检查至少有一处可交换位置，否则重生成（最多 100 次，之后取最后一次并对其执行洗牌流程）。洗牌：对棋盘上全部现有方块（含特殊方块）做 Fisher–Yates 重排，要求无现成一线且至少一处可交换位置，最多 500 次；仍失败时（极端情况，仅可能出现在无 `rainbow` 的棋盘上）把普通方块重新随机取色并重复检查，保留特殊方块及其位置 | 满足 FR-022、FR-070、A-10（“只重新排列现有方块”）；有 `rainbow` 时它与任一邻格就是可交换位置，因此“重排也找不到”只在极少数全普通方块棋盘上发生，兜底保证不卡死 | 洗牌时直接重新生成整盘（会丢失特殊方块，与 A-10 不符，放弃） | 规格 FR-022、FR-070、A-10；实验 E-2 的模拟中洗牌重排均在有限次内成功 | FR-022、FR-070、AC-14 |
| TD-009 | 关卡结果判定在一次有效交换的全部连锁与必要的洗牌之后：先判 `score ≥ target` → `levelCleared`；否则 `movesLeft = 0` → `levelFailed`；否则继续。过关时立即把“已到达的最高关卡”记为 `level + 1`（A-15）；每次加分后立即 `offer(本关得分)` 给历史最高分（FR-083） | 直接实现 R1 的答案（最后一步的连锁结束时达到目标也算过关）；记录在加分时即写入，与上一版“消除后立即写最高分”一致 | 交换后立刻判定（会在连锁加分前误判失败，违反 R1，放弃） | 意图 R1、规格 FR-061、FR-062、FR-083、A-15；系统现状 §5.3 | FR-061～FR-064、FR-082、FR-083 |
| TD-010 | 音频解锁修复（`src/audio/sound.ts` + 控制器）：在 `document` 捕获阶段监听 `touchend`、`pointerup`、`click`、`keydown`、`mousedown`，处理函数中**同步**调用 `sound.unlock()`；`unlock()`：没有上下文时创建；状态不是 `running`（含 iOS 的 `interrupted`）时调用 `resume()`，并在同一处理函数中播放一个 1 帧的静音 `AudioBuffer`；监听器常驻（状态已是 `running` 时立即返回），使切换应用回来后的下一次触摸能再次恢复（A-20）。`visibilitychange` 变为可见时也尝试一次 `resume()`。保留“上下文挂起时已安排的音符在恢复后播放”的行为，使按住手指滑动、尚未抬起时发生的第一次消除音在抬起后补播。不再在 `pointerdown` 中解锁 | 根因见 U-1：手指的 `pointerdown` 不是激活事件；`touchend`/非鼠标 `pointerup`/`click` 是。静音缓冲是 iOS 旧版本解锁 Web Audio 的通行做法，成本极低 | 改用 `<audio>` 元素播放内嵌音频（需改 CSP 的 `media-src`、要准备音频素材；作为 H-1 失败时的后备，见开放决策）；首次触摸时弹出“点击开启声音”（增加原文没有的界面步骤，放弃） | U-1 所列文档与代码出处；W3C Web Audio API（挂起时 `currentTime` 不前进）；实验 E-1 | FR-100、FR-102、A-20、AC-20、AC-21 |
| TD-011 | 交换输入（`src/ui/input.ts` 重写为 `attachSwapInput`）：Pointer Events；`pointerdown` 记下起点方块并 `setPointerCapture`；`pointermove` 位移超过方块边长的 35%（且至少 8px）时按主方向（|dx| 与 |dy| 较大者）确定邻格并发出“交换”，本次手势随即结束；`pointerup` 时位移未超阈值且仍在起点方块上 → 视为轻点；`pointercancel` 取消。轻点按 A-11 的选中规则处理（选中、再点取消、点相邻即交换、点不相邻改选）；拖向棋盘外不交换。棋盘 `touch-action: none`，`.game` 沿用 `touch-action: manipulation` | 同一套 Pointer Events 同时覆盖鼠标拖动、手指滑动、先后点两下（AC-3）；`touch-action: none` 防止滑动时页面滚动/缩放（A-13）；阈值按方块边长比例，适应棋盘缩放 | 用 HTML 拖放 API（触摸设备不支持，放弃）；分别监听 mouse/touch 事件（重复代码，放弃） | 系统现状 §6.2（现有 Pointer Events 写法）；规格 A-11、A-13 | FR-010～FR-013、AC-3、AC-22 |
| TD-012 | 动画流水线：规则层返回逐轮步骤，视图按顺序播放，时长常量放 `src/ui/timing.ts`：交换 160ms；弹回 = 交换过去 160ms + 回来 160ms；每轮：消除 180ms → 下落与补充 260ms（新方块从棋盘上方落入）→ 下一轮；洗牌 420ms；“+得分”浮字 700ms（每轮一个，显示在该轮被消除方块的中心）；分数滚动沿用逐帧滚动（系统现状 §6.3）。整个序列期间棋盘 `aria-busy="true"`，结束时信息栏已为最终值 | 每类变化都有连续过渡（AC-19），逐轮播放让玩家看清连锁；沿用按 id 复用按钮、CSS 变量定位的现有做法 | 一次性跳到最终棋盘再统一动画（看不出连锁，放弃） | 系统现状 §6.3 | FR-032、FR-052、FR-090、AC-19 |
| TD-013 | 本机记录（`src/storage/`）：沿用 `highScore.ts` 的读写容错，泛化为 `createMaxStore(storage, key, min)`；新键 `swap-match.highScore`（单关最高分，最小 0）与 `swap-match.level`（已到达的最高关卡，最小 1）。旧键 `block-match.highScore` 不读、不改、不删 | 新键名天然满足 Q4“最高分从 0 开始”；两项都是只增不减，复用同一“取较大值写入”逻辑；不删旧键避免改动玩家数据 | 读取旧键并清零（多一次写操作，无收益，放弃）；用 JSON 存一个对象（解析失败时两项一起丢，放弃） | 系统现状 §5.3；规格 FR-082～FR-086、A-16 | FR-082～FR-086、AC-18 |
| TD-014 | 方块外观（原创、纯 CSS）：6 种颜色红、黄、绿、蓝、紫、橙，各用渐变立体效果（沿用 `--hi/--base/--lo` 写法）；`row` 方块叠加横向亮条纹，`col` 方块叠加纵向亮条纹；`rainbow` 方块为多色锥形渐变底加白色星形图标（内联 SVG/CSS）。不使用任何现有游戏的角色或图形素材；音效全部为 Web Audio 合成 | 外观可区分三类方块（AC-8、AC-9）、看得出方向（A-5）；无外部素材，原创性由业务负责人验收（AC-17） | 位图/图标素材（需确认版权，放弃） | 系统现状 §6.5 | FR-040、FR-042、FR-081 |
| TD-015 | 页面标题与说明：`<h1>` 游戏名“方块换换”（`index.html` 的 `<title>` 同步），信息栏在标题下；棋盘尺寸 = 首屏除去标题与信息栏后的可用正方形（沿用容器查询单位写法）；“怎么玩”为棋盘下方带标题的 `<section>`，常驻可见（窄屏需向下滚动才看到，不能横向滚动） | 首屏完整显示棋盘（AC-22），说明始终在页面上（AC-16）；不压缩棋盘 | 说明放在可折叠的 `<details>` 中（默认看不到，有 AC-16 判定争议，放弃）；放在弹窗里（多一步操作，放弃） | 系统现状 §6.5 | FR-080、FR-110、AC-16、AC-22 |
| TD-016 | 无操作提示：控制器在“棋盘静止、没有提示层、关卡进行中”时启动 5000ms 计时（`setTimeout`），任何对棋盘或页面的 `pointerdown`/`keydown` 重置；到时取规则层 `findMoves()` 的第一处（行优先扫描，先向右后向下）给两个方块加 `data-state="hint"` 与可访问描述“可交换提示” 并做循环轻微缩放动画；玩家下一次 `pointerdown` 时清除，之后重新计时（A-14） | 规则层的可交换位置与“有效交换”同一判定，保证按提示交换必定消除（AC-15）；用 `setTimeout` 便于测试用假时钟推进 | 随机选一处（结果不确定，难核对，放弃） | 规格 FR-071、FR-072、A-14 | FR-071、FR-072、AC-15 |
| TD-017 | 旧玩法代码与测试：删除点击消除相关的规则（`findGroup`、`removeGroup`、整列靠拢）、旧端到端用例与旧单元/集成测试中针对旧玩法的断言，按新规则重写；`tests/unit/scoring.test.ts` 等文件名沿用 | 原玩法不再保留（FR-001）；保留文件名与项目划分，测试命令不变 | 保留旧代码不用（死代码，且会被误测，放弃） | 系统现状 §3、§9 | FR-001 |
| TD-018 | 部署不变：服务 `web`、`Dockerfile`、nginx、健康检查、错误日志规则全部沿用；`docs/deployment.json` 只把服务描述改为新游戏；`docs/dependencies.json` 保持无依赖 | 本次只有前端静态资源变化；应用本身不写日志，nginx 的日志写法未变 | — | 系统现状 §7、§8；`runtime/candidate.md` | — |

## 技术先后依赖

- `src/game/levels.ts`、`board.ts` 的新格子表示（TD-002）必须先于 `cascade.ts`、`game.ts`，因为结算与状态机都按新表示读写格子。
- `cascade.ts` 返回的逐轮步骤结构（见“领域与数据模型”）必须先于 `src/ui/boardView.ts` 的逐轮动画与控制器的播放逻辑，因为视图按该结构驱动动画。
- `game.ts` 的 `swapTiles`/`findMoves`/`hintMove` 必须先于 `src/ui/input.ts` 与控制器接线，因为输入只产生“交换 a↔b”，判定全部由规则层给出。
- `src/storage/` 的 `createMaxStore` 与新键必须先于控制器启动时读取“已到达的最高关卡”，因为开局关卡取决于它（FR-082）。
- `src/ui/boardView.ts` 的方块可访问名称（新颜色表、特殊方块名称）必须先于端到端用例与集成测试辅助函数的改写，因为测试只按名称读棋盘。
- 删除旧玩法代码（TD-017）必须与对应旧测试的删除/改写同时完成，因为 `npm run typecheck` 覆盖测试文件，旧测试引用被删函数会使静态检查失败。
- 特殊方块的视觉外观（TD-014 的条纹与彩色星形样式）不是规则层与可访问名称的前置：规则（TD-005、TD-004）与名称（`…横向/纵向消除方块`、`彩色消除方块`）可以先完成并被单元/集成测试验证，样式在其后任一时刻加上即可，因为测试与规则都只依赖名称与格子数据，不读样式。因此 AC-8、AC-9 的“外观明显不同”部分只能在实现 TD-014 的改动之后核对，规则部分不依赖它。

## 领域与数据模型

```ts
// src/game/board.ts
type ColorId = 0 | 1 | 2 | 3 | 4 | 5;                 // 红 黄 绿 蓝 紫 橙
type TileKind = 'normal' | 'row' | 'col' | 'rainbow';
interface Tile { id: number; kind: TileKind; color: ColorId | null } // rainbow 时 color 为 null
type Grid = Tile[][];                                   // grid[row][col]，row 0 为最上，8×8 满盘
interface Pos { row: number; col: number }

// src/game/cascade.ts —— 一次有效交换的结算结果
interface RoundStep {
  round: number;                      // 1 起
  removed: { id: number; pos: Pos }[];// 本轮移除（含特殊效果波及）
  triggered: { id: number; kind: 'row' | 'col' | 'rainbow'; pos: Pos }[]; // 本轮触发的特殊方块
  spawned: { tile: Tile; pos: Pos }[];// 本轮生成的特殊方块
  falls: { id: number; from: Pos; to: Pos }[];   // 下落
  refills: { tile: Tile; to: Pos; dropFrom: number }[]; // 补充：从棋盘上方第 dropFrom 格落到 to
  gained: number;                     // 本轮得分 = 10 × removed.length × round
  grid: Grid;                         // 本轮结束后的棋盘
}
interface Resolution { steps: RoundStep[]; shuffle: { grid: Grid; moves: { id: number; to: Pos }[] } | null; gained: number }

// src/game/game.ts
type Phase = 'playing' | 'levelCleared' | 'levelFailed';
interface GameState { level: number; score: number; target: number; movesLeft: number; colors: number; grid: Grid; phase: Phase; nextId: number }
type SwapOutcome = { kind: 'invalid' } | { kind: 'valid'; state: GameState; resolution: Resolution };
```

- `createGame(rng, level)`：按 TD-006 生成该关状态（得分 0、步数 = `movesFor(level)`）。
- `swapTiles(state, a, b, rng)`：仅 `playing` 且 `movesLeft > 0` 时生效；不相邻或无效返回 `{kind:'invalid'}`（状态不变）；有效时 `movesLeft − 1`，执行 TD-004 结算、必要时洗牌、按 TD-009 判定 `phase`。
- `nextLevel(state, rng)`：`level + 1` 的新状态；`retryLevel(state, rng)`：同一关的新状态（新棋盘，得分 0、步数恢复）。
- `findMoves(grid)`、`hintMove(grid)`：全部/第一处可交换位置（与 `swapTiles` 有效判定同一函数）。
- `id` 规则沿用：一次页面会话内唯一，`nextId` 递增（系统现状 §5.1）。
- 本机存储（`localStorage`，值为十进制整数字符串，非法值按最小值处理）：

| 键 | 含义 | 最小值 | 写入时机 |
|---|---|---|---|
| `swap-match.highScore` | 历史最高分（单关最高本关得分） | 0 | 每轮加分后本关得分超过它时 |
| `swap-match.level` | 已到达的最高关卡 | 1 | 过关（`levelCleared`）时写 `level + 1`（若更大） |

## Component 边界与项目结构

编码会创建或修改的路径：

- `index.html`（`<title>` 改为游戏名）
- `src/app.ts`（读取已到达的最高关卡作为开局关卡；`mountGame(root, { rng?, storage? })` 增加可选的存储注入，默认 `browserStorage()`）
- `src/game/board.ts`、`src/game/cascade.ts`（新）、`src/game/game.ts`、`src/game/levels.ts`、`src/game/scoring.ts`
- `src/storage/highScore.ts`（泛化为 `createMaxStore`，导出两个键名常量）
- `src/audio/sound.ts`
- `src/ui/controller.ts`、`src/ui/boardView.ts`、`src/ui/input.ts`、`src/ui/hud.ts`、`src/ui/overlay.ts`、`src/ui/timing.ts`、`src/ui/intro.ts`（新：标题与“怎么玩”）、`src/ui/anim.ts`（如需）
- `src/styles/main.css`
- `tests/unit/`（`board.test.ts`、`cascade.test.ts`（新）、`game.test.ts`、`levels.test.ts`、`scoring.test.ts`、`highScore.test.ts`、`rng.test.ts`）
- `tests/integration/`（`helpers.ts`、`controller.test.ts`、`effects.test.ts`、`audio.test.ts`、`input.test.ts`（新））
- `e2e/`（`helpers.ts` 与各 `*.spec.ts`，按新玩法重写；可新增 `e2e/audio-policy.ts` 作为严格音频策略替身）
- `README.md`（玩法与命令说明）
- `docs/deployment.json`（只改服务描述）

不修改：`Dockerfile`、`.dockerignore`、`deploy/nginx.conf`、`package.json`/`package-lock.json`（不新增依赖）、`vite.config.ts`、`playwright.config.ts`、`tsconfig.json`、`docs/dependencies.json`。

## 数据流、状态、并发与生命周期

- 控制器状态：`busy`（动画序列进行中，输入忽略、不排队，A-12）、`selected`（点选的第一个方块）、`hintTimer`、提示层是否显示。
- 一次交换：输入层 → `swapTiles` → `invalid`：播放弹回（320ms），不改信息栏；`valid`：立即 `setBusy(true)`、剩余步数信息栏减 1、写最高分；视图依次播放交换（160ms）→ 每轮（消除 → 浮字与消除音 → 下落补充）→ 洗牌（若有）→ `setBusy(false)`；`phase` 不是 `playing` 时再停 300ms（沿用 `LEVEL_END_PAUSE_MS`）显示提示层并播放过关/失败音。
- 每轮消除播放一次消除音（音高随轮次升高，最多两个八度），满足“消除时播放音效”。
- 提示层按钮：“下一关” → `nextLevel`；“重玩本关” → `retryLevel`；新棋盘以出现动画呈现。
- 开局：`level = max(1, 存储的已到达最高关卡)`，得分 0、步数为该关限定步数（FR-082、FR-085）。
- 生命周期：`destroy()` 清除全部计时器、输入监听、音频解锁监听、`visibilitychange` 监听，并静音（沿用系统现状 §3 的 `destroy` 约定）。
- 并发：单线程；多个标签页同时玩时，存储写入前重新读取取较大值（沿用系统现状 §5.3），两项都只增不减。

## Interface 与契约（Contract）

本应用没有网络接口；对外契约是页面的可访问结构与本机存储键，位置即本节（编码完成后由“更新系统现状”写入系统现状 §6）。未列出的沿用系统现状 §6.1。

| 元素 | 角色 / 可访问名称 | 状态与属性 |
|---|---|---|
| 游戏标题 | `heading`（level 1），名称“方块换换” | 页面 `<title>` 相同 |
| 怎么玩 | `region`（`<section aria-labelledby>`），名称“怎么玩”；内含标题“怎么玩”与说明文字，文字包含“交换”“相邻”“3 个及以上同色”“连成一线”，以及一句“手机处于静音模式等系统原因时听不到声音。” | 常驻可见（可能需竖向滚动） |
| 信息栏 | 5 个 `role="status"` 的 `<output>`，名称依次为“当前关卡”“本关得分”“本关目标分数”“剩余步数”“历史最高分”，文本为十进制整数 | `aria-busy="false"` 时为最终值 |
| 静音按钮 | `button`，名称“静音” | `aria-pressed` 为 `true`/`false`（沿用） |
| 棋盘 | `group`，名称“棋盘” | `aria-busy` 动画中为 `true`，静止为 `false`（沿用） |
| 方块 | `button`，名称：普通 `{颜色}色方块，第{行}行第{列}列`；整行 `{颜色}色横向消除方块，第{行}行第{列}列`；整列 `{颜色}色纵向消除方块，第{行}行第{列}列`；彩色 `彩色消除方块，第{行}行第{列}列`。颜色依次为红、黄、绿、蓝、紫、橙；行号从上为 1、列号从左为 1 | 点选的第一个方块 `aria-pressed="true"`，其余 `false`；无操作提示的两个方块 `data-state="hint"`，并以 `aria-describedby` 指向棋盘内一个视觉隐藏、文本为“可交换提示”的元素（可访问描述为“可交换提示”，提示消失时移除）；`data-kind` 为 `normal`/`row`/`col`/`rainbow`，`data-color` 为 0–5（彩色方块无此属性）。`aria-busy="false"` 时全部 64 个名称对应最终棋盘 |
| 加分浮字 | `.score-float`，文本 `+{本轮得分}`，`aria-hidden="true"` | 每轮一个，700ms 后移除 |
| 提示层 | `dialog`（`aria-modal="true"`），名称“过关”或“本关失败”；正文含“第 {N} 关”与“本关得分 {分数}”；按钮“下一关”或“重玩本关” | 显示时按钮获得焦点；显示期间棋盘不接受交换 |

- 交换契约：按住方块向相邻方向拖动超过方块边长约 35% 即交换；先后轻点两个相邻方块即交换；轻点后再点同一方块取消选中；点不相邻方块改为选中该方块。
- 存储契约：见“领域与数据模型”的键表。

## 可测性约定

沿用系统现状 §9（按角色与名称定位、`mountGame` 注入随机数、`aria-busy` 等待）。本次新增或改变的约定：

- **接口契约位置**：本文件“Interface 与契约”一节；规则数值见 TD-006、TD-007。
- **定位**：只按上表的角色与可访问名称定位；读棋盘 = 解析棋盘内 64 个按钮的名称（`{颜色}色…方块` / `彩色消除方块`）。“等待静止”= 棋盘 `aria-busy="false"` 或出现 `dialog`。
- **造数与清理（应用公开入口）**：每个用例使用全新的浏览器上下文，不需要清理。测试**可以**在自己的浏览器上下文中预置本机存储 `swap-match.level`（例如写 `5` 直接从第 5 关开始，用于快速到达“必然可失败”的关卡；写 `1` 从第 1 关开始）与 `swap-match.highScore`（预置原最高分），这是应用读取的公开持久化格式，不需要专用端点；值只写非负整数。
- **到达各种结果的方法**（依据实验 E-2、E-3，数值是实现，不是产品要求）：
  - 过关：每步选“本步可见的一线最长/消除最多”的交换，第 1～5 关基本都能过关；
  - 本关失败：从第 5 关起（预置 `swap-match.level=5`）每步选消除最少的交换，模拟中 100% 失败；
  - 4 连/5 连：在 5 种颜色的关卡（第 1～5 关）中扫描可直接连成 4 个/5 个的交换；4 连通常开局即有，5 连中位数约 10 步内出现，找不到时继续玩或“重玩本关”换棋盘。
- **时间控制**：无操作提示与全部动画序列都用 `setTimeout`/`requestAnimationFrame`，端到端测试可用 Playwright `page.clock`（`install` 后 `fastForward`/`runFor`）推进 5 秒；集成测试用 Vitest 假定时器。CSS 过渡与 Web Animations 不受假时钟影响，只影响视觉。
- **随机性控制**：集成测试通过 `mountGame(root, { rng: mulberry32(种子), storage })` 注入随机数与内存存储；单元测试直接构造 `Grid`。测试环境（部署版本）没有种子入口，端到端测试按“读棋盘 → 自行计算”应对随机性（上一版 G2 已删除 `?seed=` 用法，本次不恢复）。
- **音频观察**：沿用上一版端到端的做法，测试可用 `addInitScript` 包装 `AudioScheduledSourceNode.prototype.start/stop` 统计发声。**手机解锁的回归检查**：测试可在 `addInitScript` 中包装 `AudioContext`（构造、`resume`）与 `AudioBufferSourceNode.start`，用捕获阶段监听器记录“当前正在分发的事件类型与 `pointerType`”，按 HTML 标准激活事件表（`keydown`、`mousedown`、`pointerType==='mouse'` 的 `pointerdown`、非鼠标的 `pointerup`、`touchend`、以及由它们引起的 `click`）判定：只有在这些事件处理中调用的 `resume()` 才把替身状态设为 `running`，否则保持 `suspended` 且不发声。应用保证解锁调用发生在 `touchend`/`pointerup`/`click`/`keydown`/`mousedown` 的处理函数中（TD-010）。
- **开发者检查**（写入 `.ai-delivery/features/002-v1/runtime/deployment.json`）：
  - `developerTests`：`npm run test:unit` —— 规则层单元测试：一线识别、有效/无效交换、逐轮结算与连锁计分（AC-6、AC-7 的确定性用例）、4 连/5 连生成与触发（AC-8、AC-9，含 A-6～A-9）、洗牌后无一线且有可交换位置（AC-14）、关卡数值单调性与第 1～200 关的 AC-13 断言、最后一步才达标算过关（R1）、存储容错。全量约 10 秒（估计；上一版同类命令没有用时记录）。
  - `integrationTests`：`npm run test:integration` —— happy-dom 中挂载整页：拖动/点选/不相邻点选（AC-3）、信息栏与步数（AC-10）、提示层与重玩（AC-11、AC-12）、5 秒提示（AC-15，假定时器）、静音（AC-20）、**音频解锁只在激活事件中发生且触摸 `pointerdown` 不解锁**（AC-21 的开发者检查）、开局关卡取存储值（FR-082）。全量约 20 秒（估计）。
  - 静态检查 `npm run typecheck`、构建 `npm run build` 沿用。
- **端到端用例**（不写入部署声明）：`npx playwright test e2e/<文件>.spec.ts -g "<AC 编号>" --project=desktop`（或 `--project=mobile`）单独运行一个用例（沿用 `README.md` 写法）。预计约 12 个用例 × 2 个项目；单个用例约 20 秒～3 分钟（需要玩到过关/失败或找 5 连的用例较长，估计），首次运行另加构建与预览启动约 30 秒。
- **冒烟用例 SMK-001**（按 G2 决定 I4）：`.ai-delivery/smoke/SMK-001` 按原点击消除玩法编写（单击可消除组、按 10×n² 计分），本次替换玩法后必然失败。按冒烟集既有做法，由测试脚本步骤对照本次规格写出它的更新版本（以本交付 TS-01 的主路径替换：电脑上只用鼠标从打开页面玩到本关结束并点提示画面按钮），写明原因“本次把点击消除改为交换三消”。技术上不需要新增应用入口：更新后的用例使用本节的定位、读棋盘与“等待静止”约定即可；本方案不修改冒烟目录。
- **并行隔离**：Playwright `fullyParallel`，每个用例自己的浏览器上下文（独立 `localStorage`），共用一个预览服务（只读静态文件）；多个 Playwright 进程同时运行时各自设置不同的 `E2E_PORT`（系统现状 §4）。Vitest 各测试文件各自挂载、注入内存存储，互不影响。没有共享数据。

## 安全、隐私、身份与 Secret

- 没有账号、身份、凭据与机密；`docs/dependencies.json` 仍为空。
- 本机只保存两项整数（最高分、已到达的最高关卡），不上传、不跨设备（FR-086）；读取时校验为非负安全整数，非法值按最小值处理，存储不可用时只保留内存值（A-16，沿用系统现状 §5.3）。
- 应用不写日志，不收集任何个人信息；CSP、`nosniff`、`Referrer-Policy` 沿用（系统现状 §8），本次不需要放宽。

## 配置、可观测性与运维

- 无运行时配置与环境变量（沿用系统现状 §7）。
- 可观测性：仍只有 nginx 访问/错误日志，错误日志识别规则 `nginx-critical`、`nginx-error`、`http-5xx` 沿用（`docs/deployment.json`），应用本身不产生服务端日志，无需新增规则。

## SLO、限制、扩缩容、重试与恢复

- 没有获批准的数值指标（规格“产品质量要求”）。实现限制：结算循环每轮至少移除 3 个方块并补充，模拟中单次交换的连锁轮数有限；为防御性起见，结算循环最多 100 轮后停止连锁（只在异常时触发，记作已结束）。
- 洗牌重试上限 500 次，开局生成上限 100 次，见 TD-008。
- 存储读写失败不重试，降级为内存值。

## 部署拓扑、迁移、Rollout 与 Rollback

- 拓扑不变：单服务 `web`（nginx 静态站点，端口 8080，`/healthz`）。
- 数据迁移：无。旧键 `block-match.highScore` 保留不动（TD-013）；回滚到上一版时，上一版仍读旧键，玩家旧最高分仍在；新键对旧版无影响。
- 发布与回滚：按部署声明构建新镜像替换；回滚即部署上一版镜像。`index.html` 不缓存、`/assets/` 带哈希文件名（沿用 nginx 配置），新旧版本不会混用资源。

## 验证环境责任矩阵（Verification Environment）

| 验证类型 | 责任阶段 | 环境来源 | 依赖/凭据 | Coding 证据 | 下游结果 |
|---|---|---|---|---|---|
| 静态检查、构建 | 编码、平台部署前验证 | Agent Pod | 无 | `npm run typecheck`、`npm run build` 通过 | 平台记录开发者检查 |
| 单元测试（规则、存储、数值） | 编码 | Agent Pod（node） | 无 | `npm run test:unit` | 测试计划可作为 `developer-check` 引用 |
| 集成测试（整页挂载、输入、提示、静音、音频解锁策略） | 编码 | Agent Pod（happy-dom） | 无 | `npm run test:integration` | 同上；AC-21 的可自动部分 |
| 端到端（desktop Chrome、Pixel 7 模拟） | 编码自测、独立测试 | Pod 内预览服务 / 测试环境 HTTPS 地址 | 无 | 编码运行相关用例 | 独立测试在 G3 对测试环境执行 |
| 实机（iOS Safari、Android Chrome 听到音效；Firefox/Safari 桌面） | 业务负责人验收 | 实机 | 无 | — | AC-21 的最终确认、H-1 |
| 原创性与观感 | 业务负责人验收 | 测试环境 | 无 | — | AC-17、A-21 |

## 快速验证指南（Quickstart）

常规验证（沿用系统现状 §4 的命令）：

```bash
npm ci
npm run typecheck && npm run build
npm run test:unit
npm run test:integration
npx playwright test e2e/play.spec.ts --project=mobile
```

实验复现（脚本均放在仓库外的临时目录，会话结束已删除；下列为复现要点）：

- **实验 E-1（手机音频解锁能否在 Pod 中复现）**
  1. `mkdir /tmp/e && cd /tmp/e && npm i playwright-core@1.65.1`；`PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`。
  2. 脚本：`chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] })`，新建 `{ hasTouch: true, isMobile: true }` 上下文，`page.setContent` 一个页面：加载时 `new AudioContext()` 并记录 `state`；在 `pointerdown`/`touchstart`/`pointerup`/`touchend`/`click` 捕获监听中各新建一个 `AudioContext`、调用 `resume()`，记录 `navigator.userActivation.isActive` 与 `state`。
  3. 先用 CDP `Input.dispatchTouchEvent` 只发 `touchStart`，再发 `touchEnd`；另用 `page.touchscreen.tap` 与 `page.mouse.click` 各试一次。
  4. 观察：加载时新建的上下文已是 `running`；仅 `touchStart` 时 `pointerdown`/`touchstart` 中 `isActive=true`，各处 `resume()` 均成功、状态 `running`。结论：Pod 中的无头 Chromium 不执行自动播放限制，模拟触摸也被当作激活，**无法复现**手机无声，只能按文档定根因（U-1）并用替身策略做回归（可测性约定）。用时约 6 分钟。
- **实验 E-2（关卡数值标定）**
  1. 用 Node 写一次性模拟器，实现与 TD-003～TD-008 相同的规则（8×8、开局无一线且有可交换位置、逐轮结算、4 连生成 `row`/`col`、5 连生成 `rainbow`、`rainbow` 交换消同色、`10 × 方块数 × 轮次` 计分、卡死时重排）。
  2. 两种策略：`max`（对每个可交换位置试算一步取得分最高）与 `min`（取得分最低）；每种 40 个种子。
  3. 先测颜色 5/6 × 步数 30/24/18 的得分分布：例如 5 色 30 步 `min` 中位数 1630、p90 2390；`max` 中位数 9950、p10 6720；6 色 18 步 `max` 中位数 2560。
  4. 再按候选数值表逐关测过关率。第 4 关起 6 色、目标每关 +300：第 7 关起 `max` 过关率降到 27% 以下（断崖）。第 5 关起 6 色、`1500+250(L−1)`：第 5 关 `max` 73%。**采用的 TD-006**：第 1～5 关 `max` 100%、`min` 55%/25%/12.5%/5%/0%；第 6～12 关 `max` 65%/55%/50%/35%/30%/25%/22.5%，`min` 全为 0%。用时约 8 分钟。
- **实验 E-3（4 连/5 连交换出现的频率）**
  1. 复用 E-2 的模拟器，开局后每步随机选一个可交换位置继续玩，记录第一次出现“交换后包含被移动格子的一线长度 ≥4 / ≥5”的步数，60 局，上限 60 步。
  2. 观察：5 色时 4 连中位数第 0 步、p90 第 3 步；5 连中位数第 10 步、p90 第 47 步，3 局 60 步内未出现。6 色时 4 连中位数第 0 步、p90 第 5 步；5 连有 30 局未出现。用时约 3 分钟。

## 支持 Runbook

- 玩家反馈手机无声：先确认手机未处于静音模式、媒体音量不为 0、页面静音按钮未按下（“怎么玩”已提示）；再确认是否在第一次触摸抬起后仍无声——若是，按“开放决策”H-1 的后备做法处理。
- 玩家想从第 1 关重来：当前版本没有入口，可清除该站点的浏览器数据（会同时清除最高分）；是否增加入口见“开放决策”中的建议。
- 部署后页面空白：检查 `/healthz` 与 nginx 错误日志（规则 `nginx-critical`/`nginx-error`）、浏览器控制台的 CSP 报错（沿用系统现状 §8）。

## 开放决策

### 待验证假设

- **H-1（实机音频解锁）**：TD-010 的解锁方式在 iOS Safari 16+ 与 Android Chrome 实机上，从第一次消除起能听到音效。
  - 已做：根因按 HTML 标准、Chrome 自动播放策略与 WebKit 说明确定（U-1）；实验 E-1 证明 Pod 中的无头 Chromium 不执行该限制，无法在 Pod 复现或验证。
  - 还缺：实机上的观察。
  - 验证步骤：在测试环境地址上用 iPhone（Safari，响铃开关为响铃、媒体音量非 0）与 Android 手机（Chrome）各打开一次全新页面（无痕/清除站点数据），只用手指：①第一次用滑动完成一次消除，抬起手指后应听到消除音；②再用点选完成一次消除，应立即听到；③切到其他应用 10 秒再回来，下一次消除应有声（A-20）；④玩到过关或失败应听到对应音效。
  - 失败时的后备做法（不改变产品行为）：在同一解锁处理函数中，额外用 `<audio>` 元素播放一段由代码生成的极短静音 WAV（`Blob` URL）以激活 iOS 媒体会话，需在 `deploy/nginx.conf` 的 CSP 中为 `media-src` 增加 `'self' blob:`；若仍失败，改为全部音效用 `<audio>` 元素播放预生成的 WAV。这两步只改 `src/audio/sound.ts` 与 CSP 一行。
  - 依赖 H-1 的决定：TD-010（已附后备做法，不需要人先决定）。

### 建议，未纳入，待 G2 决定

- 本方案没有新增建议。规格中已列出的三条建议已由 G2 决定（I1 从第 1 关重新开始的入口、I2 洗牌时显示文字说明、I3 跨次记住静音状态）：均**不纳入**，本方案不实现，技术决定不变。

### 需要人决定的事项

- 无。所有技术决定已作出；没有改变已确认产品行为的事项。
