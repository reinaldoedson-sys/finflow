import type { InstallmentPlan } from '../../types/finance';
import type { BaseRepository } from './BaseRepository';

/**
 * Contrato de persistência para Planos de Parcelamento (Installment Plans).
 * Responsável exclusivamente pelo armazenamento e consulta,
 * sem acoplamento a regras de sincronização ou listeners em tempo real.
 */
export interface InstallmentPlanRepository extends BaseRepository<InstallmentPlan> {
  /**
   * Retorna os planos de parcelamento vinculados a uma conta específica.
   */
  getByAccountId(accountId: string, includeDeleted?: boolean): Promise<InstallmentPlan[]>;

  /**
   * Retorna os planos de parcelamento vinculados a um cartão de crédito específico.
   */
  getByCreditCardId(creditCardId: string, includeDeleted?: boolean): Promise<InstallmentPlan[]>;
}
