-- Morning briefing: when the coach played it (hides the Today banner on every device).
ALTER TABLE `Briefing` ADD COLUMN `playedAt` DATETIME(3) NULL;
