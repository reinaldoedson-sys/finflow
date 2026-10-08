import type { Transaction } from '../../types/finance';
import type { BaseRepository } from './BaseRepository';

export interface TransactionPagedOptions {
  cursor?: string;
  limit?: number;
  startDate?: string;
  endDate?: string;
  accountId?: string;
  creditCardId?: string;
  categoryId?: string;
}

export interface TransactionPagedResult {
  items: Transaction[];
  nextCursor?: string;
  hasMore: boolean;
  total?: number;
}

/**
 * Contrato de persistência para Transações Financeiras.
 * Responsável exclusivamente pelo armazenamento e consulta de dados,
 * sem acoplamento a regras de sincronização ou listeners em tempo real.
 */
export interface TransactionRepository extends BaseRepository<Transaction> {
  /**
   * Retorna transações filtradas por intervalo de datas (YYYY-MM-DD),
   * ordenadas decrescentemente por data.
   */
  getByDateRange(startDate?: string, endDate?: string): Promise<Transaction[]>;

  /**
   * Retorna transações pertencentes a um mês específico (formato YYYY-MM).
   */
  getByMonth(yearMonth: string): Promise<Transaction[]>;

  /**
   * Retorna transações associadas a uma conta bancária específica.
   */
  getByAccountId(accountId: string): Promise<Transaction[]>;

  /**
   * Retorna transações associadas a um cartão de crédito específico.
   */
  getByCreditCardId(creditCardId: string): Promise<Transaction[]>;

  /**
   * Realiza consulta paginada local com filtros opcionais.
   */
  getPaged(options?: TransactionPagedOptions): Promise<TransactionPagedResult>;
}
