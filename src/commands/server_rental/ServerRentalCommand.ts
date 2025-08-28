import {
  ActionRowBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChatInputCommandInteraction,
} from "discord.js";
import { CommandBase } from "../base/command_base.js";
import { prisma } from "../../utils/database.js";
import { log } from "../../utils/log.js";

/**
 * サーバー貸出申請コマンド
 */
export class ServerRentalCommand extends CommandBase {
  public static readonly commandName = "server-rental";

  command = new SlashCommandBuilder()
    .setName(ServerRentalCommand.commandName)
    .setDescription("Minecraftサーバーの貸出を申請します");

  /**
   *
   */
  public constructor() {
    super();
  }

  /**
   *
   * @param interaction
   */
  public async onCommand(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    // 申請フォームのモーダルを表示
    const modal = new ModalBuilder()
      .setCustomId("server-rental-modal")
      .setTitle("サーバー貸出申請");

    // サーバーの説明/用途
    const descriptionInput = new TextInputBuilder()
      .setCustomId("description")
      .setLabel("サーバーの説明/用途")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("例: プライベートサーバーでの建築企画")
      .setRequired(true)
      .setMaxLength(500);

    // Minecraftバージョン
    const versionInput = new TextInputBuilder()
      .setCustomId("minecraft_version")
      .setLabel("希望Minecraftバージョン")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("例: 1.20.1")
      .setRequired(true)
      .setMaxLength(20);

    // 貸出希望期間
    const periodInput = new TextInputBuilder()
      .setCustomId("requested_period")
      .setLabel("貸出希望期間（日数）")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("例: 14")
      .setRequired(true)
      .setMaxLength(3);

    // 主催者のDiscordユーザーID
    const organizerInput = new TextInputBuilder()
      .setCustomId("organizer_id")
      .setLabel("主催者のDiscordユーザーID")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("例: 123456789012345678")
      .setRequired(true)
      .setMaxLength(20);

    // パネル権限付与対象ユーザーのDiscordユーザーID（複数可、改行区切り）
    const panelUsersInput = new TextInputBuilder()
      .setCustomId("panel_users")
      .setLabel("パネル権限付与対象ユーザーのDiscordユーザーID（改行区切り）")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("123456789012345678\n987654321098765432")
      .setRequired(true)
      .setMaxLength(500);

    const firstActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);
    const secondActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(versionInput);
    const thirdActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(periodInput);
    const fourthActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(organizerInput);
    const fifthActionRow =
      new ActionRowBuilder<TextInputBuilder>().addComponents(panelUsersInput);

    modal.addComponents(
      firstActionRow,
      secondActionRow,
      thirdActionRow,
      fourthActionRow,
      fifthActionRow,
    );

    await interaction.showModal(modal);
  }

  /**
   * モーダル送信処理
   * @param interaction
   */
  public static async handleModalSubmit(
    interaction: ModalSubmitInteraction,
  ): Promise<void> {
    if (interaction.customId !== "server-rental-modal") return;

    try {
      // モーダルからデータを取得
      const description = interaction.fields.getTextInputValue("description");
      const minecraftVersion =
        interaction.fields.getTextInputValue("minecraft_version");
      const requestedPeriodStr =
        interaction.fields.getTextInputValue("requested_period");
      const organizerIdStr =
        interaction.fields.getTextInputValue("organizer_id");
      const panelUsersStr = interaction.fields.getTextInputValue("panel_users");

      // バリデーション
      const requestedPeriod = parseInt(requestedPeriodStr);
      if (isNaN(requestedPeriod) || requestedPeriod <= 0) {
        await interaction.reply({
          content: "❌ 貸出期間は正の整数で入力してください",
          ephemeral: true,
        });
        return;
      }

      // パネル権限付与対象ユーザーIDを配列に変換
      const panelUserIds = panelUsersStr
        .split("\n")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      if (panelUserIds.length === 0) {
        await interaction.reply({
          content: "❌ パネル権限付与対象ユーザーを最低1人は指定してください",
          ephemeral: true,
        });
        return;
      }

      // データベースに申請を保存
      const application = await prisma.application.create({
        data: {
          description,
          minecraftVersion,
          requestedPeriod,
          applicantDiscordId: interaction.user.id,
          organizerDiscordId: organizerIdStr,
        },
      });

      // パネル権限付与対象ユーザーを処理
      for (const panelUserId of panelUserIds) {
        // PanelUserテーブルにユーザーが存在しない場合は作成
        const panelUser = await prisma.panelUser.upsert({
          where: { discordUserId: panelUserId },
          update: {},
          create: { discordUserId: panelUserId },
        });

        // 中間テーブルに関連付けを作成
        await prisma.applicationPanelUser.create({
          data: {
            applicationId: application.id,
            panelUserId: panelUser.id,
          },
        });
      }

      log.info(
        `新しい申請を受付: ID=${application.id}, 申請者=${interaction.user.tag}`,
      );

      await interaction.reply({
        content: `✅ サーバー貸出申請を受け付けました！\n申請ID: ${application.id}\n\n管理者による承認をお待ちください。`,
        ephemeral: true,
      });

      // TODO: 管理者への通知処理を実装
    } catch (error) {
      log.error("申請処理中にエラーが発生しました:", error);
      await interaction.reply({
        content:
          "❌ 申請処理中にエラーが発生しました。管理者にお問い合わせください。",
        ephemeral: true,
      });
    }
  }
}
