# dsh-hub 可实施优化建议方案

- 分析对象：`d:\XiaoProject\DSHPluginDev\dsh-hub`（`@hanmaxiao/dsh-hub`，Cordis 插件）
- 分析日期：2026-11-05
- 基线：`node --test` 228 通过 / 0 失败，耗时 24.5s；工作区干净，`main` 与 `origin/main` 同步（HEAD `7aef4cc`）
- 说明：本方案只读分析，不改仓库代码、不建分支、不提交。所有建议均已按 `AGENTS.md` / `DESIGN.md` 的硬约束过滤。

---

## 一、现状快照

### 1.1 代码规模

| 文件 | 行数 | 说明 |
|---|---:|---|
| `client.js` | 5,497 | 面板全部 UI 与交互，单文件不可拆；243.6 kB |
| `lib/`（6 文件） | 1,713 | `config` 102 / `ids` 49 / `model` 505 / `remote-surface` 118 / `status` 274 / `store` 665 |
| `host.js` | 76 | 挂载 store 与 Remote，全部资源走 `ctx.effect` |
| `remote.js` | 295 | `HubRemote` 七个方法 |
| `typert.js` | 100 | manifest，与 `remote.js` 镜像 |
| `index.js` | 16 | Host 入口 |
| `tests/`（8 文件） | 4,104 | 228 个 `test()` |
| `DESIGN.md` / `README.md` / `AGENTS.md` / `CHANGELOG.md` | 506 / 471 / 301 / 27 | 契约、用户文档、工程约束、变更日志 |

测试分布：`client-panel` 84、`model` 52、`store` 44、`typert` 16、`config` 12、`client-bridge` 9、`host-entry` 6、`ids` 5。

### 1.2 测试基线（实跑）

```
node --test
ℹ tests 228  pass 228  fail 0  duration_ms 24508
```

内置覆盖率（`node --test --experimental-test-coverage`，Node v24.16.0）：

| 文件 | 行 % | 分支 % | 函数 % |
|---|---:|---:|---:|
| `client.js` | 93.41 | 75.13 | 77.55 |
| `host.js` | 97.37 | 100.00 | 80.00 |
| `lib/config.js` | 100.00 | 96.30 | 100.00 |
| `lib/ids.js` | 100.00 | 100.00 | 100.00 |
| `lib/model.js` | 96.83 | 90.07 | 100.00 |
| `lib/remote-surface.js` | 100.00 | 100.00 | 100.00 |
| `lib/status.js` | 93.07 | 75.00 | 100.00 |
| `lib/store.js` | 93.98 | 86.07 | 100.00 |
| `remote.js` | **80.34** | **62.50** | **58.82** |
| `typert.js` | 100.00 | 100.00 | 100.00 |
| 合计 | 93.53 | 78.69 | 81.15 |

`remote.js` 的未覆盖行集中在 `rethrow()`（93–101）与七个方法的 `catch` 块（148–150、163–169、179–185、198–204、216–222、235–241、254–260）。也就是说：**Host 到 Client 的整条错误翻译链路没有任何测试**。

### 1.3 Git / CI / 发布现实

| 项目 | 实测结论 |
|---|---|
| 工作区 | 干净；`## main...origin/main`，无待提交、无未推送 |
| 分支 | 仅 `main`（本地与远端），13 个提交 |
| 远端 | `origin` = `git@github.com:HanMaXiao/dsh-hub.git`（SSH，fetch/push 均可），仓库存在；`gh` 已登录 `HanMaXiao`（token 含 `repo` / `workflow` scope） |
| PR 流程 | 存在。`main` 受保护：必需检查 `node --test`（`strict: true`）、`required_linear_history`、禁止 force push、要求走 PR（`required_pull_request_reviews` 存在，但 **required_approving_review_count = 0**） |
| CI | `.github/workflows/ci.yml`：`pnpm install --frozen-lockfile` + `node --test`，Node 24，push/PR 触发，`contents: read` |
| Tag / Release | `git tag -l` 为空；`gh release list` 为空 |
| npm | 未发布：`npm view @hanmaxiao/dsh-hub` 返回 404 |
| 版本一致性 | `package.json:3` 是 `1.0.0`；`CHANGELOG.md:8` 已写 `[1.1.0] - 2026-10-30` |
| 发布包内容 | `npm pack --dry-run`：18 个文件、106.9 kB；**不含 `DESIGN.md` / `AGENTS.md` / `CHANGELOG.md`**，但 `README.md:464-465` 用相对链接指向其中两个 |

结论：**PR + 自动检查 + 线性历史这条自动合并链是通的**（0 个 approve 即可合并，前提是分支与 `main` 同步且 `node --test` 绿）。尚未发布过任何版本，因此版本对齐是「发布前」而不是「线上事故」。

### 1.4 主要风险（按影响排序）

