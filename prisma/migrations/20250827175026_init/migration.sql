-- CreateTable
CREATE TABLE `applications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `description` VARCHAR(191) NOT NULL,
    `minecraftVersion` VARCHAR(191) NOT NULL,
    `requestedPeriod` INTEGER NOT NULL,
    `applicantDiscordId` VARCHAR(191) NOT NULL,
    `organizerDiscordId` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'NEEDS_BACKUP', 'RETURNED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `pterodactylServerId` VARCHAR(191) NULL,
    `startDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `panel_users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `discordUserId` VARCHAR(191) NOT NULL,
    `pterodactylUserId` INTEGER NULL,
    `pterodactylUsername` VARCHAR(191) NULL,
    `pterodactylEmail` VARCHAR(191) NULL,
    `hasDiscordRole` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `panel_users_discordUserId_key`(`discordUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `application_panel_users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `applicationId` INTEGER NOT NULL,
    `panelUserId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `application_panel_users_applicationId_panelUserId_key`(`applicationId`, `panelUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `backup_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `applicationId` INTEGER NOT NULL,
    `pterodactylBackupId` VARCHAR(191) NOT NULL,
    `googleDriveFilePath` VARCHAR(191) NOT NULL,
    `backupDate` DATETIME(3) NOT NULL,
    `comment` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `application_panel_users` ADD CONSTRAINT `application_panel_users_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `application_panel_users` ADD CONSTRAINT `application_panel_users_panelUserId_fkey` FOREIGN KEY (`panelUserId`) REFERENCES `panel_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `backup_records` ADD CONSTRAINT `backup_records_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
