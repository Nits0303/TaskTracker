const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const meetingId = 'f2085d86-bfec-4341-ae60-18172a3c9167';
  
  // Find participants for this meeting
  const participants = await prisma.meetingParticipant.findMany({
    where: { meetingRequestId: meetingId }
  });
  console.log('Participants for f208:', participants.map(p => ({ id: p.id, userId: p.userId })));

  // Try the exact API query for userId b8a47f72-df25-446e-b74c-088123b7ae64
  const userId = 'b8a47f72-df25-446e-b74c-088123b7ae64';
  const meetings = await prisma.meetingRequest.findMany({
    where: {
      OR: [
        { participants: { some: { userId } } },
        { requesterId: userId }
      ]
    },
    include: {
      requester: { select: { id: true } },
      participants: { include: { user: { select: { id: true } } } },
    },
  });
  
  console.log('API Returned Meetings for user B:', meetings.map(m => m.id));
  
  await prisma.$disconnect();
}
test().catch(console.error);
