import { db, FinFlowDatabase } from '../../storage/indexedDB/database';
import type { FinancialGoal, GoalMovement } from '../../types/finance';
import type { GoalRepository } from '../interfaces/GoalRepository';

export class IndexedDBGoalRepository implements GoalRepository {
  constructor(private database: FinFlowDatabase = db) {}

  // =========================================================================
  // Metas (Financial Goals)
  // =========================================================================

  async getAllGoals(): Promise<FinancialGoal[]> {
    return this.database.goals.toArray();
  }

  async getGoalById(id: string): Promise<FinancialGoal | null> {
    const goal = await this.database.goals.get(id);
    return goal ?? null;
  }

  async saveGoal(goal: FinancialGoal): Promise<void> {
    await this.database.goals.put(goal);
  }

  async saveGoalsBatch(goals: FinancialGoal[]): Promise<void> {
    if (goals.length === 0) return;
    await this.database.goals.bulkPut(goals);
  }

  async deleteGoal(id: string): Promise<void> {
    // Transação atômica Dexie: remove a meta e os movimentos associados no ledger
    await this.database.transaction(
      'rw',
      [this.database.goals, this.database.goalMovements],
      async () => {
        await this.database.goals.delete(id);
        await this.database.goalMovements.where('goalId').equals(id).delete();
      }
    );
  }

  async replaceGoals(goals: FinancialGoal[]): Promise<void> {
    await this.database.transaction('rw', this.database.goals, async () => {
      await this.database.goals.clear();
      if (goals.length > 0) {
        await this.database.goals.bulkPut(goals);
      }
    });
  }

  // =========================================================================
  // Movimentações de Metas (Goal Movements Ledger)
  // =========================================================================

  async getAllMovements(): Promise<GoalMovement[]> {
    const movements = await this.database.goalMovements.toArray();
    return movements.sort((a, b) => b.date.localeCompare(a.date));
  }

  async getMovementById(id: string): Promise<GoalMovement | null> {
    const movement = await this.database.goalMovements.get(id);
    return movement ?? null;
  }

  async getMovementsByGoalId(goalId: string): Promise<GoalMovement[]> {
    const movements = await this.database.goalMovements
      .where('goalId')
      .equals(goalId)
      .toArray();

    return movements.sort((a, b) => b.date.localeCompare(a.date));
  }

  async saveMovement(movement: GoalMovement): Promise<void> {
    await this.database.goalMovements.put(movement);
  }

  async saveMovementsBatch(movements: GoalMovement[]): Promise<void> {
    if (movements.length === 0) return;
    await this.database.goalMovements.bulkPut(movements);
  }

  async deleteMovement(id: string): Promise<void> {
    await this.database.goalMovements.delete(id);
  }

  async replaceMovements(movements: GoalMovement[]): Promise<void> {
    await this.database.transaction('rw', this.database.goalMovements, async () => {
      await this.database.goalMovements.clear();
      if (movements.length > 0) {
        await this.database.goalMovements.bulkPut(movements);
      }
    });
  }

  // =========================================================================
  // Operações Globais
  // =========================================================================

  async clearAll(): Promise<void> {
    await this.database.transaction(
      'rw',
      [this.database.goals, this.database.goalMovements],
      async () => {
        await this.database.goals.clear();
        await this.database.goalMovements.clear();
      }
    );
  }
}
