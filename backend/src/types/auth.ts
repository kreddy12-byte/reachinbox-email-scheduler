import type { User as PrismaUser } from '@prisma/client';

export type AuthUser = Pick<PrismaUser, 'id' | 'name' | 'email' | 'avatarUrl'>;
