CREATE TABLE "LinkedinCampaign" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "pillars" TEXT NOT NULL,
    "cadence" INTEGER NOT NULL DEFAULT 2,
    "weeks" INTEGER NOT NULL DEFAULT 6,
    "startDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LinkedinCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LinkedinCampaign_userId_active_idx" ON "LinkedinCampaign"("userId", "active");
ALTER TABLE "LinkedinCampaign" ADD CONSTRAINT "LinkedinCampaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LinkedinPost" ADD COLUMN "campaignId" TEXT;
ALTER TABLE "LinkedinPost" ADD COLUMN "scheduledFor" TIMESTAMP(3);
ALTER TABLE "LinkedinPost" ADD COLUMN "pillar" TEXT;
ALTER TABLE "LinkedinPost" ADD COLUMN "angle" TEXT;
ALTER TABLE "LinkedinPost" ADD COLUMN "impressions" INTEGER;
ALTER TABLE "LinkedinPost" ADD COLUMN "reactions" INTEGER;
ALTER TABLE "LinkedinPost" ADD COLUMN "comments" INTEGER;
ALTER TABLE "LinkedinPost" ADD CONSTRAINT "LinkedinPost_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "LinkedinCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
