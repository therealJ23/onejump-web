-- Recipe book with pictures: a coach photo or a built-in picture, time, tags, shown to clients.
ALTER TABLE `Recipe` ADD COLUMN `photoKey` VARCHAR(191) NULL, ADD COLUMN `art` VARCHAR(64) NULL, ADD COLUMN `minutes` INTEGER NULL, ADD COLUMN `tags` JSON NULL, ADD COLUMN `shared` BOOLEAN NOT NULL DEFAULT true;
