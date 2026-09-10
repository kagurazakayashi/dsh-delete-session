# dsh-delete-session

Language: English · [简体中文](README.zh-CN.md)

**A DeepSeek Harness Web plugin for quickly and thoroughly deleting sessions.**

The plugin adds a **Delete session** item to a session row's `…` menu in the left sidebar of the DeepSeek Harness Web UI.

With the default confirmation mode:

1. First click: turns the item into an in-place warning state (red background + warning icon).
2. Second click: permanently deletes that session.

So an unwanted session can be deleted conveniently with a double-click.

The confirmation mode itself is configurable: the plugin registers its own card in **Settings → Plugins → Plugin configuration**, where you can choose **click again to delete** (default), **confirm in a dialog**, or **delete immediately (dangerous)**. The saved choice takes effect right away and is persisted in `$DSH_HOME/settings.yaml`.

It is a minimal DeepSeek Harness Web out-of-tree plugin. It neither modifies the DSH core installation nor any profile configuration; instead it appends the **Delete session** menu item via DOM injection in the browser.

## Quick install

Run these two commands in your terminal to install and start:

```bash
dsh plugin --profile web add @kagurazakayashi/dsh-delete-session
dsh web
```

After the restart, refresh the page and open any session row's `…` menu — **Delete session** appears below **Archive session**.

## Features

