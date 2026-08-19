# dsh-delete-session

一个极简的 DeepSeek Harness **Web** 树外插件：在左侧会话列表中「会话行 `…` 菜单」的「归档会话」下方追加一项「删除会话」。第一次点击就地变为警示状态（红底 + 警告图标），再次点击即永久删除该会话的磁盘目录（含对话日志），全程无需确认弹窗。

它不修改 DSH 核心安装，也不修改任何 profile 配置。host 端持有一条 HTTP 路由；浏览器端通过 DOM 注入在核心菜单中追加删除项。

## 功能

- host 端（`index.js`）注册 `POST /delete-session/delete`。
- 浏览器端（`client.js`）监听会话行 `…` 菜单的弹出，在「归档会话」下方注入「删除会话」项（zh/en 双语）。
- **两段式删除，无确认弹窗**：第一次点击将菜单项就地切换为警示状态（红底、警告图标、文案「再次点击删除」/「Click again to delete」），不关闭菜单也不弹窗；第二次点击才真正调用删除路由，成功后刷新会话与工作区列表。
- 警示状态按会话 id 记忆（内存态，8 秒自动解除），期间菜单关闭再重开仍会以警示状态显示；删除失败也会解除警示。
- 删除失败时弹出轻量错误提示（纯 DOM，非确认框），说明失败原因（会话使用中 / 不存在 / 网络错误等）。
- **正在运行任务的会话拒绝删除**（HTTP 409）：只有 agent 状态非 `idle`（正在运行任务）的会话才被拒绝，避免破坏正在写入的日志。仅被打开过、之后切换走而仍驻留内存的空闲会话可以正常删除。

## 会话定位算法（按设计实现）

由于核心 UI 的会话行菜单是硬编码数组、没有扩展 slot，且 UI 原语模块是 shell 冻结的 seed 模块，本插件改在 **DOM 层**注入。为把「当前这个菜单」关联到唯一的会话，使用**双条件文本匹配**：

1. **displayTitle**：读取该行实际渲染的标题文本，与 `sessions.list` 中每个会话的 `displayTitle` 精确比较。
2. **相对时间**：读取该行实际渲染的相对时间文本（如「5分钟」「5min」），并用与核心 `dsh-client-ui-workspace` **完全相同的分桶算法**（60s / 1h / 1d / 30d / 365d）对每个候选会话的 `updatedAt` 计算标签后精确比较。
3. **唯一命中规则**：同时满足两个条件的候选会话数量**恰好为 1** 时才注入菜单项；0 个或 ≥2 个都不注入。
4. **数据就绪门槛 + 可选延时**：注入前先确认前端数据已加载完成（`sessions` 清单 `phase === "ready"`，`workspaces` 清单 `phase === "ready"` 且 `baselinesReady === true`），数据未就绪时不干涉前端。延时由 `INJECT_DELAY_MS` 控制，当前为 `0`（**完全关闭延时**，数据就绪后直接同步注入，不建立计时器）；设为正数时才额外等待该毫秒数让 React 完成提交（弹层定位、清单更新）。

匹配与显示均支持 zh / en 两种语言（依据菜单中「归档会话 / Archive session」的实际文案自动判定）；其他语言下不注入。

## 安装

本插件与 `dsh-archive-manager` 同构：放在磁盘上，再装进现有 `web` profile。

```bash
dsh plugin --profile web add "C:\Users\yashi\.dsh\plugins\dsh-delete-session"
```

然后手工把插件加进 `$DSH_HOME/profiles/web/package.json` 的 bundle 列表：

```jsonc
{
  "name": "dsh-profile-web",
  "private": true,
  "dependencies": {
    "dsh-delete-session": "link:C:/Users/yashi/.dsh/plugins/dsh-delete-session"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-delete-session"
      ]
    }
  }
}
```

`dependencies` 条目由 `dsh plugin --profile web add` 写入；较新版本的 dsh 会同时自动追加 `dsh.profile.bundles`，若未自动追加则手工补上。

插件的 `cordis.patch.yml`（经 `dsh.bundle.patch` 声明）注入 host 行：

```yaml
- insert:
    - id: delete-session
      name: dsh-delete-session
```

## 重启

运行中的进程不会加载新的 bundle 行，需要重启 web profile：

```bash
dsh web
```

刷新页面后，打开任意会话行 `…` 菜单，符合条件的行会在「归档会话」下方出现「删除会话」。点击一次进入警示状态，再点一次即删除。

## 安全与限制

- **运行中会话拒绝**：`ctx.agents.get(id)?.status !== 'idle'` 即返回 409，删除前还会二次检查。仅驻留内存的空闲（idle）会话不受此限制。
- **删除前自动归档**：破坏性 `rm` 前先调用 `workspaceRegistry.archiveSession(id)`，让侧栏经 `host/archived-sessions-changed` 广播即时隐藏该会话（同时让「当前会话」被客户端自动清空选择），避免删除后仍残留在清单一直到重启。归档是幂等的，失败不阻断删除主流程。
- **原始工件后端必需**：持久化后端必须提供 `supportsRawArtifacts === true` 与返回 `{ kind: 'jsonl', path }` 的 `locate()`，否则返回 501。
- **只删会话目录**：`rm(dirname(location.path), { recursive: true, force: false })`；删除前会写归档标记，但不修改工作区分组、投影缓存与共享附件。
- **不可恢复**：删除是递归 `rm`，没有回收站。
- **两段式确认的内存态**：警示状态只存在于浏览器内存（按会话 id，8 秒窗口），插件卸载、页面刷新或超时后自动消失；不产生任何持久状态。
- **同名保守策略**：标题相同且相对时间相同的行，匹配数量 ≥2，二者都不会出现删除项。
- **DOM 注入的固有脆弱性**：本插件依赖核心 UI 的 DOM 结构（`button → span.root → span.rowActions → 时间 span → 标题 span`）与「归档会话」菜单项文案。DSH 升级后若结构或文案变化，注入会静默失效（不会报错、也不会误删），需按新结构修正 `client.js`。
- **相对时间边界漂移**：行上的相对时间由核心在渲染时计算，匹配时用当前时刻重算；若恰好处在分桶边界，可能出现 0 命中而不注入（保守、安全）。
- **数据未就绪时不注入**：启动初期（会话/工作区清单尚未从 host 拉取完成）打开菜单不会出现删除项；数据就绪后重新打开菜单即可。若菜单保持打开期间数据到达并触发重绘，观察器会自动补注入。

## 卸载

从 profile 的 `dsh.profile.bundles`（以及 `dependencies`）中移除 `dsh-delete-session` 后重启。插件自身不产生持久状态，无需其他清理。

## License

MIT — 见 [LICENSE](LICENSE)。
