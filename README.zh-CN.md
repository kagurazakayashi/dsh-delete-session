# dsh-delete-session

简体中文 · [English](README.md)

**快速彻底删除会话的 DeepSeek Harness Web 插件。**

插件会在 DeepSeek Harness Web 左侧会话列表中的会话行的 `…` 菜单中，添加一项「删除会话」。

1. 首次点击：就地变为警示状态（红底 + 警告图标）。
2. 再次点击：永久删除这条会话。

因此可以方便地通过双击删除一个不需要的会话。

它是一个极简的 DeepSeek Harness Web 树外（out-of-tree）插件。它既不修改 DSH 核心安装，也不修改任何 profile 配置，而是通过前端 DOM 在菜单中追加「删除会话」菜单项。

## 快速安装

在终端执行以下两条命令，即可完成安装并启动：

```bash
dsh plugin --profile web add @kagurazakayashi/dsh-delete-session
dsh web
```

重启后刷新页面，打开任意会话行的 `…` 菜单，「归档会话」下方就会出现「删除会话」。

## 功能特性

- host 端（`index.js`）注册 `POST /delete-session/delete`。
- 浏览器端（`client.js`）监听会话行 `…` 菜单的弹出，在「归档会话」下方注入「删除会话」项（zh / en 双语）。
- **两段式删除，无确认弹窗**：第一次点击将菜单项就地切换为警示状态（红底、警告图标、文案「再次点击删除」/「Click again to delete」），不关闭菜单也不弹窗；第二次点击才真正调用删除路由，成功后刷新会话列表。
- 警示状态按会话 id 记忆（内存态，8 秒自动解除），期间菜单关闭再重开仍会以警示状态显示；删除失败也会解除警示。
- 删除失败时弹出轻量错误提示（纯 DOM，非确认框），说明失败原因（会话使用中 / 不存在 / 网络错误等）。
- **正在运行任务的会话拒绝删除**（HTTP 409）：只有 agent 状态非 `idle`（正在运行任务）的会话才被拒绝，避免破坏正在写入的日志。仅被打开过、之后切换走而仍驻留内存的空闲会话可以正常删除。

## 菜单效果示意图

点击会话行右侧的 `…` 后，弹出的菜单结构如下（`删除会话` 为本插件注入）。下图为点击前与点击一次后的对比——第二次点击才会真正删除：

![删除会话演示](screenshot.png)

```
会话行菜单

├─ 重命名会话      （核心自带）
├─ 分叉会话        （核心自带）
├─ 归档会话        （核心自带）
└─ 删除会话        ← 本插件注入（zh / en 双语）
```

## 使用方式（两段式删除）

删除采用两段式确认，全程不弹窗：

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

刷新页面后，打开任意会话行 `…` 菜单，符合条件的行会在「归档会话」下方出现「删除会话」。点击一次进入警示状态，再点一次即删除。

## 注意事项（安全与限制）

- **运行中会话拒绝删除**：`ctx.agents.get(id)?.status !== 'idle'` 即返回 409，删除前还会二次检查。仅驻留内存的空闲（idle）会话不受此限制。
- **删除前自动归档**：破坏性 `rm` 前先调用 `workspaceRegistry.archiveSession(id)`，让侧栏经 `host/archived-sessions-changed` 广播即时隐藏该会话（同时让「当前会话」被客户端自动清空选择），避免删除后仍残留在清单一直到重启。归档是幂等的，失败不阻断删除主流程。
- **会话定位策略**：核心已不再提供 `supportsRawArtifacts` 旗标。插件先调用 JSONL 后端的公开 API `resolveCurrentLog(id)`（异步返回当前格式世代日志的绝对路径）；它对尚未迁移、文件名不带 `vN` 标记的旧格式会话会返回 `undefined`（本机 89 个既有会话中仅 4 个属于新格式），此时回退到后端执行期仍提供的 `locate(header)`（返回 `{ kind, path }`）。两者都不可用时返回 501。若后端抛出带 `kind: 'jsonl'` 与 `path` 诊断信息的错误（例如日志属于更新版本），插件会沿用该路径完成删除。
- **只删会话目录**：`rm(dirname(logPath), { recursive: true, force: false })`；删除前会写归档标记，但不修改工作区分组、投影缓存与共享附件。删除前还会校验目标目录名**正好等于会话 id**（后端以 `encodeSegment(id)` 命名，而会话 id 仅含 `[A-Za-z0-9._-]`），任何情况下都不会递归删除到整个 project 目录。
- **不可恢复**：删除是递归 `rm`，没有回收站，请谨慎操作。
- **两段式确认的内存态**：警示状态只存在于浏览器内存（按会话 id，8 秒窗口），插件卸载、页面刷新或超时后自动消失；不产生任何持久状态。
- **同名保守策略**：标题相同且相对时间相同的行，匹配数量 ≥2，二者都不会出现删除项。
- **DOM 注入的固有脆弱性**：本插件依赖核心 UI 的 DOM 结构（`div.sessionRow > span.title / span.time / span.rowActions > Menu 根 span > button`）与「归档会话」菜单项文案。标题优先从 `…` 按钮的 `aria-label`（`会话“{name}”的操作` / `Session actions for {name}`）解析，失败时才回退到 DOM 推导，因此核心新增的「活动定时任务」指示元素不会影响匹配。DSH 升级后若结构或文案变化，注入会静默失效（不会报错、也不会误删），需按新结构修正 `client.js`。
- **相对时间边界漂移**：行上的相对时间由核心在渲染时计算，匹配时用当前时刻重算；若恰好处在分桶边界，可能出现 0 命中而不注入（保守、安全）。
- **数据未就绪时不注入**：启动初期（会话/工作区清单尚未从 host 拉取完成）打开菜单不会出现删除项；数据就绪后重新打开菜单即可。若菜单保持打开期间数据到达并触发重绘，观察器会自动补注入。