1. **删除不可撤销，而 Host 已经把被删条目返回了。** `store.js:462-477` 的 `remove()` 与 `remote.js:187-205` 的注释都写着「so the panel can offer an undo」，但 `client.js:4697-4713` 丢弃了返回值。误删即永久丢失，且没有回收站。
2. **发布版本自相矛盾。** manifest 说 1.0.0，CHANGELOG 说 1.1.0，没有 tag、没有 release。按版本判断更新的插件管理器会读错版本。
3. **唯一数据通路的错误翻译零测试。** 面板的 `failureText(error)` 完全依赖 `hub/<reason>` 代码；`remote.js` 函数覆盖率 58.82%，这条链路一旦改错只会在用户面前报「未知错误」。
4. **导入没有上限。** `client.js:4894-4921` 无条件读入并解析整份文件；`client.js:4923-4963` 对每个条目发一次 Remote 写，而每次写都会重写整份文档（`store.js:363-401`）。一个 10,000 条的文件就是 10,000 次全文档落盘，面板会长时间无响应。
5. **文档与元数据漂移。** `locale/zh.json:4` / `en.json:4` 写「四边停靠 / four-edge docking」，与 `DESIGN.md:488` 的三边（左/右/下）矛盾；`README.md:439` 说 tests 只覆盖 `lib/`（实际还有面板、桥、Host 入口）；`README.md:466` 说「需要一个人 approve」，与实测 0 个 approve 不符。

### 1.5 十三个评估维度的逐项结论

| 维度 | 结论 | 对应建议 |
|---|---|---|
| 用户界面交互优化 | 整体成熟（三边、窗口化、键盘、焦点环、状态浮层齐备）。明确缺口只有两个：删除无撤销；通知没有 `role` / `aria-live`，屏幕阅读器听不到保存失败 | U-01、U-03 |
| 系统性能 | 渲染瓶颈已由 200 条窗口化解决；查询层每次按键仍有可省的分配；`list` 全量传输 + 双重克隆是**设计上接受的**代价，暂不动 | U-04；A-03 暂缓 |
| 代码架构 | Host/Client 所有权干净，`lib/remote-surface.js` 与 `typert.js` 单一来源，且被测试钉住。没有需要在本次改动的结构问题 | 无新增；见「不建议做」 |
| 模块化设计 | `client.js` 单文件是 manifest 强制；现有 banner 分区合理。**拆分是伪优化** | A-01（不建议） |
| 文档完善 | 三处事实漂移 + 发布包链接失效；`AGENTS.md`/`DESIGN.md` 本身质量高 | R-02、R-03、R-04 |
| 测试策略 | 228 个测试覆盖面很好，但错误路径是空白；覆盖率可用内置能力量化，不需要新依赖 | T-01、T-02、T-03 |
| 可扩展性 | item 的 `title` 为增量字段、status 枚举是数据、schema 版本未动 —— 扩展模型健康。真正的扩展瓶颈是导入的 O(n) 写 | U-02 |
| 代码质量 | 无 emoji、无字面颜色、JSDoc 完整。小瑕疵：`pickImportFile` 依赖数组带了两个未使用值（`client.js:4921`） | U-02 附带清理；T-04 护栏 |
| 安全性 | 附件白名单已拒绝 SVG、单图上限走 Config、原子写 0600、负载不落 localStorage —— 主要面已经守住。缺口是导入的输入上限；另有机器级凭据卫生问题 | U-02、S-01 |
| Agent Harness 增强 | `.agents/` 已有 4 个 skill + notes 生命周期 + `AGENTS.md` 约束，质量高于多数仓库；本次只需按规则为新功能补 `proposed/` note | U-01、U-02 的交付项 |
| 项目 Harness 增强 | CI 恰好一条命令，符合「唯一验证命令」约束；**不建议加第二道门禁**。发布流程缺一个「tag → release」的可重复步骤，用现有 `dsh-plugin-release` skill 即可 | R-01；不加 CI 门禁 |
| 高价值功能开发 | 删除撤销是唯一「Host 已支持、Client 只差接线」的功能；其余（回收站、批量导入 API）收益/风险不匹配 | U-01；A-02、A-05 不建议 |
| 开发提效 | 覆盖率可作为日终诊断命令；发布守卫测试把「版本不一致」变成红灯而不是发布事故 | T-03、T-04、R-01 |

---

## 二、建议清单

> 优先级：P1 = 下一个迭代应做；P2 = 排期做；P3 = 顺手做。工作量：S ≤ 半天，M = 1–2 天（不含评审与往返）。

### R-01 对齐版本、打 tag、建 release

- **维度**：文档完善 / 项目 Harness / 开发提效
- **优先级 / 工作量**：P1 / S
- **问题证据**：
  - `package.json:3` → `"version": "1.0.0"`
  - `CHANGELOG.md:8` → `## [1.1.0] - 2026-10-30`，内容（导入导出、窗口化、无障碍、store 缓存、写入串行化）已经在 HEAD 的代码里
  - `git tag -l` 为空；`gh release list` 为空；`npm view @hanmaxiao/dsh-hub` 404
- **实施步骤**：
  1. Lead 把 `package.json` 的 `version` 改为 `1.1.0`（新增能力，语义化版本 minor）。
  2. 新增 `tests/release-guards.test.js`：解析 `CHANGELOG.md` 第一条 `## [x.y.z]` 与 `package.json.version` 比较，必须相等；同时展开 `package.json.files` 的每个模式（`lib/*.js` 等）并断言至少命中一个真实文件。该测试在改版本之前是红的，改完即绿。
  3. 在 `7aef4cc` 上打 `v1.1.0` 并推送 tag；用 CHANGELOG 的 1.1.0 段落作为 release notes（`gh release create v1.1.0 --notes-file ...`）。
  4. 后续 W1–W3 合并后再补 `## [1.2.0]` 条目、升版本、打 tag，流程同上。
