import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const REQUIRE_PROJECT_ROLE_KEY = 'requireProjectRole';
export const RequireProjectRole = (role: Role) => SetMetadata(REQUIRE_PROJECT_ROLE_KEY, role);
