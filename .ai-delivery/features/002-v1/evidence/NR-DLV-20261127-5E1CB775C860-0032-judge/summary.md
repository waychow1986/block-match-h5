# G3 归类说明（结果信封 NR-DLV-20261127-5E1CB775C860-0032）

- 被测版本：候选 `f61a50cb02850b43bf81d6b67b06b2c449beb342`，服务 `web`（health：healthy）。
- 锁定的测试计划：第 1 版 `sha256:b7e5c4cf4bb4ca02311703ff58cb1fe00d6e7076df6fe754a192238f1ff98bc0`；锁定的测试脚本：第 2 版 `sha256:e248a21f2847ecb969e8c37f6b54c51ca8e32c25a09a973a298502f4f2f9a004`。

## 脚本执行

- `scriptResults` 第 1 阶段：35 个脚本场景全部符合预期（用时 322 秒），没有未通过或未报告的脚本场景。

## 引用开发者检查的场景

本轮构建中执行过的开发者检查（`developerChecks`）全部退出码 0：

| 场景 | 测试计划引用的检查 | 对应 `developerChecks` 项 | 退出码 | 覆盖的验收标准 |
|---|---|---|---|---|
| TS-13 | `npm run test:unit` 计分与连锁规则 | `developerTests[0]` | 0 | AC-7 |
| TS-16 | `npm run test:unit` 特殊方块规则 | `developerTests[0]` | 0 | AC-8 |
| TS-19 | `npm run test:unit` 彩色消除方块规则 | `developerTests[0]` | 0 | AC-9 |
| TS-23 | `npm run test:unit` 关卡结算 | `developerTests[0]` | 0 | AC-11 |
| TS-26 | `npm run test:unit` 关卡参数 | `developerTests[0]` | 0 | AC-13 |
| TS-28 | `npm run test:unit` 洗牌 | `developerTests[0]` | 0 | AC-14 |
| TS-40 | `npm run test:integration` 音频解锁 | `integrationTests[0]` | 0 | AC-21 |

这些标准在 `developerCheck.step` 中写明对应的检查，由平台核对后计为通过；同一标准的脚本场景也都通过。

## 归类

- 没有未通过或需要归类的条目；G2 没有按测试缺口处理的标准，未使用 `test-gap`。
- 测试计划写明需人工在验收时确认、不在脚本结论内的部分：AC-17 的图形与音效原创性、AC-19 的观感与流畅程度（A-21）、AC-21 的 iOS Safari / Android Chrome 实机发声（技术方案待验证假设 H-1）。