- **预期效果**：插件管理器读到的版本与变更日志一致；任何人 `git describe` 都能定位发布点；版本漂移从「发布事故」降级为「测试红灯」。
- **技术选型依据**：用仓库内测试做守卫，而不是新增 CI job —— `AGENTS.md` 规定唯一验证命令，CI 里再加一条等于制造第二套门禁；测试在现有 `node --test` 里天然被执行。
- **风险**：scope 被用户级 `.npmrc` 映射到 GitHub Packages（见 S-01），此时 `npm publish` 不会发到 npmjs；发布前必须先确认目标 registry。

### R-02 修复发布包里的文档链接

- **维度**：文档完善
- **优先级 / 工作量**：P1 / S
- **问题证据**：
  - `README.md:464-465` 指向 `DESIGN.md` 与 `AGENTS.md`
  - `package.json:43-53` 的 `files` 不含这两个文件
  - `npm pack --dry-run` 的 18 个文件中确实没有它们；README 会被 npm 自动打包，所以 npm 页面上的这两个链接必然 404
- **实施步骤**（二选一，推荐 A）：
  - **A（推荐）**：把 README 里的相对链接改成绝对地址 `https://github.com/HanMaXiao/dsh-hub/blob/main/DESIGN.md` / `.../AGENTS.md`。零发布体积变化。
  - **B**：Lead 在 `files` 里加 `DESIGN.md`（是否连 `AGENTS.md` 一起由 Lead 决定）。设计契约对使用者有价值，但 `AGENTS.md` 面向贡献者，留在仓库更合适。
- **预期效果**：npm 页面与 GitHub 页面上的文档入口都可达。
- **技术选型依据**：README 是 npm 的展示面，链接必须自包含；相对链接只在仓库内成立。
- **风险**：仓库改名会让绝对链接失效；可接受。

### R-03 修正 README 的维护事实

- **维度**：文档完善
- **优先级 / 工作量**：P1 / S
- **问题证据**：
  - `README.md:439` → `tests/ node --test 覆盖 lib/`；实际 8 个文件里 3 个是面板/桥/Host 入口测试（AGENTS.md 已写明）
  - `README.md:466` → 「需要一个人 approve」；实测 `required_approving_review_count = 0`（但 PR 本身是必需的）
  - `README.md:460-462` 说没有类型检查/lint；这是协议事实，保留不动
- **实施步骤**：
  1. 第 439 行改为列出四个测试面（`lib/`、Host 入口、面板交互、桥一致性）。
  2. 第 466 行改为：必须走 PR、必需检查 `node --test`、分支需与 `main` 同步、线性历史（squash/rebase）、force push 关闭、0 个 approve 即可合并。
  3. W1 落地后补「删除可撤销」与「导入上限」两段到 §五/§六（按实际行为写，不提前写）。
- **预期效果**：贡献者按文档操作不会白等一个不存在的 approval。
- **技术选型依据**：README 是操作面的第一入口；与保护策略不一致的说明比没有说明更糟。
- **风险**：无。

### R-04 修正 locale 元数据里的「四边停靠」

- **维度**：文档完善 / 用户界面交互
- **优先级 / 工作量**：P1 / S
- **问题证据**：
  - `locale/zh.json:4` → 「四边停靠」
  - `locale/en.json:4` → 「four-edge docking」
  - `DESIGN.md:488` → 「Three edge anchors — left / right / bottom」；`README.md:6`、`:101` 均写三边；顶部边被明确撤回（`DESIGN.md:499`）
  - 这两个文件在插件**未激活**时就会被 Plugin Manager 读取，所以错误会直接展示给用户
- **实施步骤**：`zh` 改为「三边停靠（左/右/下）」；`en` 改为「three-edge docking (left, right, bottom)」；保持两份文件的 key 集合完全一致。由 W3 的 locale key 对齐测试兜底。
- **预期效果**：Plugin Manager 里的描述与真实交互一致。
- **技术选型依据**：locale 是唯一用户可见的包元数据来源，事实错误只能手动修；测试只能保证 key 对齐，不能保证语义。
- **风险**：无。

### T-01 为 `remote.js` 的错误翻译补测试

- **维度**：测试策略 / 代码质量
- **优先级 / 工作量**：P1 / S
- **问题证据**：
  - 覆盖率：`remote.js` 行 80.34% / 分支 62.50% / 函数 58.82%
  - 未覆盖：`rethrow()`（`remote.js:93-101`）以及 `list/create/update/remove/createStatus/updateStatus/removeStatus` 的每一个 `catch`（`remote.js:148-150`、`163-169`、`179-185`、`198-204`、`216-222`、`235-241`、`254-260`）
  - Client 侧 `failureText` / `translate` 依赖 `RemoteError.code`（`hub/invalid-item`、`hub/not-found`、`hub/in-use` 等），这条映射没有任何断言
- **实施步骤**：
  1. 新建 `tests/remote-errors.test.js`，复用 `host-entry.test.js:52-65` 的 `mountEntry()` 方式（真实 Host + 临时 `dataDir`）。
  2. 断言 `service.create({})` 抛 `RemoteError`，`code === 'hub/invalid-item'`，`field`/`value` 指向出问题的字段。
  3. 断言 `service.update('missing-id', { title: 'x' })` 与 `service.delete('missing-id')` 抛 `code === 'hub/not-found'`，消息里带被查询的 id。
  4. 新建一个带 `done` 状态 TODO 的库，再 `deleteStatus('done')`，断言 `code === 'hub/in-use'`，消息里带条目数量。
  5. 把 `store.json` 替换成一个目录（跨平台都会得到 `EISDIR`），再 `list()`，断言 `code === 'hub/unreadable'` 且消息点名完整路径。
  6. 用一个保留原始异常的桩（非 `HubValidationError`/`HubStoreError`）验证 `rethrow()` 原样抛出，不被包装。
