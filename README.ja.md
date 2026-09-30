# dsh-delete-session

日本語 · [English](README.md)

**セッションを素早く完全に削除するための DeepSeek Harness Web プラグインです。**

このプラグインは、DeepSeek Harness Web の左サイドバーにあるセッション行の `…` メニューに **Delete session** という項目を追加します。

既定の確認方式では次のように動作します。

1. 1 回目のクリック：その場で警告状態（赤い背景 + 警告アイコン）に変わります。
2. 2 回目のクリック：そのセッションを完全に削除します。

つまり、不要なセッションはダブルクリックで手軽に削除できます。

確認方式自体を設定できます。プラグインは自身のカードを公式の `plugins.bundle.config` スロットに登録し、サイドバーの **Plugins** ページにあるこのプラグイン自身のページに表示します（`@kagurazakayashi/dsh-delete-session` の項目を開くと、設定セクションは説明と各項目の行の間にあります）。ここで **もう一度クリックして削除**（既定）、**ダイアログで確認**、**即時削除（危険）** を選択できます。保存した選択はすぐに有効になり、profile の `cordis.patch.yml` にある `id: delete-session` 行の `config:` エントリとして永続化されます（例：`$DSH_HOME/profiles/web/cordis.patch.yml`）。

これは最小構成の DeepSeek Harness Web のツリー外（out-of-tree）プラグインです。DSH 本体のインストールを変更することも、コアのファイルにパッチを当てることもありません。host 行はこのプラグイン自身の `cordis.patch.yml` バンドルパッチから読み込まれ、**Delete session** のメニュー項目は DOM への注入ではなく、公式の `sidebar.workspaces.session.menu.item` スロットを通じて提供されます。

## クイックインストール

ターミナルで次の 2 つのコマンドを実行すると、インストールと起動が完了します。

```bash
dsh plugin --profile web add @kagurazakayashi/dsh-delete-session
dsh web
```

再起動後にページを更新し、任意のセッション行の `…` メニューを開くと、**Archive session** の下に **Delete session** が表示されます。

## 機能

