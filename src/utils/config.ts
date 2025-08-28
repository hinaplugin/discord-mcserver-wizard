import assert from "assert";
import { parse } from "toml";
import { getWorkdirPath } from "./workdir.js";
import { copyFileSync, existsSync, readFileSync } from "fs";

/**
 * Structure of the configuration file
 */
export interface Config {
  /*
   * Configuration names should be written in snake_case. Therefore, we are disabling eslint naming rules here.
   * The 'requiresQuotes' rule is disabled here because it only excludes strings (including those with spaces) that need to be enclosed in quotes.
   */

  /** Discord Guild IDs */
  guild_ids: string[];

  /** Pterodactyl Panel Configuration */
  pterodactyl: {
    api_url: string;
    api_key: string;
    excluded_discord_users: string[]; // Discord user IDs to exclude from permission changes
  };

  /** Discord Configuration */
  discord: {
    panel_role_id: string; // Role ID for panel access users
    admin_role_ids: string[]; // Admin role IDs for approval permissions
  };

  /** Google Drive Configuration */
  google_drive: {
    folder_path: string; // Base folder path for backups
  };

  /** Reminder Configuration */
  reminders: {
    days_before_expiry: number[]; // Days before expiry to send reminders (e.g., [3, 1])
    reminder_channel_id: string; // Channel ID for sending reminders
  };
}

// If config.toml does not exist, copy config.default.toml
if (!existsSync(getWorkdirPath("config.toml"))) {
  copyFileSync(
    getWorkdirPath("config.default.toml"),
    getWorkdirPath("config.toml"),
  );
}

/** Configuration */
export const config: Config = parse(
  readFileSync(getWorkdirPath("config.toml"), "utf-8"),
) as Config;

// Check the types
assert(
  config.guild_ids && Array.isArray(config.guild_ids),
  "guild_ids is required.",
);
assert(
  config.pterodactyl && typeof config.pterodactyl === "object",
  "pterodactyl configuration is required.",
);
assert(
  config.pterodactyl.api_url && typeof config.pterodactyl.api_url === "string",
  "pterodactyl.api_url is required.",
);
assert(
  config.pterodactyl.api_key && typeof config.pterodactyl.api_key === "string",
  "pterodactyl.api_key is required.",
);
assert(
  config.discord && typeof config.discord === "object",
  "discord configuration is required.",
);
assert(
  config.discord.panel_role_id &&
    typeof config.discord.panel_role_id === "string",
  "discord.panel_role_id is required.",
);
assert(
  config.discord.admin_role_ids && Array.isArray(config.discord.admin_role_ids),
  "discord.admin_role_ids is required.",
);
assert(
  config.pterodactyl.excluded_discord_users &&
    Array.isArray(config.pterodactyl.excluded_discord_users),
  "pterodactyl.excluded_discord_users is required.",
);
assert(
  config.google_drive && typeof config.google_drive === "object",
  "google_drive configuration is required.",
);
assert(
  config.reminders && typeof config.reminders === "object",
  "reminders configuration is required.",
);
