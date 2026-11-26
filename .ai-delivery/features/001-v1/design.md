# 方块消除小游戏：计分与关卡 技术方案

> 依据：意图第 2 版（已在 G1 确认，含 Q1–Q4、R1–R5 的人工答案）、规格 `spec.md`（FR-001–FR-041、AC-1–AC-16、假设 A-1–A-12）、需求原文 `request.json`、项目宪章。`g2Decisions` 第 1 轮（I1–I15 与退回意见）。本版按 G2 退回意见与事项 I2 的回答修订：删除原 TD-012 与对外契约中的公开网址参数 `?seed=`，随机种子固定只在开发者测试内部满足；其余决定不变。I1（色觉辅助形状记号）已决定不纳入；I7–I15 确认的规格假设与本方案原有设计一致，无需改动。
> 项目还没有系统现状（`.ai-delivery/system-current.md` 不存在）；仓库现状只有 `README.md` 与 `.ai-delivery/` 下的交付文件，没有任何代码、构建、测试、持续集成或部署脚本。本方案即为首个版本的全部技术设计。
> 证据写法：“实验 E-n”的命令与观察结果只写在“快速验证指南”；“参考 X”指平台参考文档 `../reference/X`。

## 技术上下文（Technical Context）

### 已由文档或已确认输入回答的事实（直接引用，不做实验）

| 事实 | 出处 |
|---|---|
| 执行环境预装 Node 22、Playwright 与 Chromium；可在 Pod 内 `localhost` 启动应用并用 Playwright 驱动 Chromium | 参考 `runtime/agent-pod.md` |
| 测试环境按部署声明构建镜像（Dockerfile 格式，ACR Tasks，无 Docker 守护进程），容器必须以正整数非 root UID 运行；对外服务由网关终止 TLS 后以 HTTP 转发到 `port` | 参考 `runtime/candidate.md` |
| 开发者命令按 `staticAnalysis → build → developerTests → integrationTests` 顺序以 `bash -euo pipefail` 执行，`staticAnalysis`、`build`、`developerTests` 必须存在 | 参考 `runtime/candidate.md`、`runtime/catalog-facts.md` |
| 平台没有内置错误日志规则，只按 `operations.errorLogRules` 识别问题 | 参考 `runtime/candidate.md` |
| `nginxinc/nginx-unprivileged` 镜像以 UID 101 运行、默认监听 8080；只覆盖 `conf.d/default.conf` 不涉及 pid 文件权限问题 | 该镜像官方仓库 `README.md`（“default NGINX listen port is now 8080”“override the default nginx.conf … pid”）与 `mainline/alpine-slim/Dockerfile`（`ARG UID=101`、`USER $UID`） |
| 浏览器要求用户与页面交互后才允许 `AudioContext` 发声（autoplay policy） | MDN “Autoplay guide for media and Web Audio APIs”；规格假设 A-11 已据此确认 |
| 容器查询单位 `cqw/cqh`、`dvh`、Pointer Events、Web Animations API（`Element.animate`）、`localStorage` 在意图假设所列的主流浏览器当前版本中均可用 | MDN 对应条目的 Browser compatibility 表；意图假设“主流版本” |
| CSS `transform: translate(…%)` 的百分比相对于元素自身的边框盒尺寸 | MDN `translate()` |
| `localStorage` 在禁用存储/隐私模式等情况下读写可能抛出异常（`SecurityError`/`QuotaExceededError`） | MDN `Window.localStorage` “Exceptions” |
| 本游戏没有任何外部服务依赖 | 规格“依赖”：无外部服务依赖；意图不做的事（账号、排行榜、联网、云同步） |

### 不确定项（会改变某项决定的技术事实）

| 编号 | 不确定项 | 会影响的决定 | 结论 | 证据 |
|---|---|---|---|---|
| U-1 | 在 10×10 棋盘、S(n)=10·n² 下，不同颜色数时一关能得多少分；按哪组目标分数既满足 FR-020/FR-021、又不会让第 1 关就失败、并且一局能在有限关卡内结束（使“游戏结束”可被端到端测试触达） | TD-004 关卡参数 | 3/4/5/6 色一关得分中位数约 8000/4250/2900/2200（随机策略）；颜色 3→4→5 封顶、本关需新得分数 2000+500·(L−1) 时，500 局模拟中第 1 关失败 0 次，游戏结束关卡 p10=7、p50=9、p90=10、最少 6 | 实验 E-1 |
| U-2 | 哪个 `@playwright/test` 版本与执行环境预装的 Chromium 修订版匹配（不匹配时 Playwright 找不到浏览器，需要联网下载） | TD-010 端到端测试工具版本 | 本会话环境 `/ms-playwright` 下为 `chromium-1255`/`chromium_headless_shell-1255`；`playwright-core@1.65.1` 的 `browsers.json` 中 chromium 修订版为 1255（1.65.0 为 1254） | 实验 E-2 |
| U-3 | 选定工具链各包的 Node 版本要求是否与 Node 22 兼容（执行环境 Node 22 的次版本未写明） | TD-009 单元/集成测试 DOM 环境、TD-011 静态检查 | vite 8.4.0 要求 `^20.19` 或 `>=22.12`；vitest 5.1.2 要求 `^22.12`；jsdom 31 要求 `^22.22.2`（次版本要求高，存在风险）；happy-dom 21 要求 `>=20`；TypeScript 5.9.3 无问题 | 实验 E-3 |
| U-4 | 按 nginx 实际的错误日志与访问日志写法，所写的正则规则是否只命中出错行（不误报启动通知与正常请求） | `operations.errorLogRules` 的写法 | 三条规则各只命中对应的出错行，`message` 分组取到正文 | 实验 E-4 |

没有限时内无结论的不确定项。U-2 的结论依据本会话所在镜像；Agent Pod 与本会话的镜像是否完全一致参考文档没有写明，因此 TD-010 附后备做法（见该决定）。

## 治理与技术约束

