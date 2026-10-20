import { db, FinFlowDatabase } from '../../storage/indexedDB/database';
import type { FinancialGoal, GoalMovement } from '../../types/finance';
import type { GoalRepository } from '../interfaces/GoalRepository';

export class IndexedDBGoalRepository implements GoalRepository {
  constructor(private database: FinFlowDatabase = db) {}

  // =========================================================================
  // Metas (Financial Goals)
  // =========================================================================

  async getAllGoals(includeDeleted = false): Promise<FinancialGoal[]> {
    const goals = await this.database.goals.toArray();
    if (includeDeleted) return goals;
    return goals.filter(g => !g.deleted);
  }

  async getGoalById(id: string, includeDeleted = false): Promise<FinancialGoal | null> {
    const goal = await this.database.goals.get(id);
    if (!goal) return null;
    if (!includeDeleted && goal.deleted) return null;
    return goal;
  }

  async saveGoal(goal: FinancialGoal): Promise<void> {
    await this.database.goals.put(goal);
  }

  async saveGoalsBatch(goals: FinancialGoal[]): Promise<void> {
    if (goals.length === 0) return;
    await this.database.goals.bulkPut(goals);
  }

  async deleteGoal(id: string): Promise<void> {
    // Soft delete atômico Dexie por padrão: marca a meta e os movimentos associados com tombstone
    await this.database.transaction(
      'rw',
      [this.database.goals, this.database.goalMovements],
      async () => {
        const existing = await this.database.goals.get(id);
        const now = new Date().toISOString();
        if (existing) {
          await this.database.goals.put({
            ...existing,
            deleted: true,
            deletedAt: now,
            tombstoneRevision: (existing.tombstoneRevision || existing.revision || 1) + 1,
          });
        } else {
          await this.database.goals.delete(id);
        }

        // Tombstone dos movimentos associados para manter integridade com o ledger de metas
        const movs = await this.database.goalMovements.where('goalId').equals(id).toArray();
        if (movs.length > 0) {
          const tombstonedMovs = movs.map(m => ({
            ...m,
            deleted: true,
            deletedAt: now,
            tombstoneRevision: (m.tombstoneRevision || m.revision || 1) + 1,
          }));
          await this.database.goalMovements.bulkPut(tombstonedMovs);
        }
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

  async getAllMovements(includeDeleted = false): Promise<GoalMovement[]> {
    const movements = await this.database.goalMovements.toArray();
    const filtered = includeDeleted ? movements : movements.filter(m => !m.deleted);
    return filtered.sort((a, b) => b.date.localeCompare(a.date));
  }

  async getMovementById(id: string, includeDeleted = false): Promise<GoalMovement | null> {
    const movement = await this.database.goalMovements.get(id);
    if (!movement) return null;
    if (!includeDeleted && movement.deleted) return null;
    return movement;
  }

  async getMovementsByGoalId(goalId: string, includeDeleted = false): Promise<GoalMovement[]> {
    const movements = await this.database.goalMovements
      .where('goalId')
      .equals(goalId)
      .toArray();

    const filtered = includeDeleted ? movements : movements.filter(m => !m.deleted);
    return filtered.sort((a, b) => b.date.localeCompare(a.date));
  }

  async saveMovement(movement: GoalMovement): Promise<void> {
    await this.database.goalMovements.put(movement);
  }

  async saveMovementsBatch(movements: GoalMovement[]): Promise<void> {
    if (movements.length === 0) return;
    await this.database.goalMovements.bulkPut(movements);
  }

  async deleteMovement(id: string): Promise<void> {
    // Soft delete por padrão para preservar integridade do ledger
    const existing = await this.database.goalMovements.get(id);
    if (existing) {
      await this.database.goalMovements.put({
        ...existing,
        deleted: true,
        deletedAt: new Date().toISOString(),
        tombstoneRevision: (existing.tombstoneRevision || existing.revision || 1) + 1,
      });
    } else {
      await this.database.goalMovements.delete(id);
    }
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
