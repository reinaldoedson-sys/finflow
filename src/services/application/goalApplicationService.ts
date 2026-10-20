import { generateId } from '../../domain/id';
import { resolveGoalInitialAmount, calculateGoalBalance } from '../../domain/calculations';
import type { FinancialSyncService } from '../financialSyncService';
import type { FinancialGoal, GoalMovement, GoalMovementType } from '../../types/finance';

export type CreateGoalDTO = Omit<FinancialGoal, 'id' | 'currentAmount'>;
export type UpdateGoalDTO = Partial<FinancialGoal>;
export type CreateGoalMovementDTO = Omit<GoalMovement, 'id' | 'createdAt'>;

export interface AddMovementResult {
  movement: GoalMovement;
  updatedGoal?: FinancialGoal;
}

export interface DeleteMovementResult {
  updatedGoal?: FinancialGoal;
}

/**
 * Application Service responsável pelos casos de uso de Metas Financeiras (Goals)
 * e seu Ledger Contábil de Movimentações (GoalMovements):
 * - Criação de meta com saldo inicial
 * - Atualização de dados da meta
 * - Exclusão de meta e de suas movimentações vinculadas
 * - Registro de aportes e resgates (movimentações) com causalidade
 * - Exclusão de movimentações com recálculo de saldo derivado
 *
 * Desacoplado de React, Firestore direto ou IndexedDB direto.
 */
export class GoalApplicationService {
  constructor(private syncService: FinancialSyncService) {}

  /**
   * Cria uma nova meta financeira e persiste via FinancialSyncService.
   */
  async create(data: CreateGoalDTO): Promise<FinancialGoal> {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('O nome da meta é obrigatório.');
    }
    if (typeof data.targetAmount !== 'number' || data.targetAmount <= 0) {
      throw new Error('O valor alvo da meta deve ser maior que zero.');
    }

    const newId = generateId('goal');
    const initialAmount = data.initialAmount ?? 0;
    const newGoal: FinancialGoal = {
      ...data,
      id: newId,
      initialAmount,
      currentAmount: initialAmount,
    };

    // Persistência Local-First no IndexedDB e SyncQueue
    await this.syncService.saveGoal(newGoal);

    return newGoal;
  }

  /**
   * Atualiza os campos de uma meta financeira existente.
   */
  async update(
    id: string,
    updatedFields: UpdateGoalDTO,
    currentGoal?: FinancialGoal
  ): Promise<FinancialGoal> {
    if (!id) {
      throw new Error('ID da meta é obrigatório para atualização.');
    }

    const merged: FinancialGoal = {
      ...(currentGoal || {
        name: '',
        targetAmount: 0,
        currentAmount: 0,
        targetDate: '',
        color: '',
        icon: '',
      }),
      ...updatedFields,
      id,
      currentAmount: updatedFields.currentAmount ?? currentGoal?.currentAmount ?? 0,
    };

    // Persistência Local-First no IndexedDB e SyncQueue
    await this.syncService.saveGoal(merged);

    return merged;
  }

  /**
   * Exclui uma meta financeira e todas as movimentações ativas vinculadas.
   */
  async delete(id: string, movementsToDelete: GoalMovement[] = []): Promise<void> {
    if (!id) {
      throw new Error('ID da meta é obrigatório para exclusão.');
    }

    // 1. Soft-delete / tombstone Local-First da meta
    await this.syncService.deleteGoal(id);

    // 2. Soft-delete de todas as movimentações vinculadas
    for (const mov of movementsToDelete) {
      await this.syncService.deleteGoalMovement(mov.id);
    }
  }

  /**
   * Adiciona uma movimentação ao ledger contábil da meta (depósito ou resgate),
   * registrando a dependência causal e recalculando o saldo derivado da meta.
   */
  async addMovement(
    movement: CreateGoalMovementDTO,
    targetGoal?: FinancialGoal,
    existingMovements: GoalMovement[] = []
  ): Promise<AddMovementResult> {
    if (!movement.goalId) {
      throw new Error('O ID da meta vinculada (goalId) é obrigatório.');
    }
    if (typeof movement.amount !== 'number' || movement.amount <= 0) {
      throw new Error('O valor da movimentação deve ser maior que zero.');
    }

    const newId = generateId('gmov');
    const createdAt = new Date().toISOString();
    const newMovement: GoalMovement = {
      ...movement,
      id: newId,
      amount: Math.abs(movement.amount),
      createdAt,
    };

    // 1. Persistência Local-First da movimentação no IndexedDB e SyncQueue com causalidade
    await this.syncService.saveGoalMovement(newMovement, {
      dependsOn: [{ entityName: 'goals', entityId: movement.goalId }],
    });

    // 2. Se a meta de destino foi fornecida, recalcula o saldo derivado
    let updatedGoal: FinancialGoal | undefined;
    if (targetGoal) {
      const remainingMovements = existingMovements.filter(m => m.goalId === movement.goalId);
      const initial = resolveGoalInitialAmount(targetGoal, remainingMovements);
      const updatedBalance = calculateGoalBalance(initial, [...remainingMovements, newMovement]);

      updatedGoal = {
        ...targetGoal,
        initialAmount: initial,
        currentAmount: updatedBalance,
      };

      await this.syncService.saveGoal(updatedGoal);
    }

    return { movement: newMovement, updatedGoal };
  }

  /**
   * Registra um depósito ou resgate em uma meta.
   */
  async addDeposit(
    id: string,
    amount: number,
    notes?: string,
    date?: string,
    targetGoal?: FinancialGoal,
    existingMovements: GoalMovement[] = []
  ): Promise<AddMovementResult> {
    const isWithdrawal = amount < 0;
    const type: GoalMovementType = isWithdrawal ? 'withdrawal' : 'deposit';
    const absAmount = Math.abs(amount);
    const movDate = date || new Date().toISOString().split('T')[0];

    return this.addMovement(
      {
        goalId: id,
        type,
        amount: absAmount,
        date: movDate,
        notes: notes || (isWithdrawal ? 'Resgate da meta' : 'Aporte na meta'),
      },
      targetGoal,
      existingMovements
    );
  }

  /**
   * Exclui uma movimentação contábil do ledger e recalcula o saldo derivado da meta.
   */
  async deleteMovement(
    id: string,
    targetGoal?: FinancialGoal,
    remainingMovements: GoalMovement[] = []
  ): Promise<DeleteMovementResult> {
    if (!id) {
      throw new Error('ID da movimentação é obrigatório para exclusão.');
    }

    // 1. Soft-delete / tombstone Local-First no ledger de metas
    await this.syncService.deleteGoalMovement(id);

    // 2. Se a meta associada foi informada, recalcula o saldo derivado
    let updatedGoal: FinancialGoal | undefined;
    if (targetGoal) {
      const activeMovements = remainingMovements.filter(m => m.id !== id && m.goalId === targetGoal.id);
      const initial = resolveGoalInitialAmount(targetGoal, activeMovements);
      const updatedBalance = calculateGoalBalance(initial, activeMovements);

      updatedGoal = {
        ...targetGoal,
        initialAmount: initial,
        currentAmount: updatedBalance,
      };

      await this.syncService.saveGoal(updatedGoal);
    }

    return { updatedGoal };
  }
}

export default GoalApplicationService;
