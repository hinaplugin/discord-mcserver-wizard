import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ChatInputCommandInteraction,
} from "discord.js";
import { CommandBase } from "../base/command_base.js";
import { prisma } from "../../utils/database.js";
import { config } from "../../utils/config.js";
import { log } from "../../utils/log.js";
import { ServerAssignmentService } from "../../services/ServerAssignmentService.js";
import { BackupService } from "../../services/BackupService.js";

/**
 * 管理者コマンド
 */
export class AdminCommand extends CommandBase {
  public static readonly commandName = "server-admin";

  command = new SlashCommandBuilder()
    .setName(AdminCommand.commandName)
    .setDescription("管理者用コマンド")
    .addSubcommand((subcommand) =>
      subcommand.setName("applications").setDescription("申請一覧を表示"),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("status").setDescription("システム状況を表示"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("returns")
        .setDescription("返却待ちサーバー一覧を表示"),
    ) as SlashCommandBuilder;

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
    // 管理者権限チェック
    if (!this.isAdmin(interaction)) {
      await interaction.reply({
        content: "❌ このコマンドは管理者のみ使用できます。",
        ephemeral: true,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "applications":
        await this.showApplications(interaction);
        break;
      case "status":
        await this.showStatus(interaction);
        break;
      case "returns":
        await this.showReturns(interaction);
        break;
    }
  }

  /**
   * 管理者権限をチェック
   * @param interaction
   */
  private isAdmin(interaction: ChatInputCommandInteraction): boolean {
    if (!interaction.member || !interaction.member.roles) return false;

    // roles is either string[] (for partial members) or GuildMemberRoleManager
    const memberRoles = Array.isArray(interaction.member.roles)
      ? interaction.member.roles
      : interaction.member.roles.cache;

    if (Array.isArray(memberRoles)) {
      return config.discord.admin_role_ids.some((roleId) =>
        memberRoles.includes(roleId),
      );
    } else {
      return config.discord.admin_role_ids.some((roleId) =>
        memberRoles.has(roleId),
      );
    }
  }

  /**
   * 申請一覧を表示
   * @param interaction
   */
  private async showApplications(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const applications = await prisma.application.findMany({
      where: {
        status: "PENDING",
      },
      include: {
        panelUsers: {
          include: {
            panelUser: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (applications.length === 0) {
      await interaction.reply({
        content: "現在、承認待ちの申請はありません。",
        ephemeral: true,
      });
      return;
    }

    for (const application of applications.slice(0, 5)) {
      // 最大5件表示
      const embed = new EmbedBuilder()
        .setTitle(`申請 #${application.id}`)
        .setColor(0xffd700)
        .addFields(
          {
            name: "申請者",
            value: `<@${application.applicantDiscordId}>`,
            inline: true,
          },
          {
            name: "主催者",
            value: `<@${application.organizerDiscordId}>`,
            inline: true,
          },
          { name: "説明", value: application.description },
          {
            name: "Minecraftバージョン",
            value: application.minecraftVersion,
            inline: true,
          },
          {
            name: "期間",
            value: `${application.requestedPeriod}日`,
            inline: true,
          },
          {
            name: "パネル権限付与対象ユーザー",
            value:
              application.panelUsers
                .map((pu) => `<@${pu.panelUser.discordUserId}>`)
                .join("\n") || "なし",
          },
          {
            name: "申請日時",
            value: application.createdAt.toLocaleString("ja-JP"),
          },
        )
        .setTimestamp();

      const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`approve_${application.id}`)
          .setLabel("承認")
          .setStyle(ButtonStyle.Success)
          .setEmoji("✅"),
        new ButtonBuilder()
          .setCustomId(`reject_${application.id}`)
          .setLabel("却下")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("❌"),
      );

      await interaction.followUp({
        embeds: [embed],
        components: [buttons],
      });
    }

    if (!interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }
  }

  /**
   * システム状況を表示
   * @param interaction
   */
  private async showStatus(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const stats = await Promise.all([
      prisma.application.count({ where: { status: "PENDING" } }),
      prisma.application.count({ where: { status: "ACTIVE" } }),
      prisma.application.count({ where: { status: "NEEDS_BACKUP" } }),
      prisma.application.count(),
      prisma.panelUser.count(),
    ]);

    const embed = new EmbedBuilder()
      .setTitle("システム状況")
      .setColor(0x00ae86)
      .addFields(
        { name: "承認待ち申請", value: stats[0].toString(), inline: true },
        { name: "貸出中サーバー", value: stats[1].toString(), inline: true },
        { name: "返却待ちサーバー", value: stats[2].toString(), inline: true },
        { name: "総申請数", value: stats[3].toString(), inline: true },
        { name: "登録ユーザー数", value: stats[4].toString(), inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  /**
   * 返却待ちサーバー一覧を表示
   * @param interaction
   */
  private async showReturns(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const returningApplications = await prisma.application.findMany({
      where: {
        status: "NEEDS_BACKUP",
      },
      include: {
        panelUsers: {
          include: {
            panelUser: true,
          },
        },
      },
      orderBy: {
        endDate: "asc", // 期限切れが古い順
      },
    });

    if (returningApplications.length === 0) {
      await interaction.reply({
        content: "現在、返却待ちのサーバーはありません。",
        ephemeral: true,
      });
      return;
    }

    for (const application of returningApplications.slice(0, 5)) {
      // 最大5件表示
      const embed = new EmbedBuilder()
        .setTitle(`返却待ち #${application.id}`)
        .setColor(0xff4444)
        .addFields(
          {
            name: "主催者",
            value: `<@${application.organizerDiscordId}>`,
            inline: true,
          },
          {
            name: "サーバー",
            value: application.pterodactylServerId || "未割り当て",
            inline: true,
          },
          { name: "説明", value: application.description },
          {
            name: "期限切れ日時",
            value: application.endDate?.toLocaleString("ja-JP") || "不明",
          },
          {
            name: "パネル権限付与対象ユーザー",
            value:
              application.panelUsers
                .map((pu) => `<@${pu.panelUser.discordUserId}>`)
                .join("\n") || "なし",
          },
        )
        .setTimestamp();

      const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`backup_select_${application.id}`)
          .setLabel("バックアップ選択")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("💾"),
      );

      await interaction.followUp({
        embeds: [embed],
        components: [buttons],
      });
    }

    if (!interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }
  }

  /**
   * 承認ボタン押下処理
   * @param interaction
   */
  public static async handleApproval(
    interaction: ButtonInteraction,
  ): Promise<void> {
    const applicationId = parseInt(interaction.customId.split("_")[1]);

    // Pterodactylユーザー名入力モーダルを表示
    const modal = new ModalBuilder()
      .setCustomId(`approval_modal_${applicationId}`)
      .setTitle("申請承認 - ユーザー名設定");

    const usernameInput = new TextInputBuilder()
      .setCustomId("pterodactyl_usernames")
      .setLabel("Pterodactylユーザー名（改行区切りで複数可）")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("user1\nuser2\nuser3")
      .setRequired(true)
      .setMaxLength(500);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(
      usernameInput,
    );
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  /**
   * 却下ボタン押下処理
   * @param interaction
   */
  public static async handleRejection(
    interaction: ButtonInteraction,
  ): Promise<void> {
    const applicationId = parseInt(interaction.customId.split("_")[1]);

    try {
      await prisma.application.update({
        where: { id: applicationId },
        data: { status: "REJECTED" },
      });

      await interaction.update({
        content: "申請が却下されました。",
        embeds: [],
        components: [],
      });

      log.info(`申請 #${applicationId} が却下されました`);
    } catch (error) {
      log.error("申請却下処理中にエラーが発生しました:", error);
      await interaction.reply({
        content: "❌ 申請却下処理中にエラーが発生しました。",
        ephemeral: true,
      });
    }
  }

  /**
   * 承認モーダル送信処理
   * @param interaction
   */
  public static async handleApprovalModal(
    interaction: ModalSubmitInteraction,
  ): Promise<void> {
    const applicationId = parseInt(interaction.customId.split("_")[2]);
    const usernamesInput = interaction.fields.getTextInputValue(
      "pterodactyl_usernames",
    );

    try {
      // ユーザー名を配列に変換
      const usernames = usernamesInput
        .split("\n")
        .map((name) => name.trim())
        .filter((name) => name.length > 0);

      if (usernames.length === 0) {
        await interaction.reply({
          content: "❌ ユーザー名を最低1つは入力してください。",
          ephemeral: true,
        });
        return;
      }

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
        await interaction.reply({
          content: "❌ 申請が見つかりません。",
          ephemeral: true,
        });
        return;
      }

      // パネル権限付与対象ユーザー数とユーザー名数が一致するかチェック
      if (usernames.length !== application.panelUsers.length) {
        await interaction.reply({
          content: `❌ ユーザー名の数（${usernames.length}）がパネル権限付与対象ユーザー数（${application.panelUsers.length}）と一致しません。`,
          ephemeral: true,
        });
        return;
      }

      // パネルユーザー情報を更新
      for (let i = 0; i < application.panelUsers.length; i++) {
        const panelUser = application.panelUsers[i];
        const username = usernames[i];
        const email = `${username}@kpw.local`;

        await prisma.panelUser.update({
          where: { id: panelUser.panelUserId },
          data: {
            pterodactylUsername: username,
            pterodactylEmail: email,
            // TODO: 実際のPterodactylユーザーID設定
            // pterodactylUserId: actualUserId,
          },
        });

        // TODO: Discordロール付与処理
      }

      // 申請ステータスを更新
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: "ACTIVE", // 承認後は直接ACTIVE状態へ
          startDate: new Date(),
          endDate: new Date(
            Date.now() + application.requestedPeriod * 24 * 60 * 60 * 1000,
          ),
        },
      });

      await interaction.reply({
        content: "✅ 申請が承認されました！",
        ephemeral: true,
      });

      log.info(`申請 #${applicationId} が承認されました`);

      // サーバー割り当て処理を実行
      const serverAssignmentService = new ServerAssignmentService();
      await serverAssignmentService.assignServerToApplication(applicationId);
    } catch (error) {
      log.error("申請承認処理中にエラーが発生しました:", error);
      await interaction.reply({
        content: "❌ 申請承認処理中にエラーが発生しました。",
        ephemeral: true,
      });
    }
  }

  /**
   * バックアップ選択ボタン押下処理
   * @param interaction
   */
  public static async handleBackupSelection(
    interaction: ButtonInteraction,
  ): Promise<void> {
    const applicationId = parseInt(interaction.customId.split("_")[2]);

    try {
      const backupService = new BackupService();
      const backupOptions = await backupService.getBackupOptions(applicationId);

      if (backupOptions.length === 0) {
        await interaction.reply({
          content: "❌ 利用可能なバックアップが見つかりません。",
          ephemeral: true,
        });
        return;
      }

      // バックアップ選択用のSelectMenuを作成
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`backup_choice_${applicationId}`)
        .setPlaceholder("保存するバックアップを選択してください");

      // バックアップオプションを追加
      for (const backup of backupOptions.slice(0, 20)) {
        // 最大20件
        const date = new Date(backup.created_at).toLocaleString("ja-JP");
        const size = (backup.bytes / (1024 * 1024)).toFixed(1); // MB
        const label = `${date} (${size}MB)${backup.is_locked ? " 🔒" : ""}`;

        selectMenu.addOptions({
          label: label.length > 100 ? label.substring(0, 97) + "..." : label,
          value: backup.uuid,
          description: `${backup.is_locked ? "ロック済み " : ""}${backup.name || "名前なし"}`,
        });
      }

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        selectMenu,
      );

      await interaction.reply({
        content: `📋 **バックアップ選択**\n申請ID: ${applicationId}\n\n保存するバックアップを選択してください:`,
        components: [row],
        ephemeral: true,
      });
    } catch (error) {
      log.error(`バックアップ選択処理に失敗: 申請ID=${applicationId}`, error);
      await interaction.reply({
        content: "❌ バックアップの取得に失敗しました。",
        ephemeral: true,
      });
    }
  }

  /**
   * バックアップ選択Menu処理
   * @param interaction
   */
  public static async handleBackupChoice(
    interaction: StringSelectMenuInteraction,
  ): Promise<void> {
    const applicationId = parseInt(interaction.customId.split("_")[2]);
    const selectedBackupUuid = interaction.values[0];

    // コメント入力モーダルを表示
    const modal = new ModalBuilder()
      .setCustomId(`backup_comment_${applicationId}_${selectedBackupUuid}`)
      .setTitle("バックアップ保存 - コメント入力");

    const commentInput = new TextInputBuilder()
      .setCustomId("backup_comment")
      .setLabel("補足コメント（任意）")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("例: 最終建築完了版")
      .setRequired(false)
      .setMaxLength(100);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(
      commentInput,
    );
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  /**
   * バックアップ保存コメントモーダル処理
   * @param interaction
   */
  public static async handleBackupComment(
    interaction: ModalSubmitInteraction,
  ): Promise<void> {
    const parts = interaction.customId.split("_");
    const applicationId = parseInt(parts[2]);
    const selectedBackupUuid = parts[3];
    const comment =
      interaction.fields.getTextInputValue("backup_comment") || undefined;

    try {
      await interaction.deferReply({ ephemeral: true });

      const backupService = new BackupService();
      await backupService.processServerReturn(
        applicationId,
        selectedBackupUuid,
        comment,
      );

      await interaction.editReply({
        content: `✅ **サーバー返却処理完了**\n申請ID: ${applicationId}\n\nバックアップの保存、サーバー初期化、権限剥奪が完了しました。`,
      });

      log.info(
        `サーバー返却処理完了: 申請ID=${applicationId}, バックアップUUID=${selectedBackupUuid}`,
      );
    } catch (error) {
      log.error(`サーバー返却処理に失敗: 申請ID=${applicationId}`, error);
      await interaction.editReply({
        content:
          "❌ サーバー返却処理中にエラーが発生しました。ログを確認してください。",
      });
    }
  }
}
