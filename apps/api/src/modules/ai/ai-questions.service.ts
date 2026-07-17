import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AiQuestionDTO } from '@atlas/shared';
import type { AiQuestion } from '@atlas/db';
import { PrismaService } from '../../core/prisma.service.js';
import { TimelineService } from '../../core/timeline.service.js';
import { MemoryService } from '../../core/memory.service.js';

function toDto(q: AiQuestion): AiQuestionDTO {
  return {
    id: q.id,
    question: q.question,
    rationale: q.rationale,
    relatesTo: q.relatesTo,
    status: q.status,
    createdAt: q.createdAt.toISOString(),
  };
}

@Injectable()
export class AiQuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: TimelineService,
    private readonly memory: MemoryService,
  ) {}

  private async owned(userId: string, id: string): Promise<AiQuestion> {
    const q = await this.prisma.client.aiQuestion.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Question not found');
    if (q.userId !== userId) throw new ForbiddenException();
    return q;
  }

  async listOpen(userId: string): Promise<AiQuestionDTO[]> {
    const qs = await this.prisma.client.aiQuestion.findMany({
      where: { userId, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    });
    return qs.map(toDto);
  }

  async answer(userId: string, id: string, answer: string): Promise<AiQuestionDTO> {
    await this.owned(userId, id);
    const q = await this.prisma.client.aiQuestion.update({
      where: { id },
      data: { status: 'ANSWERED', answer, answeredAt: new Date() },
    });
    await this.timeline.write({
      userId,
      type: 'ai_question.answered',
      source: 'ai',
      title: `Answered Atlas: ${q.question.slice(0, 60)}`,
      summary: answer.slice(0, 120),
      refType: 'ai_question',
      refId: q.id,
    });
    // The Q+A becomes durable, retrievable knowledge about the user.
    await this.memory.queueForEmbedding(userId, 'qa', q.id, `Q: ${q.question}\nA: ${answer}`);
    return toDto(q);
  }

  async dismiss(userId: string, id: string): Promise<{ ok: true }> {
    await this.owned(userId, id);
    await this.prisma.client.aiQuestion.update({ where: { id }, data: { status: 'DISMISSED' } });
    return { ok: true };
  }
}