| 约束 | 来源 | 设计响应 |
|---|---|---|
| 保持已批准的业务意图和范围 | 宪章“产品与架构” | 只实现 FR-001–FR-041；规格与本方案中“建议，未纳入”的条目一律不实现（G2 I1、I3–I6 已决定不纳入）；不新增任何网址参数或其他玩家可见入口（G2 I2） |
| 优先选择满足需求的最简单架构 | 宪章“产品与架构” | 纯前端静态页面 + 静态文件服务器；无后端、无数据库、无框架（原生 TypeScript + DOM） |
| 记录重大决策与例外 | 宪章“产品与架构” | 见“技术决策与替代方案” |
| 凭据留在服务端；绝不记录 secret 或客户内容 | 宪章“安全与隐私” | 本系统没有任何凭据与机密；不收集个人信息；nginx 访问日志只有请求行与状态码 |
| 验证输入、最小权限 | 宪章“安全与隐私” | 校验 `localStorage` 中读出的最高分（非法值丢弃）；容器以非 root UID 101 运行；CSP 只允许同源脚本 |
| 每项用户可见能力都有可独立执行的验收场景 | 宪章“测试与质量” | “可测性约定”给出无障碍角色与名称、状态属性、本机存储键、音效可观测点；AC-5/AC-9 另有开发者检查可引用 |
| 外部 integration 用真实测试服务 | 宪章“测试与质量” | 没有外部 integration；集成测试只替换浏览器内置的 `AudioContext`（happy-dom 没有它），不涉及外部服务 |
| 不修改已有 CI/部署脚本 | 平台规则 | 仓库中没有，不新增 CI；部署只通过 `docs/deployment.json` |

## 架构概览（Architecture）

```
浏览器（电脑 / 手机）
 └─ index.html + 打包后的 JS/CSS（同源静态文件）
     ├─ game/   纯逻辑层（无 DOM）：随机数、棋盘生成、找组、消除/下落/靠拢、计分、关卡参数、游戏状态机
     ├─ ui/     表现层：DOM 渲染（每个方块一个 <button>）、指针输入、突出显示、动画编排、HUD、提示画面、布局
     ├─ audio/  Web Audio 合成音效 + 主音量节点（静音）
     └─ storage/ 历史最高分（localStorage，读写失败时退化为内存值）
        ↑ 由 main.ts 组装：GameController 调用 game/ 计算结果 → ui/ 播放动画 → audio/ 发声 → storage/ 保存
测试环境：一个容器服务 web（nginx-unprivileged，UID 101，端口 8080，/healthz），只提供静态文件
```

- 逻辑层与表现层分离：`game/` 的每次操作返回新状态与一份“变化描述”（被消除的方块、每个方块的起止位置、得分），`ui/` 只按变化描述播放动画，不自行推导规则。这样规则（FR-003–FR-021）全部可在 Node 中单元测试。
- 所有状态只在页面内存中；本机持久化只有历史最高分一个数值（FR-023、FR-026）。

## 技术决策与替代方案

