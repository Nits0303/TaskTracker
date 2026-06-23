const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const users = await prisma.user.findMany({ take: 2 });
  if (users.length === 0) return console.log('no users');
  const userId = users[1].id; // The user who accepted
  
  const meetings = await prisma.meetingRequest.findMany();
  console.log('Meetings:', meetings.map(m => ({ id: m.id, title: m.title, status: m.status })));
  
  const blocks = await prisma.calendarBlock.findMany();
  console.log('Blocks:', blocks.map(b => ({ id: b.id, label: b.label, meetingRequestId: b.meetingRequestId })));

  const participants = await prisma.meetingParticipant.findMany();
  console.log('Participants:', participants.map(p => ({ id: p.id, status: p.status, meetingRequestId: p.meetingRequestId, userId: p.userId })));
  
  await prisma.$disconnect();
}
test().catch(console.error);
