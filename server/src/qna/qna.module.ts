import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { QnaStoreService } from './qna-store.service';
import { QnaService } from './qna.service';
import { QnaController } from './qna.controller';
import { PublicQnaController } from './public-qna.controller';

/**
 * Q&A module.
 *
 * Provides Q&A CRUD + moderation services backed by Prisma (Postgres only).
 * No metafield sync, no BullMQ jobs, no Redis locks.
 * Exports QnaStoreService and QnaService for consumption by other modules.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [QnaController, PublicQnaController],
  providers: [QnaStoreService, QnaService],
  exports: [QnaStoreService, QnaService],
})
export class QnaModule {}
