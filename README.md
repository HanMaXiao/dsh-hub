# Hub · 统一管理面板

[![ci](https://github.com/HanMaXiao/dsh-hub/actions/workflows/ci.yml/badge.svg)](https://github.com/HanMaXiao/dsh-hub/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-informational)](./LICENSE)

`@hanmaxiao/dsh-hub` —— 把 **TODO、Note、Prompt** 三类条目收进同一个悬浮面板：一个面板、三块标签、完整增删改查，四边停靠随手收起，排序按「一个字段 + 一个方向」配一个分组依据。

它刻意不做三件事：不联网同步、不做多用户协作、不把你的数据塞进浏览器 `localStorage`。所有条目落在宿主进程的一份 JSON 文档里。

## 一、安装

DSH 的插件安装只认一种东西：**spec**。插件页的 **Add plugin** 输入框和
`plugin_manager` 接受同样四种写法，选哪一种只取决于你从哪里拿到的包。

### 方式 A：GitHub（推荐，最省事）

仓库地址直接就是 spec。装之前宿主会先 `git ls-remote` 探一次连通性，通不过才报网络错。

```
plugin_manager { action: "install_bundle", target: "https://github.com/HanMaXiao/dsh-hub" }
```

页面上等价于：侧栏 **Plugins → Add plugin**，粘贴
`https://github.com/HanMaXiao/dsh-hub`，回车。

### 方式 B：npm registry

本包已配置为可发布（`publishConfig.access = public`）。一旦发布到 npm，
按包名装，版本可省：

```
plugin_manager { action: "install_bundle", target: "@hanmaxiao/dsh-hub" }
plugin_manager { action: "install_bundle", target: "@hanmaxiao/dsh-hub@1.0.0" }
```

`@hanmaxiao` 是你的 npm 作用域，只有账号本人能发布，别人装不到抢注的同名包。
国内网络下插件页默认还会问一遍 npmmirror 镜像。

### 方式 C：本地绝对路径（开发用）

```
plugin_manager { action: "install_bundle", target: "D:\\path\\to\\dsh-hub" }
```

必须是**绝对路径**。相对路径会以 profile 目录为基准解析，指向 profile 内部，
安装器会直接拒掉。

### 方式 D：tarball

发一个 `.tgz` 附件或 GitHub Release 资产，把它的 URL 贴进同一个输入框即可。

### 装之前先知道的三条

1. **不要手写 profile 的 `package.json` 或 `cordis.patch.yml`。** 这两个文件由 Loader 管，手改会被下一次安装或配置写入覆盖。本插件的 bundle 补丁是包内自带的 `cordis.patch.yml`，它会随安装注入一行 `hub-core`。
2. **不要在 profile 目录里跑 pnpm。** profile 目录由 Loader 维护，手工装依赖会破坏它；本插件本身是纯 ESM、无构建步骤、零产物依赖，不需要编译。
3. **`install_bundle` 一步完成包安装与 bundle 选择**，不要用 shell 命令去复现这两步。如果返回了待批准构建脚本清单，本插件不会要求批准任何构建脚本。

安装后确认三件事：`list_bundles` 里能看到本 bundle、`list_plugins` 里 `@hanmaxiao/dsh-hub` 不是 `failed`、插件详情里显示的是「Hub · 统一管理面板」这个标题而不是包名回退。

**装好的插件不会自动升级。** 升级就是卸掉再装新版本；这不是本插件的特殊规定，
是 DSH 安装器目前的行为（插件页上也这么写着）。

### 装不上时报 `incompatible-version`

安装器会在 pnpm 动手之前先做一次版本兼容检查：本包把
`@deepseek-ai/dsh-typert-protocol` 钉死在 `0.1.7-rc.2`，而那个版本声明的
DSH peer 范围如果和你的 DSH 对不上，安装会被**在下载之前**拒掉，报错里列出
`name` / `version` / `runtimeVersion` 和没满足的 `peers`。

这时不要改本包去迁就，而是给这一对版本开一次豁免：

```
plugin_manager { action: "list_version_exemptions" }          # 先拿到 runtimeVersion
plugin_manager { action: "set_version_exemption",
                 target: "@hanmaxiao/dsh-hub@1.0.0",
                 runtimeVersion: "<上一步给出的>",
                 enabled: true, acceptRisk: true }
```

豁免是**精确的 `包名@版本` 对精确的 DSH 运行时版本**，写在 profile 的
`compatibility.json` 里，不改任何依赖、不改 bundle 选择。`acceptRisk: true`
需要你明确确认「不兼容的插件可能导致崩溃或数据丢失」，安装器只校验这个标志和
版本号，不校验对话历史。**先读下面第七节的排障再开这个** —— 多数时候真正的原因
不是版本不兼容，而是进程里跑的还是旧代码。

### 从 `@local/dsh-hub` 迁移

包名 1.0.0 起由 `@local/dsh-hub` 改为 `@hanmaxiao/dsh-hub`。这个名字同时是
客户端 manifest 的键、Typert 的 invocation id 和 profile 里的依赖名，所以
**改名是一次破坏性安装变更**：先 `plugin_manager { action: "remove_bundle" }`
卸掉旧的，再用上面的任一方式装新的。你的数据在 `$dataDir/store.json` 里，
不在包里，卸载不会碰它。

### 生效

- **Host 半边**（`host.js`、`lib/`、`remote.js`）：Loader 只在首次 `import()` 某个包名时加载它，Node 的 ESM 缓存按解析后的模块 URL 记账。所以**改动了 Host 侧代码必须重启进程**，重装、改行 id、改 `exports` 目标都不会重新加载。
- **Client 半边**（`client.js`）：客户端模块表在页面启动时拉取，模块文件由宿主现从磁盘取，所以**刷新页面即可**。

首次安装时包名此前从未被加载，通常能即时生效；但一旦你改过 Host 侧代码，就走上面的规则：重启进程，再刷新页面。

## 二、四边停靠与自动收展

面板可以停靠在窗口的**上、右、下、左**四条边。

- **收起时**屏幕上只剩一条窄把手，不遮挡任何内容。**这条把手是面板唯一的开关** —— 除它之外，界面上没有别的地方能开合面板。
- **展开的两种方式**：指针移入把手（悬停），或点一下把手。
- **自动收起**：指针离开面板后，等一段空闲时间再收回去 —— 你把鼠标移到别处去操作窗口，面板不会一直杵在那儿。
- **停靠边会被记住**：下次打开还是在你上次放的那条边。

四条边都是可选的停靠位：把手停在哪条边，就从那条边唤出面板。选定的边会被记住，所以下次它出现在同一个位置，肌肉记忆不用重新建立。

## 三、三个标签页、两种视图

底部居中是一个悬浮胶囊形状的标签栏，三个选项：**TODO / NOTE / PROMPT**。面板里同时只处理当前标签页那一类条目。

| 视图 | 样子 | 说明 |
|------|------|------|
| 网格 | 卡片铺排 | 列数随窗口宽度自动重排（`repeat(auto-fill, minmax(...))` 加一个 `ResizeObserver`），窗口变宽变窄都跟着变 |
| 条目列表 | 一行一条 | 适合条目多、需要扫读的场景 |

两种视图可随时切换，**选择会被记住**，下次打开还是你上次用的那个；两种视图各自有独立的加载态。

其余交互约定：

- **空态**只有一个添加按钮，没有别的废话。
- **加载态**有两套独立骨架：网格骨架与条目行骨架，都带脉冲动画。
- **三个弹窗**：创建、删除确认、详情。详情弹窗右上角是复制按钮与关闭按钮。
- 全文中英双语，所有可见文案走应用的 locale；界面零 Emoji，每个控件都是内联 SVG 加 `aria-label`。

### 三类条目分别有什么字段

| | TODO | Note | Prompt |
|---|---|---|---|
| 标题 | `title` | `title` | `title` |
| 正文 | `description` + `note` 备注 | `text` | `text` |
| 归类 | `category` 类别 | 无 | 无 |
| 标记 | `priority`：`low` / `normal` / `high` / `urgent` | 无 | 无 |
| 状态 | `done` 布尔值 | 无 | 无 |
| 图片 | `attachments` 附件 | `images` | `images` |
| 时间 | `createdAt`、`updatedAt` | 同左 | 同左 |

**标题是单独存的字段**，不再拿正文第一行当标题。新建和编辑时都能单独填。

留空也允许：列表里显示的**名称**取「标题」，标题为空时退回「正文第一行」——所以旧数据
（本来就没有标题）和随手写的短条目都照常可读，不会出现空白行。标题也计入「大小」，
因为它就是存下来的字节。

**正文（`description` / `text`）是可选的**：标题是对正文的概括，短 TODO 标题就能说清楚时，
只填标题直接点确定就行，不用再补一段重复的话。只有「标题」和「正文」同时为空才会拦下来——
那种条目既没有名字也没有内容，在列表里是一行空白、在详情里是一张空弹窗，所以确定按钮会
保持禁用，直到两者至少有一个非空。编辑时把正文清空是可以的，标题还在就仍然能保存。

时间戳一律 ISO 字符串。宿主校验每一次写入，遇到不认识的 `kind` 或 `priority` 会**点名是哪个字段**并拒绝，不会静默吞掉。

## 四、排序菜单

排序菜单是**一个字段 + 一个方向 + 可选分组**，三项各自单选。它**不是**比较器链 —— 不会「先按名称，相同再按日期」。

### 排序字段与方向

| 菜单字段 | TODO | Note / Prompt | 递增（`递增`）的含义 | 递减（`递减`）的含义 |
|---|---|---|---|---|
| 名称 | 有 | 有 | A → Z | Z → A |
| 修改日期 | 有 | 有 | 旧 → 新 | 新 → 旧 |
| 类型（类别） | 有，映射到 `category` | 无 | 类别字母序 | 类别倒序 |
| 大小 | 有 | 有 | 小 → 大 | 大 → 小 |
| 创建日期 | 有 | 有 | 旧 → 新 | 新 → 旧 |
| 标记（优先级） | 有，映射到 `priority` | 无 | `low` → `normal` → `high` → `urgent` | 反向：`urgent` → `high` → `normal` → `low` |

「名称」按**标题**排（标题为空时退回正文第一行），所以你敲的标题就是排序键。

方向只做一件事：**把同一个字段反过来**。递增永远是「字母靠前、日期靠旧、体积靠小、优先级靠低」，递减就是把它整个倒过来。

**大小**不是存下来的字段，而是由条目自身的标题、正文、备注加上附件字节现算出来的。

**并列怎么办**：任何比较都以 `createdAt` 升序、再以 `id` 升序收尾。所以键值相等的条目在两次渲染之间不会自己换位置。

### 菜单里没有的一项：作者

菜单里**没有**「作者」，而且**不会渲染成空的条目**。理由：本插件的条目模型里根本没有作者字段。
它不做多用户协作，也不从云端同步，每条数据的作者从头到尾只有你一个。列出一个永远为空的字段是在骗你。

「标题」曾经也在这张被删掉的清单里——那时它和「名称」是同一个东西，因为「名称」本身就是正文第一行。
现在标题是单独存、单独编辑的字段，「名称」是由它派生出来的显示名，两者不再是同一个事实，
所以标题留在表单里，菜单里保留的是「名称」。

### 分组依据

| 标签页 | 可选分组 |
|---|---|
| TODO | 无 / 类别 / 优先级 / 完成状态 |
| Note | 无 / 含图片 / 纯文字 |
| Prompt | 无 / 含图片 / 纯文字 |

分组与排序是**正交**的两件事：分组决定条目被切成哪几堆，排序决定每一堆**堆内**的顺序。选了「类别」分组再选「修改日期」递增，得到的是每个类别里各按日期从旧到新，而不是把所有条目混在一起按日期排。

## 五、数据存放位置

全部数据在一份 JSON 文档里：

```
$dataDir/store.json
```

`$dataDir` 的解析规则：

1. `hub-core` 行的 `config.dataDir` 留空（`''`，即默认值）时，取 `$DSH_HOME/plugin-data/dsh-hub`；环境变量 `DSH_HOME` 未设置时退到 `~/.dsh/plugin-data/dsh-hub`。
2. `config.dataDir` 填了非空值时，按 `path.resolve` 解析成绝对路径 —— 想把库放到同步盘或备份目录里，改这一处即可，不用动代码。

写入用「写临时文件 + rename」，所以写到一半崩溃不会把你的库截断。文件不存在按空库读；**文件损坏则是一次响亮失败，错误信息会点名这个路径，绝不悄悄重置成空库**（悄悄清空是比崩溃更坏的结果）。

### 图片：base64 内联，及其取舍

图片不单独落盘，而是以 **base64 data URL** 直接内联在这份 JSON 文档里。这是一个**明确的 v1 取舍**：

**换来的**：整个库就是**一个文件**。备份就是复制一个文件，迁移就是复制一个文件，用任何文本编辑器、任何 diff 工具、任何版本控制都能看见它。条目和它的图片永远不会走散。

**代价的**：

- **体积膨胀约三分之一**。base64 用 4 个字符编码 3 字节，编码本身就让每张图凭空多出约 33%。一张 1 MB 的图，进库大约 1.33 MB。留出这个余量再规划库的大小。
- **整个库一次读写**。库越大，每次增删改都要重写整份文档，附件一多会明显变慢。

### 单张图片的上限：`maxImageBytes`

`hub-core` 行上有**两个**可调项，图片上限就是其中之一：

| 字段 | 默认值 | 作用 |
|---|---|---|
| `dataDir` | `''`（空，即自动解析） | 库放在哪个目录 |
| `maxImageBytes` | `2097152`（2 MiB） | 单张图片的体积上限 |

- **默认 2 MiB，按「解码后」的字节算** —— 也就是图片本体的字节数，在 base64 编码**之前**测量。所以 2 MiB 的图在文档里实际占大约 **2.7 MiB**。
- **这是硬上限，不是建议值。** 因为整个库是**一份** JSON 文档，而面板每次打开都要通过 `list` **整读整份文档**。也就是说，编码后的体积是你**每打开一次面板就要付一次**的代价。这条上限挡的不是某一张图，是这份文档每一次读入的重量。
- **超限时 Host 直接拒绝**，并在报错里**同时告诉你上限值和你这张图的实际大小**。你据此去调配置，或者换一张小一点的图 —— 库本身不会被写坏。

要放宽就把 `hub-core` 行的 `maxImageBytes` 调大（按字节填），要收紧同理。改的是 bundle 行的 `config`，不是代码，也不需要动 `cordis.patch.yml`。

因此实践上的建议：**别往 Note/Prompt 里塞高分辨率大图**。截图裁到实际需要的尺寸再存，库会长得慢得多，浏览器的渲染也不会因为解码一堆超大图而卡。真的需要更大的图，再去调 `maxImageBytes`。

## 六、主题

跟随应用，**插件自身不提供独立主题**。

- 面板只用 `ctx.theme.setTheme('light' | 'dark' | 'system')`，三态是亮色、暗色、跟随系统。
- 三态偏好**归应用管**。插件不再维护第二份主题设置 —— 两份设置迟早会打架。
- 所有颜色取自 `--dsw-alias-*` 主题令牌，插件不写死字面色值（图标图形本身除外）。

想换主题，在应用的主题设置里切，面板跟着变。

## 七、常见问题

### 面板一直显示失败态

**这是设计，不是崩溃。** 客户端与宿主之间**唯一的桥**是一条 Typert Remote（`remote.js` + `typert.js`，`SERVICE_KEY = 'hub'`）。`host.call` 和 `styles.insert` 属于 `cordis_run` 的动态插件运行时，**对 `dsh.client` 这类 bundle 不可用**，所以没有别的路可走。

这条 Remote 到页面要经过**两步，缺一不可**：

1. **客户端自己挂载它。** `dsh-typert-loader` 只在**宿主侧**发现包的 `./typert` 导出；基座里客户端侧的挂载全是 `@deepseek-ai/dsh-api-remotes` 里那批生成的第一方贡献项，**不会替你挂第三方包的命名空间**。所以 `client.js` 必须自己调用 `ctx.remote.$mount()`，贡献项与 `typert.js` 一一对应。
2. **命名空间是一个独立服务。** `$mount()` 会把每个命名空间装成一个独立的 Cordis 服务，键名是 `remote.<namespace>`。所以面板读的是 `ctx.get('remote.hub')`，**不是** `ctx.get('remote')?.hub` —— 那个 carrier 上只有 `$mount`、`$stream`、`$host`、`$on`，永远没有 `hub`。
3. **发布出去的方法名不能撞命名空间服务自己。** 网关的 `RemoteNamespaceService` 自己就有 `remove`、`install`、`has`、`empty`、`name`、`methods`、`namespace`、`invokeRemote`、`ctx`，挂载时同名的方法会被拒。`remove` 因此不能用：删除发布为 **`delete`**，由 `implementation: 'remove'` 转发到宿主那个方法（网关按 `descriptor.implementation ?? descriptor.method` 分发）。

面板在每次调用时**重新读取** `ctx.get('remote.hub')`（承载方可能在首次渲染之后才到，也可能在卸载时消失）。读不到时它显示一个**持久的失败态**：

- **不会**悄悄退回 `localStorage` —— 那意味着你的数据看起来好好的，实际存在另一个地方，等你发现时已经分叉了；
- **不会**抛异常把页面打坏；
- **挂载被拒绝时也不会把入口整个判失败** —— 面板照样出现，只是把被拒绝的原因显示出来。

失败态里那行红色小字会直接说明是哪一步被拒的：

| 小字 | 含义 |
|---|---|
| `this composition has no Remote carrier: ctx.get("remote") is absent` | 组合里没有 `@deepseek-ai/dsh-api-remotes` 那一行 |
| `mounting the Hub Remote contribution failed: …conflicts with its namespace service` | 有发布出去的方法名撞上了命名空间服务自己的成员 |
| `ctx.get("remote.hub") is not mounted` | 挂载成功过，但承载方随后消失了（插件被停用） |

**标题填了但保存后没生效**：宿主会按设计**丢弃它不认识的字段**（未知键是客户端的事，不该让一次保存失败）。
所以如果宿主进程比面板旧——比如你改了 `lib/model.js` 却只刷新了页面——`title` 会被静默丢掉，
列表里又退回显示正文第一行，**全程没有任何报错**。

面板现在会自己发现这件事：宿主返回的条目里凡是**缺少 §5 的字段**（缺键，不是空值），
就说明宿主更旧，面板会挂一条提示，点名丢了哪个字段、并让你重启 Host 进程。

自己确认的话直接看数据文件，键里没有 `title` 就是宿主旧了：

```powershell
Get-Content "$env:DSH_HOME\plugin-data\dsh-hub\store.json" -Raw | ConvertFrom-Json |
  ForEach-Object { $_.items[0].PSObject.Properties.Name -join ',' }
```

修复只有一步：**重启 DSH 进程**（重装、改配置、刷新页面都不管用）。
重启后把你之前丢掉的标题重新编辑一次补上——旧条目本身就是空的，不会被追溯恢复。

还有一种情况：客户端**挂载成功了**，但宿主那个 `hub` 服务根本没起来——这时网关要等到**第一次调用**才报 `active Service "hub" is unavailable`，面板表现和上面一样。宿主侧的原因只有两个：

1. **进程里跑的不是最新代码。** `HubRemote` 必须声明 `static inject = ['hub-store']`；没有它，`HubRemote` 会在构造时因为读不到 store 而抛错，而**那一行仍然是 ACTIVE**，从外面看完全正常。改过 Host 侧就**重启进程**。
2. **`hub-store` 没起来**，比如 `store.json` 损坏——`HubStore` 在构造时响亮失败，路径写在消息里。

宿主侧有一行日志可以直接确认，启动后（或改完 Host 代码重启后）在 Host 日志里找：

```
dsh-hub: {"service":"hub","mounted":true,"namespace":"hub","boundTo":"hub","methods":["list:direct","create:direct","update:direct","delete:direct"]}
```

`mounted:false` 或这行**根本没出现**，就是宿主半边没挂上，和客户端无关。挂载失败时同一位置会打 `dsh-hub: the Hub Remote did not mount: <原因>`。

最常见的原因是**组合里没有承载这条 Remote 的行**，通常是 `@deepseek-ai/dsh-api-remotes` 那一行缺失。

按顺序排查：

1. `plugin_manager { action: "list_plugins" }` —— 确认 `@hanmaxiao/dsh-hub` 在列表里，且状态不是 `failed`。是 `failed` 就先看诊断。
2. `plugin_manager { action: "list_bundles" }` —— 确认本 bundle 已选中。若状态是 `restart-required`，说明改动不在当前进程生效，重启 Host 进程。
3. 确认当前组合里**确实有** `@deepseek-ai/dsh-api-remotes` 这一行，以及 `typert-loader` 没有对 `typert.js` 报 manifest 校验警告（例如 codec 缺 `create()` 工厂那类）。
4. 确认宿主半边跑的是**最新代码**：改过 Host 侧（`remote.js` / `typert.js` / `lib/`）就必须**重启进程**，重装和改配置都不管用；只改 `client.js` 时刷新页面就够。改名或改 manifest 属于前者。
5. 刷新页面让 Client 半边重新拉取模块表。
6. 刷新后仍失败 —— 看页面 console 里对应的那一行，以及面板失败态里那行红色小字。插槽条目里抛的错只在 console 留一条记录，不会渲染成可见错误。

### 面板怎么开、怎么收

面板只有**一个**入口：屏幕上那条窄把手。收起状态下它贴在窗口边缘，不遮挡任何内容。

- **展开**：指针移到**把手**上即展开，或者点它一下。（只有把手，不是整条边——否则沿着边缘蹭一下面板就弹开了。）
- **收起**：指针离开面板片刻后自动收起，不需要你手动去关。
- **换边**：把手可以停靠**左、右、下**三条边中的任意一条，停在哪里就从哪里唤出，选择会被记住。
  上边**没有**把手：那条边是应用自己的标题栏和对话标题行，面板停在那里要么被拖拽区挡住收不到悬浮，要么压住对话标题，两种都不会报错，所以干脆不做。

所以「找不到面板」通常不是它坏了，而是**你没往它停靠的那条边看** —— 它就贴在窗口边缘。若整条边都找不到把手，那才是面板没有激活，回头看上一条的排查。

### 数据能备份吗

能，整个库就是一个 `store.json`，复制走即可。要搬到别处，改 `hub-core` 行的 `config.dataDir` 指过去，然后把原文件复制过去。

### 改了 `dataDir` 之后数据「不见了」

不是丢了，是换了地方。`dataDir` 决定的是**读哪一份**库；改配置不会搬迁旧数据，记得自己把原来的 `store.json` 复制过去。

### 图片存不进去，报「超过上限」

默认单张上限是 2 MiB（按解码后字节算），见第五节的 `maxImageBytes`。报错里会同时给出上限值和这张图的实际大小。两条路：换一张小一点的图（多数时候你只是截图没裁），或者把 `hub-core` 行的 `maxImageBytes` 调大。调之前先想清楚 —— 面板每次打开都要整读整份文档，图越大，每次打开越慢。

### `store.json` 报错了

如果它损坏或不可读，面板会明确报错并**点名完整路径**，而不会假装这是空库。修法：先手工把那个文件挪走备份，再让面板以空库重新开始（代价是那一库的数据没了，所以先备份）。不要指望它自动重建。

## 八、包结构

下列结构取自 `package.json` 的 `exports` 与 `files` 字段 —— 那是这个包对外的契约。`files` 同时覆盖运行时文件与 `cordis.patch.yml`、`locale/*.json`、`icon.svg`；`locale` 与图标在插件**不激活**的情况下就能被 Plugin Manager 与设置页读取（标题、描述、图标）。

`tests/` 是唯一的例外：它只存在于仓库里供 `node --test` 运行，**不在 `files` 中**，不随包发布。

```
dsh-hub/
├── package.json          私有 ESM 包：exports / files / dsh.bundle.patch / dsh.client
├── cordis.patch.yml      注入一行 hub-core，config 上两个可调项：dataDir 与 maxImageBytes
├── icon.svg              包图标
├── DESIGN.md             设计契约（权威）
├── README.md             本文件
├── locale/
│   ├── zh.json           Plugin Manager 显示元数据：meta.title / meta.description
│   └── en.json           同上，key 集与 zh.json 完全一致
├── index.js              Host 入口，导出 apply(ctx, config)
├── host.js               挂载磁盘 store 与 Remote，注册全部资源走 ctx.effect
├── remote.js             HubRemote：客户端唯一的数据通路
├── typert.js             与 remote.js 一一对应的 Typert manifest
├── client.js             面板全部界面与交互（单文件，不可拆）
├── lib/                  宿主侧纯逻辑：id 生成、条目校验、原子 JSON 存储
└── tests/                node --test 覆盖 lib/
```

Client 半边是**单文件**，这是协议限制不是偷懒：`manifest.ts` 规定客户端 entry 名必须等于包名，一个包只能有一个 `client.js`。

## 九、维护须知

1. **不要引入 emoji。** 全部控件用内联 SVG 加 `aria-label`。
2. **不要写死颜色。** 一律 `--dsw-alias-*` 令牌。
3. **不要 `require` 任何 Harness Client 包。** 官方明确禁止，控件必须自己写。
4. **不要往 `document.body` 追加第二套应用。** 面板挂在 `shell.overlay` 座位上。
5. **排序规格改前先读 `DESIGN.md` §6。** 「作者」与「标题」是被**故意删掉**的，不是漏做的。
6. **验证命令**：`node --test`（跑 `tests/`）。

## 十、参与开发

```sh
pnpm install        # 只有测试依赖，插件本身零产物
node --test         # 唯一的验证命令；CI 跑的就是这一条
```

没有构建、没有打包、没有 lint、没有类型检查 —— 这不是省事，是协议要求：
Loader 直接按文件原样 `import()` 本包，加一层构建只会让 `files` 和仓库对不上。
所以**一个 bug 要么被 `node --test` 逮到，要么被用户逮到**，别指望编译期。

- **[DESIGN.md](DESIGN.md) 是设计契约**，冲突时它说了算。
- **[AGENTS.md](AGENTS.md) 是改这份代码前必读的约束**，每条都写了为什么。
- 改动走 PR。`main` 受保护：必须过 `node --test`，且需要一个人 approve，
  不能直推、不能强推。

## 十一、许可证

[MIT](./LICENSE)。DeepSeek Harness 与本插件的官方包同为 MIT。
