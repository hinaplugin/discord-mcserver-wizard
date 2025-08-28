import { prisma } from "../utils/database.js";
import { PterodactylService } from "./PterodactylService.js";
import { config } from "../utils/config.js";
import { log } from "../utils/log.js";
import { client } from "../index.js";

/**
 * サーバー割り当てサービス
 */
export class ServerAssignmentService {
  private pterodactylService: PterodactylService;

  /**
   *
   */
  constructor() {
    this.pterodactylService = new PterodactylService();
  }

  /**
   * 申請に対してサーバーを自動割り当て
   * @param applicationId 申請ID
   */
  async assignServerToApplication(applicationId: number): Promise<void> {
    try {
      log.info(`サーバー割り当て開始: 申請ID=${applicationId}`);

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

      // 利用可能なサーバーを検索
      const availableServers =
        await this.pterodactylService.getAvailableServers();
      if (availableServers.length === 0) {
        throw new Error("利用可能なサーバーが見つかりません");
      }

      // 最初の利用可能なサーバーを選択
      const assignedServer = availableServers[0];

      // パネル権限付与対象ユーザーを処理
      for (const applicationPanelUser of application.panelUsers) {
        const panelUser = applicationPanelUser.panelUser;

        // Pterodactylユーザーが既に存在しない場合は作成
        if (
          !panelUser.pterodactylUserId &&
          panelUser.pterodactylUsername &&
          panelUser.pterodactylEmail
        ) {
          try {
            const createdUser = await this.pterodactylService.createUser(
              panelUser.pterodactylUsername,
              panelUser.pterodactylEmail,
            );

            // PterodactylユーザーIDを更新
            await prisma.panelUser.update({
              where: { id: panelUser.id },
              data: { pterodactylUserId: createdUser.id },
            });

            panelUser.pterodactylUserId = createdUser.id;
            log.info(
              `Pterodactylユーザーを作成しました: ${panelUser.pterodactylUsername} (ID: ${createdUser.id})`,
            );
          } catch (error) {
            log.error(
              `Pterodactylユーザー作成に失敗: ${panelUser.pterodactylUsername}`,
              error,
            );
            throw error;
          }
        }

        // サーバーに権限を付与
        if (panelUser.pterodactylUserId) {
          try {
            await this.pterodactylService.addServerUser(
              assignedServer.id,
              panelUser.pterodactylUserId,
            );
            log.info(
              `サーバー権限を付与: ユーザー${panelUser.pterodactylUsername} -> サーバー${assignedServer.identifier}`,
            );
          } catch (error) {
            log.error(
              `サーバー権限付与に失敗: ユーザー${panelUser.pterodactylUsername}`,
              error,
            );
            throw error;
          }
        }

        // Discordロールを付与
        await this.assignDiscordRole(panelUser.discordUserId);
      }

      // 申請にサーバー情報を記録
      await prisma.application.update({
        where: { id: applicationId },
        data: { pterodactylServerId: assignedServer.identifier },
      });

      // 関係者への通知を送信
      await this.sendAssignmentNotifications(application, assignedServer);

      log.info(
        `サーバー割り当て完了: 申請ID=${applicationId}, サーバー=${assignedServer.identifier}`,
      );
    } catch (error) {
      log.error(`サーバー割り当てに失敗: 申請ID=${applicationId}`, error);
      throw error;
    }
  }

