-- Assist reliability: a log of every question (kept 30 days) and the minutes Assist saved.
CREATE TABLE `AssistRun` (
  `id` VARCHAR(191) NOT NULL,
  `businessId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `question` TEXT NOT NULL,
  `voice` BOOLEAN NOT NULL DEFAULT false,
  `model` VARCHAR(191) NULL,
  `tools` JSON NULL,
  `proposals` JSON NULL,
  `outcome` VARCHAR(191) NOT NULL,
  `error` TEXT NULL,
  `ms` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AssistRun_businessId_createdAt_idx`(`businessId`, `createdAt`),
  INDEX `AssistRun_outcome_createdAt_idx`(`outcome`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AssistSaving` (
  `id` VARCHAR(191) NOT NULL,
  `businessId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `kind` VARCHAR(191) NOT NULL,
  `minutes` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AssistSaving_businessId_createdAt_idx`(`businessId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
