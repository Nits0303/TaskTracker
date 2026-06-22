const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.invite.findMany().then(console.log).finally(() => prisma.$disconnect());