- **预期效果**：七个方法的失败词汇被钉住；未来改 `rethrow` 或 `HubStoreError.reason` 时，测试先红。
- **技术选型依据**：Cordis 与 Typert 协议已可从本包 `node_modules` 解析（`host-entry.test.js:28-35` 已验证），无需新依赖。
- **风险**：临时目录里创建目录模拟损坏文件时，注意 Windows 与 POSIX 的错误码差异；断言应针对 `HubStoreError.reason`，而不是 `error.message` 的具体系统文案。

### T-02 补 Host 的失败分支（读/写/损坏/重复 id）

- **维度**：测试策略 / 安全性
- **优先级 / 工作量**：P2 / M
- **问题证据**：`store.js` 未覆盖行 154–158（不可读）、176–177、253–257（stat 失败）、368–370（目录不可创建）、379–390（写失败后的 temp 清理）、398–400（写后 stat 失败）、486–487、514–515、555–556、560–561、623–624；`status.js:224-227` 重复 id 未覆盖
- **实施步骤**：新建 `tests/store-failure-paths.test.js`：
  1. `store.json` 存在但内容是空串 / 非法 JSON / 顶层是数组 / `version` 不符 → 分别断言 `HubStoreError.reason` 为 `corrupt` / `version`，且消息包含文件路径。
  2. `dataDir` 指向一个已存在的**文件**（而不是目录）→ 第一次写入失败，`reason === 'unwritable'`，并断言原文档未被破坏。
  3. `statuses` 列表里两个定义 id 相同 → 打开失败 `corrupt`，点名 `statuses[i].id`。
  4. `createStatus({ label: '   ' })` → `HubValidationError` 落到 `label`。
  5. `updateStatus` 传非整数 `order`、非对象 `patch` → 分别拒绝，且文档不变（读回后断言）。
  6. `removeStatus` 删最后一条 → `last-status`；删仍被条目使用的 → `in-use`（与 T-01 的第 4 步不同：这里直接测 store，不经过 Remote）。
- **预期效果**：「配置错误必须响亮失败、绝不静默重置」这条契约第一次有直接测试。
- **技术选型依据**：全部用 `node:fs` 与临时目录，不引入 mocking 库，也不改生产代码。
- **风险**：Windows 对「目录当文件读」的行为需要在实现时确认；若某条在 CI 的 Linux 与本地 Windows 表现不同，用 `t.skip` 注明原因而不是放宽断言。

### T-03 用内置覆盖率建立可复现的基线

- **维度**：开发提效 / 测试策略
- **优先级 / 工作量**：P2 / S
- **问题证据**：`node --test --experimental-test-coverage` 在 Node v24.16.0 可直接运行，无需安装任何包；当前合计 93.53 / 78.69 / 81.15，`remote.js` 明显低于其它文件
- **实施步骤**：
  1. 不新增脚本、不改 CI（守住「唯一验证命令」）。
  2. 在 `README.md` §十与 `AGENTS.md` 的 Testing 段各加一句：日终/合并前可选运行 `node --test --experimental-test-coverage`，并记录当前基线数字与日期。
  3. T-01 / T-02 合并后刷新一次数字。
- **预期效果**：覆盖率变化可见；不需要 `c8` / `istanbul` 等依赖。
- **技术选型依据**：Node 24 的 test runner 自带 V8 coverage；引入第三方覆盖率工具会触发 Ask first（新增依赖），收益相同。
- **风险**：`--experimental-test-coverage` 是实验旗标，未来 Node 大版本可能改名；`engines` 已锁 `>=24`，改名时随 README 一起更新。

### T-04 把三条硬规则变成文本护栏

- **维度**：代码质量 / 测试策略 / 项目 Harness
- **优先级 / 工作量**：P2 / S
- **问题证据**：当前 `client.js`、`README.md`、`locale/*.json` 的 emoji 数为 0；`client.js` 中十六进制 / `rgb()` / `hsl()` 字面颜色为 0；但没有任何测试阻止回归。`client-panel.test.js` 只断言了 client 内部两份字典 key 相同，没有覆盖 `locale/zh.json` 与 `locale/en.json`。
- **实施步骤**：新建 `tests/style-guards.test.js`（只读源码文本，不渲染）：
  1. 扫描 `client.js` 的 `\p{Extended_Pictographic}`，必须为 0（与 `AGENTS.md`「Zero emoji, anywhere」一致）。
  2. 扫描 `client.js` 中 `#rrggbb` / `rgb(` / `hsl(` 字面颜色，必须为 0。若将来图标 artwork 需要字面颜色，只允许出现在 `ICONS` 定义块内，测试用该块边界放行。
  3. 读取 `locale/zh.json` 与 `locale/en.json`，断言 key 集合完全相等且 value 都是非空字符串。
  4. 扫描 `client.js` 里客户端工厂返回的 `inject: ['slots', 'locale']`，断言数组中**从不出现 `remote`**（`remote` 只能通过 `ctx.get('remote')` 取；写进 Cordis inject 会让 fiber 永久 park），并断言 `package.json` 的 `dsh.bundle.patch` 指向的文件真实存在。
