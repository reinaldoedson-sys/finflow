import { DEFAULT_CATEGORIES } from '../src/utils/mockData';
import { ICON_MAP } from '../src/components/CategoryIcon';
import { HelpCircle } from 'lucide-react';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests(): Promise<void> {
  console.log('🧪 Iniciando testes de mapeamento de ícones (CategoryIcon)...');

  // 1. Garante que todos os ícones das categorias padrão existem em ICON_MAP
  console.log('\n--- 1. Validando ícones de categorias padrão (DEFAULT_CATEGORIES) ---');
  assert(DEFAULT_CATEGORIES.length > 0, 'DEFAULT_CATEGORIES não deve estar vazia');

  for (const cat of DEFAULT_CATEGORIES) {
    const iconName = cat.icon;
    assert(iconName in ICON_MAP, `Ícone "${iconName}" da categoria "${cat.name}" deve existir em ICON_MAP`);
    assert(Boolean(ICON_MAP[iconName]), `Entrada ICON_MAP["${iconName}"] deve ser um componente Lucide válido`);
    console.log(`  ✅ Ícone "${iconName}" mapeado corretamente (${cat.name})`);
  }

  // 2. Garante que ícones de fallback e dinâmicos do app existem em ICON_MAP
  console.log('\n--- 2. Validando ícones de fallback e regras de negócio ---');
  const requiredAppIcons = [
    'FileText',       // fallback em DashboardView, ReportsView, TransactionsView
    'ShoppingBag',    // fallback em InstallmentsView
    'ArrowUpRight',   // transações de receita em TransactionsView
    'ArrowDownRight', // transações de despesa em TransactionsView
    'Tag',            // categorias customizadas em SettingsView e IndexedDB
    'Coins',          // contas tipo dinheiro / reserva
    'LineChart',      // contas tipo investimento
    'Building2',      // contas tipo banco / corrente
    'Wallet',         // carteira física / parcelamentos
    'Target',         // metas
    'ShieldCheck',    // metas / segurança
    'Plane',          // meta viagem
    'Laptop',         // meta tecnologia
    'HelpCircle',     // ícone fallback do sistema
  ];

  for (const iconName of requiredAppIcons) {
    assert(iconName in ICON_MAP, `Ícone de fallback/negócio "${iconName}" deve existir em ICON_MAP`);
    assert(Boolean(ICON_MAP[iconName]), `ICON_MAP["${iconName}"] deve ser um componente válido`);
    console.log(`  ✅ Ícone essencial "${iconName}" presente no mapa`);
  }

  // 3. Garante que nomes desconhecidos recorrem a HelpCircle
  console.log('\n--- 3. Validando resolução de ícones desconhecidos e fallback ---');
  const unknownNames = ['NonExistentIcon', 'RandomLegacyIcon_123', '', 'undefined'];
  for (const name of unknownNames) {
    const resolved = ICON_MAP[name] || HelpCircle;
    assert(resolved === HelpCircle, `Nome desconhecido "${name}" deve cair no fallback HelpCircle`);
  }
  console.log('  ✅ Fallback para HelpCircle validado com sucesso.');

  console.log('\n🎉 Todos os testes de CategoryIcon foram aprovados com sucesso!');
}

runTests().catch((err) => {
  console.error('❌ Falha nos testes de CategoryIcon:', err);
  process.exit(1);
});
