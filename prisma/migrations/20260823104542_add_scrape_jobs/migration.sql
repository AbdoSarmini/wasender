-- CreateTable
CREATE TABLE "scrape_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "query" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "maxResults" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "scrape_results" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scrapeJobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "category" TEXT,
    "website" TEXT,
    "rating" REAL,
    "reviewCount" INTEGER,
    "googleMapsUrl" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scrape_results_scrapeJobId_fkey" FOREIGN KEY ("scrapeJobId") REFERENCES "scrape_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "scrape_results_scrapeJobId_googleMapsUrl_key" ON "scrape_results"("scrapeJobId", "googleMapsUrl");
