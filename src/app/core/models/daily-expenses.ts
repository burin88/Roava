import type { Expense, Place, Trip } from './travel.models';

export interface CurrencyTotal { currency: string; amount: number; }
export interface TravelDayGroup { date: string; places: Place[]; expenses: Expense[]; totals: CurrencyTotal[]; }

/** HTML date inputs need a calendar date in the user's timezone, not UTC. */
export function todayInBangkok(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    calendar: 'gregory', numberingSystem: 'latn',
  }).formatToParts(now);
  const part = (type: string) => parts.find(item => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Keep currencies separate: no exchange rate is assumed. */
export function expenseTotals(expenses: readonly Expense[]): CurrencyTotal[] {
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    if (!Number.isFinite(expense.amount)) continue;
    const currency = expense.currency?.trim().toUpperCase() || 'THB';
    totals.set(currency, (totals.get(currency) ?? 0) + expense.amount);
  }
  return [...totals].sort(([a],[b]) => a.localeCompare(b)).map(([currency,amount]) => ({ currency, amount: Math.round((amount + Number.EPSILON) * 100) / 100 }));
}

export function groupTravelDays(trip: Pick<Trip,'places' | 'expenses'>): TravelDayGroup[] {
  const groups = new Map<string, TravelDayGroup>();
  const groupFor = (date: string) => {
    let group = groups.get(date);
    if (!group) { group = { date, places: [], expenses: [], totals: [] }; groups.set(date,group); }
    return group;
  };
  for (const place of trip.places) groupFor(place.visitedAt || '').places.push(place);
  for (const expense of trip.expenses) groupFor(expense.spentAt || '').expenses.push(expense);
  return [...groups.values()].map(group => ({ ...group, totals: expenseTotals(group.expenses) })).sort((a,b) => a.date.localeCompare(b.date));
}
