import { Module } from '@nestjs/common';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ActivityModule } from '../activity/activity.module';
import { WorkspaceModule } from '../workspace/workspace.module';

@Module({
  imports: [PrismaModule, ActivityModule, WorkspaceModule],
  providers: [ProjectService],
  controllers: [ProjectController]
})
export class ProjectModule {}
