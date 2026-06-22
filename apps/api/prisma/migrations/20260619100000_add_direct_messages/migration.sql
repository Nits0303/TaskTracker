-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('Project', 'Direct');

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN "type" "ChannelType" NOT NULL DEFAULT 'Project';
ALTER TABLE "Channel" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Channel" ADD COLUMN "participant1Id" TEXT;
ALTER TABLE "Channel" ADD COLUMN "participant2Id" TEXT;

-- UpdateData (Set workspaceId based on Project)
UPDATE "Channel" SET "workspaceId" = (SELECT "workspaceId" FROM "Project" WHERE "Project"."id" = "Channel"."projectId");

-- AlterTable Constraints
ALTER TABLE "Channel" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Channel" ALTER COLUMN "projectId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Channel_workspaceId_participant1Id_participant2Id_key" ON "Channel"("workspaceId", "participant1Id", "participant2Id");

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