| 决策 ID | 选择 | 理由 | 已考虑替代方案 | 证据 | 来源 |
|---|---|---|---|---|---|
| TD-001 | 纯前端静态单页：原生 TypeScript（无 UI 框架），Vite 8 打包为静态文件 | 规则简单、无服务端需求；无框架即可满足动画与布局；Vite 提供 TS 编译、开发服务器与带哈希的产物 | React/Vue（增加依赖与体积，无收益）；游戏引擎 Phaser/Pixi（Canvas 渲染，无障碍角色与名称需另建一层，增加测试难度） | 实验 E-3（Node 兼容）；规格“依赖” | FR-001、宪章“最简单架构” |
| TD-002 | DOM 渲染：棋盘是一个容器，每个方块一个绝对定位的 `<button>`，位置用 `transform: translate(calc(var(--c)*100%), calc(var(--r)*100%))`（百分比相对方块自身尺寸），方块宽高为棋盘的 1/10 | 每个方块天然有无障碍角色与可见名称供测试定位；位置与棋盘尺寸解耦，窗口缩放无需 JS 重算坐标；transform 过渡由合成器处理，流畅 | Canvas 绘制（需另做无障碍层与命中测试）；CSS Grid 排布（下落/靠拢无法直接用过渡动画表现位移） | MDN `translate()`（百分比相对自身） | FR-007、FR-008、FR-031、FR-032、FR-039 |
| TD-003 | 计分 S(n) = 10·n² | 严格递增；S(2N)=40N²=2×(S(N)+S(N))，满足“≥2 倍”；对任意拆分 n=a₁+…+a_k（k≥2，aᵢ≥2）有 n² = Σaᵢ² + 2Σ_{i<j}aᵢa_j > Σaᵢ²，满足严格大于；系数 10 让分数读起来更有分量 | n²（数值偏小）；k·n·(n−1)（S(2N) ÷ [2×(S(N)+S(N))] = (2N−1)/(2N−2)，N=2 时为 1.5，N 越大越接近 1，始终小于 2，不满足 FR-011）；指数计分（数值增长过快、难读） | 数学推导（本行理由）；单元测试 `tests/unit/scoring.test.ts` 按开发者检查验证 | FR-009–FR-012、AC-5、Q4 |
| TD-004 | 关卡参数：棋盘 10 列 × 10 行（各关相同）；颜色种类 colors(L)=min(2+L, 5)，即 3、4、5、5…（上限 5）；本关需新得分数 d(L)=2000+500·(L−1)；本关目标分数（累计）target(L)=Σd = 2000·L + 250·L·(L−1)，即 2000、4500、7500、11000、15000… | 满足 FR-020（颜色不减、目标严格递增、需新得分数不减）与 FR-021（颜色封顶后只提高目标）；模拟显示第 1 关不会失败、一局在 6–10 关左右结束，难度递增可感知，且“游戏结束”在端到端测试中用约 9 关可触达 | d=2000+250(L−1)（一局中位 13 关，过长）；d=3000+200(L−1)（最少第 4 关就结束，早期挫败感强）；颜色上限 6（10×10 上 6 色时一关中位只得约 2200 分，后期几乎必然一关即结束） | 实验 E-1 | FR-003、FR-020、FR-021、AC-9、R3、Q3、A-1 |
| TD-005 | 棋盘生成：每格从本关颜色中均匀随机取色；若生成结果少于 2 种颜色或没有任何可消除组，则用同一随机数流重新生成；最多 50 次，仍不满足时把左下角两个相邻方块设为同一颜色、把另一个方块改为另一种颜色后使用（实验中从未需要重试） | 保证 FR-003（至少 2 种颜色）且新关不会“一开始就结束” | 不校验（极小概率违反 FR-003）；按图案预置（单调） | 实验 E-1 | FR-003、FR-016 |
| TD-006 | 随机数：mulberry32（32 位种子），以函数参数注入逻辑层（`createGame(rng)`、`generateBoard(cols, rows, colors, rng)`）；页面运行时种子一律取 `crypto.getRandomValues`，不从网址或任何外部输入读取；单元测试与集成测试在代码内部传入固定种子的 `rng`（集成测试由测试代码直接调用 `src/app.ts` 导出的挂载函数 `mountGame(root, { rng })`，不经网址） | 实现极短；注入方式让开发者测试可重复，又不给玩家增加入口（G2 I2）；不需要密码学强度 | `Math.random` 全局（测试中无法固定棋盘）；公开网址参数 `?seed=`（原 TD-012，G2 I2 决定删除）；第三方库（无必要） | G2 I2 的回答 | FR-003、可测性 |
| TD-007 | 动画：消除用 Web Animations API（缩小+淡出，180 ms）；下落与列靠拢用 CSS `transition: transform`（下落 240 ms，随后靠拢 200 ms，两段依次）；加分用“+N”浮字（700 ms，不阻塞）与当前分数在 400 ms 内按 `requestAnimationFrame` 递增到新值；所有时长集中在 `src/ui/timing.ts`；动画编排用定时等待（`setTimeout`），不依赖 `transitionend` | 满足 AC-12 的“连续过渡”；按定时等待推进，避免 `transitionend` 在元素被移除或时长为 0 时不触发导致卡死；总时长约 0.65 s，操作手感紧凑 | 全部用 JS 逐帧计算位置（代码量大）；用 `transitionend` 驱动（不可靠） | MDN Web Animations API / CSS transitions | FR-030–FR-033、A-2 |
| TD-008 | 输入：只用 Pointer Events。`pointerdown` 记录起始方块并突出显示其组；`pointerup` 时用 `document.elementFromPoint` 取松开位置的方块，与起始方块相同才执行消除尝试；`pointercancel`/离开则取消。鼠标（`pointerType==='mouse'`）另在 `pointerover/pointerout` 时突出显示。棋盘设 `touch-action: none`、禁用长按菜单与文字选择；页面其余部分 `touch-action: manipulation` | 一套代码覆盖鼠标与触摸（FR-001/FR-002）；“同一方块按下并松开”满足 FR-002 与 A-4；禁止棋盘上的滚动/双击缩放避免轻点被浏览器吞掉 | 分别处理 mouse/touch 事件（重复代码、双触发）；用 `click`（触摸移动后松开仍可能触发，不满足 A-4） | MDN Pointer Events、`touch-action` | FR-001、FR-002、FR-027–FR-029、A-2、A-3、A-4 |
| TD-009 | 测试框架：Vitest 5；单元测试在 Node 环境，集成测试在 happy-dom 环境 | Vitest 与 Vite 同源配置；happy-dom 的 Node 版本要求宽松（≥20），jsdom 31 要求 Node ≥22.22.2，执行环境 Node 22 的次版本未知 | jsdom（Node 次版本风险）；Jest（需另配 TS 转译） | 实验 E-3 | 可测性 |
| TD-010 | 端到端测试：`@playwright/test` 精确锁定 `1.65.1`，只用 Chromium 项目（桌面 + 移动设备模拟两个 project）；不在命令中下载浏览器 | 与预装 Chromium 修订版 1255 匹配，离线可用 | 版本浮动（修订版不匹配时找不到浏览器）。**后备做法**：若 Agent Pod 中 `/ms-playwright`（或 `PLAYWRIGHT_BROWSERS_PATH`）下的 chromium 修订版不是 1255，编码时把版本改为 `browsers.json` 中修订版与之相同的版本（查法见快速验证 E-2），不改测试写法 | 实验 E-2 | 可测性、AC-1、AC-15 |
| TD-011 | 静态检查：`tsc --noEmit`（TypeScript 5.9.x，`strict: true`、`noUncheckedIndexedAccess: true`）；不引入 ESLint | 类型检查已能发现大部分缺陷；减少依赖与版本兼容风险 | ESLint 10 + typescript-eslint（额外配置与依赖，收益有限）；TypeScript 7（新编译器，生态兼容性未验证） | 实验 E-3 | 可测性 |
| TD-012 | （已删除）原“公开网址参数 `?seed=`”决定按 G2 事项 I2 的回答删除；编号保留不复用，避免与 G2 记录混淆 | — | — | G2 I2 | — |
| TD-013 | 音效：Web Audio API 用振荡器即时合成（消除：音高随消除数升高的短“叮”；过关：上行三音；游戏结束：下行三音），全部经一个主 `GainNode`；`AudioContext` 在首次 `pointerdown` 时创建/恢复；静音时把主音量置 0 并对正在播放的全部源节点调用 `stop()`，静音期间不创建也不启动新节点；取消静音只恢复主音量 | 无需音频素材（没有版权与加载问题）；满足 FR-036–FR-038 与 A-11；“立即停止正在播放的音效”由 `stop()` 保证 | 音频文件 + `<audio>`（素材授权与加载、iOS 上并发播放受限）；Howler.js 库（无必要） | MDN Web Audio API、Autoplay guide | FR-036–FR-038、AC-14、A-11 |
| TD-014 | 静音状态只保存在页面内存（本次打开期间有效） | 规格 FR-038 只要求本次打开期间；跨次记住是“建议，未纳入” | 存 `localStorage`（超出已确认范围） | 规格 FR-038、范围外建议 | FR-038 |
| TD-015 | 历史最高分：`localStorage` 键 `block-match.highScore`，值为非负整数的十进制字符串；页面加载时读取，非数字/负数/读取异常按 0（并以内存值继续）；每次消除计分后若当前分数 > 已保存值，立即写入（写入异常时只更新内存值，不提示） | 满足 FR-024（中途即保存）、FR-025、FR-026、A-10 | `IndexedDB`（对一个数值过重）；只在游戏结束时保存（违反 R1 答案） | MDN `localStorage` Exceptions | FR-024–FR-026、AC-10、R1、A-10 |
| TD-016 | 布局：页面为纵向弹性布局（HUD 行 → 棋盘区 → 无），棋盘区 `container-type: size`，棋盘边长 `min(100cqw, 100cqh)`、`aspect-ratio: 1`；`html, body { overflow-x: hidden; max-width: 100% }`，高度用 `100dvh`（先写 `100vh` 兜底）；提示画面与“+N”浮字都在棋盘容器内绝对定位且容器 `overflow: hidden`；viewport `width=device-width, initial-scale=1, viewport-fit=cover` | 纯 CSS 自适应，窗口变化无需 JS；所有元素都限制在视口宽度内，杜绝横向滚动 | JS `resize` 监听重算尺寸（多余）；固定像素尺寸 + 缩放（手机上过小或溢出） | MDN 容器查询单位、`dvh` | FR-039、FR-040、AC-15、A-9 |
| TD-017 | 视觉：5 种颜色（红 #E5484D、黄 #F5B300、绿 #30A46C、蓝 #3E63DD、紫 #8E4EC6，第 1 关用前 3 种，依次加入），方块圆角 + 自上而下的线性渐变 + 内侧高光/底部阴影（`box-shadow inset`）表现立体感；突出显示为整体提亮、外发光描边并轻微放大（`scale(1.06)`）；深色背景 | 5 色色相间隔大、亮度有差异，在深色底上易于区分；立体感只用 CSS，无图片 | 图片素材（加载与缩放失真） | — （观感由业务负责人按 AC-16 目视确认） | FR-027、FR-041、AC-11、AC-16 |
| TD-018 | 部署：一个服务 `web`，多阶段 Dockerfile：`node:22-alpine` 中 `npm ci && npm run build`，产物复制到 `nginxinc/nginx-unprivileged:1.28-alpine`，`USER 101`，端口 8080；`/healthz` 由 nginx 直接返回 200；`index.html` 不缓存、`/assets/*`（文件名带哈希）长缓存；`log_not_found off` | 静态文件最简单可靠的托管方式；镜像官方即以 UID 101 非 root 运行并监听 8080 | Node 静态服务器（多一个运行时、更多攻击面）；`vite preview`（官方不建议用于生产） | nginx-unprivileged 官方 README 与 Dockerfile；参考 `runtime/candidate.md` | 部署 |
| TD-019 | 安全响应头（nginx 添加）：`Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer` | 只允许同源脚本；`style-src` 放开内联样式是因为渲染需要通过 CSSOM 设置 CSS 变量并且 Web Animations 产生内联样式效果，本应用没有用户输入内容，风险可接受 | 不设 CSP；`style-src 'self'`（需要逐一确认不使用 `style` 属性，收益很小） | — | 宪章“安全与隐私” |

