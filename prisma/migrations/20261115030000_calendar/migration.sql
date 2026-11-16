-- Calendar: sessions, check-in calls, consultations and blocked time.
CREATE TABLE `CalendarEvent` (
  `id` VARCHAR(191) NOT NULL,
  `businessId` VARCHAR(191) NOT NULL,
  `clientId` VARCHAR(191) NULL,
  `leadId` VARCHAR(191) NULL,
  `type` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `start` DATETIME(3) NOT NULL,
  `end` DATETIME(3) NOT NULL,
  `location` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'scheduled',
  `source` VARCHAR(191) NOT NULL DEFAULT 'manual',
  `createdBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `CalendarEvent_businessId_start_idx`(`businessId`, `start`),
  INDEX `CalendarEvent_businessId_clientId_idx`(`businessId`, `clientId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