  /**
   * Discordロールをユーザーに付与
   * @param discordUserId DiscordユーザーID
   */
  private async assignDiscordRole(discordUserId: string): Promise<void> {
    try {
      // 既にロールが付与されているかチェック
      const panelUser = await prisma.panelUser.findUnique({
        where: { discordUserId },
      });

      if (panelUser?.hasDiscordRole) {
        log.info(`既にDiscordロールが付与済み: ${discordUserId}`);
        return;
      }

      // 各ギルドでロールを付与
      for (const guildId of config.guild_ids) {
        try {
          const guild = await client.guilds.fetch(guildId);
          const member = await guild.members.fetch(discordUserId);
          const role = await guild.roles.fetch(config.discord.panel_role_id);

          if (role && !member.roles.cache.has(role.id)) {
            await member.roles.add(role);
            log.info(
              `Discordロールを付与: ${member.user.tag} in ${guild.name}`,
            );
          }
        } catch (error) {
          log.warn(
            `Discordロール付与に失敗: ギルド${guildId}, ユーザー${discordUserId}`,
            error,
          );
        }
      }

      // データベースのフラグを更新
      await prisma.panelUser.update({
        where: { discordUserId },
        data: { hasDiscordRole: true },
      });
    } catch (error) {
      log.error(`Discordロール付与処理に失敗: ${discordUserId}`, error);
      // ロール付与の失敗はサーバー割り当て全体を止めない
    }
  }

  /**
   * サーバー割り当て通知を送信
   * @param application 申請情報
   * @param server 割り当てられたサーバー
   */
  private async sendAssignmentNotifications(
    application: any,
    server: any,
  ): Promise<void> {
    try {
      // 主催者への通知
      try {
        const organizer = await client.users.fetch(
          application.organizerDiscordId,
        );
        await organizer.send(
          `🎉 **サーバー割り当て完了通知**\n\n` +
            `申請ID: ${application.id}\n` +
            `割り当てサーバー: **${server.name}** (${server.identifier})\n` +
            `説明: ${application.description}\n` +
            `期間: ${application.requestedPeriod}日\n\n` +
            `サーバーパネルにアクセスして設定を開始してください。`,
        );
      } catch (error) {
        log.warn(
          `主催者への通知送信に失敗: ${application.organizerDiscordId}`,
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
            `🎉 **サーバーアクセス権付与通知**\n\n` +
              `申請ID: ${application.id}\n` +
              `サーバー: **${server.name}** (${server.identifier})\n` +
              `あなたのPterodactylユーザー名: ${applicationPanelUser.panelUser.pterodactylUsername}\n\n` +
              `サーバーパネルにアクセス可能になりました。`,
          );
        } catch (error) {
          log.warn(
            `パネルユーザーへの通知送信に失敗: ${applicationPanelUser.panelUser.discordUserId}`,
            error,
          );
        }
      }
    } catch (error) {
      log.error("サーバー割り当て通知の送信に失敗", error);
      // 通知の失敗はサーバー割り当て全体を止めない
    }
  }

  /**
   * サーバーからユーザーの権限を剥奪
   * @param applicationId 申請ID
   */
  async revokeServerAccess(applicationId: number): Promise<void> {
    try {
      log.info(`サーバー権限剥奪開始: 申請ID=${applicationId}`);

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
        log.warn(`サーバーが割り当てられていません: 申請ID=${applicationId}`);
        return;
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

      // パネル権限付与対象ユーザーの権限を剥奪
      for (const applicationPanelUser of application.panelUsers) {
        const panelUser = applicationPanelUser.panelUser;

        if (panelUser.pterodactylUserId) {
          // 除外ユーザーでない場合のみ権限を剥奪
          if (
            !this.pterodactylService.isExcludedUser(panelUser.discordUserId)
          ) {
            try {
              await this.pterodactylService.removeServerUser(
                server.id,
                panelUser.pterodactylUserId,
              );
              log.info(
                `サーバー権限を剥奪: ユーザー${panelUser.pterodactylUsername} -> サーバー${server.identifier}`,
              );
            } catch (error) {
              log.error(
                `サーバー権限剥奪に失敗: ユーザー${panelUser.pterodactylUsername}`,
                error,
              );
            }
          } else {
            log.info(
              `除外ユーザーのため権限剥奪をスキップ: ${panelUser.pterodactylUsername} (Discord: ${panelUser.discordUserId})`,
            );
          }
        }
      }

      log.info(`サーバー権限剥奪完了: 申請ID=${applicationId}`);
    } catch (error) {
      log.error(`サーバー権限剥奪に失敗: 申請ID=${applicationId}`, error);
      throw error;
    }
  }
}