## 技术先后依赖

- `src/game/`（棋盘、找组、消除结果中的“变化描述”结构、计分、关卡参数）必须先于 `src/ui/` 的动画编排与 `GameController`，因为表现层只按逻辑层返回的变化描述（方块 id 与起止位置）播放动画，变化描述的结构由逻辑层定义。
- `package.json`、`tsconfig.json`、`vite.config.ts`（含 Vitest 配置）必须先于任何测试与构建命令可执行，因为 `runtime/deployment.json` 中的开发者命令全部是 `npm run …` 脚本。
- 无障碍角色与可见名称、`data-state`/`aria-busy` 等状态属性（见“可测性约定”）必须在端到端测试编写之前落到 `src/ui/` 中，因为端到端测试只按这些属性定位与等待。
- `Dockerfile` 与 `deploy/nginx.conf` 依赖 `npm run build` 的产物目录 `dist/`，因此构建脚本与产物目录名必须先确定（本方案固定为 `dist/`）。

## 领域与数据模型

逻辑层（`src/game/`，纯数据，无 DOM）：

```ts
type ColorId = 0 | 1 | 2 | 3 | 4;              // 对应 TD-017 的 红、黄、绿、蓝、紫
interface Tile { id: number; color: ColorId }   // id 在一局内唯一，用于动画对应 DOM 元素
type Board = Tile[][];                          // 按列存储：board[col][rowFromBottom]，只存非空列，列内自底向上连续
                                                // 天然满足不变量“列内无空位、非空列从左连续”（FR-007、FR-008）
interface Pos { col: number; row: number }      // row 从底部 0 起；展示与可访问名称中换算为从上 1 起（见可测性约定）
interface MoveResult {
  removed: { id: number; pos: Pos }[];          // 本次被消除的方块（FR-004）
  moved:   { id: number; from: Pos; afterFall: Pos; to: Pos }[]; // 下落后位置与靠拢后最终位置（FR-007、FR-008）
  gained: number;                               // S(n)
  board: Board;                                 // 新棋盘
  levelEnded: boolean;                          // 新棋盘上没有可消除组（FR-016）
}
type Phase = 'playing' | 'animating' | 'levelCleared' | 'gameOver';
interface GameState { level: number; score: number; target: number; colors: number; board: Board; phase: Phase }
```

- 常量：`COLS = 10`、`ROWS = 10`；`scoreFor(n) = 10*n*n`（n≥2）；`colorsFor(L) = Math.min(2 + L, 5)`；`targetFor(L) = 2000*L + 250*L*(L-1)`。
- 找组：从点击位置做 4 邻接同色的广度/深度优先搜索；`hasMoves(board)` 检查是否存在同色的左右或上下相邻对（O(格数)）。
- 持久化数据：只有 `localStorage['block-match.highScore']`（TD-015）。无服务端数据、无数据库、无迁移。

## Component 边界与项目结构

Coding 会创建的路径（全部为新建）：

- `./package.json`、`./package-lock.json`：脚本 `dev`、`build`（`vite build`，产物 `dist/`）、`preview`、`typecheck`（`tsc --noEmit`）、`test:unit`、`test:integration`、`test:e2e`
- `./tsconfig.json`、`./vite.config.ts`（Vitest 配置写在这里，用 `projects` 区分 unit 与 integration）、`./playwright.config.ts`
- `./index.html`（视口 meta、HUD、棋盘容器、静音按钮、提示画面的静态骨架）
- `src/app.ts`：导出 `mountGame(root, { rng? })`，组装逻辑、表现、音效与存储（`rng` 缺省时用 `crypto.getRandomValues` 取种子，TD-006）；`src/main.ts`：页面入口，只调用 `mountGame(document.body)`，不读取网址参数
- `src/game/`：`rng.ts`、`board.ts`（生成、找组、消除/下落/靠拢、`hasMoves`）、`scoring.ts`、`levels.ts`、`game.ts`（状态机：`start`、`tryRemove`、`nextLevel`、`restart`）
- `src/ui/`：`controller.ts`（GameController：串起逻辑、动画、音效、存储、HUD；维护 `aria-busy` 与输入锁）、`boardView.ts`（方块 DOM 的创建/定位/移除）、`input.ts`（TD-008）、`hud.ts`（数值显示与计数动画）、`overlay.ts`（过关/游戏结束提示画面）、`timing.ts`（动画时长常量）、`anim.ts`（`Element.animate` 不可用时以定时器退化的包装）
- `src/audio/sound.ts`（TD-013；没有 `AudioContext` 时为无声实现）
- `src/storage/highScore.ts`（TD-015）
- `src/styles/main.css`
- `tests/unit/`：`scoring.test.ts`、`levels.test.ts`、`board.test.ts`、`game.test.ts`、`rng.test.ts`、`highScore.test.ts`
- `tests/integration/`：`controller.test.ts`（happy-dom 中挂载页面，模拟指针事件，用 Vitest 假定时器推进动画）、`audio.test.ts`（注入假的 `AudioContext` 验证静音）（布局与横向滚动只在真实浏览器的端到端测试中验证，happy-dom 不做布局计算）
- `e2e/`：`play.spec.ts`、`highscore.spec.ts`、`mute.spec.ts`、`layout.spec.ts`、`helpers.ts`（从可访问名称读出棋盘、找可消除组）
- `./Dockerfile`、`./.dockerignore`、`deploy/nginx.conf`
- `./README.md`（补充开发、测试与运行说明；保留现有两行）
- `./.gitignore`（`node_modules/`、`dist/`、`test-results/`、`playwright-report/`）