- **预期效果**：`dsh-hub-client-ui` skill 里的三条视觉规则从「评审记得看」变成「测试会红」。
- **技术选型依据**：纯 `node:fs` + 正则，零依赖；不渲染，因此不会拖慢 24s 的测试套件太多。
- **风险**：正则误伤（例如注释里出现 `#` 开头的十六进制样式说明）。实现时先扫描现有文件确认 0 命中，已实测为 0，风险低。

### U-01 删除撤销（高价值功能）

- **维度**：高价值功能开发 / 用户界面交互
- **优先级 / 工作量**：P1 / M
- **问题证据**：
  - `store.js:462-477`：`remove()` 返回被删条目，注释写明「so the Client can offer an undo」
  - `remote.js:187-205`：`remove` 的 `@returns` 同样写着「so the panel can offer an undo」
  - `client.js:4697-4713`：`await hubCall('delete', id)` 的返回值被丢弃，随后 `load()` 重载，条目永久消失
  - `client.js:4463-4472`：通知只有文本，2.2 秒后自动消失；`client.js:5292-5295` 没有可点击元素
  - `DESIGN.md` / `README.md` 的删除说明都是「不可撤销」
- **实施步骤**：
  1. 在 `HubPanelEntry` 里保存待撤销条目：`pendingUndoRef = useRef(null)`，值为 `delete` 返回的原始条目（Host 的规范化形状）。
  2. `confirmDelete` 改为 `const removed = await hubCall('delete', id)`，`closeModal()`、`load()` 之后把 `removed` 存入 ref，并调用新的 `sayUndo(removed)`。
  3. 通知支持可选动作：`say(text, tone, { action, duration })`。`action` 渲染成 `h('button', { type: 'button', className: 'hub-notice-action', onClick }, translate('action.undo'))`；撤销通知的 duration 取 6000ms，普通通知维持 2200ms。
  4. `undoDelete`：先检查当前 `itemsById` 是否已有同 id（极端情况下另一个客户端重建过）——有则走 `update`，无则 `hubCall('create', createPayload(removed, {}))`。`createPayload`（`client.js:2991-3010`）已经会带上 `id` / `createdAt` / `updatedAt` / `completedAt` / 附件，Host 的 `normalizeItem` 接受这些字段（`model.js:385-393`），所以恢复是**同 id、同时间戳、同顺序**，不是复制品。
  5. 成功后 `load()`，并用 `setRegionOpen(landed.status, true)` 打开条目所在区域；失败则 `say(failureText(error) || translate('state.failed'), 'error')`。
  6. 通知消失或用户切换标签时清空 `pendingUndoRef`，避免一个旧通知把已过期的条目创建回来。
  7. 新增两份字典条目：`action.undo`、`state.deleted`（文本不带 emoji；`translate` 是单参数，条目名用字符串拼接）。
  8. `tests/client-panel.test.js` 增三条：删除后出现撤销按钮；点击后条目以**同一 id** 回来；超过时限后按钮消失、再点击无效。
  9. 按仓库规则写 `.agents/notes/proposed/feature/2026-11-05-undo-delete.md`，记录「恢复同 id 而不是复制」「6 秒窗口」「Host 不做回收站」的取舍。
  10. 同步更新 `README.md` 的删除说明（归 W5）。
- **预期效果**：误删从永久数据损失变成一次可回退操作；Host 已有的返回值第一次被用上；`store.js` / `remote.js` 里「so the panel can offer an undo」的说法从悬空承诺变成事实。
- **技术选型依据**：不新增 Remote 方法、不改 schema。`create` 已经允许客户端携带 `id` 与时间戳（导入导出往返测试 `an export imported into a fresh store restores it` 已在用这条路径），撤销复用它可以把「同一条记录」原样放回。相比回收站，这个方案不产生第二份持久化状态、没有「清空回收站」策略、也不改 Host。
- **风险**：
  - 撤销窗口内如果另一个面板（同一进程的第二页）重建了同 id，直接 `create` 会产生重复 id；第 4 步的 `itemsById` 检查把它降级为 `update`。
  - 条目在撤销后仍保持原 `updatedAt`，不会跳到列表顶部 —— 这是有意的，但要在 note 里写明。
  - 通知区仍会被下一次 `say` 覆盖；如果用户连续删除两条，只保留最后一条的撤销。属于可接受的产品取舍，写进 note。

### U-02 导入预检上限（安全与性能）

- **维度**：安全性 / 系统性能
- **优先级 / 工作量**：P1 / S–M
- **问题证据**：
  - `client.js:4894-4921`：`readTextFile(file)` 与 `JSON.parse` 之前没有任何 `file.size` 检查
  - `client.js:4923-4963`：状态与条目各循环一次，每条一次 `hubCall`；`store.js:363-401` 的每次写都 `JSON.stringify` 整份文档并 rename
  - 因此导入成本是 O(条目数 × 文档字节数)，而不是 O(条目数)
  - `client.js:4921` 的依赖数组包含 `itemsById, statusIds`，但函数体没有使用（无 lint 阶段，不会有人发现）
