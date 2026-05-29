// Plain TypeScript interface for the goal response shape.
// Includes all entity fields PLUS computed currentValue and progressPct.
// Using an interface (not a class) since no ClassSerializerInterceptor is
// wired globally and no properties need to be hidden from the raw entity.
export interface GoalResponseDto {
  id: string;
  userId: string;
  accountId: string | null;
  title: string;
  goalType: string;
  targetValue: number;
  currentValue: number; // computed at query time — NOT stored in DB
  progressPct: number; // computed at query time — NOT stored in DB
  isCompleted: boolean;
  isActive: boolean;
  period: string;
  notes: string | null;
  startDate: string;
  endDate: string;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