本设计步骤已写出、编码不修改：`docs/dependencies.json`、`docs/deployment.json`、`.ai-delivery/features/001-v1/runtime/deployment.json`。

## 数据流、状态、并发与生命周期

1. 页面加载：读最高分（TD-015）→ 以 `crypto.getRandomValues` 取种子创建 `rng`（TD-006）→ `start()` 生成第 1 关（score=0）→ 渲染。进行中的进度从不保存（FR-023）。
2. 玩家按下方块：`phase !== 'playing'`（动画中或提示画面中）时忽略一切棋盘输入（A-2、FR-035）。否则突出显示该方块所在组（组大小 ≥2 时，FR-027–FR-029）。
3. 在同一方块松开：`tryRemove(pos)`；单个方块或空位返回“无变化”（FR-005、FR-006）。有变化时：`phase='animating'`、棋盘 `aria-busy="true"` → 播放消除音效 → 计分并立即更新内存中的分数；若超过最高分立即写入存储（FR-024）→ 依次播放消除（180 ms）、下落（240 ms）、靠拢（200 ms）动画，同时 HUD 分数 400 ms 递增、“+N”浮字 → 动画结束：`aria-busy="false"`。
4. 若 `levelEnded`：停顿 300 ms 后按 FR-017 判定，`score >= target` → `phase='levelCleared'`，过关音效与“过关”提示画面；否则 `phase='gameOver'`，游戏结束音效与“游戏结束”提示画面。否则 `phase='playing'`。
5. 提示画面按钮：“下一关” → `nextLevel()`（关卡 +1，分数不变，新颜色数与目标，新棋盘，FR-018）；“重新开始” → `restart()`（第 1 关，分数 0，最高分不变，FR-022）。新棋盘方块以短暂的出现动画进入。
6. 并发：单线程；动画期间的输入由 `phase` 锁丢弃（不排队，A-2）；窗口缩放只影响 CSS 尺寸，不触碰状态（A-9）。
7. 静音：按钮切换内存中的 `muted`，立即作用于主音量与正在播放的节点（TD-013），跨关卡与重新开始保持（FR-038）。

## Interface 与契约（Contract）

本系统没有 HTTP API、没有服务端接口。对外“契约”只有：

| 契约 | 内容 | 位置 |
|---|---|---|
| 页面入口 | `GET /` 返回游戏页面；静态资源在 `/assets/` 下 | `deploy/nginx.conf` |
| 健康检查 | `GET /healthz` → `200`，正文 `ok` | `deploy/nginx.conf` |
| URL 参数 | 无；页面不读取任何查询参数（G2 I2） | `src/main.ts`、`src/app.ts` |
| 本机存储 | `localStorage['block-match.highScore']`：非负整数十进制字符串 | `src/storage/highScore.ts` |
| 页面可访问结构 | 见下节“可测性约定” | `index.html`、`src/ui/` |

## 可测性约定

项目还没有系统现状，以下全部为本次新建的约定。测试按无障碍角色与可见名称定位，不按样式类名或 DOM 层级定位。

### 关键控件的角色与名称

| 元素 | 角色 | 可访问名称 | 状态/值 |
|---|---|---|---|
| 棋盘 | `group` | `棋盘` | `aria-busy="true"` 表示消除/下落/靠拢/加分动画进行中（此时点击不生效，A-2）；为 `false` 时 HUD 数值已是最终值 |
| 方块 | `button`（`<button type="button">`，每个非空格一个；空格没有元素） | `{颜色}色方块，第{行}行第{列}列`，颜色 ∈ 红/黄/绿/蓝/紫；行从上往下 1–10（第 10 行为最底行），列从左往右 1–10；位置随下落/靠拢更新 | `data-state="highlighted"` 表示正处于突出显示（AC-11）；否则无该属性 |
| 当前分数 | `status`（`<output>`） | `当前分数` | 文本为不带分隔符的十进制整数；`aria-busy="false"` 后为最终值 |
| 本关目标分数 | `status`（`<output>`） | `本关目标分数` | 同上 |
| 当前关卡 | `status`（`<output>`） | `当前关卡` | 从 1 开始的整数 |
| 历史最高分 | `status`（`<output>`） | `历史最高分` | 整数；当前分数超过时同步更新（A-5） |
| 静音按钮 | `button` | `静音`（名称固定） | `aria-pressed="true"` 表示已静音，`"false"` 表示有声；图标随之切换（A-8） |
| 过关提示画面 | `dialog`（`aria-modal="true"`） | `过关` | 内含文字“过关”、当前分数，以及按钮 `下一关` |
| 游戏结束提示画面 | `dialog`（`aria-modal="true"`） | `游戏结束` | 内含文字“游戏结束”、当前分数，以及按钮 `重新开始` |

- “加分”动画的可观测点：每次成功消除时在棋盘容器内出现文字为 `+{得分}` 的浮字（约 700 ms 后移除），当前分数文本在约 400 ms 内经过若干中间值增加到新值（AC-12 可在动画期间多次读取文本观察到中间值）。
- 下落/靠拢动画的可观测点：动画期间方块的 `getBoundingClientRect()` 位置处于起点与终点之间（AC-12）；时长见 `src/ui/timing.ts`。
- 横向滚动的检查方式（AC-15）：`document.documentElement.scrollWidth <= document.documentElement.clientWidth`，且 `window.scrollTo(100, 0)` 后 `window.scrollX === 0`；棋盘的 `getBoundingClientRect()` 完全落在视口内。

### 造数与清理

- 默认通过页面本身游玩造数：测试从各方块的可访问名称读出整个棋盘（颜色与位置），自行计算可消除组后点击。棋盘每次打开随机生成，页面没有固定棋盘的入口（G2 I2）；端到端测试按读出的实际棋盘决定操作，不依赖特定棋盘形态。
- 历史最高分：测试可以在自己的浏览器上下文中直接设置/读取 `localStorage['block-match.highScore']`（这是本机浏览器存储，不是共享数据）；Playwright 每个测试默认使用全新的浏览器上下文，无需清理。没有数据库，不存在直接改库。
- 触达“游戏结束”：按 TD-004 的参数，一局通常在第 6–10 关结束（实验 E-1），测试可以一直选可消除组中最小的组游玩直到出现“游戏结束”提示画面；每关约 30–45 次消除，每次约 0.7 s 动画。

