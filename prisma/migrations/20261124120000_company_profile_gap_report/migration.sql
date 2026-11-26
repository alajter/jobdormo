-- Company profile fields
ALTER TABLE "Company" ADD COLUMN "description" TEXT;
ALTER TABLE "Company" ADD COLUMN "areas" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Company" ADD COLUMN "stage" TEXT;
ALTER TABLE "Company" ADD COLUMN "profileUpdatedAt" TIMESTAMP(3);

-- Gap reports
CREATE TABLE "GapReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobCount" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    CONSTRAINT "GapReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GapReport_userId_createdAt_idx" ON "GapReport"("userId", "createdAt");
ALTER TABLE "GapReport" ADD CONSTRAINT "GapReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