- **实施步骤**：
  1. 定义两个模块级常量并写明理由：`MAX_IMPORT_BYTES = 8 * 1024 * 1024`、`MAX_IMPORT_ENTRIES = 2000`。它们是输入安全边界（与 `maxImageBytes` 这种部署可调项不同），不是部署变量；注释里说明「超过这个规模，逐条写入会让面板无响应，而不是变慢」。
  2. `pickImportFile` 开头：`if (file.size > MAX_IMPORT_BYTES) { setTransfer(...error...); return }`；解析后检查 `items.length + statuses.length > MAX_IMPORT_ENTRIES`，拒绝并显示实际数量。
  3. 确认对话框显示「将写入 N 次（N = 状态数 + 条目数）」，让用户在写之前看到成本。
  4. 删除 `pickImportFile` 依赖数组里未使用的 `itemsById, statusIds`。
  5. `tests/client-panel.test.js` 增三条：超大文件在解析前被拒；条目超限被拒且不发任何 `hubCall`；正常文件行为不变。
- **预期效果**：恶意或误选的超大导出不会把面板卡死；失败发生在写之前，用户能看到原因。
- **技术选型依据**：不改 Host、不加 Remote 方法（见 A-02）。文件字节上限天然约束了附件总量；条目上限约束了写次数。两个常量与 `WINDOW_THRESHOLD` 同类 —— 客户端自身的安全/性能边界。
- **风险**：上限可能挡住合法的超大数据迁移。8 MiB / 2000 条远高于当前默认（单图 2 MiB、正常库几十条），且报错文本会给出实际规模；如果确有迁移需求，再评估提升或走手工合并。

### U-03 通知的语义与可访问性

- **维度**：用户界面交互优化 / 可访问性
- **优先级 / 工作量**：P2 / S
- **问题证据**：
  - `client.js:5292-5295`：`h('div', { className: 'hub-notice', 'data-tone': ... }, text)` —— 没有 `role`、没有 `aria-live`
  - `client.js:4463-4472`：固定 2.2 秒后清空；错误消息可能包含完整文件路径（`store.js:154-158`），读屏用户来不及听完
  - 相比之下，折叠/展开已经有 `aria-live` 播报（`tests/client-panel.test.js:2340`，用例名 `a fold is announced, and so is an unfold`）
- **实施步骤**：
  1. 根据 `tone` 选择语义：`error` → `role="alert"`、`aria-live="assertive"`；`warn` / 信息 → `role="status"`、`aria-live="polite"`；两者都加 `aria-atomic="true"`。
  2. 错误通知的停留时间与信息通知分开（例如错误 6 秒、信息 2.2 秒），或在带动作的通知上不自动消失（与 U-01 共用 `duration` 参数）。
  3. `tests/client-panel.test.js` 增两条：保存失败时通知节点带 `role="alert"`；普通提交成功时带 `role="status"`。
- **预期效果**：读屏用户能听到失败原因；长错误文本不会被 2.2 秒截断。
- **技术选型依据**：用原生 ARIA 而不是自建播报队列；项目已经在用 `aria-live`，保持一致。
- **风险**：`assertive` 会打断当前朗读；只用于错误，频率低，可接受。

### U-04 查询层的两处小优化

- **维度**：系统性能
- **优先级 / 工作量**：P3 / S
- **问题证据**：
  - `client.js:2351-2353`：`matchesSearch` 每次调用都 `search.trim().toLowerCase().split(/\s+/)`；它在 `client.js:2406-2408` 的 `items.filter(...)` 里对每个条目调用一次 —— 1000 条目时每次按键做 1000 次相同切分
  - `client.js:2456-2479`：`runRegions` 先用 `todo.filter(item => item.status === status.id)` 按状态切一次，`runQuery` 里 `client.js:2407` 又按 `item.kind === kind` 过滤一次
  - `client.js:2373` / `2381` / `2393`：分组每类又做一次 `filter`
- **实施步骤**：
  1. 在 `runQuery` 顶部计算一次 `const terms = ...`，把 `matchesSearch(item, terms)` 改成只做 `terms.every(term => item.haystack.includes(term))`；语义完全不变。
  2. 在 `runRegions` 里用一次 `Map` 分桶（`statusId → items[]`），再把每个桶传给 `runQuery`；`runQuery` 增加一个可选参数表示「调用方已按 kind 过滤」，避免重复扫描。
  3. 依赖数组不变（`client.js:4996-4999` 已按 `items/statuses/tab/query` 记忆化）。
- **预期效果**：每次搜索按键少约 N 次字符串切分与一次全量过滤；1000 条以上时体感更稳。
- **技术选型依据**：只改纯函数内部，不动数据结构、不动排序规则（`DESIGN.md §6` 的比较器与并列规则保持原样）。
- **风险**：如果 `terms` 为空数组，`every` 恒真 —— 与现状一致；不要顺手改搜索语义。

### S-01 机器级凭据与 registry（运维，不入仓）

- **维度**：安全性 / 发布流程
- **优先级 / 工作量**：P1 / S
- **问题证据**：
  - 用户级 `~/.npmrc` 里有两个明文 token（一个 npm、一个 GitHub PAT，本报告不复述内容），并包含 `@hanmaxiao:registry=https://npm.pkg.github.com`
  - 因此 `npm view @hanmaxiao/dsh-hub` 请求打到 GitHub Packages 并 404 —— 包从未发布
  - 明文 token 已在本轮命令输出中出现过，应按「已泄露」处理
