# dsh-delete-session

简体中文 · [English](README.md)

**快速彻底删除会话的 DeepSeek Harness Web 插件。**

插件会在 DeepSeek Harness Web 左侧会话列表中的会话行的 `…` 菜单中，添加一项「删除会话」。

使用默认的确认方式时：

1. 首次点击：就地变为警示状态（红底 + 警告图标）。
2. 再次点击：永久删除这条会话。

因此可以方便地通过双击删除一个不需要的会话。

确认方式本身可以配置：插件把本插件的卡片注册进官方 `plugins.bundle.config` 槽位，渲染在侧栏「插件」页中本插件的页面上（打开 `@kagurazakayashi/dsh-delete-session` 条目，配置区位于该插件说明与各行之间），可以选择「再次点击删除」（默认）、「弹出对话框删除」或「直接删除（危险）」。保存后的选择立即生效，并持久化在 profile 的 `cordis.patch.yml` 中 `id: delete-session` 行的 `config:` 条目里（例如 `$DSH_HOME/profiles/web/cordis.patch.yml`）。

它是一个极简的 DeepSeek Harness Web 树外（out-of-tree）插件。它既不修改 DSH 核心安装，也不改动任何核心文件：host 行来自它自己的 `cordis.patch.yml` bundle patch，菜单项则通过官方 `sidebar.workspaces.session.menu.item` 槽位贡献，而不是以 DOM 注入的方式追加。

## 快速安装

在终端执行以下两条命令，即可完成安装并启动：

```bash
dsh plugin --profile web add @kagurazakayashi/dsh-delete-session
dsh web
```

重启后刷新页面，打开任意会话行的 `…` 菜单，「归档会话」下方就会出现「删除会话」。

## 功能特性