### 时间与随机性

- 随机性：只有棋盘生成使用随机数。开发者测试在代码内部注入固定种子的 `rng`（单元测试直接传给 `src/game/` 的函数，集成测试经 `mountGame(root, { rng })`，TD-006）；需要特定棋盘形态的单元测试直接构造 `Board` 数据。独立测试与端到端测试无法、也不需要固定随机性，按页面上读出的实际棋盘行动。
- 时间：游戏没有计时规则；动画时长为固定常量（`src/ui/timing.ts`）。测试以棋盘 `aria-busy="false"` 作为“动画结束、数值最终”的等待条件，不使用固定等待。集成测试用 Vitest 假定时器推进。

### 音效的可观测点（AC-14）

- 所有音效只经 Web Audio：`window.AudioContext`（Safari 旧名 `webkitAudioContext`）创建的 `OscillatorNode` 的 `start()`，经同一个主 `GainNode` 输出；首次 `pointerdown` 后才创建 `AudioContext`（A-11）。
- 成功消除、过关、游戏结束各至少调用一次 `start()`；静音（`aria-pressed="true"`）期间不调用任何 `start()`，点下静音时对正在播放的节点调用 `stop()`。独立测试可以在页面脚本执行前（例如 Playwright `addInitScript`）包装 `AudioContext.prototype` / `OscillatorNode.prototype` 的方法来计数，这只改变测试自己的浏览器，不需要应用提供任何测试端点。

### 开发者命令与检查（写在 `.ai-delivery/features/001-v1/runtime/deployment.json`）

| 类别 | 命令 | 验证什么 | 全量运行一次大致用时 |
|---|---|---|---|
| setup | `npm ci` | 安装锁定依赖 | 约 30–60 s（估计） |
| `staticAnalysis` | `npm run typecheck` | `tsc --noEmit` 严格类型检查 | 约 5 s（估计） |
| `build` | `npm run build` | Vite 打包出 `dist/` | 约 5 s（估计） |
| `developerTests` | `npm run test:unit` | 单元测试（Node 环境）：`scoring.test.ts` 对 n=2…100 验证 S(n) 严格递增与 FR-011，对 n≤20 的全部拆分（每组≥2）与 n≤100 的随机拆分验证 FR-012；`levels.test.ts` 对 L=1…200 验证 FR-020/FR-021（颜色不减且封顶 5、目标严格递增、本关需新得分数不减，第 1 关上一关目标按 0，A-12）；`board.test.ts` 验证找组只含 4 邻接同色、消除只删该组、下落与靠拢后不变量、单个方块与空位无变化、`hasMoves`；`game.test.ts` 验证本关结束判定与过关/游戏结束分支、进入下一关分数不清零、重新开始；`highScore.test.ts` 验证非法值与存储异常时的退化 | 约 10 s（估计），约 40 个用例 |
| `integrationTests` | `npm run test:integration` | happy-dom 中挂载整页：指针按下/松开触发消除、动画期间输入被忽略、HUD 与可访问名称更新、最高分中途写入 `localStorage`、提示画面与按钮、静音时不调用 `start()` 且会 `stop()` 正在播放的节点 | 约 15 s（估计），约 15 个用例 |

- 可供测试计划以 `developer-check` 引用的检查：AC-5 → `developerTests` 中的 `tests/unit/scoring.test.ts`；AC-9 → `developerTests` 中的 `tests/unit/levels.test.ts`（无限关卡的性质在测试环境中只能抽查前几关）。

### 端到端用例（不写进部署声明）

- 运行方式：`npx playwright test`（`playwright.config.ts` 的 `webServer` 先 `npm run build` 再以 `vite preview --port $E2E_PORT --strictPort` 启动，`E2E_PORT` 缺省 4173；也可设 `E2E_BASE_URL` 指向已有地址而不启动本地服务）。单独运行一个用例：`npx playwright test e2e/play.spec.ts -g "<用例标题>" --project=desktop`。
- 两个 project：`desktop`（Desktop Chrome，鼠标）与 `mobile`（Pixel 7 设备模拟，`hasTouch`、竖屏，使用 `tap()`）。
- 规模（估计）：约 12 个用例 × 2 个 project；普通用例单个约 5–20 s；“玩到游戏结束并重新开始”的用例约 3–5 min（约 9 关 × 约 40 次消除 × 约 0.7 s）。

### 并行与隔离

- 单元与集成测试无共享状态（每个测试文件独立的 happy-dom 窗口与 `localStorage`），Vitest 默认多线程并行即可。
- 端到端：Playwright 每个测试使用独立浏览器上下文（各自的 `localStorage`），可多 worker 并行；多个 Playwright 进程同时运行时，各进程设置不同的 `E2E_PORT`。
- 没有外部依赖，不存在与 `dev` 实例共用数据的问题。

## 安全、隐私、身份与 Secret

- 无账号、无身份、无服务端数据；不收集个人信息；没有任何凭据或应用机密（`docs/dependencies.json` 的 `secrets` 为空）。
- 输入校验：页面不读取任何网址参数；`localStorage` 读出的最高分只接受非负安全整数，否则按 0。所有显示文本用 `textContent` 写入，不用 `innerHTML` 拼接。
- 响应头与 CSP 见 TD-019；容器以 UID 101 非 root 运行（TD-018）。
- 日志：nginx 访问日志只含请求行、状态码与 User-Agent，不含客户内容；前端不向任何地方上报数据。

## 外部依赖声明

本游戏没有外部依赖（规格“依赖”：无外部服务依赖）：`docs/dependencies.json` 的 `dependencies` 与 `secrets` 均为空数组，因此没有探测脚本、没有 IaC、没有 `AIDH_DEP_*` 变量。将来若需要外部服务，按 `runtime/dependency-declaration.md` 另行声明。

## 配置、可观测性与运维

- 配置：无运行时配置与环境变量；nginx 配置随镜像发布（`deploy/nginx.conf`，监听 8080）。
- 日志：沿用镜像默认——访问日志（`combined` 格式）写 stdout，错误日志写 stderr，错误日志行格式为 `YYYY/MM/DD HH:MM:SS [级别] pid#tid: 消息`。`/healthz` 关闭访问日志；`log_not_found off` 使 404 不写错误日志（避免把扫描/探测请求误报为错误）。
- 错误日志识别规则（写在 `docs/deployment.json` 的 `operations.errorLogRules`，均为 `"kind": "pattern"` 规则，与样例日志行的匹配见实验 E-4）：
  - `nginx-critical`（high）：错误日志级别为 `emerg`/`alert`/`crit`，出现即报告（配置或进程级故障）。
  - `nginx-error`（medium）：错误日志级别为 `error`，10 分钟内 3 次才报告（例如文件权限、上游异常）。
  - `http-5xx`（high）：访问日志中响应状态为 5xx（静态服务正常情况下不应出现）。
