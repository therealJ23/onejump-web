-- Voice + nutrition (03-voice-and-nutrition-spec.md)

-- AlterTable
ALTER TABLE `Message` ADD COLUMN `audioKey` VARCHAR(191) NULL,
    ADD COLUMN `durationS` INTEGER NULL,
    ADD COLUMN `transcriptSummary` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `AIUsage` ADD COLUMN `seconds` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `VoiceInteraction` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'ask',
    `transcript` TEXT NOT NULL,
    `durationMs` INTEGER NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `costMicros` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VoiceInteraction_businessId_createdAt_idx`(`businessId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AssistProposal` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `summary` TEXT NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `source` VARCHAR(191) NOT NULL DEFAULT 'voice',
    `result` JSON NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `decidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AssistProposal_businessId_status_idx`(`businessId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Briefing` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `script` TEXT NOT NULL,
    `lines` JSON NULL,
    `audioKey` VARCHAR(191) NULL,
    `notifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Briefing_businessId_userId_date_key`(`businessId`, `userId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NutritionPlan` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `approach` VARCHAR(191) NOT NULL DEFAULT 'habits',
    `calories` INTEGER NULL,
    `proteinG` INTEGER NULL,
    `carbsG` INTEGER NULL,
    `fatG` INTEGER NULL,
    `hideNumbers` BOOLEAN NOT NULL DEFAULT false,
    `mealPlanId` VARCHAR(191) NULL,
    `coachNote` TEXT NULL,
    `sex` VARCHAR(191) NULL,
    `heightIn` DOUBLE NULL,
    `activity` DOUBLE NULL,
    `goal` VARCHAR(191) NULL,
    `lowTargetConfirmedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `NutritionPlan_clientId_key`(`clientId`),
    INDEX `NutritionPlan_businessId_idx`(`businessId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Habit` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Habit_businessId_clientId_idx`(`businessId`, `clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HabitCheck` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `habitId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,

    UNIQUE INDEX `HabitCheck_habitId_date_key`(`habitId`, `date`),
    INDEX `HabitCheck_businessId_clientId_date_idx`(`businessId`, `clientId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FoodEntry` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `meal` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `photoKey` VARCHAR(191) NULL,
    `aiInsightId` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `day` DATE NOT NULL,
    `loggedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FoodEntry_businessId_clientId_loggedAt_idx`(`businessId`, `clientId`, `loggedAt`),
    INDEX `FoodEntry_businessId_clientId_day_idx`(`businessId`, `clientId`, `day`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FoodEntryItem` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `entryId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `grams` DOUBLE NULL,
    `portionText` VARCHAR(191) NULL,
    `calories` DOUBLE NOT NULL,
    `proteinG` DOUBLE NOT NULL,
    `carbsG` DOUBLE NOT NULL,
    `fatG` DOUBLE NOT NULL,
    `foodRef` VARCHAR(191) NULL,
    `fdcId` INTEGER NULL,
    `barcode` VARCHAR(191) NULL,
    `confidence` VARCHAR(191) NULL,

    INDEX `FoodEntryItem_businessId_clientId_idx`(`businessId`, `clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FoodFavorite` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `items` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FoodFavorite_businessId_clientId_idx`(`businessId`, `clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MealPlanTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `calories` INTEGER NULL,
    `notes` TEXT NULL,
    `days` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MealPlanTemplate_businessId_idx`(`businessId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Recipe` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `servings` INTEGER NOT NULL,
    `ingredients` JSON NOT NULL,
    `steps` JSON NOT NULL,
    `perServing` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Recipe_businessId_idx`(`businessId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NutritionFlag` (
    `id` VARCHAR(191) NOT NULL,
    `businessId` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `sourceType` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `text` TEXT NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `severity` VARCHAR(191) NOT NULL DEFAULT 'normal',
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NutritionFlag_businessId_status_idx`(`businessId`, `status`),
    INDEX `NutritionFlag_businessId_clientId_idx`(`businessId`, `clientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FoodCache` (
    `id` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `externalId` VARCHAR(191) NOT NULL,
    `data` JSON NOT NULL,
    `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FoodCache_source_externalId_key`(`source`, `externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FoodEntryItem` ADD CONSTRAINT `FoodEntryItem_entryId_fkey` FOREIGN KEY (`entryId`) REFERENCES `FoodEntry`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