- Host side (`index.js`) registers `POST /delete-session/delete`.
- Browser side (`client.js`) watches for session-row `…` menu popups and injects a **Delete session** item below **Archive session** (zh / en bilingual).
- **Three confirmation modes, chosen in Settings** (see [Plugin settings](#plugin-settings-delete-confirmation-mode)): `click-again` (default) uses the in-place warning state, `dialog` opens a confirmation dialog, and `instant` deletes on the first click with no confirmation.
- **Two-step deletion (the default mode), no confirmation dialog**: the first click switches the menu item to an in-place warning state (red background, warning icon, "Click again to delete" / "再次点击删除") without closing the menu or showing a dialog; the second click actually calls the delete route, then refreshes the session list.
- The warning state is remembered per session id (in-memory, auto-disarms after 8 seconds); reopening the menu within that window still shows the warning state. A failed deletion also disarms it. It only exists in the `click-again` mode.
- The `dialog` mode's confirmation can be dismissed with Cancel, Escape, or a click outside; only its danger-coloured confirm button deletes, and the initial focus sits on Cancel to reduce mis-clicks.
- Deletion failures show a lightweight error notice (plain DOM, not a confirm dialog) explaining the reason (session busy / not found / network error, etc.).
- **Running sessions are refused** (HTTP 409): only sessions whose agent status is not `idle` (i.e. running a task) are rejected, to avoid corrupting a log that is still being written. Idle sessions that were merely opened and then switched away (still resident in memory) can be deleted normally.
- **Settings card**: a card for this plugin is registered in **Settings → Plugins → Plugin configuration**, offering the delete confirmation mode (click again / confirm in a dialog / delete immediately). The card uses a draft-then-save model and writes to the `delete-session` section of `$DSH_HOME/settings.yaml`; it shows a "Customized" badge and offers "Reset to default". The saved value decides how the next deletion is confirmed, immediately; the card's unsaved draft does not affect deletion.

## Menu diagram

After clicking the `…` button on a session row, the opened menu looks like this (`Delete session` is injected by this plugin). The screenshot below contrasts the menu before and after the first click — the second click is what actually deletes:

![Delete session demo](screenshot.png)

```
Session row menu

├─ Rename session     (core)
├─ Fork session       (core)
├─ Archive session    (core)
└─ Delete session     ← injected by this plugin (zh / en)
```

## Usage (delete confirmation modes)

The confirmation mode comes from the plugin's settings card; `click-again` is the default.

**`click-again`** — two-step confirmation with no dialog:

```
First click "Delete session"
        │
        ▼
The item turns into a red warning state "Click again to delete"
        │
        ├─ not clicked again within 8s ──▶ reverts to normal "Delete session"
        │
        └─ clicked again within 8s ──▶ calls POST /delete-session/delete
                                            │
                                            ├─ session is running ──▶ 409 refused, error notice
                                            │
                                            └─ idle session ──▶ archive → rm session directory
                                                                   │
                                                                   ▼
                                                              200 OK, refresh lists
```

**`dialog`** — the menu closes and a confirmation dialog appears; only its confirm button deletes:

```
Click "Delete session"
        │
        ▼
Dialog: Permanently delete the session "…"?   [Cancel] [Delete]
        │
        ├─ Cancel / Escape / click outside ──▶ nothing is deleted
        │
        └─ Delete ──▶ calls POST /delete-session/delete (same checks as above)
```

**`instant`** — the first click deletes immediately, with no confirmation at all:

```
Click "Delete session" ──▶ calls POST /delete-session/delete (same checks as above)
```

All three modes end in the same route, so the running-session refusal (409) and the auto-archive-then-remove behaviour are identical.

## Plugin settings (delete confirmation mode)

Open **Settings → Plugins → Plugin configuration** to find this plugin's card, **Delete session**. Expanding it offers the confirmation mode used when deleting a session:

| Option                          | Meaning                                                                    |
| ------------------------------- | -------------------------------------------------------------------------- |
| Click again to delete           | The first click enters a warning state; the second click deletes (default) |
| Confirm in a dialog             | A confirmation dialog appears; the session is deleted after confirming     |
| Delete immediately (dangerous)  | Deletes immediately with no second confirmation                            |

Saving follows the same rules as the core plugin cards:

- A selection is only a draft; it is written when you press **Save**, and **Discard** drops the draft.
- A successful save is written to the `delete-session` section of `$DSH_HOME/settings.yaml`, so it survives a restart:
  ```yaml
  delete-session:
    confirmMode: click-again   # click-again | dialog | instant
  ```
- When the field is overridden in the user layer the card shows a "Customized" badge, and **Reset to default** clears the override so the field re-inherits its default.
- A failed save (for example a deployment that does not allow writes) keeps the draft and reports the failure instead of silently dropping it.

How it is implemented: the Host half (`index.js`) registers the `delete-session` namespace and schema through `ctx.settings.installSection`, while the browser half reads and writes that namespace through `ctx.settingsScope.bind({ namespace: 'delete-session' })` and registers its card into the official `settings.plugin.item` slot (keyed by the namespace). A deployment without the settings service only loses the card; deletion keeps working.

> The saved value takes effect immediately: it decides how the next "Delete session" click is confirmed. The card's unsaved draft does not affect deletion until you press Save.

## Installation

### One-command install (recommended)

```bash
dsh plugin --profile web add @kagurazakayashi/dsh-delete-session
```

This pulls the plugin from npm and registers it in the profile's bundle list automatically (no manual config editing).

### Install from source

This plugin is structured like `dsh-archive-manager`: put it on disk, then add it to an existing `web` profile.

1. Place the plugin source somewhere on disk, e.g. on Windows:

   ```
   C:\Users\<you>\.dsh\plugins\dsh-delete-session
   ```

   (On macOS / Linux: `~/.dsh/plugins/dsh-delete-session`.)

2. Add it to the `web` profile with dsh:

   ```bash
   # Windows (replace <you> with your username)
   dsh plugin --profile web add "C:\Users\<you>\.dsh\plugins\dsh-delete-session"

   # macOS / Linux
   dsh plugin --profile web add "~/.dsh/plugins/dsh-delete-session"
   ```

3. Make sure the bundle list in `$DSH_HOME/profiles/web/package.json` includes this plugin. Newer dsh versions append it automatically on `add`; if not, add it by hand:

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

   The `dependencies` entry is written by `dsh plugin --profile web add`; if `dsh.profile.bundles` is not appended automatically, add it by hand.

4. The plugin's `cordis.patch.yml` (declared via `dsh.bundle.patch`) injects the host row:

   ```yaml
   - insert:
       - id: delete-session
         name: '@kagurazakayashi/dsh-delete-session'
   ```

## Restart to take effect

A running process does not load new bundle rows, so restart the web profile:

```bash
dsh web
```

After refreshing the page, open any session row's `…` menu; eligible rows show **Delete session** below **Archive session**. In the default mode, click once to enter the warning state and click again to delete; in the other modes the matching confirmation flow applies instead.

The plugin's card in **Settings → Plugins → Plugin configuration** also appears after the restart (that tab only shows cards for namespaces the Host serves).

## Notes (safety & limitations)

- **Running sessions refused**: `ctx.agents.get(id)?.status !== 'idle'` returns 409, and a second check runs right before deletion. Only idle sessions resident in memory are exempt.
- **Auto-archive before delete**: the destructive `rm` is preceded by `workspaceRegistry.archiveSession(id)`, which lets the sidebar hide the session immediately via the `host/archived-sessions-changed` broadcast (and lets the client auto-clear the current selection), so it does not linger in the list until restart. Archiving is idempotent; a failure does not block the main deletion flow.
- **Session locating strategy**: the core no longer exposes the `supportsRawArtifacts` flag. The plugin first calls the JSONL backend's public API `resolveCurrentLog(id)` (async, returning the absolute path of the current-format-generation log); for sessions that have not been migrated yet — filenames without a `vN` marker — it returns `undefined` (on this machine only 4 of 89 existing sessions were in the new format), so the plugin falls back to the backend's still-present-at-runtime `locate(header)` (returning `{ kind, path }`). When neither yields a path it returns 501. If the backend throws an error carrying `kind: 'jsonl'` and `path` diagnostics (for example a log in a newer version), the plugin reuses that path to complete the deletion.
- **Deletes only the session directory**: `rm(dirname(logPath), { recursive: true, force: false })`; an archive marker is written first, but workspace groups, projection caches, and shared attachments are left untouched. Before deleting, the target directory name must be **exactly the session id** (the backend names it with `encodeSegment(id)`, and session ids only contain `[A-Za-z0-9._-]`), so the whole project directory can never be recursively removed.
- **Irreversible**: deletion is a recursive `rm` with no recycle bin; operate with care.
- **In-memory two-step state** (`click-again` mode only): the warning state lives only in browser memory (per session id, 8-second window) and disappears on plugin unmount, page refresh, or timeout; no persistent state is produced. Switching to another mode stops showing it.
- **Conservative same-name policy**: if two rows share both the same title and the same relative time (match count ≥2), neither gets a delete item.
- **Inherent DOM-injection fragility**: this plugin depends on the core UI's DOM structure (`div.sessionRow > span.title / span.time / span.rowActions > Menu root span > button`) and the "Archive session" menu-item text. The title is parsed first from the `…` button's `aria-label` (`会话“{name}”的操作` / `Session actions for {name}`) and only falls back to DOM derivation, so the core's new "active schedule" indicator element cannot break the match. If DSH changes the structure or the wording in an upgrade, injection fails silently (no error, and no accidental deletion); `client.js` must then be updated to match the new structure.
- **Relative-time boundary drift**: the row's relative time is computed by the core at render time, while matching recomputes it with the current time; near a bucket boundary this may yield 0 matches and no injection (conservative and safe).
- **No injection before data is ready**: opening the menu during early startup (before the session/workspace lists are pulled from the host) shows no delete item; reopen the menu once data is ready. If data arrives and triggers a repaint while the menu stays open, the observer re-injects automatically.

## Version compatibility

The DSH versions and runtime environment this plugin targets:

| Item                | Version / notes                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Targeted DSH core   | minimum `0.1.3-alpha.2` (API-level check); runtime-verified on `0.1.5-rc.1` (sub-packages `0.1.5-rc.2`)                                                               |
| Plugin version      | `1.1.0`                                                                                                                                                               |
| Settings service    | `@deepseek-ai/dsh-settings` (optional: without it the settings card is simply absent)                                                                                 |
| Persistence backend | `@deepseek-ai/dsh-session-persistence-jsonl` (must provide `resolveCurrentLog` or `locate`)                                                                           |
| Client inject deps  | `@deepseek-ai/dsh-api-session-controller`, `@deepseek-ai/dsh-api-workspace-controller`, `@deepseek-ai/dsh-client-ui-settings`, `@deepseek-ai/dsh-client-ui-workspace` |

Breaking core changes adopted in `1.0.4`:

| Core change              | Old usage (≤ `1.0.3`)                                | New usage (`1.0.4`)                                      |
| ------------------------ | ---------------------------------------------------- | -------------------------------------------------------- |
| Session list snapshot    | top-level `id` on each `list()` item                 | `header.id` on each `list()` item                        |
| Locating the session log | `supportsRawArtifacts` + `locate(meta)`              | `resolveCurrentLog(id)` first, `locate(header)` fallback |
| Workspace snapshot       | `workspaces.baselinesReady`                          | only `workspaces.phase === "ready"`                      |
| Workspace refresh        | `workspaces.refresh()`                               | removed; refresh `sessions` only                         |
| Client inject deps       | `@deepseek-ai/dsh-client-runtime` (no longer exists) | existing `dsh-api-*-controller` packages                 |

| Plugin version | Usable core versions | Basis                                                                                                                                                                                                      |
| -------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1.1.0`        | `>= 0.1.3-alpha.2`   | Same as `1.0.4`; adds the `delete-session` settings namespace (the delete-confirmation card in Settings) and makes the three confirmation modes (click again / dialog / immediate) actually drive deletion |
| `1.0.4`        | `>= 0.1.3-alpha.2`   | `sessionPersistence.list()` returns `SessionPersistenceSnapshot` from that version on (id in `header.id`), and `resolveCurrentLog()` is available from the same version                                    |
| `1.0.3`        | `<= 0.1.2-rc.1`      | In that range `list()` returns `SessionHeader[]` (id at the top level) and `locate()` / `supportsRawArtifacts` are still public base-class API                                                             |

The two ranges do not overlap: `0.1.3-alpha.2` changed the `list()` return type and removed the base-class `locate()` / `supportsRawArtifacts` in the same release, so no single core version runs both plugin versions. `1.0.4` cannot be used on `0.1.2-rc.1` or earlier.

## Uninstall

Remove `@kagurazakayashi/dsh-delete-session` from the profile's `dsh.profile.bundles` (and `dependencies`) and restart. The plugin's only durable trace is the optional `delete-session:` section in `$DSH_HOME/settings.yaml` (written only after a confirmation mode is saved); delete that section too if you want it gone.

## License

MIT — see [LICENSE](LICENSE), copyright KagurazakaYashi(KagurazakaMiyabi).

## Languages

- [简体中文](README.zh-CN.md)
