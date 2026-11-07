import React, { useState, useMemo } from 'react';
import { 
  AlertTriangle, 
  Clock, 
  CreditCard as CardIcon, 
  CheckCircle2, 
  ArrowRight, 
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { CreditCard, Transaction, CurrencyCode } from '../types/finance';
import { formatCurrency, formatDateShort } from '../utils/currency';
import { todayLocalISO } from '../utils/localDate';
import { computeDueAlerts, DueAlert } from '../domain/dueAlerts';

interface DueAlertsBannerProps {
  creditCards: CreditCard[];
  transactions: Transaction[];
  currency?: CurrencyCode;
  hideValues?: boolean;
  onNavigateToTab?: (tab: string) => void;
  onPayTransaction?: (txId: string) => void;
}

export const DueAlertsBanner: React.FC<DueAlertsBannerProps> = ({
  creditCards,
  transactions,
  currency = 'BRL',
  hideValues = false,
  onNavigateToTab,
  onPayTransaction,
}) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const todayStr = useMemo(() => todayLocalISO(), []);

  const alerts = useMemo<DueAlert[]>(() => {
    return computeDueAlerts(creditCards, transactions, todayStr, 3);
  }, [creditCards, transactions, todayStr]);

  if (isDismissed || alerts.length === 0) {
    return null;
  }

  const overdueCount = alerts.filter(a => a.urgency === 'overdue').length;
  const todayCount = alerts.filter(a => a.urgency === 'today').length;
  const totalAmount = alerts.reduce((acc, a) => acc + a.amount, 0);

  const isCritical = overdueCount > 0 || todayCount > 0;

  return (
    <div 
      className={`rounded-xl border p-3.5 sm:p-4 mb-4 transition-all duration-200 ${
        isCritical 
          ? 'bg-rose-950/20 border-rose-500/40 text-rose-100 shadow-sm shadow-rose-950/30' 
          : 'bg-amber-950/20 border-amber-500/40 text-amber-100 shadow-sm shadow-amber-950/30'
      }`}
      role="region"
      aria-label="Alertas de faturas e vencimentos próximos"
    >
      <div className="flex items-center justify-between gap-3">
        <div 
          onClick={() => setIsExpanded(prev => !prev)}
          className="flex items-center gap-2.5 min-w-0 cursor-pointer select-none group flex-1"
        >
          <div className={`p-2 rounded-lg shrink-0 ${
            isCritical ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          }`}>
            {isCritical ? <AlertTriangle className="w-4 h-4 animate-pulse" /> : <Clock className="w-4 h-4" />}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs sm:text-sm font-bold text-white group-hover:text-amber-200 transition-colors">
                Lembrete de Vencimentos
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full font-mono ${
                isCritical ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}>
                {alerts.length} {alerts.length === 1 ? 'vencimento próximo' : 'vencimentos próximos'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              {overdueCount > 0 && (
                <span className="text-rose-400 font-semibold mr-1.5">
                  {overdueCount} {overdueCount === 1 ? 'vencido' : 'vencidos'}!
                </span>
              )}
              Total previsto: <strong className="text-white font-mono">{formatCurrency(totalAmount, currency, hideValues)}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
            aria-label={isExpanded ? 'Recolher alertas' : 'Expandir alertas'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
            title="Fechar lembrete por agora"
            aria-label="Fechar lembrete"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Lista expansível de itens que estão vencendo */}
      {isExpanded && (
        <div className="pt-3 mt-3 border-t border-slate-800/80 space-y-2 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {alerts.map(alert => {
              const isOverdue = alert.urgency === 'overdue';
              const isToday = alert.urgency === 'today';

              return (
                <div
                  key={alert.id}
                  className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/90 flex items-center justify-between gap-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1.5 rounded-md bg-slate-800 text-slate-300 shrink-0">
                      {alert.kind === 'credit_card' ? <CardIcon className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-slate-100 block truncate" title={alert.title}>
                        {alert.title}
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                        <span className={`font-semibold ${
                          isOverdue ? 'text-rose-400' : isToday ? 'text-amber-400 font-bold' : 'text-slate-400'
                        }`}>
                          {alert.subtitle}
                        </span>
                        <span className="text-slate-600">·</span>
                        <span className="text-slate-400">{formatDateShort(alert.dueDate)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs font-bold font-mono text-rose-400">
                      -{formatCurrency(alert.amount, currency, hideValues)}
                    </span>

                    {/* Ações rápidas */}
                    {alert.kind === 'credit_card' && onNavigateToTab && (
                      <button
                        type="button"
                        onClick={() => onNavigateToTab('accounts')}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 font-medium cursor-pointer"
                      >
                        <span>Ver cartão</span>
                        <ArrowRight className="w-2.5 h-2.5" />
                      </button>
                    )}

                    {alert.kind === 'pending_bill' && alert.transactionId && onPayTransaction && (
                      <button
                        type="button"
                        onClick={() => onPayTransaction(alert.transactionId!)}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 font-medium cursor-pointer"
                      >
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        <span>Marcar paga</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
