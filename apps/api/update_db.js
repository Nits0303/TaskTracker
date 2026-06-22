const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "NotificationPreference" ADD COLUMN "emailTaskAssignments" BOOLEAN NOT NULL DEFAULT true;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "NotificationPreference" ADD COLUMN "emailMentions" BOOLEAN NOT NULL DEFAULT true;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "NotificationPreference" ADD COLUMN "emailTaskDeadlines" BOOLEAN NOT NULL DEFAULT true;`);

    await prisma.$executeRawUnsafe(`ALTER TABLE "NotificationPreference" ADD COLUMN "inAppTaskAssignments" BOOLEAN NOT NULL DEFAULT true;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "NotificationPreference" ADD COLUMN "inAppMentions" BOOLEAN NOT NULL DEFAULT true;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "NotificationPreference" ADD COLUMN "inAppTaskDeadlines" BOOLEAN NOT NULL DEFAULT true;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "NotificationPreference" ADD COLUMN "inAppTaskUpdates" BOOLEAN NOT NULL DEFAULT true;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "NotificationPreference" ADD COLUMN "inAppCalendarEvents" BOOLEAN NOT NULL DEFAULT true;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "NotificationPreference" ADD COLUMN "inAppMemberJoined" BOOLEAN NOT NULL DEFAULT true;`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "NotificationPreference" ADD COLUMN "inAppDirectMessages" BOOLEAN NOT NULL DEFAULT true;`);

    console.log("Successfully altered NotificationPreference table.");
  } catch (err) {
    console.error("Error altering table:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