- host 側（`index.js`）が `POST /delete-session/delete` を登録します。
- ブラウザー側（`client.js`）が **Delete session** の項目を公式の `sidebar.workspaces.session.menu.item` スロットに登録します（登録 id `delete-session`、order `450`）。そのため、組み込みの **Archive session** 行（order `400`）のすぐ下に配置されます（zh / en の二言語）。
- **3 つの確認方式をプラグインのページで選択できます**（[プラグイン設定](#プラグイン設定削除の確認方式)を参照）。`click-again`（既定）はその場の警告状態を使い、`dialog` は確認ダイアログを開き、`instant` は 1 回目のクリックで確認なしに削除します。
- **2 段階削除（既定の方式）、確認ダイアログなし**：1 回目のクリックでメニュー項目がその場で警告状態（赤い背景、警告アイコン、「Click again to delete」/「再次点击删除」）に切り替わります。メニューは閉じず、ダイアログも表示しません。2 回目のクリックで実際に削除ルートを呼び出し、その後にセッション一覧を更新します。
- 警告状態はセッション id ごとに記憶されます（メモリー内のみ、8 秒後に自動解除）。その間はメニューを閉じて開き直しても警告状態のまま表示されます。削除に失敗した場合も解除されます。この状態は `click-again` モードでのみ意味を持ちます。
- `dialog` モードの確認は、キャンセル、Escape、外側のクリックで閉じられます。削除されるのは危険色の確認ボタンを押したときだけで、誤クリックを減らすため初期フォーカスはキャンセルに置かれます。
- 削除に失敗すると、軽量なエラー通知（確認ダイアログではない素の DOM）で理由（セッションが実行中 / 存在しない / ネットワークエラーなど）を説明します。
- **実行中のセッションは拒否されます**（HTTP 409）。拒否されるのは agent の状態が `idle` ではない（タスクを実行中の）セッションだけで、書き込み中のログを壊さないようにしています。開いただけで別のセッションに切り替えた、メモリー内に残っているアイドル状態のセッションは通常どおり削除できます。
- **設定カード**：このプラグイン自身のカードを公式の `plugins.bundle.config` スロットに登録します（npm パッケージ名 `@kagurazakayashi/dsh-delete-session` をキーとし、`@deepseek-ai/dsh-client-ui-plugin-manager` が提供します）。サイドバーの **Plugins** ページにあるこのプラグイン自身のページに表示され、削除の確認方式（もう一度クリックして削除 / ダイアログで確認 / 即時削除）を選べます。カードはドラフトを保持してから保存する方式で、profile の `cordis.patch.yml` にある `id: delete-session` 行の `config:` エントリに書き込みます。「カスタマイズ済み」バッジと「既定値に戻す」も用意しています。保存した値は次の削除の確認方法を即座に決めます。カード内の未保存のドラフトは削除には影響しません。

## メニューの図

セッション行の `…` ボタンをクリックすると、開くメニューは次のようになります（`Delete session` はこのプラグインが追加するものです）。下のスクリーンショットは 1 回目のクリックの前後を比較したもので、実際に削除するのは 2 回目のクリックです。

![Delete session demo](screenshot.png)

```
Session row menu

├─ Rename session     (core)
├─ Fork session       (core)
├─ Archive session    (core)
└─ Delete session     ← added by this plugin (zh / en)
```

## 使い方（削除の確認方式）

確認方式はこのプラグインの設定カードで決まり、既定は `click-again` です。

**`click-again`** — ダイアログを使わない 2 段階確認です。

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

**`dialog`** — メニューが閉じて確認ダイアログが表示され、その確認ボタンだけが削除します。

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

**`instant`** — 1 回目のクリックで確認なしに即座に削除します。

```
Click "Delete session" ──▶ calls POST /delete-session/delete (same checks as above)
```

3 つの方式は最終的に同じルートを通るため、実行中セッションの拒否（409）と自動アーカイブ後の削除という動作は完全に同じです。

## プラグイン設定（削除の確認方式）

dsh 0.2.x では、プラグインの設定は**もう「設定」ダイアログの中にはありません**（そこは 0.1.x の場所でした）。設定はプラグイン自身のページにあります。たどり着くまでの手順は次の 4 つです。

1. サイドバー上部の **Plugins** ページ（Workspaces の上にある四角が 4 つの項目）を開きます。下部の **Settings** ではありません。
2. **Installed** 一覧が表示されるまで待ちます。このページは host にプラグイン一覧を問い合わせるため、ブラウザーセッションが冷えていると十数秒かかることがあります。一覧が届くまでページはほぼ空に見えますが、内容が欠けているわけではありません。
3. **Installed** の下でこのプラグインの項目をクリックし、詳細ページを開きます。`1.2.1` 以降は一覧にローカライズされた名前 **Delete session** が表示され、古いバージョンではパッケージ名 `@kagurazakayashi/dsh-delete-session` が表示されます。右側のトグルや余白をクリックしても開きません。
4. 設定セクションはプラグインの**説明**と**含まれるコンポーネント**の間にあります。カードは既定で折りたたまれているので、タイトルをクリックして展開してください。

展開すると、セッション削除時の確認方式を選べます。

| オプション               | 意味                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| もう一度クリックして削除 | 1 回目のクリックで警告状態になり、2 回目のクリックで削除します（既定） |
| ダイアログで確認         | 確認ダイアログが表示され、確認した後にセッションを削除します           |
| 即時削除（危険）         | 2 回目の確認なしに即座に削除します                                     |

保存はコアのプラグインカードと同じ規則に従います。

- 選択はドラフトにすぎず、**Save** を押したときに書き込まれ、**Discard** でドラフトを破棄します。
- 保存に成功すると、profile の `cordis.patch.yml` にある `id: delete-session` 行の `config` エントリに書き込まれるため（設定名前空間はこの profile エントリ id です）、再起動しても保持されます。
  ```yaml
  - id: delete-session
    config:
      confirmMode: click-again   # click-again | dialog | instant
  ```
- ユーザー層でフィールドが上書きされている場合、カードには「カスタマイズ済み」バッジが表示され、**既定値に戻す**で上書きを解除して既定値を再び継承できます。
- 保存に失敗した場合（書き込みが許可されていないデプロイなど）はドラフトを保持して失敗を報告し、黙って破棄することはありません。

実装方法：設定名前空間は、このバンドルの `cordis.patch.yml` が宣言する profile エントリ id `delete-session` そのものであり、Host 側（`index.js`）が自身の schemastery `Config` でスキーマを宣言します（`confirmMode` フィールド、`.volatile()` 指定）。`settings.installSection` / `settings.register` / `settings.get` はもうありません。ブラウザー側は `ctx.configForms.get("delete-session")`（`getSnapshot` / `subscribe` / `set` / `unset`）でその名前空間を読み書きし、カードを公式の `plugins.bundle.config` スロットに登録します（キーは npm パッケージ名 `@kagurazakayashi/dsh-delete-session`、`@deepseek-ai/dsh-client-ui-plugin-manager` が提供します）。settings サービスがないデプロイではカードが表示されなくなるだけで、削除機能はそのまま動作します。

> 保存した値はすぐに有効になります。次の「Delete session」クリックをどのように確認するかを決めるのはこの値です。カード内の未保存のドラフトは、Save を押すまで削除には影響しません。

> カードが見つからない場合は、まず 2 点を確認してください。**Installed** の下でプラグインの**名前**をクリックして詳細ページを開くこと（トグルではありません）、そして一覧の読み込みに時間がかかる可能性を考慮することです。背景画像つきのスキンが有効な場合、ページの文字はその上に描画されて読みにくくなります（Plugins ページ自体は不透明な背景を描画せず、カードは自身の背景を保ちます）。スキンを一時的に切り替えるか無効にすると、格段に読みやすくなります。

## インストール

### ワンコマンドインストール（推奨）

```bash
dsh plugin --profile web add @kagurazakayashi/dsh-delete-session
```

このコマンドは npm からプラグインを取得し、profile のバンドル一覧に自動で登録します（手動での設定編集は不要です）。

### ソースからインストール

このプラグインは `dsh-archive-manager` と同じ構成です。ディスク上に置いてから、既存の `web` profile に追加します。

1. プラグインのソースをディスク上の任意の場所に置きます（Windows の例）。

   ```
   C:\Users\<you>\.dsh\plugins\dsh-delete-session
   ```

   （macOS / Linux では `~/.dsh/plugins/dsh-delete-session` です。）

2. dsh を使って `web` profile に追加します。

   ```bash
   # Windows (replace <you> with your username)
   dsh plugin --profile web add "C:\Users\<you>\.dsh\plugins\dsh-delete-session"

   # macOS / Linux
   dsh plugin --profile web add "~/.dsh/plugins/dsh-delete-session"
   ```

3. `$DSH_HOME/profiles/web/package.json` のバンドル一覧にこのプラグインが含まれていることを確認します。新しい dsh は `add` 時に自動で追加します。追加されていない場合は手動で追記してください。

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

   `dependencies` のエントリは `dsh plugin --profile web add` が書き込みます。`dsh.profile.bundles` が自動で追加されない場合は手動で追記してください。

4. プラグインの `cordis.patch.yml`（`dsh.bundle.patch` で宣言）が host 行を注入します。

   ```yaml
   - insert:
       - id: delete-session
         name: '@kagurazakayashi/dsh-delete-session'
   ```

## 再起動で有効化

実行中のプロセスは新しいバンドル行を読み込まないため、web profile を再起動します。

```bash
dsh web
```

ページを更新した後、任意のセッション行の `…` メニューを開くと、対象となる行では **Archive session** の下に **Delete session** が表示されます。既定の方式では 1 回目のクリックで警告状態になり、もう一度クリックすると削除されます。ほかの方式では、それぞれ対応する確認フローが適用されます。

サイドバーの **Plugins** ページにあるこのプラグインのカード（このプラグイン自身のページ）も再起動後に表示されます（このページには Host が提供している名前空間の項目だけが表示されます）。

## 注意事項（安全性と制限）

- **実行中のセッションは拒否**：`ctx.agents.get(id)?.status !== 'idle'` なら 409 を返し、削除の直前にもう一度チェックします。メモリー内に残っているアイドル状態のセッションだけが対象外です。
- **削除前の自動アーカイブ**：破壊的な `rm` の前に `workspaceRegistry.archiveSession(id)` を呼び出します。これによりサイドバーは `host/archived-sessions-changed` ブロードキャストでそのセッションを即座に非表示にし（クライアントは現在の選択も自動で解除します）、再起動まで一覧に残り続けることを防ぎます。アーカイブは冪等で、失敗しても削除の主処理は妨げられません。
- **セッション特定の戦略**：コアは `supportsRawArtifacts` フラグを公開しなくなりました。プラグインはまず JSONL バックエンドの公開 API `resolveCurrentLog(id)`（非同期で、現在の形式世代のログの絶対パスを返します）を呼び出します。まだ移行されていない、ファイル名に `vN` マーカーがないセッションでは `undefined` を返すため（このマシンでは既存 89 セッションのうち新しい形式は 4 つだけでした）、実行時にもまだ存在するバックエンドの `locate(header)`（`{ kind, path }` を返します）にフォールバックします。どちらもパスを返さない場合は 501 を返します。バックエンドが `kind: 'jsonl'` と `path` の診断情報を含むエラーを投げた場合（新しいバージョンのログなど）、プラグインはそのパスを再利用して削除を完了します。
- **削除するのはセッションディレクトリだけ**：`rm(dirname(logPath), { recursive: true, force: false })`。削除の前にアーカイブマーカーを書き込みますが、ワークスペースのグループ、投影キャッシュ、共有添付ファイルには触れません。削除の前に、対象ディレクトリ名が**セッション id と完全に一致すること**を検証します（バックエンドは `encodeSegment(id)` で命名し、セッション id には `[A-Za-z0-9._-]` しか含まれません）。そのため、プロジェクトディレクトリ全体を再帰的に削除してしまうことはありません。
- **復元不可**：削除は再帰的な `rm` で、ごみ箱はありません。慎重に操作してください。
- **メモリー内の 2 段階状態**（`click-again` モードのみ）：警告状態はブラウザーのメモリー内にだけ存在し（セッション id ごと、8 秒のウィンドウ）、プラグインのアンマウント、ページの更新、タイムアウトで消えます。永続的な状態は生成しません。ほかの方式に切り替えると表示されなくなります。
- **公式のセッションメニュースロットを使用し、DOM 注入は行わない**：プラグインは `sidebar.workspaces.session.menu.item` の一覧に通常の項目を 1 つ提供します（登録 id `delete-session`、order `450`）。host のメニューはこれを 1 つの `role="menuitem"` ボタンとして描画します。スロットは `{ sessionId, displayTitle }` と `useMenuOpenState` フックを提供するため、プラグインは正確なセッション id を取得できます。行の `…` ボタンのクリックを捕捉することも、`document.body` に `MutationObserver` を仕掛けることも、行の `aria-label`（`会话“{name}”的操作` / `Session actions for {name}`）を解析することも、コアの相対時間のバケット化を再実装することも、「Archive session」項目を複製することもありません。キーボード操作、フォーカスの復帰、メニューの閉じ方は host のメニューが処理するため、DOM 構造にもローカライズされたテキストにも依存しません。
- **利用可否はスロットに従う**：host がセッションメニューを描画する場所ならどこでも項目は表示されます。プラグインはそのスロットが宣言されるのを待つため、`@deepseek-ai/dsh-client-ui-workspace` を組み込んでいないデプロイには痕跡を残しません。

## バージョン互換性

このプラグインが対象とする DSH のバージョンと実行環境です。

| 項目                   | バージョン / 備考                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 対象の DSH core        | 最低 `0.2.0-rc.1`（すべての `@deepseek-ai/dsh*` peer は `>=0.2.0-rc.1 <0.3.0-0`）。`0.2.0-rc.2` で動作確認済み                                                                                                                            |
| プラグインのバージョン | `1.2.1`                                                                                                                                                                                                                                   |
| 設定サービス           | `@deepseek-ai/dsh-settings`（Host）と `@deepseek-ai/dsh-client-ui-settings`（`ctx.configForms`）。任意：ない場合は設定カードが表示されないだけです                                                                                        |
| 永続化バックエンド     | `@deepseek-ai/dsh-session-persistence-jsonl`（`resolveCurrentLog` または `locate` を提供する必要があります）                                                                                                                              |
| クライアント注入依存   | `@deepseek-ai/dsh-api-session-controller`、`@deepseek-ai/dsh-client-locale`、`@deepseek-ai/dsh-client-ui-plugin-manager`、`@deepseek-ai/dsh-client-ui-settings`、`@deepseek-ai/dsh-client-ui-workspace`                                   |
| 提供するスロット       | `sidebar.workspaces.session.menu.item`（登録 id `delete-session`、order `450`、`@deepseek-ai/dsh-client-ui-workspace` が宣言）; `plugins.bundle.config`（npm パッケージ名をキーとし、`@deepseek-ai/dsh-client-ui-plugin-manager` が宣言） |

`1.0.4` で取り込んだ core の破壊的変更：

| core の変更                    | 旧用法（≤ `1.0.3`）                    | 新用法（`1.0.4`）                                                    |
| ------------------------------ | --------------------------------------- | -------------------------------------------------------------------- |
| セッション一覧スナップショット | `list()` の各項目のトップレベル `id`    | `list()` の各項目の `header.id`                                      |
| セッションログの特定           | `supportsRawArtifacts` + `locate(meta)` | まず `resolveCurrentLog(id)`、次に `locate(header)` へフォールバック |
| ワークスペーススナップショット | `workspaces.baselinesReady`             | `workspaces.phase === "ready"` のみ                                  |
| ワークスペースの更新           | `workspaces.refresh()`                  | 廃止。更新するのは `sessions` のみ                                   |

`1.2.0` で取り込んだ core の破壊的変更：

| core の変更            | 旧用法（≤ `1.1.0`）                                                                                                             | 新用法（`1.2.0`）                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 設定名前空間とスキーマ | Host 側の `ctx.settings.installSection`。名前空間は設定セクション                                                                | 名前空間は profile エントリ id `delete-session`。Host 側が自身の schemastery `Config`（`confirmMode`、`.volatile()` 指定）を宣言                           |
| 値の読み書き           | `ctx.settingsScope.bind({ namespace: 'delete-session' })`                                                                        | `ctx.configForms.get("delete-session")`（`getSnapshot` / `subscribe` / `set` / `unset`）                                                                   |
| 設定カードのスロット   | `settings.plugin.item`、名前空間をキーとする                                                                                     | `plugins.bundle.config`、npm パッケージ名をキーとし、`@deepseek-ai/dsh-client-ui-plugin-manager` が提供                                                    |
| セッションメニュー項目 | DOM 注入：クリック捕捉、`document.body` への `MutationObserver`、`aria-label` の解析、相対時間のバケット化、アーカイブ項目の複製 | `sidebar.workspaces.session.menu.item`、登録 id `delete-session`、order `450`。スロットが `{ sessionId, displayTitle }` と `useMenuOpenState` フックを提供 |
| 設定の永続化先         | `$DSH_HOME/settings.yaml` の `delete-session:` セクション                                                                        | profile の `cordis.patch.yml` にある `id: delete-session` 行の `config:` エントリ                                                                          |
| クライアント注入依存   | `dsh-api-session-controller`、`dsh-api-workspace-controller`、`dsh-client-ui-settings`、`dsh-client-ui-workspace`                | 不要になった `dsh-api-workspace-controller` を削除し、`dsh-client-locale` と `dsh-client-ui-plugin-manager` を追加                                         |

| プラグインのバージョン | 使用可能な core のバージョン | 根拠                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1.2.1`                | `>= 0.2.0-rc.1 < 0.3.0-0`    | プラグイン表示メタデータを追加：`locale/{en,zh}.json` がローカライズされたプラグイン名と概要を、`icon.svg` が Plugins ページの画像を提供します。設定の仕組みは `1.2.0` と同じです                                                                                                                        |
| `1.2.0`                | `>= 0.2.0-rc.1 < 0.3.0-0`    | プラグインを dsh 0.2.x に対応：設定名前空間は profile エントリ id `delete-session` で、宣言的な schemastery `Config` を使い、カードは `ctx.configForms` で読み書きし、メニュー項目とカードはどちらも公式スロットに乗ります。`0.1.x` はサポートしません。0.1.x の設定 API は `0.2.0` で削除されたためです |
| `1.1.0`                | `>= 0.1.3-alpha.2 < 0.2.0-0` | `1.0.4` と同じ。`delete-session` 設定名前空間（削除確認のカード）を追加し、3 つの確認方式（もう一度クリック / ダイアログ / 即時削除）が実際に削除を制御するようにしました。0.1.x の設定 API を使うため、`0.2.0` 以降では動作しません                                                                     |
| `1.0.4`                | `>= 0.1.3-alpha.2 < 0.2.0-0` | `sessionPersistence.list()` がそのバージョンから `SessionPersistenceSnapshot` を返し（id は `header.id`）、`resolveCurrentLog()` も同じバージョンから利用できます                                                                                                                                        |
| `1.0.3`                | `<= 0.1.2-rc.1`              | その範囲では `list()` が `SessionHeader[]` を返し（id はトップレベル）、`locate()` / `supportsRawArtifacts` もまだ基底クラスの公開 API です                                                                                                                                                              |

範囲は重なりません。`0.1.3-alpha.2` は `list()` の戻り値を変更し、同じリリースで基底クラスの `locate()` / `supportsRawArtifacts` を削除したため、`1.0.3` と `1.0.4` の両方が動作する core のバージョンは存在しません。`1.0.4` は `0.1.2-rc.1` 以前では使えず、`1.2.0` は `0.2.x` を要求します。`1.1.0` 以前は `0.2.0` 以降で動作しません。0.1.x の設定 API（`settings.installSection` / `settingsScope` / `settings.plugin.item` スロット）が `0.2.0` で削除されたためです。

**`0.1.x` からの移行**：dsh `0.2.0` は、インポートの実行時に構成へ存在する profile エントリ id についてだけ、古い `$DSH_HOME/settings.yaml` のセクションをインポートします。そのインポートは一度きりで、すでに実行済みです。したがって `settings.yaml.imported` に残っている `delete-session:` セクションは、[プラグイン設定](#プラグイン設定削除の確認方式)の YAML スニペットを使って手動で profile の `cordis.patch.yml` に移す必要があります。

## アンインストール

profile の `dsh.profile.bundles`（および `dependencies`）から `@kagurazakayashi/dsh-delete-session` を削除して再起動します。プラグインが残す永続的な痕跡は、profile の `cordis.patch.yml` にある `id: delete-session` 行の `config:` エントリだけです（確認方式を保存した後にのみ書き込まれます）。完全に消したい場合はそのエントリも削除してください。

## License

MIT — [LICENSE](LICENSE) を参照してください。著作権は KagurazakaYashi(KagurazakaMiyabi) に帰属します。

## 言語

- [English (United States)](README.md)
- [简体中文（中国大陆）](README.zh-CN.md)
- [繁體中文（台灣）](README.zh-TW.md)
- 日本語
