import { Module } from '@nestjs/common';
import { WorkloadController } from './workload.controller';
import { WorkloadService } from './workload.service';

@Module({
  controllers: [WorkloadController],
  providers: [WorkloadService],
})
export class WorkloadModule {}
