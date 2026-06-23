const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanup() {
  const blocks = await prisma.calendarBlock.findMany({
    where: { meetingRequestId: { not: null } },
  });

  const seen = new Set();
  const toDelete = [];

  for (const block of blocks) {
    const key = `${block.userId}-${block.meetingRequestId}`;
    if (seen.has(key)) {
      toDelete.push(block.id);
    } else {
      seen.add(key);
    }
  }

  if (toDelete.length > 0) {
    console.log(`Deleting ${toDelete.length} duplicate blocks...`);
    await prisma.calendarBlock.deleteMany({
      where: { id: { in: toDelete } }
    });
    console.log('Cleaned up duplicates.');
  } else {
    console.log('No duplicates found.');
  }

  await prisma.$disconnect();
}

cleanup().catch(e => {
  console.error(e);
  process.exit(1);
});
