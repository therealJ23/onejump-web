-- Exercise library: a coach's own photo or video for an exercise (private storage key).
ALTER TABLE `Exercise` ADD COLUMN `mediaKey` VARCHAR(191) NULL, ADD COLUMN `mediaType` VARCHAR(20) NULL;
