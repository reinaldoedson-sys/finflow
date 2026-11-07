import { todayLocalISO } from '../utils/localDate';

export interface ParsedShareResult {
  type: 'expense' | 'income';
  amount?: number;
  description: string;
  date: string; // YYYY-MM-DD
  notes?: string;
}

/**
 * Analisa textos de comprovantes de PIX, boletos ou texto compartilhado via Web Share Target (PWA).
 * Extrai automaticamente o valor, tipo (receita ou despesa), descrição/favorecido e data.
 */
export function parseReceiptOrShareText(text: string, title?: string): ParsedShareResult {
  const cleanText = (text || '').trim();
  const cleanTitle = (title || '').trim();
  const fullText = `${cleanTitle} ${cleanText}`.trim();

  // 1. Detecção do tipo: receita vs despesa
  const lower = fullText.toLowerCase();
  const incomeKeywords = [
    'recebeu',
    'recebido',
    'recebimento',
    'pix recebido',
    'transferência recebida',
    'crédito em conta',
    'salário',
    'reembolso recebido',
    'depósito recebido'
  ];

  const isIncome = incomeKeywords.some(keyword => lower.includes(keyword));
  const type: 'expense' | 'income' = isIncome ? 'income' : 'expense';

  // 2. Extração do valor financeiro
  let amount: number | undefined;

  // Padrão 1: "R$ 1.250,50" ou "R$ 89,90" ou "R$ 150"
  const brlPattern = /r\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+,[0-9]{2}|[0-9]+(?:\.[0-9]{2})?)/i;
  const matchBrl = fullText.match(brlPattern);

  if (matchBrl && matchBrl[1]) {
    const rawNum = matchBrl[1].trim();
    if (rawNum.includes(',')) {
      amount = parseFloat(rawNum.replace(/\./g, '').replace(',', '.')) || undefined;
    } else {
      amount = parseFloat(rawNum) || undefined;
    }
  } else {
    // Padrão 2: "valor: 150,00" ou "valor de 50,00"
    const valorPattern = /valor(?:\s+de)?(?:\s*:)?\s*([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2}|[0-9]+,[0-9]{2})/i;
    const matchValor = fullText.match(valorPattern);
    if (matchValor && matchValor[1]) {
      const rawNum = matchValor[1].trim();
      amount = parseFloat(rawNum.replace(/\./g, '').replace(',', '.')) || undefined;
    }
  }

  // 3. Extração da data (formato DD/MM/AAAA)
  let date = todayLocalISO();
  const datePattern = /\b([0-3]?[0-9])\/([0-1]?[0-9])\/(20[2-9][0-9])\b/;
  const matchDate = fullText.match(datePattern);
  if (matchDate) {
    const day = matchDate[1].padStart(2, '0');
    const month = matchDate[2].padStart(2, '0');
    const year = matchDate[3];
    date = `${year}-${month}-${day}`;
  }

  // 4. Extração da descrição / favorecido
  let description = '';

  // Procura padrões como "Para: João", "Destinatário: XYZ", "Favorecido: ABC", "Estabelecimento: Supermercado"
  const recipientPatterns = [
    /(?:destinat[aá]rio|favorecido|recebedor|para|pago a|estabelecimento)\s*[:-]\s*([^\n\r,.]+)/i,
    /(?:de|recebido de|origem)\s*[:-]\s*([^\n\r,.]+)/i,
    /(?:para|a)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/,
  ];

  for (const pat of recipientPatterns) {
    const m = fullText.match(pat);
    if (m && m[1] && m[1].trim().length > 1) {
      const candidate = m[1].trim();
      // Evita falsos positivos com números de documento ou palavras reservadas
      if (!/^(r\$|[0-9]|\bchave\b|\bcpf\b|\bcnpj\b|\bconta\b|\bbanco\b)/i.test(candidate)) {
        description = candidate;
        break;
      }
    }
  }

  if (!description) {
    // Usa o título compartilhado se fizer sentido
    if (cleanTitle && cleanTitle.length > 2 && !/comprovante|compartilhar/i.test(cleanTitle)) {
      description = cleanTitle;
    } else {
      // Primeira linha não vazia que não seja apenas números
      const firstLine = cleanText.split('\n').map(l => l.trim()).find(l => l.length > 3 && !/^r\$\s*[0-9]/i.test(l));
      if (firstLine && firstLine.length <= 50) {
        description = firstLine;
      } else {
        description = isIncome ? 'Recebimento PIX' : 'Pagamento PIX';
      }
    }
  }

  // Limita tamanho da descrição e remove quebras
  description = description.replace(/[\n\r]+/g, ' ').slice(0, 60).trim();

  return {
    type,
    amount: amount && amount > 0 ? amount : undefined,
    description: description || (type === 'income' ? 'Receita Compartilhada' : 'Despesa Compartilhada'),
    date,
    notes: cleanText ? `Compartilhado via PWA:\n${cleanText.slice(0, 300)}` : undefined,
  };
}
