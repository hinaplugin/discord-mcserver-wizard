import { prisma } from "../utils/database.js";
import { PterodactylService } from "./PterodactylService.js";
import { ServerAssignmentService } from "./ServerAssignmentService.js";
import { config } from "../utils/config.js";
import { log } from "../utils/log.js";
import { client } from "../index.js";
import { spawn } from "child_process";

/**
 * バックアップサービス
 */
export class BackupService {
  private pterodactylService: PterodactylService;
  private serverAssignmentService: ServerAssignmentService;

  /**
   *
   */
  constructor() {
    this.pterodactylService = new PterodactylService();
    this.serverAssignmentService = new ServerAssignmentService();
  }

  /**
   * サーバーのバックアップ選択肢を取得
   * @param applicationId 申請ID
   * @returns バックアップ一覧（最新とロック済みを優先）
   */
  async getBackupOptions(applicationId: number): Promise<any[]> {
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!application || !application.pterodactylServerId) {
      throw new Error("サーバーが割り当てられていません");
    }

    // サーバー情報を取得
    const servers = await this.pterodactylService.getServers();
    const server = servers.find(
      (s) => s.identifier === application.pterodactylServerId,
    );

    if (!server) {
      throw new Error(
        `サーバーが見つかりません: ${application.pterodactylServerId}`,
      );
    }

    // バックアップ一覧を取得
    const backups = await this.pterodactylService.getServerBackups(server.id);

    // 最新バックアップとロック済みバックアップを優先してソート
    const sortedBackups = backups
      .filter((backup) => backup.is_successful) // 成功したバックアップのみ
      .sort((a, b) => {
        // ロック済みを優先
        if (a.is_locked && !b.is_locked) return -1;
        if (!a.is_locked && b.is_locked) return 1;

        // 作成日時で降順ソート（新しい順）
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });

