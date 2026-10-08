-- Local MySQL setup for development (run once): `mysql -u root -p < scripts/setup-local-db.sql`
-- Creates the app database, a test database and two users:
--   onejump_app      reads and writes rows only (what the server uses)
--   onejump_migrate  can change tables (used only by `npm run db:migrate`)
-- These passwords are for your own computer only. Use different ones in production.
CREATE DATABASE IF NOT EXISTS onejump CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS onejump_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'onejump_app'@'localhost' IDENTIFIED BY 'app-dev-password';
CREATE USER IF NOT EXISTS 'onejump_migrate'@'localhost' IDENTIFIED BY 'migrate-dev-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON onejump.* TO 'onejump_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON onejump_test.* TO 'onejump_app'@'localhost';
GRANT ALL PRIVILEGES ON onejump.* TO 'onejump_migrate'@'localhost';
GRANT ALL PRIVILEGES ON onejump_test.* TO 'onejump_migrate'@'localhost';
FLUSH PRIVILEGES;
