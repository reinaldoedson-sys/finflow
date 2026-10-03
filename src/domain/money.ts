/**
 * Utilitários financeiros para precisão monetária (centavos inteiros)
 * Evita erros de arredondamento de ponto flutuante IEEE 754 (ex: 0.1 + 0.2 = 0.30000000000000004)
 */

/**
 * Converte um valor em reais (ou float) para centavos inteiros (inteiro seguro).
 * Exemplo: 10.50 -> 1050, 1000.01 -> 100001
 */
export function toCents(amount: number): number {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return 0;
  }
  // Math.round previne imperfeições na multiplicação por 100
  return Math.round(amount * 100);
}

/**
 * Converte centavos inteiros de volta para valor float com 2 casas decimais.
 * Exemplo: 1050 -> 10.50
 */
export function fromCents(cents: number): number {
  if (typeof cents !== 'number' || isNaN(cents)) {
    return 0;
  }
  return Math.round(cents) / 100;
}

/**
 * Soma segura de valores monetários
 */
export function addMoney(a: number, b: number): number {
  return fromCents(toCents(a) + toCents(b));
}

/**
 * Subtração segura de valores monetários
 */
export function subtractMoney(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b));
}

/**
 * Multiplicação segura de valor monetário por fator
 */
export function multiplyMoney(amount: number, factor: number): number {
  return fromCents(Math.round(toCents(amount) * factor));
}

/**
 * Divide um valor total em N parcelas distribuindo o resto de centavos
 * nas primeiras parcelas, garantindo que sum(parcelas) === total exato!
 *
 * Exemplo: R$ 1.000,00 em 3 parcelas -> [333.34, 333.33, 333.33]
 * Soma: 333.34 + 333.33 + 333.33 = 1000.00
 */
export function splitMoney(totalAmount: number, numberOfInstallments: number): number[] {
  if (numberOfInstallments <= 0) return [];
  if (numberOfInstallments === 1) return [fromCents(toCents(totalAmount))];

  const totalCents = toCents(totalAmount);
  const baseCents = Math.floor(totalCents / numberOfInstallments);
  let remainderCents = totalCents % numberOfInstallments;

  // Trata valores negativos se houver
  const sign = totalCents >= 0 ? 1 : -1;
  const absRemainder = Math.abs(remainderCents);

  const parts: number[] = [];
  for (let i = 0; i < numberOfInstallments; i++) {
    let centsForThis = baseCents;
    if (i < absRemainder) {
      centsForThis += sign * 1;
    }
    parts.push(fromCents(centsForThis));
  }

  return parts;
}