- 前端运行错误只出现在玩家浏览器中，不进入服务日志；本次不加前端错误上报（需求未要求）。

## SLO、限制、扩缩容、重试与恢复

- 没有获批准的数值指标（规格“性能、可靠性与其他质量边界”）。静态服务单副本即可；无重试逻辑。
- 客户端恢复：存储不可用时退化为内存最高分（A-10）；刷新页面即开始新局（FR-023）。
- 产物体积预计 < 100 KB（无框架、无图片与音频素材）。

## 部署拓扑、迁移、Rollout 与 Rollback

- 拓扑：一个对外服务 `web`（`docs/deployment.json`），构建上下文为仓库根目录、构建文件 `Dockerfile`，端口 8080，健康检查 `/healthz`。无依赖、无服务间调用。
- 迁移：无。`localStorage` 键带项目前缀，将来格式变化时换新键名即可。
- 发布：平台按部署声明构建并部署被测提交的镜像。
- 回滚：重新部署上一版本的镜像；没有服务端数据，玩家本机的最高分键与格式不变，回滚不影响。

## 验证环境责任矩阵（Verification Environment）

| 验证类型 | 责任阶段 | 环境来源 | 依赖/凭据 | Coding 证据 | 下游结果 |
|---|---|---|---|---|---|
| 类型检查、构建 | 编码 | Agent Pod | 无 | `npm run typecheck`、`npm run build` 通过 | 平台按 `runtime/deployment.json` 复跑 |
| 单元测试（规则、计分、关卡、存储） | 编码 | Agent Pod（Node） | 无 | `npm run test:unit` 通过 | 平台复跑；AC-5、AC-9 可被测试计划作为开发者检查引用 |
| 集成测试（整页 DOM、输入、动画锁、静音） | 编码 | Agent Pod（happy-dom） | 无 | `npm run test:integration` 通过 | 平台复跑 |
| 端到端（真实浏览器，鼠标与触摸、布局、动画、最高分重开页面） | 编码自测 | Agent Pod `localhost` + 预装 Chromium | 无 | 单独运行新写用例的输出 | 不进部署声明 |
| 独立测试（AC-1–AC-15） | 独立测试 | 测试环境 `cand-*` 的 `AIDH_SERVICE_WEB_URL`（HTTPS） | 无 | — | G3 结果 |
| 观感（AC-16）与真实手机/其他浏览器 | 验收 | 业务负责人的设备 | 无 | — | 人工目视确认 |

说明：执行环境只有 Chromium（参考 `runtime/agent-pod.md`）；Firefox/Safari/iOS Safari 上的表现由所用 Web 标准的兼容性（技术上下文中的 MDN 出处）保证，实机确认在验收时由人完成。

## 快速验证指南（Quickstart）

### 本地运行与检查（编码完成后）

```bash
npm ci
npm run typecheck && npm run build && npm run test:unit && npm run test:integration
npm run dev                              # 开发服务器，浏览器打开 http://localhost:5173/
npx playwright test --project=desktop    # 端到端（自动构建并以 vite preview 启动）
```

预期：全部命令退出码 0；页面可玩，两次打开得到不同的随机棋盘；带任意查询参数（例如 `/?seed=42`）打开时行为与不带参数完全相同。

### 实验 E-1：计分与关卡参数标定（U-1）

在仓库外临时目录写一次性脚本 `/tmp/e1/sim.mjs`（10×10 棋盘、mulberry32 随机数、S(n)=10·n²，三种策略：随机选组 `rand`、选最大组 `greedy`、选最小组 `small`），用 Node 运行：

```js
const W=10,H=10;
function rng(s){return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function gen(k,r){const b=[];for(let c=0;c<W;c++){const col=[];for(let y=0;y<H;y++)col.push(Math.floor(r()*k));b.push(col)}return b}
function groups(b){/* 4 邻接同色、≥2 的全部组（DFS）*/ const seen=b.map(c=>c.map(()=>false));const gs=[];for(let c=0;c<b.length;c++)for(let y=0;y<b[c].length;y++){if(seen[c][y])continue;const col=b[c][y];const st=[[c,y]];seen[c][y]=true;const g=[];while(st.length){const[x,z]=st.pop();g.push([x,z]);for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,nz=z+dz;if(nx<0||nx>=b.length||nz<0||nz>=b[nx].length||seen[nx][nz]||b[nx][nz]!==col)continue;seen[nx][nz]=true;st.push([nx,nz])}}if(g.length>=2)gs.push(g)}return gs}
function remove(b,g){const del=new Set(g.map(([x,z])=>x*100+z));return b.map((col,x)=>col.filter((_,z)=>!del.has(x*100+z))).filter(c=>c.length)}
function play(k,seed,strat){const r=rng(seed),pr=rng(seed*7+1);let b=gen(k,r),s=0;for(;;){const gs=groups(b);if(!gs.length)break;let g;if(strat==='rand')g=gs[Math.floor(pr()*gs.length)];else if(strat==='greedy')g=gs.reduce((a,c)=>c.length>a.length?c:a);else g=gs.reduce((a,c)=>c.length<a.length?c:a);s+=10*g.length*g.length;b=remove(b,g)}return s}
// 单关得分分布：k=3..6，各 2000 局
for(const k of [3,4,5,6])for(const st of ['rand','greedy','small']){const xs=[];for(let i=1;i<=2000;i++)xs.push(play(k,i,st));xs.sort((a,b)=>a-b);const q=p=>xs[Math.floor(p*xs.length)];console.log(`k=${k} ${st} p10=${q(.1)} p25=${q(.25)} p50=${q(.5)} p75=${q(.75)} p90=${q(.9)}`)}
// 整局：colors(L)=min(2+L,5)，d(L)=base+step*(L-1)，各 500 局，记录游戏结束时的关卡
const colorsFor=L=>Math.min(3+(L-1),5);
for(const [base,step] of [[2000,250],[2500,250],[2000,500],[3000,200]])for(const st of ['rand','greedy','small']){const lv=[];for(let i=1;i<=500;i++){let L=1,tot=0,target=0;for(;;){target+=base+step*(L-1);tot+=play(colorsFor(L),i*1000+L,st);if(tot<target)break;L++;if(L>60)break}lv.push(L)}lv.sort((a,b)=>a-b);console.log(`d=${base}+${step}(L-1) ${st} p10=${lv[50]} p50=${lv[250]} p90=${lv[450]} min=${lv[0]} L1fail=${lv.filter(x=>x===1).length}`)}
```

