import type { FinancialGoal, GoalMovement } from '../../types/finance';

/**
 * Contrato de persistência para Metas Financeiras e seu Ledger de Movimentações.
 * Responsável exclusivamente pelo armazenamento e consulta,
 * sem acoplamento a regras de sincronização ou listeners em tempo real.
 */
export interface GoalRepository {
  // --- Metas (Financial Goals) ---
  getAllGoals(): Promise<FinancialGoal[]>;
  getGoalById(id: string): Promise<FinancialGoal | null>;
  saveGoal(goal: FinancialGoal): Promise<void>;
  saveGoalsBatch(goals: FinancialGoal[]): Promise<void>;
  deleteGoal(id: string): Promise<void>;
  replaceGoals(goals: FinancialGoal[]): Promise<void>;

  // --- Movimentações de Metas (Goal Movements Ledger) ---
  getAllMovements(): Promise<GoalMovement[]>;
  getMovementById(id: string): Promise<GoalMovement | null>;
  getMovementsByGoalId(goalId: string): Promise<GoalMovement[]>;
  saveMovement(movement: GoalMovement): Promise<void>;
  saveMovementsBatch(movements: GoalMovement[]): Promise<void>;
  deleteMovement(id: string): Promise<void>;
  replaceMovements(movements: GoalMovement[]): Promise<void>;

  // --- Operações Globais ---
  clearAll(): Promise<void>;
}
