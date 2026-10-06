import * as fs from 'fs';
import * as path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('--- INICIANDO TESTES DE SEGURANÇA DAS REGRAS DO FIRESTORE (ETAPA 8) ---');

// 1. Auditoria Estática do Arquivo firestore.rules
const rulesContent = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf-8');

// Teste 1: Regra para match /investments/{investmentId} está presente
assert(
  rulesContent.includes('match /investments/{investmentId}'),
  'Teste 1: Bloco de regras para /investments/{investmentId} está configurado'
);

// Teste 2: create possui restrição de dono, ID e chaves obrigatórias
assert(
  rulesContent.includes("incoming().keys().hasAll(['ticker', 'name', 'type', 'quantity', 'averagePrice', 'currentPrice', 'currency', 'userId', 'createdAt'])"),
  'Teste 2: Criação exige todas as chaves obrigatórias do modelo'
);

// Teste 3: create e update bloqueiam campos arbitrários com hasOnly
const hasOnlyPattern = "hasOnly(['ticker', 'name', 'type', 'quantity', 'averagePrice', 'currentPrice', 'previousClose', 'changePercent', 'currency', 'institution', 'autoUpdate', 'lastPriceUpdate', 'notes', 'userId', 'createdAt'])";
const hasOnlyOccurrences = rulesContent.split(hasOnlyPattern).length - 1;
assert(
  hasOnlyOccurrences >= 2,
  `Teste 3: hasOnly restritivo com 15 campos presentes em create e update (encontradas ${hasOnlyOccurrences} ocorrências)`
);

// Teste 4: Imutabilidade de createdAt e userId no update
assert(
  rulesContent.includes('incoming().createdAt == existing().createdAt'),
  'Teste 4: Imutabilidade de createdAt garantida no update'
);
assert(
  rulesContent.includes('incoming().userId == existing().userId'),
  'Teste 4b: Imutabilidade do proprietário (userId) garantida no update'
);

// Teste 5: Validação do tipo do ativo (type in ['stock', 'fii', 'crypto', 'fixed_income', 'bdr_etf', 'other'])
assert(
  rulesContent.includes("incoming().type in ['stock', 'fii', 'crypto', 'fixed_income', 'bdr_etf', 'other']"),
  'Teste 5: Restrição de classes de ativos válidas configurada'
);

// Teste 6: Restrição de moeda apenas para BRL e USD
assert(
  rulesContent.includes("incoming().currency in ['BRL', 'USD']"),
  'Teste 6: Restrição de moedas válidas estritamente para BRL e USD'
);

// Teste 7: Validações numéricas não negativas para quantity, averagePrice e currentPrice
assert(
  rulesContent.includes('incoming().quantity is number && incoming().quantity >= 0') &&
  rulesContent.includes('incoming().averagePrice is number && incoming().averagePrice >= 0') &&
  rulesContent.includes('incoming().currentPrice is number && incoming().currentPrice >= 0'),
  'Teste 7: Validações numéricas não negativas configuradas para quantity, averagePrice e currentPrice'
);

// 2. Validador Comportamental de Simulação da Regra
interface InvestmentPayload {
  ticker?: any;
  name?: any;
  type?: any;
  quantity?: any;
  averagePrice?: any;
  currentPrice?: any;
  previousClose?: any;
  changePercent?: any;
  currency?: any;
  institution?: any;
  autoUpdate?: any;
  lastPriceUpdate?: any;
  notes?: any;
  userId?: any;
  createdAt?: any;
  [key: string]: any;
}

const ALLOWED_KEYS = [
  'ticker', 'name', 'type', 'quantity', 'averagePrice', 'currentPrice',
  'previousClose', 'changePercent', 'currency', 'institution', 'autoUpdate',
  'lastPriceUpdate', 'notes', 'userId', 'createdAt'
];

const REQUIRED_KEYS = [
  'ticker', 'name', 'type', 'quantity', 'averagePrice', 'currentPrice',
  'currency', 'userId', 'createdAt'
];

const VALID_TYPES = ['stock', 'fii', 'crypto', 'fixed_income', 'bdr_etf', 'other'];
const VALID_CURRENCIES = ['BRL', 'USD'];

function simulateValidateCreate(data: InvestmentPayload, authUid: string): boolean {
  if (data.userId !== authUid) return false;

  // hasAll
  for (const req of REQUIRED_KEYS) {
    if (!(req in data)) return false;
  }

  // hasOnly
  for (const k of Object.keys(data)) {
    if (!ALLOWED_KEYS.includes(k)) return false;
  }

  // Types & bounds
  if (typeof data.ticker !== 'string' || data.ticker.length > 32) return false;
  if (typeof data.name !== 'string' || data.name.length > 120) return false;
  if (!VALID_TYPES.includes(data.type)) return false;
  if (typeof data.quantity !== 'number' || data.quantity < 0) return false;
  if (typeof data.averagePrice !== 'number' || data.averagePrice < 0) return false;
  if (typeof data.currentPrice !== 'number' || data.currentPrice < 0) return false;
  if (!VALID_CURRENCIES.includes(data.currency)) return false;

  if ('previousClose' in data && (typeof data.previousClose !== 'number' || data.previousClose < 0)) return false;
  if ('changePercent' in data && typeof data.changePercent !== 'number') return false;
  if ('autoUpdate' in data && typeof data.autoUpdate !== 'boolean') return false;
  if ('institution' in data && (typeof data.institution !== 'string' || data.institution.length > 80)) return false;
  if ('notes' in data && (typeof data.notes !== 'string' || data.notes.length > 500)) return false;
  if ('lastPriceUpdate' in data && (typeof data.lastPriceUpdate !== 'string' || data.lastPriceUpdate.length > 64)) return false;
  if (typeof data.createdAt !== 'string' || data.createdAt.length > 64) return false;

  return true;
}