- **实施步骤**：
  1. 在 npm 与 GitHub 侧轮换这两个 token。
  2. 把凭据移出明文 `.npmrc`（改用环境变量或凭据管理器），`.npmrc` 只保留 registry 配置。
  3. 明确发布目标：若要发到 npmjs，删除 `@hanmaxiao:registry` 映射，或在 `publishConfig` 里写死 `registry`（`package.json` 由 Lead 改）。
  4. 发布本身走 `dsh-plugin-release` skill，不在本轮自动执行。
- **预期效果**：发布路径唯一且可预测；凭据不再随任何日志/仓库外泄。
- **技术选型依据**：这是账号与环境问题，不适合写进仓库；放进方案的「发布前置条件」。
- **风险**：轮换前确认 CI 没有使用同一 token；本仓库 CI 只用 `GITHUB_TOKEN`，无影响。

---

## 三、工作包拆分

### 3.1 冲突源与实际划分

方案**没有改动** `remote.js`、`typert.js`、`lib/remote-surface.js`，因此 `tests/client-bridge.test.js` 无人触碰。实际冲突源只剩：

- `client.js` + `tests/client-panel.test.js` → 全部归 W1（唯一修改者）
- `locale/zh.json` + `locale/en.json` → 全部归 W4
- `package.json` → 归 W4，且 **Lead 所有**（`AGENTS.md` 明确「read them, do not edit them」）
- `.agents/notes/proposed/**` → 归 W1（仓库规则要求与功能同一改动写 note）

W3 会**读** `client.js` 做文本断言，但不修改它，因此与 W1 并行安全。

### 3.2 工作包表

| 包 ID | 包含建议 | 负责文件 | 依赖 | 验收方式 |
|---|---|---|---|---|
| **W1** Client 面板 | U-01、U-02、U-03、U-04 | `client.js`；`tests/client-panel.test.js`；`.agents/notes/proposed/feature/2026-11-05-undo-delete.md`；`.agents/notes/proposed/feature/2026-11-05-import-caps.md` | 无（可与 W2/W3 并行） | `node --test`（新增 ≥8 条面板用例）；刷新页面手动走一遍删除→撤销、超大文件导入；Host 未改，**不需要重启进程** |
| **W2** Host 错误路径测试 | T-01、T-02 | `tests/remote-errors.test.js`（新建）；`tests/store-failure-paths.test.js`（新建） | 无 | `node --test`；覆盖率复查 `remote.js` 行/函数显著上升 |
| **W3** 规则护栏 | T-04、R-04 的测试部分（locale key 对齐） | `tests/style-guards.test.js`（新建） | 无 | `node --test`；先在现有代码上跑成绿（已实测 emoji=0、字面颜色=0） |
| **W4** 发布元数据 | R-01、R-02、R-04、T-03 的版本守卫 | `package.json`（**Lead**）；`CHANGELOG.md`；`locale/zh.json`；`locale/en.json`；`tests/release-guards.test.js`（新建）；`.github/workflows/ci.yml`（仅当采用 R-02-B/附加检查时） | **阶段 1**（版本 1.0.0→1.1.0、tag、release）无依赖，可立即做；**阶段 2**（1.2.0 条目、tag、release）依赖 W1+W2+W3+W5 全部合并 | `node --test`；`npm pack --dry-run` 核对 18 个文件与新增文档；`git tag -l`、`gh release view v1.1.0` |
| **W5** 文档 | R-03、T-03 的文字部分 | `README.md`；`DESIGN.md`；`AGENTS.md` | W1（撤销/导入行为定稿）、W4 阶段 1（版本号） | `node --test`（文档不进测试面）；人工核对 README 三个相对链接与版本说明；Markdown 链接检查 |

### 3.3 执行顺序与冲突说明

```
W4 阶段 1（版本对齐 + tag + release）
        │
        ├── W1（client.js，独立）        ─┐
        ├── W2（tests，独立）            ─┼── W5（文档收口）── W4 阶段 2（1.2.0 + release）
        └── W3（tests，独立，只读）      ─┘
```

- W1、W2、W3 三个包**可以同时派工**：文件集合互不相交，且都不改 Host/Boot 代码。
- W4 的 `package.json` 是 Lead 所有，派工前必须由 Lead 执行或明确授权，否则违反 `AGENTS.md`。
- W5 必须在 W1 合并后写「可撤销」与「导入上限」的准确描述，避免文档先于实现。
- 同一文件的第二个包必须等前一个合并：本方案已通过「一个文件只归一个包」消除这种情况。

### 3.4 每个包的完成定义

- 所有包：`node --test` 全绿；报告中只写实际跑过的命令（`dsh-hub-pre-push-checks` skill 的要求）。
- W1：新增用例覆盖「删除→撤销同 id 恢复」「超限导入不发写」「通知 role」「搜索词一次编译」；不引入新依赖；`client.js` 仍为单文件、仍零 emoji、仍无字面颜色。
- W2：`remote.js` 七个方法的失败码逐一断言；`store.js` 的 `corrupt` / `unreadable` / `unwritable` / `last-status` / `in-use` 至少各一条。
- W3：在**未修改**的 `client.js` 上先绿；任何一条护栏失败都应是真实违规，不是误报。
- W4：manifest 版本 = CHANGELOG 首条版本；`files` 里每个模式都能命中真实文件；tag 指向包含 CHANGELOG 条目的提交。
- W5：README 的 `DESIGN.md` 链接在「只读发布包内容」视角下仍然可达（绝对链接）；保护策略描述与 `gh api .../protection` 一致。

