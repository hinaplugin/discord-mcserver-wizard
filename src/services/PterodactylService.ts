import { config } from "../utils/config.js";
import { log } from "../utils/log.js";

/**
 * PterodactylのAPIレスポンス型定義
 */
interface PterodactylUser {
  id: number;
  external_id?: string;
  uuid: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  language: string;
  admin: boolean;
  created_at: string;
  updated_at: string;
}

interface PterodactylServer {
  id: number;
  external_id?: string;
  uuid: string;
  identifier: string;
  name: string;
  description: string;
  suspended: boolean;
  limits: {
    memory: number;
    swap: number;
    disk: number;
    io: number;
    cpu: number;
  };
  feature_limits: {
    databases: number;
    allocations: number;
    backups: number;
  };
}

interface PterodactylBackup {
  uuid: string;
  name: string;
  ignored_files: string[];
  sha256_hash: string;
  bytes: number;
  created_at: string;
  completed_at: string;
  is_successful: boolean;
  is_locked: boolean;
  checksum: string;
}

/**
 * Pterodactyl Panel APIサービス
 */
export class PterodactylService {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  /**
   *
   */
  constructor() {
    this.apiUrl = config.pterodactyl.api_url.replace(/\/$/, ""); // 末尾のスラッシュを削除
    this.apiKey = config.pterodactyl.api_key;
  }

  /**
   * APIリクエストを送信
   * @param endpoint
   * @param method
   * @param body
   */
  private async makeRequest(
    endpoint: string,
    method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
    body?: any,
  ): Promise<any> {
    const url = `${this.apiUrl}/api/application/${endpoint}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw new Error(
          `Pterodactyl API error: ${response.status} ${response.statusText}`,
        );
      }

      return await response.json();
    } catch (error) {
      log.error(`Pterodactyl API request failed: ${method} ${url}`, error);
      throw error;
    }
  }

  /**
   * ユーザーを作成
   * @param username ユーザー名
   * @param email メールアドレス
   * @param firstName 名前
   * @param lastName 苗字
   * @returns 作成されたユーザー情報
   */
  async createUser(
    username: string,
    email: string,
    firstName: string = username,
    lastName: string = "",
  ): Promise<PterodactylUser> {
    const userData = {
      username,
      email,
      first_name: firstName,
      last_name: lastName,
      password: this.generateRandomPassword(), // ランダムパスワードを生成
    };

    const response = await this.makeRequest("users", "POST", userData);
    return response.attributes;
  }

  /**
   * ユーザー一覧を取得
   */
  async getUsers(): Promise<PterodactylUser[]> {
    const response = await this.makeRequest("users");
    return response.data.map((user: any) => user.attributes);
  }

  /**
   * ユーザー情報を取得
   * @param userId ユーザーID
   */
  async getUser(userId: number): Promise<PterodactylUser> {
    const response = await this.makeRequest(`users/${userId}`);
    return response.attributes;
  }

  /**
   * サーバー一覧を取得
   */
  async getServers(): Promise<PterodactylServer[]> {
    const response = await this.makeRequest("servers");
    return response.data.map((server: any) => server.attributes);
  }

  /**
   * 利用可能なサーバーを検索
   * @returns 利用可能なサーバー（suspended = falseかつ既に割り当てられていない）
   */
  async getAvailableServers(): Promise<PterodactylServer[]> {
    const servers = await this.getServers();

    // TODO: データベースと照合して、既に割り当てられているサーバーを除外
    return servers.filter((server) => !server.suspended);
  }

  /**
   * サーバーにユーザーの権限を追加
   * @param serverId サーバーID
   * @param userId ユーザーID
   * @param permissions 権限配列
   */
  async addServerUser(
    serverId: number,
    userId: number,
    permissions: string[] = ["*"], // デフォルトで全権限
  ): Promise<void> {
    const userData = {
      user: userId,
      permissions,
    };

    await this.makeRequest(`servers/${serverId}/users`, "POST", userData);
  }

  /**
   * サーバーからユーザーの権限を削除
   * @param serverId サーバーID
   * @param userId ユーザーID
   */
  async removeServerUser(serverId: number, userId: number): Promise<void> {
    await this.makeRequest(`servers/${serverId}/users/${userId}`, "DELETE");
  }

  /**
   * サーバーのバックアップ一覧を取得
   * @param serverId サーバーID
   */
  async getServerBackups(serverId: number): Promise<PterodactylBackup[]> {
    const response = await this.makeRequest(`servers/${serverId}/backups`);
    return response.data.map((backup: any) => backup.attributes);
  }

  /**
   * バックアップのロックを解除
   * @param serverId サーバーID
   * @param backupUuid バックアップUUID
   */
  async unlockBackup(serverId: number, backupUuid: string): Promise<void> {
    await this.makeRequest(
      `servers/${serverId}/backups/${backupUuid}`,
      "PATCH",
      { is_locked: false },
    );
  }

  /**
   * サーバーを初期化（再インストール）
   * @param serverId サーバーID
   */
  async reinstallServer(serverId: number): Promise<void> {
    await this.makeRequest(`servers/${serverId}/reinstall`, "POST");
  }

  /**
   * 権限変更除外ユーザーかチェック
   * @param discordUserId DiscordユーザーID
   */
  isExcludedUser(discordUserId: string): boolean {
    return config.pterodactyl.excluded_discord_users.includes(discordUserId);
  }

  /**
   * ランダムパスワードを生成
   * @param length
   */
  private generateRandomPassword(length: number = 16): string {
    const charset =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  }
}
