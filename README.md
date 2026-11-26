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
```

端到端测试默认先构建并在 `E2E_PORT`（默认 4173）上启动预览服务；设置 `E2E_BASE_URL` 时直接针对该地址运行。
