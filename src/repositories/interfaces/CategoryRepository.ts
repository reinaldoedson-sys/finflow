import type { Category } from '../../types/finance';
import type { BaseRepository } from './BaseRepository';

/**
 * Contrato de persistência para Categorias Financeiras.
 * Responsável exclusivamente pelo armazenamento e consulta,
 * sem acoplamento a regras de sincronização ou listeners em tempo real.
 */
export interface CategoryRepository extends BaseRepository<Category> {
  /**
   * Retorna categorias filtradas pelo tipo ('expense', 'income', 'both').
   */
  getByType(type: 'expense' | 'income' | 'both', includeDeleted?: boolean): Promise<Category[]>;
}
