import { generateId } from '../../domain/id';
import type { FinancialSyncService } from '../financialSyncService';
import type { Transaction } from '../../types/finance';

export interface CreateTransactionDTO extends Omit<Transaction, 'id' | 'createdAt'> {}
export interface UpdateTransactionDTO extends Partial<Transaction> {}

/**
 * Application Service responsável pelos casos de uso de Transações:
 * - Criação de transação com validação de fluxo e persistência Local-First
 * - Atualização com mesclagem e garantia de integridade
 * - Exclusão com soft delete / tombstone
 * - Alternância de status de conciliação (completed / pending)
 *
 * Desacoplado de React, Firestore direto ou IndexedDB direto.
 */
export class TransactionApplicationService {
  constructor(private syncService: FinancialSyncService) {}

  /**
   * Cria uma nova transação aplicando validações e persistindo via FinancialSyncService.
   */
  async create(data: CreateTransactionDTO): Promise<Transaction> {
    if (!data.description || data.description.trim().length === 0) {
      throw new Error('A descrição da transação é obrigatória.');
    }
    if (typeof data.amount !== 'number' || isNaN(data.amount) || data.amount < 0) {
      throw new Error('O valor da transação deve ser um número positivo ou zero.');
    }
    if (!data.accountId) {
      throw new Error('A conta de origem (accountId) é obrigatória.');
    }
    if (!data.date) {
      throw new Error('A data da transação é obrigatória.');
    }

    const newId = generateId('tx');
    const createdAt = new Date().toISOString();

    const newTx: Transaction = {
      ...data,
      id: newId,
      createdAt,
    };

    // Persiste localmente no repositório e enfileira na SyncQueue
    await this.syncService.saveTransaction(newTx);

    return newTx;
  }

  /**
   * Atualiza uma transação existente preservando campos imutáveis.
   */
  async update(
    id: string,
    updatedFields: UpdateTransactionDTO,
    currentTx?: Transaction
  ): Promise<Transaction> {
    if (!id) {
      throw new Error('ID da transação é obrigatório para atualização.');
    }

    const updatedTx: Transaction = {
      ...(currentTx || { id }),
      ...updatedFields,
      id,
      createdAt: currentTx?.createdAt || new Date().toISOString(),
    } as Transaction;

    if (updatedTx.amount !== undefined && (typeof updatedTx.amount !== 'number' || updatedTx.amount < 0)) {
      throw new Error('O valor atualizado deve ser um número positivo ou zero.');
    }

    // Persiste no repositório local e enfileira na SyncQueue
    await this.syncService.saveTransaction(updatedTx);

    return updatedTx;
  }

  /**
   * Exclui uma transação aplicando soft delete e gerando tombstone na SyncQueue.
   */
  async delete(id: string): Promise<void> {
    if (!id) {
      throw new Error('ID da transação é obrigatório para exclusão.');
    }

    await this.syncService.deleteTransaction(id);
  }

  /**
   * Alterna o status de conciliação de uma transação ('completed' <-> 'pending').
   */
  async toggleStatus(id: string, currentTx?: Transaction): Promise<Transaction> {
    if (!currentTx) {
      throw new Error(`Transação "${id}" não encontrada para alteração de status.`);
    }

    const newStatus = currentTx.status === 'completed' ? 'pending' : 'completed';
    return this.update(id, { status: newStatus }, currentTx);
  }
}

export default TransactionApplicationService;
