
// app/lib/prisma.server.js
import { PrismaClient } from '@prisma/client';

// 单例模式，避免热重载时创建多个实例
let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      log: ['query', 'error', 'warn'],
    });
  }
  prisma = global.prisma;
}

export { prisma };
