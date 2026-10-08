import type { Budget } from '../../types/finance';
import type { BaseRepository } from './BaseRepository';

/**
 * Contrato de persistência para Orçamentos Financeiros (Budgets).
 * Responsável exclusivamente pelo armazenamento e consulta,
 * sem acoplamento a regras de sincronização ou listeners em tempo real.
 */
export interface BudgetRepository extends BaseRepository<Budget> {
  /**
   * Retorna os orçamentos de um determinado mês (formato YYYY-MM).
   */
  getByMonth(month: string): Promise<Budget[]>;

  /**
   * Retorna o orçamento específico de uma categoria para um determinado mês.
   */
  getByCategoryAndMonth(categoryId: string, month: string): Promise<Budget | null>;
}
