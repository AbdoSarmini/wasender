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
    CONSTRAINT "campaign_messages_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "campaign_messages_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_campaign_messages" ("campaignId", "contactId", "createdAt", "error", "id", "sentAt", "status") SELECT "campaignId", "contactId", "createdAt", "error", "id", "sentAt", "status" FROM "campaign_messages";
DROP TABLE "campaign_messages";
ALTER TABLE "new_campaign_messages" RENAME TO "campaign_messages";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