---

## 四、不建议做（含理由）

### A-01 拆分 `client.js`

**不做的理由**：客户端 manifest 要求 entry 名等于包名、一个包只能有一个客户端入口（`DESIGN.md §7`、`README.md:442`），拆出去的文件无法被 Loader 解析；`client.js` 是函数体，拆成模块会改变作用域与测试桩的加载方式，而 `tests/client-panel.test.js` 正是为了捕获「函数体内未声明标识符」这类只有整体加载才能发现的缺陷。收益（可读性）远小于风险（入口失效、测试失真）。

**替代方案**：沿用 banner 分区（现状已有 11 个区），新增功能落在对应区；不新增结构测试（容易变成对格式的过度约束）。

### A-02 新增「批量导入」Remote 方法

**不做的理由**：需要同时改 `remote.js`、`typert.js`、`lib/remote-surface.js`、`client.js` 的 roster、`tests/client-bridge.test.js` 与 `tests/typert.test.js` 六处，并新增一套服务端校验入口；与「Client 不持有第二份数据、Host 是唯一写入者」的现状相比，收益只是把 N 次写降为 1 次。更重要的是，批量写会让「逐条报告哪一条失败」语义变复杂，而当前导入的价值恰恰在于逐条反馈。

**替代方案**：U-02 在客户端预检规模，把最坏情况挡在写之前。

### A-03 把 `list` 改成增量 / 附件懒加载

**不做的理由**：`list` 是全量文档（含 base64 附件），每次打开与每次写后都传输一次。看起来是性能问题，但改成「条目元数据 + 按需附件」会把一份文档拆成两处真相：Host 需要额外的附件读取方法、Client 需要维护缓存与失效、导入导出与 `store.json` 同构的承诺也要重新定义。`store.js:1-40` 的模块注释把「一份文档、读一次、写一次」写成 deliberate trade-off；`DESIGN.md §4` 也是同一条约定。

**暂缓条件**：当真实库的 `store.json` 超过约 10 MB 且面板打开到可交互超过 200ms 时，再按实测数据评估；当前没有这个证据。

### A-04 引入 lint / typecheck / 构建步骤

**不做的理由**：`README.md:460-462` 把「没有构建、没有打包、没有 lint、没有类型检查」写成协议要求：Loader 直接按文件原样加载，构建层只会让 `files` 与仓库对不上。新增 `tsc --checkJs` 或 ESLint 需要 devDependency + 配置，属于 Ask first，而且会在「唯一验证命令」之外制造第二条命令。

**替代方案**：T-04 的文本护栏覆盖最容易回归的三条硬规则；JSDoc 已经是完整的类型描述。

### A-05 持久化回收站 / 归档

**不做的理由**：需要 schema 变更 + 新字段 + 新 UI 区域 + 新 Remote 方法，并且要定义「清空」「保留期」「归档是否参与搜索」等一整套策略。U-01 的一次性撤销已经覆盖误删场景；导入导出的「恢复」也已覆盖跨设备迁移。

**替代方案**：如果以后确实需要，优先做「导出当前标签页」的定期备份提示，而不是在文档里加第二份状态。

### A-06 注册 `sidebar.panellist`、增加顶部 rail、引入第二个 theme 偏好

**不做的理由**：三条都已有明确结论，重复列出以免后续派工误触：

- `sidebar.panellist` 的每一行都是 `layout.selectPanel(id)` 路由，`shell.overlay` 面板没有 `main` 面板，点击必崩（`AGENTS.md` 的 Plugin rules）。
- 顶部边是应用标题栏与对话标题行，rail 要么落进拖拽区导致 hover 失效，要么压住标题；`EDGES` 已固定左/右/下。
- 主题偏好由应用持有（`ctx.theme.setTheme`），面板只读不存。

### A-07 把查询层抽到 `lib/`

**不做的理由**：浏览器模块表无法访问 `lib/`，抽取的结果只能是第二份拷贝 —— 这正是 `tests/client-bridge.test.js` 在防的重复源问题。查询/过滤/排序/分组的数学必须留在 `client.js`（`AGENTS.md` 的所有权表）。

---

## 附录：本轮实际执行的证据命令

| 命令 | 结果摘要 |
|---|---|
| `node --test` | 228 pass / 0 fail / 24.5s |
| `node --test --experimental-test-coverage` | 合计 93.53 / 78.69 / 81.15；`remote.js` 80.34 / 62.50 / 58.82 |
| `npm pack --dry-run` | 18 files、106.9 kB；无 `DESIGN.md` / `AGENTS.md` / `CHANGELOG.md` |
| `git status -sb` / `git log -1` | `## main...origin/main`；HEAD `7aef4cc`（2026-10-30） |
| `git tag -l` / `gh release list` | 均为空 |
| `gh api repos/HanMaXiao/dsh-hub/branches/main/protection` | checks `["node --test"]`、`strict:true`、`linear:true`、`force_push:false`、`pr_reviews:true`、`approvals:0` |
| `npm view @hanmaxiao/dsh-hub` | 404（请求打到 `npm.pkg.github.com`） |
| 文本扫描（emoji / 字面颜色） | `client.js`、`README.md`、`locale/*.json` 均为 0 |
