import type { Account } from '../../types/finance';
import type { BaseRepository } from './BaseRepository';

/**
 * Contrato de persistência para Contas Financeiras.
 * Responsável exclusivamente pelo armazenamento e consulta de contas,
 * sem acoplamento a regras de sincronização ou listeners em tempo real.
 */
export interface AccountRepository extends BaseRepository<Account> {
  /**
   * Retorna contas filtradas por tipo (ex: 'checking', 'savings', 'investment', 'cash').
   */
  getByType(type: Account['type']): Promise<Account[]>;

  /**
   * Salva um snapshot do saldo calculado de uma conta específica.
   * O saldo real é derivado do ledger financeiro de transações.
   */
  saveBalanceSnapshot(id: string, balanceSnapshot: number): Promise<void>;
}
