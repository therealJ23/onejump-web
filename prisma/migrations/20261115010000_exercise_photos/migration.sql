-- Exercise library pictures: a licensed photo or drawing per exercise (wger.de, CC BY-SA, credited).
ALTER TABLE `Exercise` ADD COLUMN `photoKey` VARCHAR(191) NULL, ADD COLUMN `photoCredit` JSON NULL;
