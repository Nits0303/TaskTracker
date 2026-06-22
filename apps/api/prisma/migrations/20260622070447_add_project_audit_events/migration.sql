-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEventType" ADD VALUE 'TASK_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE 'TASK_DELETED';
ALTER TYPE "AuditEventType" ADD VALUE 'ATTACHMENT_DELETED';
ALTER TYPE "AuditEventType" ADD VALUE 'COMMENT_DELETED_BY_ADMIN';


