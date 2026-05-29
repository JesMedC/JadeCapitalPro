import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AgentService } from './agent.service';
import { AgentConversation } from './entities/agent-conversation.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../auth/strategies/jwt.strategy';

@Controller('agent')
@UseGuards(AuthGuard('jwt'))
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get('conversations')
  async getConversations(@CurrentUser() user: UserPayload): Promise<AgentConversation[]> {
    return this.agentService.getConversations(user.sub);
  }

  @Get('conversations/:id')
  async getConversation(
    @Param('id') id: string,
    @CurrentUser() user: UserPayload,
  ): Promise<AgentConversation> {
    return this.agentService.getConversation(id, user.sub);
  }

  @Post('chat')
  async sendMessage(
    @Body() dto: { conversationId?: string; message: string },
    @CurrentUser() user: UserPayload,
  ): Promise<AgentConversation> {
    return this.agentService.chat(user.sub, dto);
  }
}
