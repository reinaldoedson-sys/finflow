import { generateId } from '../../domain/id';
import type { FinancialSyncService } from '../financialSyncService';
import type { Account } from '../../types/finance';

export interface CreateAccountDTO extends Omit<Account, 'id' | 'currentBalance'> {}
export interface UpdateAccountDTO extends Partial<Account> {}

/**
 * Application Service responsável pelos casos de uso de Contas Bancárias:
 * - Criação de conta com saldo inicial e persistência Local-First
 * - Atualização de dados cadastrais
 * - Exclusão com soft delete / tombstone preservando integridade referencial
 *
 * Desacoplado de React, Firestore direto ou IndexedDB direto.
 */
export class AccountApplicationService {
  constructor(private syncService: FinancialSyncService) {}

  /**
   * Cria uma nova conta bancária e persiste via FinancialSyncService.
   */
  async create(data: CreateAccountDTO): Promise<Account> {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('O nome da conta é obrigatório.');
    }
    const initialBalance = typeof data.initialBalance === 'number' && !isNaN(data.initialBalance)
      ? data.initialBalance
      : 0;

    const newId = generateId('acc');
    const newAcc: Account = {
      ...data,
      id: newId,
      initialBalance,
      currentBalance: initialBalance,
    };

    // Persiste localmente no repositório e enfileira na SyncQueue
    await this.syncService.saveAccount(newAcc);
    await this.syncService.saveAccountBalanceSnapshot(newId, initialBalance).catch(err => {
      console.warn('[AccountApplicationService] Erro ao salvar balance snapshot inicial:', err);
    });

    return newAcc;
  }

  /**
   * Atualiza uma conta bancária preservando campos imutáveis.
   */
  async update(
    id: string,
    updatedFields: UpdateAccountDTO,
    currentAcc?: Account
  ): Promise<Account> {
    if (!id) {
      throw new Error('ID da conta é obrigatório para atualização.');
    }

    const updatedAcc: Account = {
      ...(currentAcc || { id }),
      ...updatedFields,
      id,
    } as Account;

    // Persiste atualização no repositório local e enfileira
    await this.syncService.saveAccount(updatedAcc);

    return updatedAcc;
  }

  /**
   * Exclui uma conta bancária aplicando soft-delete e tombstone.
   * Preserva o histórico de transações vinculadas.
   */
  async delete(id: string): Promise<void> {
    if (!id) {
      throw new Error('ID da conta é obrigatório para exclusão.');
    }

    await this.syncService.deleteAccount(id);
  }
}

export default AccountApplicationService;
