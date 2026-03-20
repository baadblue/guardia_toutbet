-- CreateEnum
CREATE TYPE "BetVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Bet" ADD COLUMN     "visibility" "BetVisibility" NOT NULL DEFAULT 'PRIVATE';

