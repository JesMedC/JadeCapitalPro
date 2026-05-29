import { User } from '../modules/auth/entities/user.entity';
import { Role } from '../modules/auth/entities/role.entity';
import { UserRole } from '../modules/auth/entities/user-role.entity';
import { TradingAccount } from '../modules/accounts/entities/trading-account.entity';
import { AccountAccess } from '../modules/accounts/entities/account-access.entity';
import { Trade } from '../modules/trades/entities/trade.entity';
import { JournalEntry } from '../modules/journal/entities/journal-entry.entity';
import { Goal } from '../modules/goals/entities/goal.entity';
import { Alert } from '../modules/alerts/entities/alert.entity';
import { Candle } from '../modules/market-data/entities/candle.entity';
import { ScannerResult } from '../modules/scanner/entities/scanner-result.entity';
import { BacktestSession } from '../modules/backtest/entities/backtest-session.entity';
import { AgentConversation } from '../modules/agent/entities/agent-conversation.entity';
import { Transaction } from '../modules/transactions/entities/transaction.entity';
import { PatternBookmark } from '../modules/bookmarks/entities/pattern-bookmark.entity';

const entities = [
  User,
  Role,
  UserRole,
  TradingAccount,
  AccountAccess,
  Trade,
  JournalEntry,
  Goal,
  Alert,
  Candle,
  ScannerResult,
  BacktestSession,
  AgentConversation,
  Transaction,
  PatternBookmark,
];

export default entities;
