# Discord Minecraft Server Management Bot

MinecraftサーバーのPterodactylパネルと連携し、Discord上でサーバー貸出申請から返却までを自動化するDiscord Botです。

## 🚀 機能

### ユーザー向け機能
- **サーバー貸出申請フォーム** (`/server-rental`)
  - Discord上でサーバーの貸出申請を行える
  - 申請者、主催者、パネル権限付与対象ユーザーの3種類のユーザータイプに対応
  - Minecraftバージョン、期間、用途の詳細入力

### 管理者向け機能
- **申請管理** (`/server-admin applications`)
  - 承認待ち申請一覧の表示
  - ワンクリック承認/却下システム
  - 自動メール設定とPterodactylユーザー作成

- **システム状況表示** (`/server-admin status`)
  - 現在のサーバー使用状況
  - アクティブな申請数の確認

- **返却管理** (`/server-admin returns`)
  - 返却待ちサーバー一覧
  - バックアップ選択機能
  - Google Driveへの自動バックアップ保存

### 自動化機能
- **期限切れリマインド通知**
  - 主催者への期限切れ前通知（設定可能）
  - 期限切れ時の自動ステータス変更

- **サーバー自動割り当て**
  - Pterodactylパネル上でのユーザー作成
  - 自動サーバー割り当てとDiscordロール付与

- **バックアップ・返却処理**
  - 管理者による選択式バックアップ作成
  - RCloneを使用したGoogle Driveへの自動バックアップ
  - サーバー初期化と権限剥奪の自動実行

## 📦 セットアップ

### 前提条件
- Node.js 18+
- PostgreSQL（または他のPrisma対応データベース）
- Pterodactyl Panel
- Google Drive（バックアップ保存用）
- RClone（Google Drive連携用）

### インストール

1. リポジトリをクローン:
   ```bash
   git clone <repository-url>
   cd discord-mcserver-wizard
   ```

2. 依存関係をインストール:
   ```bash
   npm install
   ```

3. データベースを初期化:
   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

4. 設定ファイルを作成:
   ```bash
   cp run/config.example.toml run/config.toml
   cp .env.example .env
   ```

### 設定

#### .env ファイル
```env
DISCORD_TOKEN=your_discord_bot_token
DATABASE_URL="postgresql://username:password@localhost:5432/database"
```

#### run/config.toml ファイル
```toml
# Discord Guild IDs
guild_ids = ["your_guild_id"]

# Pterodactyl Panel設定
[pterodactyl]
api_url = "https://panel.example.com"
api_key = "ptlc_your_api_key_here"
excluded_discord_users = ["123456789012345678"] # 管理者のDiscordユーザーID

# Discord設定
[discord]
panel_role_id = "role_id_here" # パネルアクセス用ロールID
admin_role_ids = ["admin_role_id"] # 管理者ロールID

# Google Drive設定
[google_drive]
folder_path = "企画鯖ワールドデータ" # バックアップ保存先フォルダ

# リマインダー設定
[reminders]
days_before_expiry = [3, 1] # 期限切れ何日前にリマインドするか
reminder_channel_id = "channel_id_here" # リマインド送信先チャンネル
```

### 起動

```bash
npm run start
```

開発モードで起動:
```bash
npm run dev
```

## 🗂️ プロジェクト構造

```
discord-mcserver-wizard/
├── prisma/
│   └── schema.prisma          # データベーススキーマ
├── src/
│   ├── commands/
│   │   ├── admin/             # 管理者向けコマンド
│   │   ├── server_rental/     # サーバー貸出申請コマンド
│   │   └── base/              # コマンドベースクラス
│   ├── services/
│   │   ├── PterodactylService.ts      # Pterodactyl API連携
│   │   ├── ServerAssignmentService.ts # サーバー割り当て処理
│   │   ├── ReminderService.ts         # リマインダー機能
│   │   └── BackupService.ts           # バックアップ・返却処理
│   ├── utils/
│   │   ├── config.ts          # 設定管理
│   │   ├── database.ts        # データベース接続
│   │   └── log.ts             # ログ設定
│   ├── eventHandler.ts        # Discord イベントハンドラー
│   └── index.ts               # エントリーポイント
├── run/
│   └── config.example.toml    # 設定ファイルテンプレート
└── spec/
    └── 要件定義書.md          # 詳細な要件定義
```

## 🎮 使用方法

### ユーザー操作
1. `/server-rental` コマンドでサーバー貸出申請
2. モーダルフォームに必要事項を入力
3. 管理者の承認を待機
4. 承認後、自動的にサーバーが割り当てられDiscordロールが付与

### 管理者操作
1. `/server-admin applications` で承認待ち申請を確認
2. 承認/却下ボタンで申請を処理
3. `/server-admin returns` で返却待ちサーバーを確認
4. バックアップを選択して返却処理を実行

## 🔧 開発

### リント・フォーマット
```bash
npm run lint
npm run prettier
```

### データベース操作
```bash
# マイグレーション作成
npx prisma migrate dev --name migration_name

# データベースリセット
npx prisma migrate reset

# Prisma Studio起動
npx prisma studio
```

## 📝 ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 🤝 貢献

バグ報告や機能提案は、GitHubのIssuesでお願いします。

## 📚 詳細仕様

詳細な要件定義については `spec/要件定義書.md` を参照してください。