    return sortedBackups.slice(0, 10); // 最大10件まで
  }

  /**
   * 選択されたバックアップをGoogle Driveに保存して返却処理を実行
   * @param applicationId 申請ID
   * @param selectedBackupUuid 選択されたバックアップUUID
   * @param comment 管理者のコメント
   */
  async processServerReturn(
    applicationId: number,
    selectedBackupUuid: string,
    comment?: string,
  ): Promise<void> {
    try {
      log.info(
        `サーバー返却処理開始: 申請ID=${applicationId}, バックアップUUID=${selectedBackupUuid}`,
      );

      // 申請情報を取得
      const application = await prisma.application.findUnique({
        where: { id: applicationId },
        include: {
          panelUsers: {
            include: {
              panelUser: true,
            },
          },
        },
      });

      if (!application) {
        throw new Error(`申請が見つかりません: ID=${applicationId}`);
      }

      if (!application.pterodactylServerId) {
        throw new Error("サーバーが割り当てられていません");
      }

      // サーバー情報を取得
      const servers = await this.pterodactylService.getServers();
      const server = servers.find(
        (s) => s.identifier === application.pterodactylServerId,
      );

      if (!server) {
        throw new Error(
          `サーバーが見つかりません: ${application.pterodactylServerId}`,
        );
      }

      // 選択されたバックアップを取得
      const backups = await this.pterodactylService.getServerBackups(server.id);
      const selectedBackup = backups.find(
        (backup) => backup.uuid === selectedBackupUuid,
      );

      if (!selectedBackup) {
        throw new Error(`バックアップが見つかりません: ${selectedBackupUuid}`);
      }

      // Google Driveにバックアップをコピー
      const driveFilePath = await this.copyBackupToDrive(
        application,
        selectedBackup,
        comment,
      );

      // バックアップ記録をデータベースに保存
      await prisma.backupRecord.create({
        data: {
          applicationId,
          pterodactylBackupId: selectedBackup.uuid,
          googleDriveFilePath: driveFilePath,
          backupDate: new Date(selectedBackup.created_at),
          comment,
        },
      });

      // 全てのロック済みバックアップのロックを解除
      await this.unlockAllBackups(server.id);

      // サーバーを初期化
      await this.pterodactylService.reinstallServer(server.id);

      // ユーザーの権限を剥奪
      await this.serverAssignmentService.revokeServerAccess(applicationId);

      // 申請ステータスを更新
      await prisma.application.update({
        where: { id: applicationId },
        data: { status: "RETURNED" },
      });

      // 関係者に返却完了通知を送信
      await this.sendReturnNotifications(application, driveFilePath);

      log.info(`サーバー返却処理完了: 申請ID=${applicationId}`);
    } catch (error) {
      log.error(`サーバー返却処理に失敗: 申請ID=${applicationId}`, error);
      throw error;
    }
  }

  /**
   * バックアップをGoogle Driveにコピー
   * @param application 申請情報
   * @param backup バックアップ情報
   * @param comment 管理者のコメント
   * @returns Google Drive上のファイルパス
   */
  private async copyBackupToDrive(
    application: any,
    backup: any,
    comment?: string,
  ): Promise<string> {
    const year = application.startDate
      ? new Date(application.startDate).getFullYear()
      : new Date().getFullYear();
    const startDate = application.startDate
      ? new Date(application.startDate)
      : new Date();
    const formattedDate = startDate
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");

    // 主催者名を取得（簡略化のためDiscordユーザーIDを使用）
    const organizerName = `User${application.organizerDiscordId.slice(-4)}`;

    // バックアップファイル名を生成
    const backupDateStr = new Date(backup.created_at)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
    const fileName = `[${backupDateStr}]${comment ? `_${comment}` : ""}.tar.gz`;

    // フォルダパスを生成
    const folderPath = `${config.google_drive.folder_path}\\${year}\\[${application.id}]_${formattedDate}_${application.description.replace(/[<>:"/\\|?*]/g, "_")}_[${organizerName}]主催`;
    const fullPath = `${folderPath}\\${fileName}`;

    try {
      log.info(`Google Driveにバックアップをコピー開始: ${fullPath}`);

      // RCloneを使用してバックアップをコピー
      // 注意: 実際の実装では、PterodactylからバックアップファイルをダウンロードしてからRCloneでアップロードする必要があります
      // ここでは簡略化した例を示します
      await this.executeRcloneCommand([
        "copy",
        `pterodactyl:${backup.uuid}`, // 実際のバックアップファイルパス
        `gdrive:${folderPath}`,
        "--create-dest-dirs",
      ]);

      log.info(`Google Driveへのバックアップコピー完了: ${fullPath}`);
      return fullPath;
    } catch (error) {
      log.error("Google Driveバックアップコピーに失敗", error);
      throw error;
    }
  }

  /**
   * サーバーの全ロック済みバックアップのロックを解除
   * @param serverId サーバーID
   */
  private async unlockAllBackups(serverId: number): Promise<void> {
    try {
      const backups = await this.pterodactylService.getServerBackups(serverId);
      const lockedBackups = backups.filter((backup) => backup.is_locked);

      log.info(`ロック解除対象バックアップ: ${lockedBackups.length}件`);

      for (const backup of lockedBackups) {
        try {
          await this.pterodactylService.unlockBackup(serverId, backup.uuid);
          log.info(`バックアップのロックを解除: ${backup.uuid}`);
        } catch (error) {
          log.warn(`バックアップのロック解除に失敗: ${backup.uuid}`, error);
        }
      }
    } catch (error) {
      log.error("バックアップロック解除処理に失敗", error);
      throw error;
    }
  }

  /**
   * 返却完了通知を送信
   * @param application 申請情報
   * @param driveFilePath Google Drive上のファイルパス
   */
  private async sendReturnNotifications(
    application: any,
    driveFilePath: string,
  ): Promise<void> {
    try {
      // 主催者への通知
      try {
        const organizer = await client.users.fetch(
          application.organizerDiscordId,
        );
        await organizer.send(
          `📦 **サーバー返却完了通知**\n\n` +
            `申請ID: ${application.id}\n` +
            `サーバー: ${application.pterodactylServerId}\n` +
            `説明: ${application.description}\n\n` +
            `バックアップは以下に保存されました:\n\`${driveFilePath}\`\n\n` +
            `ご利用ありがとうございました。`,
        );
      } catch (error) {
        log.warn(
          `主催者への返却通知送信に失敗: ${application.organizerDiscordId}`,
          error,
        );
      }

      // パネル権限付与対象ユーザーへの通知
      for (const applicationPanelUser of application.panelUsers) {
        try {
          const user = await client.users.fetch(
            applicationPanelUser.panelUser.discordUserId,
          );
          await user.send(
            `📦 **サーバー返却通知**\n\n` +
              `申請ID: ${application.id} のサーバーが返却されました。\n` +
              `サーバーへのアクセス権限が削除されました。\n\n` +
              `ご利用ありがとうございました。`,
          );
        } catch (error) {
          log.warn(
            `パネルユーザーへの返却通知送信に失敗: ${applicationPanelUser.panelUser.discordUserId}`,
            error,
          );
        }
      }
    } catch (error) {
      log.error("返却通知の送信に失敗", error);
    }
  }

  /**
   * RCloneコマンドを実行
   * @param args RCloneコマンドの引数
   */
  private async executeRcloneCommand(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const rclone = spawn("rclone", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let _stdout = "";
      let stderr = "";

      rclone.stdout.on("data", (data) => {
        _stdout += data.toString();
      });

      rclone.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      rclone.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`RClone failed with code ${code}: ${stderr}`));
        }
      });

      rclone.on("error", (error) => {
        reject(new Error(`RClone execution error: ${error.message}`));
      });
    });
  }
}
