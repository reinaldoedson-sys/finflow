import type { CreditCard } from '../../types/finance';
import type { BaseRepository } from './BaseRepository';

/**
 * Contrato de persistência para Cartões de Crédito.
 * Responsável exclusivamente pelo armazenamento e consulta de cartões,
 * sem acoplamento a regras de sincronização ou listeners em tempo real.
 */
export interface CreditCardRepository extends BaseRepository<CreditCard> {
  /**
   * Retorna todos os cartões ativos (ou inclui tombstoned se includeDeleted for true).
   */
  getAll(includeDeleted?: boolean): Promise<CreditCard[]>;

  /**
   * Busca um cartão pelo identificador (ou inclui tombstoned se includeDeleted for true).
   */
  getById(id: string, includeDeleted?: boolean): Promise<CreditCard | null>;

  /**
   * Retorna a contagem de cartões (apenas ativos por padrão).
   */
  count(includeDeleted?: boolean): Promise<number>;

  /**
   * Salva um snapshot do valor de fatura calculado de um cartão específico.
   * O valor real da fatura é derivado do ledger financeiro de transações.
   */
  saveInvoiceSnapshot(id: string, invoiceSnapshot: number): Promise<void>;
}
