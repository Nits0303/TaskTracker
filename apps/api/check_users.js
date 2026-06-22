const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.user.findMany().then(users => console.log(users.map(u => u.email))).finally(() => prisma.$disconnect());