function simulateValidateUpdate(incoming: InvestmentPayload, existing: InvestmentPayload, authUid: string): boolean {
  if (incoming.userId !== authUid || incoming.userId !== existing.userId) return false;
  if (incoming.createdAt !== existing.createdAt) return false;

  // hasOnly
  for (const k of Object.keys(incoming)) {
    if (!ALLOWED_KEYS.includes(k)) return false;
  }

  // Types & bounds
  if (typeof incoming.ticker !== 'string' || incoming.ticker.length > 32) return false;
  if (typeof incoming.name !== 'string' || incoming.name.length > 120) return false;
  if (!VALID_TYPES.includes(incoming.type)) return false;
  if (typeof incoming.quantity !== 'number' || incoming.quantity < 0) return false;
  if (typeof incoming.averagePrice !== 'number' || incoming.averagePrice < 0) return false;
  if (typeof incoming.currentPrice !== 'number' || incoming.currentPrice < 0) return false;
  if (!VALID_CURRENCIES.includes(incoming.currency)) return false;

  if ('previousClose' in incoming && (typeof incoming.previousClose !== 'number' || incoming.previousClose < 0)) return false;
  if ('changePercent' in incoming && typeof incoming.changePercent !== 'number') return false;
  if ('autoUpdate' in incoming && typeof incoming.autoUpdate !== 'boolean') return false;
  if ('institution' in incoming && (typeof incoming.institution !== 'string' || incoming.institution.length > 80)) return false;
  if ('notes' in incoming && (typeof incoming.notes !== 'string' || incoming.notes.length > 500)) return false;
  if ('lastPriceUpdate' in incoming && (typeof incoming.lastPriceUpdate !== 'string' || incoming.lastPriceUpdate.length > 64)) return false;

  return true;
}

const validCreate: InvestmentPayload = {
  ticker: 'PETR4',
  name: 'Petrobras PN',
  type: 'stock',
  quantity: 100,
  averagePrice: 32.50,
  currentPrice: 35.80,
  previousClose: 35.00,
  changePercent: 2.28,
  currency: 'BRL',
  institution: 'XP',
  autoUpdate: true,
  lastPriceUpdate: '2026-10-05T12:00:00Z',
  notes: 'Posição de dividendos',
  userId: 'user-123',
  createdAt: '2026-10-01T10:00:00Z'
};

// Teste 8: Payload válido é aceito
assert(simulateValidateCreate(validCreate, 'user-123'), 'Teste 8: Payload válido é aceito');

// Teste 9: Payload com campo arbitrário é rejeitado (Shadow update guard)
assert(!simulateValidateCreate({ ...validCreate, shadowField: true }, 'user-123'), 'Teste 9: Campo arbitrário bloqueado');

// Teste 10: Payload com quantity negativa é rejeitado
assert(!simulateValidateCreate({ ...validCreate, quantity: -5 }, 'user-123'), 'Teste 10: Quantidade negativa rejeitada');

// Teste 11: Payload com averagePrice negativo é rejeitado
assert(!simulateValidateCreate({ ...validCreate, averagePrice: -10 }, 'user-123'), 'Teste 11: Preço médio negativo rejeitado');

// Teste 12: Payload com moeda inválida (ex: EUR) é rejeitado
assert(!simulateValidateCreate({ ...validCreate, currency: 'EUR' }, 'user-123'), 'Teste 12: Moeda fora de BRL/USD rejeitada');

// Teste 13: Payload com type inválido (ex: forex) é rejeitado
assert(!simulateValidateCreate({ ...validCreate, type: 'forex' }, 'user-123'), 'Teste 13: Tipo inválido rejeitado');

// Teste 14: Tentativa de alterar createdAt em update é rejeitada
assert(
  !simulateValidateUpdate(
    { ...validCreate, createdAt: '2026-10-05T00:00:00Z' },
    validCreate,
    'user-123'
  ),
  'Teste 14: Alteração de createdAt no update bloqueada'
);

// Teste 15: Tentativa de alterar userId em update é rejeitada
assert(
  !simulateValidateUpdate(
    { ...validCreate, userId: 'other-user' },
    validCreate,
    'user-123'
  ),
  'Teste 15: Alteração de userId no update bloqueada'
);

// Teste 16: Update legítimo (apenas preços e cotações atualizadas) é aceito
const validUpdate = {
  ...validCreate,
  currentPrice: 36.20,
  previousClose: 35.80,
  changePercent: 1.12,
  lastPriceUpdate: '2026-10-05T15:00:00Z'
};
assert(
  simulateValidateUpdate(validUpdate, validCreate, 'user-123'),
  'Teste 16: Update legítimo de cotações aceito com sucesso'
);

console.log(`\nResultado Final dos Testes das Regras (Etapa 8): ${passed} passaram, ${failed} falharam.`);

if (failed > 0) {
  process.exit(1);
}
