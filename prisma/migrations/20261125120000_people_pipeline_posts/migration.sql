ALTER TABLE "Contact" ADD COLUMN "outreachStatus" TEXT;
ALTER TABLE "Contact" ADD COLUMN "nextFollowUpAt" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN "channel" TEXT;
ALTER TABLE "Contact" ADD COLUMN "source" TEXT;
ALTER TABLE "Contact" ADD COLUMN "companyName" TEXT;
ALTER TABLE "Contact" ADD COLUMN "connectedOn" TIMESTAMP(3);
ALTER TABLE "Contact" ADD COLUMN "priority" INTEGER;
ALTER TABLE "Contact" ADD COLUMN "priorityReason" TEXT;
CREATE INDEX "Contact_createdBy_outreachStatus_idx" ON "Contact"("createdBy", "outreachStatus");

CREATE TABLE "ContactActivity" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT,
    "text" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ContactActivity_contactId_idx" ON "ContactActivity"("contactId");
CREATE INDEX "ContactActivity_userId_at_idx" ON "ContactActivity"("userId", "at");
ALTER TABLE "ContactActivity" ADD CONSTRAINT "ContactActivity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactActivity" ADD CONSTRAINT "ContactActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "LinkedinPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "postedAt" TIMESTAMP(3),
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LinkedinPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LinkedinPost_userId_status_idx" ON "LinkedinPost"("userId", "status");
ALTER TABLE "LinkedinPost" ADD CONSTRAINT "LinkedinPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
