import type { Account } from '../../types/finance';
import type { BaseRepository } from './BaseRepository';

/**
 * Contrato de persistência para Contas Financeiras.
 * Responsável exclusivamente pelo armazenamento e consulta de contas,
 * sem acoplamento a regras de sincronização ou listeners em tempo real.
 */
export interface AccountRepository extends BaseRepository<Account> {
  /**
   * Retorna todas as contas ativas (ou inclui tombstoned se includeDeleted for true).
   */
  getAll(includeDeleted?: boolean): Promise<Account[]>;

  /**
   * Busca uma conta pelo identificador (ou inclui tombstoned se includeDeleted for true).
   */
  getById(id: string, includeDeleted?: boolean): Promise<Account | null>;

  /**
   * Retorna a contagem de contas (apenas ativas por padrão).
   */
  count(includeDeleted?: boolean): Promise<number>;

  /**
   * Retorna contas filtradas por tipo (ex: 'checking', 'savings', 'investment', 'cash').
   */
  getByType(type: Account['type'], includeDeleted?: boolean): Promise<Account[]>;

  /**
   * Salva um snapshot do saldo calculado de uma conta específica.
   * O saldo real é derivado do ledger financeiro de transações.
   */
  saveBalanceSnapshot(id: string, balanceSnapshot: number): Promise<void>;
}
