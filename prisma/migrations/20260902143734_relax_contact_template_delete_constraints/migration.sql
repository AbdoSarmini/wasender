-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_campaign_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT,
    "rawName" TEXT,
    "rawPhone" TEXT,
    "rawFields" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "campaign_messages_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "campaign_messages_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_campaign_messages" ("campaignId", "contactId", "createdAt", "error", "id", "rawFields", "rawName", "rawPhone", "sentAt", "sequence", "status") SELECT "campaignId", "contactId", "createdAt", "error", "id", "rawFields", "rawName", "rawPhone", "sentAt", "sequence", "status" FROM "campaign_messages";
DROP TABLE "campaign_messages";
ALTER TABLE "new_campaign_messages" RENAME TO "campaign_messages";
CREATE TABLE "new_campaigns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "deviceId" TEXT,
    "templateId" TEXT,
    "minDelay" INTEGER NOT NULL DEFAULT 5,
    "maxDelay" INTEGER NOT NULL DEFAULT 15,
    "targetAll" BOOLEAN NOT NULL DEFAULT false,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    CONSTRAINT "campaigns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "campaigns_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "campaigns_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_campaigns" ("completedAt", "createdAt", "deviceId", "failedCount", "id", "maxDelay", "minDelay", "name", "scheduledAt", "sentCount", "startedAt", "status", "targetAll", "templateId", "totalCount", "userId") SELECT "completedAt", "createdAt", "deviceId", "failedCount", "id", "maxDelay", "minDelay", "name", "scheduledAt", "sentCount", "startedAt", "status", "targetAll", "templateId", "totalCount", "userId" FROM "campaigns";
DROP TABLE "campaigns";
ALTER TABLE "new_campaigns" RENAME TO "campaigns";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
