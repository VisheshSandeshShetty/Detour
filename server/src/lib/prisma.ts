// One shared database connection for the whole server.

import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
