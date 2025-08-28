import { prisma } from "../utils/database.js";
import { config } from "../utils/config.js";
import { log } from "../utils/log.js";
import { client } from "../index.js";
import { EmbedBuilder } from "discord.js";

/**
 * リマインダーサービス
 */
export class ReminderService {
  /**
   * 期限切れ予定のサーバーをチェックしてリマインド通知を送信
   */
  async checkAndSendReminders(): Promise<void> {
    try {
      log.info("期限切れチェック・リマインド通知を開始");

      // 期限切れ予定のサーバーを検索
      const now = new Date();
      const reminderDays = config.reminders.days_before_expiry;

      for (const days of reminderDays) {
        const targetDate = new Date();
        targetDate.setDate(now.getDate() + days);
        targetDate.setHours(23, 59, 59, 999); // 対象日の終了時刻

        const startOfTargetDay = new Date(targetDate);
        startOfTargetDay.setHours(0, 0, 0, 0);

        // 対象日に期限切れになる申請を検索
        const expiringApplications = await prisma.application.findMany({
          where: {
            status: "ACTIVE",
            endDate: {
              gte: startOfTargetDay,
              lte: targetDate,
            },
          },
          include: {
            panelUsers: {
              include: {
                panelUser: true,
              },
            },
          },
        });

        log.info(
          `${days}日後に期限切れの申請: ${expiringApplications.length}件`,
        );

        // 各申請の主催者にリマインド送信
        for (const application of expiringApplications) {
          await this.sendExpirationReminder(application, days);
        }
      }

      // 既に期限切れのサーバーをNEEDS_BACKUPステータスに変更
      await this.updateExpiredServers();

      log.info("期限切れチェック・リマインド通知を完了");
    } catch (error) {
      log.error("リマインダー処理中にエラーが発生しました:", error);
    }
  }

  /**
   * 期限切れリマインド通知を送信
   * @param application 申請情報
   * @param daysUntilExpiry 期限切れまでの日数
   */
  private async sendExpirationReminder(
    application: any,
    daysUntilExpiry: number,
  ): Promise<void> {
    try {
      const organizer = await client.users.fetch(
        application.organizerDiscordId,
      );

      const embed = new EmbedBuilder()
        .setTitle("🕐 サーバー期限切れ予告通知")
        .setColor(daysUntilExpiry <= 1 ? 0xff4444 : 0xffaa00) // 1日以内なら赤、それ以外は黄色
        .setDescription(
          `あなたが主催するサーバーの期限が近づいています。\n` +
            `**${daysUntilExpiry}日後**に期限切れとなります。`,
        )
        .addFields(
          { name: "申請ID", value: application.id.toString(), inline: true },
          {
            name: "サーバー",
            value: application.pterodactylServerId || "未割り当て",
            inline: true,
          },
          { name: "説明", value: application.description },
          {
            name: "期限日時",
            value: application.endDate.toLocaleString("ja-JP"),
            inline: true,
          },
          {
            name: "パネル権限ユーザー",
            value:
              application.panelUsers
                .map((pu: any) => `<@${pu.panelUser.discordUserId}>`)
                .join(", ") || "なし",
          },
        )
        .setFooter({
          text:
            daysUntilExpiry <= 1
              ? "期限切れ後はサーバーが自動で返却処理されます"
              : "必要に応じて期限延長をご検討ください",
        })
        .setTimestamp();

      await organizer.send({ embeds: [embed] });

      // リマインダーチャンネルにも通知
      if (config.reminders.reminder_channel_id) {
        try {
          const channel = await client.channels.fetch(
            config.reminders.reminder_channel_id,
          );
          if (channel && channel.isTextBased() && "send" in channel) {
            await channel.send({
              content: `🕐 **期限切れ予告**: <@${application.organizerDiscordId}> さんのサーバー（申請ID: ${application.id}）が**${daysUntilExpiry}日後**に期限切れ`,
              embeds: [embed],
            });
          }
        } catch (error) {
          log.warn("リマインダーチャンネルへの通知に失敗", error);
        }
      }

      log.info(
        `期限切れリマインドを送信: 申請ID=${application.id}, 主催者=${application.organizerDiscordId}, ${daysUntilExpiry}日後`,
      );
    } catch (error) {
      log.error(
        `期限切れリマインド送信に失敗: 申請ID=${application.id}`,
        error,
      );
    }
  }

  /**
   * 既に期限切れのサーバーをNEEDS_BACKUPステータスに更新
   */
  private async updateExpiredServers(): Promise<void> {
    const now = new Date();

    const expiredApplications = await prisma.application.findMany({
      where: {
        status: "ACTIVE",
        endDate: {
          lt: now,
        },
      },
    });

    if (expiredApplications.length > 0) {
      log.info(`期限切れサーバーを発見: ${expiredApplications.length}件`);

      // ステータスをNEEDS_BACKUPに更新
      await prisma.application.updateMany({
        where: {
          id: {
            in: expiredApplications.map((app) => app.id),
          },
        },
        data: {
          status: "NEEDS_BACKUP",
        },
      });

      // 管理者チャンネルに通知
      if (config.reminders.reminder_channel_id) {
        try {
          const channel = await client.channels.fetch(
            config.reminders.reminder_channel_id,
          );
          if (channel && channel.isTextBased() && "send" in channel) {
            const embed = new EmbedBuilder()
              .setTitle("⚠️ 期限切れサーバー検出")
              .setColor(0xff4444)
              .setDescription(
                `${expiredApplications.length}件のサーバーが期限切れになりました。\nバックアップ選択・返却処理を実行してください。`,
              )
              .addFields(
                ...expiredApplications.slice(0, 10).map((app) => ({
                  name: `申請ID: ${app.id}`,
                  value: `サーバー: ${app.pterodactylServerId}\n説明: ${app.description.substring(0, 50)}...`,
                  inline: true,
                })),
              )
              .setTimestamp();

            await channel.send({ embeds: [embed] });
          }
        } catch (error) {
          log.warn("期限切れ通知の送信に失敗", error);
        }
      }

      log.info(
        `${expiredApplications.length}件のサーバーをNEEDS_BACKUPステータスに更新`,
      );
    }
  }

  /**
   * 定期実行タスクを開始
   * @param intervalMinutes チェック間隔（分）
   */
  startPeriodicCheck(intervalMinutes: number = 60): void {
    log.info(`リマインダー定期実行を開始: ${intervalMinutes}分間隔`);

    // 初回実行
    setImmediate(() => {
      this.checkAndSendReminders().catch((error) => {
        log.error("リマインダー定期実行中にエラー:", error);
      });
    });

    // 定期実行
    setInterval(
      () => {
        this.checkAndSendReminders().catch((error) => {
          log.error("リマインダー定期実行中にエラー:", error);
        });
      },
      intervalMinutes * 60 * 1000,
    );
  }
}