- host 端（`index.js`）注册 `POST /delete-session/delete`。
- 浏览器端（`client.js`）把「删除会话」项注册进官方 `sidebar.workspaces.session.menu.item` 槽位（注册 id `delete-session`，order `450`），因此紧跟在内置「归档会话」行（order `400`）之后（zh / en 双语）。
- **三种确认方式，在插件自己的页面上选择**（见[插件设置](#插件设置删除确认方式)）：「再次点击删除」（默认）走就地警示状态，「弹出对话框删除」弹出确认框，「直接删除（危险）」首次点击即删除、没有任何确认。
- **默认的两段式删除，无确认弹窗**：第一次点击将菜单项就地切换为警示状态（红底、警告图标、文案「再次点击删除」/「Click again to delete」），不关闭菜单也不弹窗；第二次点击才真正调用删除路由，成功后刷新会话列表。
- 警示状态按会话 id 记忆（内存态，8 秒自动解除），期间菜单关闭再重开仍会以警示状态显示；删除失败也会解除警示。该状态只在「再次点击删除」模式下有意义。
- 「弹出对话框删除」的确认框支持取消、Escape 与点击遮罩关闭，只有按下确认（危险色按钮）才会删除；初始焦点落在「取消」上以减少误删。
- 删除失败时弹出轻量错误提示（纯 DOM，非确认框），说明失败原因（会话使用中 / 不存在 / 网络错误等）。
- **正在运行任务的会话拒绝删除**（HTTP 409）：只有 agent 状态非 `idle`（正在运行任务）的会话才被拒绝，避免破坏正在写入的日志。仅被打开过、之后切换走而仍驻留内存的空闲会话可以正常删除。
- **配置卡片**：本插件的卡片注册进官方 `plugins.bundle.config` 槽位（以 npm 包名 `@kagurazakayashi/dsh-delete-session` 为键，由 `@deepseek-ai/dsh-client-ui-plugin-manager` 提供），渲染在侧栏「插件」页中本插件的页面上，可选择删除确认方式（再次点击删除 / 弹出对话框删除 / 直接删除（危险））。卡片采用「草稿 — 保存」模型，保存后写入 profile 的 `cordis.patch.yml` 中 `id: delete-session` 行的 `config:` 条目；提供「已自定义」标记与「恢复默认」。已保存的值立即决定下一次删除的确认方式（卡片里的草稿在按下「保存」前不影响删除行为）。

## 菜单效果示意图

点击会话行右侧的 `…` 后，弹出的菜单结构如下（`删除会话` 由本插件添加）。下图为点击前与点击一次后的对比——第二次点击才会真正删除：

![删除会话演示](screenshot.png)

```
会话行菜单

├─ 重命名会话      （核心自带）
├─ 分叉会话        （核心自带）
├─ 归档会话        （核心自带）
└─ 删除会话        ← 由本插件添加（zh / en 双语）
```

## 使用方式（删除确认方式）

确认方式来自本插件的设置卡片，默认为「再次点击删除」。

**「再次点击删除」**——两段式确认，全程不弹窗：

```
第一次点击「删除会话」
        │
        ▼
菜单项就地变为红底警示态「再次点击删除」
        │
        ├─ 8 秒内未再点击 ──▶ 自动恢复为普通「删除会话」
        │
        └─ 8 秒内再次点击 ──▶ 调用 POST /delete-session/delete
                                    │
                                    ├─ 会话正在运行任务 ──▶ 409 拒绝，弹错误提示
                                    │
                                    └─ 空闲会话 ──▶ 归档 → rm 会话目录
                                                      │
                                                      ▼
                                                 200 OK，刷新列表
```

**「弹出对话框删除」**——菜单关闭后弹出确认对话框，只有按下确认才会删除：

```
点击「删除会话」
        │
        ▼
确认对话框：确定要永久删除会话「…」吗？   [取消] [删除]
        │
        ├─ 取消 / Escape / 点击遮罩 ──▶ 不执行任何删除
        │
        └─ 删除 ──▶ 调用 POST /delete-session/delete（后续校验与上面相同）
```

**「直接删除（危险）」**——首次点击立即删除，没有任何确认：

```
点击「删除会话」──▶ 调用 POST /delete-session/delete（后续校验与上面相同）
```

三种方式最终都走同一条删除路径，因此「运行中会话 409 拒绝」与「先归档再 rm」的行为完全一致。

## 插件设置（删除确认方式）

dsh 0.2.x 起，插件配置**不再位于「设置」对话框**（那是 0.1.x 的位置），而在插件自己的页面上。按下面四步即可找到：

1. 在侧栏顶部打开「插件」页（四宫格图标，位于「工作区」之上），不是底部的「设置」。
2. 等「已安装」列表填充出来。该页需要向 host 查询插件清单，冷启动的浏览器会话里可能要十几秒；列表未出现时页面几乎是空的，并非没有内容。
3. 在「已安装」里点本插件的条目打开详情页——`1.2.1` 起列表显示本地化名称「删除会话」，旧版本显示包名 `@kagurazakayashi/dsh-delete-session`；点右侧开关或空白处不会进入详情页。
4. 配置区位于该插件的**说明**与**包含的组件**之间；卡片默认收起，点卡片标题展开。

展开后可选删除会话时的确认方式：

| 选项             | 含义                                                 |
| ---------------- | ---------------------------------------------------- |
| 再次点击删除     | 首次点击进入警示状态，再次点击才删除（默认，最安全） |
| 弹出对话框删除   | 点击后弹出确认对话框，确认后才删除                   |
| 直接删除（危险） | 点击后立即删除，没有任何二次确认                     |

保存规则与核心的插件配置卡片一致：

- 选择只是草稿，按下「保存」才会写入；「放弃」丢弃草稿。
- 保存成功后写入 profile 的 `cordis.patch.yml` 中 `id: delete-session` 行的 `config`（设置命名空间就是这个 profile 入口 id），重启后仍然保留：
  ```yaml
  - id: delete-session
    config:
      confirmMode: click-again   # click-again | dialog | instant
  ```
- 字段被用户层覆写时会显示「已自定义」标记，可用「恢复默认」清除覆写、重新继承默认值。
- 保存失败（例如部署不允许写入设置）时保留草稿并提示，不会静默丢弃。

实现方式：设置命名空间就是本 bundle 的 `cordis.patch.yml` 声明的 profile 入口 id `delete-session`，host 端（`index.js`）以自己的 schemastery `Config` 声明 schema（`confirmMode` 字段，标记为 `.volatile()`），已不再有 `settings.installSection` / `settings.register` / `settings.get`。浏览器端通过 `ctx.configForms.get("delete-session")`（`getSnapshot` / `subscribe` / `set` / `unset`）读写该命名空间，并把卡片注册进官方 `plugins.bundle.config` 槽位，键为 npm 包名 `@kagurazakayashi/dsh-delete-session`（由 `@deepseek-ai/dsh-client-ui-plugin-manager` 提供）。settings 服务缺席的部署只会少一张卡片，删除功能不受影响。

> 保存后的值立即生效：它决定下一次点击「删除会话」时的确认方式；卡片里的草稿在按下「保存」前不影响删除行为。

> 找不到卡片时先确认两件事：一是在「已安装」组里**点名称**进详情页（不是点开关），二是列表可能还在加载。若启用了带背景图案的皮肤，该页文字会压在画面上、对比度偏低（插件页自身没有不透明底色，卡片保留自己的底色），临时切换或停用皮肤会更容易看清。

## 安装

### 一键安装（推荐）

```bash
dsh plugin --profile web add @kagurazakayashi/dsh-delete-session
```

此命令会从 npm 拉取插件，并自动把它注册到 profile 的 bundle 列表（无需手工编辑配置）。

### 从源码安装

本插件与 `dsh-archive-manager` 同构：放在磁盘上，再装进现有 `web` profile。

1. 将插件源码放到磁盘某处，例如 Windows 下：

   ```
   C:\Users\<你>\.dsh\plugins\dsh-delete-session
   ```

   （macOS / Linux 下为 `~/.dsh/plugins/dsh-delete-session`。）

2. 用 dsh 把它加入 `web` profile：

   ```bash
   # Windows（请替换 <你> 为你的用户名）
   dsh plugin --profile web add "C:\Users\<你>\.dsh\plugins\dsh-delete-session"

   # macOS / Linux
   dsh plugin --profile web add "~/.dsh/plugins/dsh-delete-session"
   ```

3. 确认 `$DSH_HOME/profiles/web/package.json` 的 bundle 列表包含本插件。较新版本的 dsh 会在 `add` 时自动追加；若没有，手工补上：

   ```jsonc
   {
     "name": "dsh-profile-web",
     "private": true,
     "dependencies": {
       "@kagurazakayashi/dsh-delete-session": "link:../../plugins/dsh-delete-session"
     },
     "dsh": {
       "profile": {
         "bundles": [
           "@deepseek-ai/dsh-base",
           "@deepseek-ai/dsh-web-app",
           "@kagurazakayashi/dsh-delete-session"
         ]
       }
     }
   }
   ```

   `dependencies` 条目由 `dsh plugin --profile web add` 写入；`dsh.profile.bundles` 若未自动追加则手工补上。

4. 插件的 `cordis.patch.yml`（经 `dsh.bundle.patch` 声明）注入 host 行：

   ```yaml
   - insert:
       - id: delete-session
         name: '@kagurazakayashi/dsh-delete-session'
   ```

## 重启生效

运行中的进程不会加载新的 bundle 行，需要重启 web profile：

```bash
dsh web
```

刷新页面后，打开任意会话行 `…` 菜单，符合条件的行会在「归档会话」下方出现「删除会话」。默认（再次点击删除）下点击一次进入警示状态，再点一次即删除；换成其它确认方式后，按对应的确认流程执行。

侧栏「插件」页中本插件页面上的卡片同样在重启后出现（该页面只显示 host 端正在服务的命名空间对应的条目）。

## 注意事项（安全与限制）

- **运行中会话拒绝删除**：`ctx.agents.get(id)?.status !== 'idle'` 即返回 409，删除前还会二次检查。仅驻留内存的空闲（idle）会话不受此限制。
- **删除前自动归档**：破坏性 `rm` 前先调用 `workspaceRegistry.archiveSession(id)`，让侧栏经 `host/archived-sessions-changed` 广播即时隐藏该会话（同时让「当前会话」被客户端自动清空选择），避免删除后仍残留在清单一直到重启。归档是幂等的，失败不阻断删除主流程。
- **会话定位策略**：核心已不再提供 `supportsRawArtifacts` 旗标。插件先调用 JSONL 后端的公开 API `resolveCurrentLog(id)`（异步返回当前格式世代日志的绝对路径）；它对尚未迁移、文件名不带 `vN` 标记的旧格式会话会返回 `undefined`（本机 89 个既有会话中仅 4 个属于新格式），此时回退到后端执行期仍提供的 `locate(header)`（返回 `{ kind, path }`）。两者都不可用时返回 501。若后端抛出带 `kind: 'jsonl'` 与 `path` 诊断信息的错误（例如日志属于更新版本），插件会沿用该路径完成删除。
- **只删会话目录**：`rm(dirname(logPath), { recursive: true, force: false })`；删除前会写归档标记，但不修改工作区分组、投影缓存与共享附件。删除前还会校验目标目录名**正好等于会话 id**（后端以 `encodeSegment(id)` 命名，而会话 id 仅含 `[A-Za-z0-9._-]`），任何情况下都不会递归删除到整个 project 目录。
- **不可恢复**：删除是递归 `rm`，没有回收站，请谨慎操作。
- **两段式确认的内存态**（仅「再次点击删除」模式）：警示状态只存在于浏览器内存（按会话 id，8 秒窗口），插件卸载、页面刷新或超时后自动消失；不产生任何持久状态。切换到其它确认方式后不再显示该状态。
- **官方会话菜单槽位，无 DOM 注入**：本插件向 `sidebar.workspaces.session.menu.item` 列表贡献一个普通条目（注册 id `delete-session`，order `450`），由宿主菜单渲染为一个 `role="menuitem"` 按钮。槽位直接提供 `{ sessionId, displayTitle }` 与 `useMenuOpenState` 钩子，因此本插件拿到的是精确的会话 id：既不捕捉会话行 `…` 按钮的点击，也不运行 `document.body` 上的 `MutationObserver`、不解析会话行的 `aria-label`（`会话“{name}”的操作` / `Session actions for {name}`）、不重新实现核心的相对时间分桶，也不克隆「归档会话」项。键盘遍历、焦点归位与菜单关闭都由宿主菜单处理，因此不依赖任何 DOM 结构，也不依赖任何界面文案。
- **可用性跟随槽位**：只要宿主渲染会话菜单，该项就会出现；本插件会等待该槽位被声明，因此未组合 `@deepseek-ai/dsh-client-ui-workspace` 的部署不会留下任何痕迹。

## 版本兼容性

本插件适配的 DSH 版本与运行环境：

| 项目            | 版本 / 说明                                                                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 适配的 DSH core | 最低 `0.2.0-rc.1`（所有 `@deepseek-ai/dsh*` peer 均为 `>=0.2.0-rc.1 <0.3.0-0`）；运行实测于 `0.2.0-rc.2`                                                                                                                         |
| 插件版本        | `1.2.1`                                                                                                                                                                                                                          |
| 持久化后端      | `@deepseek-ai/dsh-session-persistence-jsonl`（须提供 `resolveCurrentLog` 或 `locate`）                                                                                                                                           |
| 设置服务        | `@deepseek-ai/dsh-settings`（host 端）与 `@deepseek-ai/dsh-client-ui-settings`（`ctx.configForms`）；可选：缺席时只是不显示配置卡片                                                                                              |
| 客户端注入依赖  | `@deepseek-ai/dsh-api-session-controller`、`@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-plugin-manager`、`@deepseek-ai/dsh-client-ui-settings`、`@deepseek-ai/dsh-client-ui-workspace`                          |
| 贡献的槽位      | `sidebar.workspaces.session.menu.item`（注册 id `delete-session`，order `450`，由 `@deepseek-ai/dsh-client-ui-workspace` 声明）；`plugins.bundle.config`（以 npm 包名为键，由 `@deepseek-ai/dsh-client-ui-plugin-manager` 声明） |

自 `1.0.4` 起适配的 core 破坏性变更：

| core 变更    | 旧用法（≤ `1.0.3`）                     | 新用法（`1.0.4`）                                       |
| ------------ | ---------------------------------------- | ------------------------------------------------------- |
| 会话列表快照 | `list()` 项取顶层 `id`                   | `list()` 项取 `header.id`                               |
| 定位会话日志 | `supportsRawArtifacts` 与 `locate(meta)` | 先 `resolveCurrentLog(id)`，旧格式回退 `locate(header)` |
| 工作区快照   | `workspaces.baselinesReady`              | 仅 `workspaces.phase === "ready"`                       |
| 工作区刷新   | `workspaces.refresh()`                   | 该方法已移除；只刷新 `sessions`                         |

自 `1.2.0` 起适配的 core 破坏性变更：

| core 变更             | 旧用法（≤ `1.1.0`）                                                                                              | 新用法（`1.2.0`）                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 设置命名空间与 schema | host 端用 `ctx.settings.installSection` 注册；命名空间是一个设置节                                                | 命名空间就是 profile 入口 id `delete-session`；host 端以自己的 schemastery `Config` 声明 schema（`confirmMode`，标记 `.volatile()`）             |
| 读写设置值            | `ctx.settingsScope.bind({ namespace: 'delete-session' })`                                                         | `ctx.configForms.get("delete-session")`（`getSnapshot` / `subscribe` / `set` / `unset`）                                                         |
| 配置卡片槽位          | `settings.plugin.item`，键为命名空间                                                                              | `plugins.bundle.config`，键为 npm 包名，由 `@deepseek-ai/dsh-client-ui-plugin-manager` 提供                                                      |
| 会话菜单项            | DOM 注入：捕捉点击、`document.body` 上的 `MutationObserver`、解析 `aria-label`、相对时间分桶、克隆「归档会话」项  | `sidebar.workspaces.session.menu.item`，注册 id `delete-session`，order `450`；槽位提供 `{ sessionId, displayTitle }` 与 `useMenuOpenState` 钩子 |
| 配置持久化位置        | `$DSH_HOME/settings.yaml` 的 `delete-session:` 节                                                                 | profile 的 `cordis.patch.yml` 中 `id: delete-session` 行的 `config:` 条目                                                                        |
| 客户端注入依赖        | `dsh-api-session-controller`、`dsh-api-workspace-controller`、`dsh-client-ui-settings`、`dsh-client-ui-workspace` | 移除不再使用的 `dsh-api-workspace-controller`，新增 `dsh-client-locale` 与 `dsh-client-ui-plugin-manager`                                        |

| 插件版本 | 可用 core 版本               | 依据                                                                                                                                                                                                                                       |
| -------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `1.2.1`  | `>= 0.2.0-rc.1 < 0.3.0-0`    | 新增插件展示元信息：`locale/{en,zh}.json` 提供本地化的插件名与简介，`icon.svg` 提供插件页图标；设置机制与 `1.2.0` 相同                                                                                                                     |
| `1.2.0`  | `>= 0.2.0-rc.1 < 0.3.0-0`    | 让插件适配 dsh 0.2.x：设置命名空间为 profile 入口 id `delete-session`，schema 由插件自己的 schemastery `Config` 声明，卡片经 `ctx.configForms` 读写，菜单项与卡片都走官方槽位。不再支持 `0.1.x`，因为 0.1.x 的设置 API 已在 `0.2.0` 中移除 |
| `1.1.0`  | `>= 0.1.3-alpha.2 < 0.2.0-0` | 同 `1.0.4`；新增设置命名空间 `delete-session`（删除确认方式卡片），并让三种确认方式（再次点击／对话框／直接删除）真正生效。使用 0.1.x 的设置 API，因此无法在 `0.2.0` 及更高版本运行                                                        |
| `1.0.4`  | `>= 0.1.3-alpha.2 < 0.2.0-0` | `sessionPersistence.list()` 自该版本起返回 `SessionPersistenceSnapshot`（id 在 `header.id`）；`resolveCurrentLog()` 亦自该版本起可用                                                                                                       |
| `1.0.3`  | `<= 0.1.2-rc.1`              | 该区间 `list()` 返回 `SessionHeader[]`（id 在顶层），且 `locate()` / `supportsRawArtifacts` 仍是基类的公开 API                                                                                                                             |

各区间没有重叠：`0.1.3-alpha.2` 同时改掉了 `list()` 的返回类型并移除了基类的 `locate()` / `supportsRawArtifacts`，因此不存在能同时运行 `1.0.3` 与 `1.0.4` 的 core 版本。`0.1.2-rc.1` 及更早版本无法使用 `1.0.4`；`1.2.0` 则要求 `0.2.x`：`1.1.0` 及更早版本无法在 `0.2.0` 及更高版本运行，因为 0.1.x 的设置 API（`settings.installSection` / `settingsScope` / `settings.plugin.item` 槽位）已在 `0.2.0` 中移除。

**从 `0.1.x` 迁移**：dsh `0.2.0` 只会为「导入执行时组合中已存在的 profile 入口 id」导入旧的 `$DSH_HOME/settings.yaml` 设置节，而这次导入是一次性的、且已经执行完毕。因此，仍留在 `settings.yaml.imported` 里的 `delete-session:` 节需要按[插件设置](#插件设置删除确认方式)中的 YAML 片段手工搬进 profile 的 `cordis.patch.yml`。

## 卸载

从 profile 的 `dsh.profile.bundles`（以及 `dependencies`）中移除 `@kagurazakayashi/dsh-delete-session` 后重启。插件唯一的持久痕迹是 profile 的 `cordis.patch.yml` 中 `id: delete-session` 行的 `config:` 条目（只有在保存过删除确认方式后才会出现），需要一并清理时手动删除该条目即可。

## License

MIT — 见 [LICENSE](LICENSE)，版权归 KagurazakaYashi(KagurazakaMiyabi) 所有。

## 语言

- [English (United States)](README.md)
- 简体中文（中国大陆）
- [繁體中文（台灣）](README.zh-TW.md)
- [日本語](README.ja.md)
