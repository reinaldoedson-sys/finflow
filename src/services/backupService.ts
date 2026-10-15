import { encryptData, decryptData } from '../utils/crypto';
import { resolveGoalInitialAmount, calculateGoalBalance } from '../domain/calculations';
import type {
  Category,
  Account,
  CreditCard,
  Budget,
  FinancialGoal,
  GoalMovement,
  InstallmentPlan,
  Transaction,
  InvestmentAsset,
  InvestmentTransaction,
  CurrencyCode,
} from '../types/finance';

export interface BackupData {
  currency?: CurrencyCode;
  categories: Category[];
  accounts: Account[];
  creditCards: CreditCard[];
  budgets: Budget[];
  goals: FinancialGoal[];
  goalMovements: GoalMovement[];
  installmentPlans: InstallmentPlan[];
  transactions: Transaction[];
  investments: InvestmentAsset[];
  investmentTransactions: InvestmentTransaction[];
}

export interface BackupEnvelope extends BackupData {
  version: string;
  exportedAt: string;
}

export interface EncryptedBackupEnvelope {
  isEncrypted: true;
  cipherText: string;
  exportedAt: string;
  version: string;
}

export interface ImportResult {
  success: boolean;
  message: string;
  data?: {
    categories?: Category[];
    accounts?: Account[];
    creditCards?: CreditCard[];
    budgets?: Budget[];
    goals?: FinancialGoal[];
    goalMovements?: GoalMovement[];
    installmentPlans?: InstallmentPlan[];
    transactions?: Transaction[];
    investments?: InvestmentAsset[];
    investmentTransactions?: InvestmentTransaction[];
    currency?: CurrencyCode;
  };
}

/**
 * Serviço desacoplado responsável por operações de Backup, Restauração
 * e Criptografia WebCrypto (AES-GCM 256 bits).
 * Não possui qualquer dependência de hooks ou estado do React.
 */
export class BackupService {
  /**
   * Exporta os dados financeiros formatados em JSON e opcionalmente criptografados.
   */
  async export(data: BackupData, passphrase?: string): Promise<string> {
    const backupPayload: BackupEnvelope = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      currency: data.currency || 'BRL',
      categories: data.categories || [],
      accounts: data.accounts || [],
      creditCards: data.creditCards || [],
      budgets: data.budgets || [],
      goals: data.goals || [],
      goalMovements: data.goalMovements || [],
      installmentPlans: data.installmentPlans || [],
      transactions: data.transactions || [],
      investments: data.investments || [],
      investmentTransactions: data.investmentTransactions || [],
    };

    const jsonString = JSON.stringify(backupPayload, null, 2);

    if (passphrase && passphrase.trim().length > 0) {
      const encrypted = await encryptData(jsonString, passphrase.trim());
      const envelope: EncryptedBackupEnvelope = {
        isEncrypted: true,
        cipherText: encrypted,
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
      };
      return JSON.stringify(envelope, null, 2);
    }

    return jsonString;
  }

  /**
   * Importa e valida um arquivo de backup, descriptografando caso necessário
   * e normalizando metas e saldos derivados.
   */
  async import(content: string, passphrase?: string): Promise<ImportResult> {
    try {
      if (!content || typeof content !== 'string') {
        return { success: false, message: 'Conteúdo de backup inválido ou vazio.' };
      }

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        return { success: false, message: 'Arquivo corrompido: formato JSON inválido.' };
      }

      let payload = parsed;

      // Tratamento de arquivo criptografado
      if (parsed.isEncrypted && parsed.cipherText) {
        if (!passphrase || passphrase.trim().length === 0) {
          return {
            success: false,
            message: 'Este arquivo está criptografado. Insira a senha correta para restaurar.',
          };
        }

        try {
          const decryptedJson = await decryptData(parsed.cipherText, passphrase.trim());
          payload = JSON.parse(decryptedJson);
        } catch {
          return {
            success: false,
            message: 'Falha na descriptografia: senha incorreta ou arquivo adulterado.',
          };
        }
      }

      // Validação de estrutura mínima
      if (!payload || typeof payload !== 'object' || !payload.accounts || !payload.transactions) {
        return {
          success: false,
          message: 'Arquivo de backup inválido ou com formato incompatível.',
        };
      }

      // Normalização de metas financeiras
      const importedMovements: GoalMovement[] = Array.isArray(payload.goalMovements)
        ? payload.goalMovements
        : [];

      const normalizedGoals: FinancialGoal[] | undefined = Array.isArray(payload.goals)
        ? payload.goals.map((g: FinancialGoal) => {
            const movs = importedMovements.filter((m: GoalMovement) => m.goalId === g.id);
            const initial = resolveGoalInitialAmount(g, movs);
            return {
              ...g,
              initialAmount: initial,
              currentAmount: calculateGoalBalance(initial, movs),
            };
          })
        : undefined;

      return {
        success: true,
        message: 'Backup restaurado com sucesso! Seus dados foram atualizados.',
        data: {
          categories: Array.isArray(payload.categories) ? payload.categories : undefined,
          accounts: Array.isArray(payload.accounts) ? payload.accounts : undefined,
          creditCards: Array.isArray(payload.creditCards) ? payload.creditCards : undefined,
          budgets: Array.isArray(payload.budgets) ? payload.budgets : undefined,
          goals: normalizedGoals,
          goalMovements: importedMovements,
          installmentPlans: Array.isArray(payload.installmentPlans)
            ? payload.installmentPlans
            : undefined,
          transactions: Array.isArray(payload.transactions) ? payload.transactions : undefined,
          investments: Array.isArray(payload.investments) ? payload.investments : undefined,
          investmentTransactions: Array.isArray(payload.investmentTransactions)
            ? payload.investmentTransactions
            : undefined,
          currency: payload.currency,
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao importar dados.';
      return { success: false, message: msg };
    }
  }

  /**
   * Criptografa uma string arbitrária com AES-GCM 256.
   */
  async encrypt(text: string, passphrase: string): Promise<string> {
    return encryptData(text, passphrase);
  }

  /**
   * Descriptografa um cipherText AES-GCM 256.
   */
  async decrypt(cipherText: string, passphrase: string): Promise<string> {
    return decryptData(cipherText, passphrase);
  }
}

export const backupService = new BackupService();
export default backupService;