```bash
node /tmp/e1/sim.mjs
```

观察结果（单关得分，随机策略 / 最大组策略，分位数 p10–p50–p90）：

| 颜色数 | rand p10 / p50 / p90 | greedy p10 / p50 / p90 |
|---|---|---|
| 3 | 5940 / 8320 / 12160 | 5920 / 7680 / 10760 |
| 4 | 3260 / 4250 / 5890 | 3380 / 4240 / 5400 |
| 5 | 2230 / 2850 / 3770 | 2370 / 2950 / 3670 |
| 6 | 1670 / 2190 / 2800 | 1800 / 2290 / 2850 |

整局（颜色 3→4→5 封顶）游戏结束所在关卡（p10 / p50 / p90 / 最少，第 1 关失败次数）：

| d(L) | rand | greedy | small |
|---|---|---|---|
| 2000+250(L−1) | 11/13/16/9，0 | 12/13/15/10，0 | 12/14/16/9，0 |
| 2500+250(L−1) | 9/10/13/6，0 | 9/10/12/6，0 | 9/11/14/6，0 |
| **2000+500(L−1)（选定）** | **7/9/10/6，0** | **8/9/10/6，0** | **8/9/11/6，0** |
| 3000+200(L−1) | 7/9/12/4，0 | 7/9/11/5，0 | 7/10/13/5，0 |

补充：在脚本末尾追加 `for(const k of [3,4,5]){let mn=1e9;for(let i=1;i<=2000;i++)for(const st of ["rand","greedy","small"])mn=Math.min(mn,play(k,i,st));console.log(k,mn)}`，观察到单关最低得分 3 色 3580、4 色 2180、5 色 1420（各 6000 局）：均大于 0（初始棋盘都有可消除组），且 3 色最低分高于第 1 关目标 2000（第 1 关在样本中从未失败）。

### 实验 E-2：Playwright 版本与预装 Chromium 修订版（U-2）

```bash
ls /ms-playwright                                  # 观察：chromium-1255  chromium_headless_shell-1255  firefox-1572  webkit-2388  ffmpeg-1013
mkdir -p /tmp/e2 && cd /tmp/e2
for v in 1.63.0 1.64.0 1.65.0 1.65.1; do
  npm pack playwright-core@$v --silent >/dev/null && tar -xzf playwright-core-$v.tgz package/browsers.json \
  && echo "$v: $(jq -c '[.browsers[]|select(.name=="chromium")|.revision]' package/browsers.json)"; rm -rf package *.tgz
done
```

观察：`1.63.0: ["1243"]`、`1.64.0: ["1248"]`、`1.65.0: ["1254"]`、`1.65.1: ["1255"]`。编码时若 Pod 的修订版不同，用同样的方法找到修订版相同的版本（TD-010 后备做法）。

### 实验 E-3：工具链的 Node 版本要求（U-3）

```bash
for p in vite@8.4.0 vitest@5.1.2 jsdom happy-dom typescript@5.9.3 @playwright/test@1.65.1; do npm view $p version engines --json; done
```

观察：vite 8.4.0 `^20.19.0 || >=22.12.0`；vitest 5.1.2 `^22.12.0 || ^24.0.0 || >=26.0.0`（peer：vite `^6.4.0 || ^7.0.0 || ^8.0.0`）；jsdom 31.0.1 `^22.22.2 || ^24.15.0 || >=26.0.0`；happy-dom 21.0.4 `>=20.0.0`；@playwright/test 1.65.1 `>=20`；TypeScript 5.9.3 为当前 5.x 最新版。若 Agent Pod 的 Node 22 次版本低于 22.12，vite/vitest 退回到支持该版本的上一主版本（vite 7、vitest 4），测试写法不变。

### 实验 E-4：错误日志识别规则与 nginx 日志行的匹配

用 Node 把 `docs/deployment.json` 中三条 `pattern` 依次作用于 nginx 的样例日志行（`[emerg]` 端口占用、`[error]` 权限拒绝、`[notice]` 启动、访问日志 502、访问日志 200 且 User-Agent 中含 “500”）：

```bash
node -e 'const d=JSON.parse(require("fs").readFileSync("docs/deployment.json","utf8"));const lines=[/* 上述 5 行 */];for(const r of d.operations.errorLogRules){const re=new RegExp(r.pattern);console.log(r.name,lines.map(l=>{const m=l.match(re);return m?"HIT":"-"}).join(" | "))}'
```

观察：`nginx-critical` 只命中 `[emerg]` 行；`nginx-error` 只命中 `[error]` 行；`http-5xx` 只命中 502 行，不误命中 `[notice]` 与 200 行（User-Agent 中的 “500” 也不命中）；三条规则的命名分组 `message` 均取到消息正文。

## 支持 Runbook

| 症状 | 排查 | 处理 |
|---|---|---|
| 部署后健康检查失败 | 看容器 stderr 是否有 `[emerg]`（多为 `deploy/nginx.conf` 语法或监听端口不是 8080） | 修正配置后重新部署；或回滚到上一镜像 |
| 页面空白 | 浏览器控制台是否有 CSP 拦截或 404 的 `/assets/*` | 确认 `dist/` 被复制到 `/usr/share/nginx/html`、CSP 与 TD-019 一致 |
| 玩家反馈最高分丢失 | 是否清除了浏览器数据、使用隐私模式或换了浏览器（FR-026、A-10） | 属预期行为，无服务端数据可恢复 |
| 某局出现规则错误 | 请玩家描述或截图出错前后的棋盘 | 在单元测试中直接构造该棋盘（`Board` 数据）复现，修正后保留该用例 |

## 开放决策

- 待验证假设：无（U-1–U-3 均有实验结论）。TD-010（Playwright 版本）与 E-3 中的 Node 次版本依据的是本会话的镜像，已附后备做法，不影响产品行为。
- 需要人决定的事项：无。
- 已由 G2 决定：色觉辅助形状记号（I1）不纳入；公开网址参数 `?seed=`（I2）删除，原 TD-012 作废；I3–I6 的规格建议不纳入；I7–I15 的规格假设按推荐确认，本方案原设计（TD-007、TD-008、TD-015、TD-013、TD-016、TD-004）与之一致。
- 建议，未纳入，待 G2 决定：无新增。
