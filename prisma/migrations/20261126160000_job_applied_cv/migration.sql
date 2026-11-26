-- Which CV went out with the application ("tailored" or "generic") and its
-- ATS keyword match at that moment; and a switch to stop follow-up prompts.
ALTER TABLE "Job" ADD COLUMN "appliedCv" TEXT;
ALTER TABLE "Job" ADD COLUMN "appliedAts" INTEGER;
ALTER TABLE "Job" ADD COLUMN "followUpOff" BOOLEAN NOT NULL DEFAULT false;
