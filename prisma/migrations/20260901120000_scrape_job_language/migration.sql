-- AlterTable
ALTER TABLE "scrape_jobs" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "scrape_jobs" DROP COLUMN "location";
