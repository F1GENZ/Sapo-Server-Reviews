import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ReviewModule } from '../review/review.module';
import { QnaModule } from '../qna/qna.module';

@Module({
  imports: [ReviewModule, QnaModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