## 版本兼容性

本插件适配的 DSH 版本与运行环境：

| 项目            | 版本 / 说明                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 适配的 DSH core | 最低 `0.1.3-alpha.2`（依 API 静态核对）；运行实测于 `0.1.5-rc.1`（子包 `0.1.5-rc.2`）                                          |
| 插件版本        | `1.0.4`                                                                                                                        |
| 持久化后端      | `@deepseek-ai/dsh-session-persistence-jsonl`（须提供 `resolveCurrentLog` 或 `locate`）                                         |
| 客户端注入依赖  | `@deepseek-ai/dsh-api-session-controller`、`@deepseek-ai/dsh-api-workspace-controller`、`@deepseek-ai/dsh-client-ui-workspace` |

自 `1.0.4` 起适配的 core 破坏性变更：

| core 变更      | 旧用法（≤ `1.0.3`）                           | 新用法（`1.0.4`）                                       |
| -------------- | --------------------------------------------- | ------------------------------------------------------- |
| 会话列表快照   | `list()` 项取顶层 `id`                        | `list()` 项取 `header.id`                               |
| 定位会话日志   | `supportsRawArtifacts` 与 `locate(meta)`      | 先 `resolveCurrentLog(id)`，旧格式回退 `locate(header)` |
| 工作区快照     | `workspaces.baselinesReady`                   | 仅 `workspaces.phase === "ready"`                       |
| 工作区刷新     | `workspaces.refresh()`                        | 该方法已移除；只刷新 `sessions`                         |
| 客户端注入依赖 | `@deepseek-ai/dsh-client-runtime`（已不存在） | `dsh-api-*-controller` 等现存包                         |

| 插件版本 | 可用 core 版本     | 依据                                                                                                                                 |
| -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `1.0.4`  | `>= 0.1.3-alpha.2` | `sessionPersistence.list()` 自该版本起返回 `SessionPersistenceSnapshot`（id 在 `header.id`）；`resolveCurrentLog()` 亦自该版本起可用 |
| `1.0.3`  | `<= 0.1.2-rc.1`    | 该区间 `list()` 返回 `SessionHeader[]`（id 在顶层），且 `locate()` / `supportsRawArtifacts` 仍是基类的公开 API                       |

两个区间没有重叠：`0.1.3-alpha.2` 同时改掉了 `list()` 的返回类型并移除了基类的 `locate()` / `supportsRawArtifacts`，因此不存在能同时运行两个插件版本的 core 版本。`0.1.2-rc.1` 及更早版本无法使用 `1.0.4`。

## 卸载

从 profile 的 `dsh.profile.bundles`（以及 `dependencies`）中移除 `@kagurazakayashi/dsh-delete-session` 后重启。插件自身不产生持久状态，无需其他清理。

## License

MIT — 见 [LICENSE](LICENSE)，版权归 KagurazakaYashi(KagurazakaMiyabi) 所有。

## 语言

- [English](README.md)
