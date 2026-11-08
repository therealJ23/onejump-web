-- Profile photos for everyone (coaches and clients), and 6-digit login codes so clients can
-- log in on the iPhone app from the same email as the login link.
ALTER TABLE `User` ADD COLUMN `avatarKey` VARCHAR(191) NULL;
ALTER TABLE `MagicLink` ADD COLUMN `codeHash` VARCHAR(191) NULL, ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0;
