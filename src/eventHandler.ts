import {
  Message,
  OmitPartialGroupDMChannel,
  ModalSubmitInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
} from "discord.js";
import { ServerRentalCommand } from "./commands/server_rental/ServerRentalCommand.js";
import { AdminCommand } from "./commands/admin/AdminCommand.js";

/**
 * Sample function to reply with "Hello" when the bot is mentioned
 * @param message The message where the bot was mentioned
 */
export async function onMentionMessage(
  message: OmitPartialGroupDMChannel<Message>,
): Promise<void> {
  // Check if the bot was mentioned
  if (!message.mentions.has(message.client.user)) {
    return;
  }

  // Reply with "Hello" in the channel where the bot was mentioned
  await message.channel.send(`Hello! ${message.author.username}!`);
}

/**
 * ボタンインタラクションイベントハンドラー
 * @param interaction ボタンインタラクション
 */
export async function onButtonInteraction(
  interaction: ButtonInteraction,
): Promise<void> {
  const customId = interaction.customId;

  // 管理者承認/却下ボタンの処理
  if (customId.startsWith("approve_")) {
    await AdminCommand.handleApproval(interaction);
  } else if (customId.startsWith("reject_")) {
    await AdminCommand.handleRejection(interaction);
  }
  // バックアップ選択ボタンの処理
  else if (customId.startsWith("backup_select_")) {
    await AdminCommand.handleBackupSelection(interaction);
  }
}

/**
 * モーダル送信イベントハンドラー
 * @param interaction モーダル送信インタラクション
 */
export async function onModalSubmit(
  interaction: ModalSubmitInteraction,
): Promise<void> {
  const customId = interaction.customId;

  // サーバー貸出申請モーダルの処理
  if (customId === "server-rental-modal") {
    await ServerRentalCommand.handleModalSubmit(interaction);
  }
  // 管理者承認モーダルの処理
  else if (customId.startsWith("approval_modal_")) {
    await AdminCommand.handleApprovalModal(interaction);
  }
  // バックアップコメントモーダルの処理
  else if (customId.startsWith("backup_comment_")) {
    await AdminCommand.handleBackupComment(interaction);
  }
}

/**
 * セレクトメニューインタラクションイベントハンドラー
 * @param interaction セレクトメニューインタラクション
 */
export async function onSelectMenuInteraction(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  const customId = interaction.customId;

  // バックアップ選択メニューの処理
  if (customId.startsWith("backup_choice_")) {
    await AdminCommand.handleBackupChoice(interaction);
  }
}
