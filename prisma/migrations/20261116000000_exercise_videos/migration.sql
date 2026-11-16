-- Free demo videos for OneJump's global exercise library (wger.de, Creative Commons, credited).
ALTER TABLE `Exercise` ADD COLUMN `videoKey` VARCHAR(191) NULL, ADD COLUMN `videoCredit` JSON NULL;
