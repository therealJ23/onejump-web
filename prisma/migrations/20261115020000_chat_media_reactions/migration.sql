-- Chat: photos, videos and GIFs on messages, and emoji reactions (one per person per message).
ALTER TABLE `Message` ADD COLUMN `attachments` JSON NULL;

CREATE TABLE `MessageReaction` (
  `id` VARCHAR(191) NOT NULL,
  `businessId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NOT NULL,
  `messageId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `emoji` VARCHAR(16) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `MessageReaction_messageId_userId_key`(`messageId`, `userId`),
  INDEX `MessageReaction_businessId_clientId_idx`(`businessId`, `clientId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
