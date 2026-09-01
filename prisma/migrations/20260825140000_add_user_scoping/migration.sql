-- Add per-user data isolation: every device/template/group/contact/campaign/scrape job
-- now belongs to exactly one user. Pre-existing rows (created before this migration,
-- when data was shared between all users) are backfilled to the admin account.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- devices
CREATE TABLE "new_devices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_devices" ("id","userId","name","clientId","phone","status","createdAt","updatedAt")
SELECT "id", 'cmshb58490000z3pfkscnaqvh', "name","clientId","phone","status","createdAt","updatedAt" FROM "devices";
DROP TABLE "devices";
ALTER TABLE "new_devices" RENAME TO "devices";
CREATE UNIQUE INDEX "devices_clientId_key" ON "devices"("clientId");

-- templates
CREATE TABLE "new_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaPath" TEXT,
    "mediaName" TEXT,
    "mediaMime" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_templates" ("id","userId","name","content","mediaPath","mediaName","mediaMime","createdAt","updatedAt")
SELECT "id", 'cmshb58490000z3pfkscnaqvh', "name","content","mediaPath","mediaName","mediaMime","createdAt","updatedAt" FROM "templates";
DROP TABLE "templates";
ALTER TABLE "new_templates" RENAME TO "templates";

-- groups
CREATE TABLE "new_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "groups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_groups" ("id","userId","name","createdAt")
SELECT "id", 'cmshb58490000z3pfkscnaqvh', "name","createdAt" FROM "groups";
DROP TABLE "groups";
ALTER TABLE "new_groups" RENAME TO "groups";
CREATE UNIQUE INDEX "groups_userId_name_key" ON "groups"("userId","name");

-- contacts
CREATE TABLE "new_contacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "fields" TEXT,
    "groupId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "contacts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contacts_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_contacts" ("id","userId","name","phone","fields","groupId","createdAt","updatedAt")
SELECT "id", 'cmshb58490000z3pfkscnaqvh', "name","phone","fields","groupId","createdAt","updatedAt" FROM "contacts";
DROP TABLE "contacts";
ALTER TABLE "new_contacts" RENAME TO "contacts";
CREATE UNIQUE INDEX "contacts_userId_phone_key" ON "contacts"("userId","phone");

-- campaigns
CREATE TABLE "new_campaigns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "deviceId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "minDelay" INTEGER NOT NULL DEFAULT 5,
    "maxDelay" INTEGER NOT NULL DEFAULT 15,
    "targetAll" BOOLEAN NOT NULL DEFAULT false,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "scheduledAt" DATETIME,
    CONSTRAINT "campaigns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "campaigns_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "campaigns_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_campaigns" ("id","userId","name","status","deviceId","templateId","minDelay","maxDelay","targetAll","totalCount","sentCount","failedCount","createdAt","startedAt","completedAt","scheduledAt")
SELECT "id", 'cmshb58490000z3pfkscnaqvh', "name","status","deviceId","templateId","minDelay","maxDelay","targetAll","totalCount","sentCount","failedCount","createdAt","startedAt","completedAt","scheduledAt" FROM "campaigns";
DROP TABLE "campaigns";
ALTER TABLE "new_campaigns" RENAME TO "campaigns";

-- scrape_jobs
CREATE TABLE "new_scrape_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "maxResults" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    CONSTRAINT "scrape_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_scrape_jobs" ("id","userId","query","location","maxResults","status","resultCount","error","createdAt","startedAt","completedAt")
SELECT "id", 'cmshb58490000z3pfkscnaqvh', "query","location","maxResults","status","resultCount","error","createdAt","startedAt","completedAt" FROM "scrape_jobs";
DROP TABLE "scrape_jobs";
ALTER TABLE "new_scrape_jobs" RENAME TO "scrape_jobs";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
