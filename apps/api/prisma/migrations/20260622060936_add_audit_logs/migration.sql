-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('LOGIN_SUCCESS', 'LOGOUT', 'BRUTE_FORCE_DETECTED', 'MEMBER_INVITED', 'MEMBER_REMOVED', 'MEMBER_ROLE_CHANGED', 'WORKSPACE_CREATED', 'WORKSPACE_UPDATED', 'WORKSPACE_ARCHIVED', 'WORKSPACE_DELETED', 'PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_ARCHIVED', 'PROJECT_DELETED', 'PROJECT_MEMBER_ADDED', 'PROJECT_MEMBER_REMOVED', 'PROJECT_MEMBER_ROLE_CHANGED', 'WORKSPACE_SETTINGS_CHANGED', 'PROJECT_SETTINGS_CHANGED', 'RATE_LIMIT_VIOLATION');

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "emailMentions" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailTaskAssignments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailTaskDeadlines" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "inAppCalendarEvents" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "inAppDirectMessages" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "inAppMemberJoined" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "inAppMentions" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "inAppTaskAssignments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "inAppTaskDeadlines" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "inAppTaskUpdates" BOOLEAN NOT NULL DEFAULT true;



-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "event" "AuditEventType" NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "resourceName" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_event_idx" ON "AuditLog"("workspaceId", "event");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
