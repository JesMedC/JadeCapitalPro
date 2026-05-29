import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentConversation } from './entities/agent-conversation.entity';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @InjectRepository(AgentConversation)
    private readonly conversationRepository: Repository<AgentConversation>,
  ) {}

  async getConversations(userId: string): Promise<AgentConversation[]> {
    return this.conversationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getConversation(id: string, userId: string): Promise<AgentConversation> {
    const conversation = await this.conversationRepository.findOne({ where: { id } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.userId !== userId) throw new ForbiddenException();
    return conversation;
  }

  async chat(
    userId: string,
    dto: { conversationId?: string; message: string },
  ): Promise<AgentConversation> {
    let conversation: AgentConversation;

    if (dto.conversationId) {
      conversation = await this.getConversation(dto.conversationId, userId);
    } else {
      conversation = this.conversationRepository.create({
        userId,
        title: dto.message.slice(0, 50),
        messages: [],
      });
    }

    conversation.messages = [
      ...(conversation.messages ?? []),
      {
        role: 'user',
        content: dto.message,
        timestamp: new Date().toISOString(),
      },
    ];

    // TODO: Route to LLM provider and store assistant response
    return this.conversationRepository.save(conversation);
  }
}
