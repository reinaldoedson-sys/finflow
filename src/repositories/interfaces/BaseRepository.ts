/**
 * Interface base para operações fundamentais de persistência (CRUD).
 * Todas as operações são puramente locais ou de persistência desacoplada,
 * sem dependência de UI, listeners ou lógica de sincronização em nuvem.
 */
export interface BaseRepository<T extends { id: string }> {
  /** Retorna todas as entidades armazenadas */
  getAll(): Promise<T[]>;

  /** Busca uma entidade pelo seu identificador único */
  getById(id: string): Promise<T | null>;

  /** Salva ou atualiza uma entidade */
  save(item: T): Promise<void>;

  /** Salva ou atualiza uma lista de entidades em lote */
  saveBatch(items: T[]): Promise<void>;

  /** Remove uma entidade pelo ID */
  delete(id: string): Promise<void>;

  /** Substitui toda a coleção pelas entidades fornecidas */
  replaceAll(items: T[]): Promise<void>;

  /** Limpa todas as entidades da coleção */
  clear(): Promise<void>;

  /** Retorna a contagem total de itens armazenados */
  count(): Promise<number>;
}
