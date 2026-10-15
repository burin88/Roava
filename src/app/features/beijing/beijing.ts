import { ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';

import { BEIJING_ITINERARY, ItineraryDay } from '../../core/data/beijing-itinerary';
import { BEIJING_PLAN_GROUP, BEIJING_TRIP_ID, TIANJIN_TRIP_ID } from '../../core/data/beijing-trips';
import { expenseTotals, CurrencyTotal } from '../../core/models/daily-expenses';
import { DecimalPipe } from '@angular/common';
import { TravelStore } from '../../core/state/travel-store';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-beijing',
  imports: [RouterLink, DecimalPipe],
  templateUrl: './beijing.html',
  styleUrl: './beijing.css',
})
export class Beijing {
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly store = inject(TravelStore);
  readonly addingPlan = signal(false);
  readonly planError = signal('');
  readonly planSaved = computed(() => [BEIJING_TRIP_ID, TIANJIN_TRIP_ID].every(id => this.store.trips().some(trip => trip.id === id)));
  readonly selectedDay = signal(0);
  readonly days = BEIJING_ITINERARY;
  readonly visibleDays = computed(() => this.selectedDay() === 0 ? this.days : this.days.filter(day => day.number === this.selectedDay()));
  dayExpenseTotals(day: ItineraryDay): CurrencyTotal[] {
    const [date, month] = day.date.split('/');
    const isoDate = `2026-${month}-${date}`;
    const expenses = this.store.trips().filter(trip => trip.journeyGroupId === BEIJING_PLAN_GROUP || [BEIJING_TRIP_ID, TIANJIN_TRIP_ID].includes(trip.id)).flatMap(trip => trip.expenses).filter(expense => expense.spentAt === isoDate);
    return expenseTotals(expenses);
  }
  constructor() { void this.addPlan(false); }
  async addPlan(force = true): Promise<void> {
    if (this.addingPlan()) return;
    this.addingPlan.set(true); this.planError.set('');
    try { await this.store.addRequestedChinaPlan(force); }
    catch { this.planError.set('ยังบันทึกแผนไม่สำเร็จ กรุณาตรวจสอบพื้นที่จัดเก็บของเบราว์เซอร์แล้วลองอีกครั้ง'); }
    finally { this.addingPlan.set(false); }
  }
  print(): void {
    const previousDay = this.selectedDay();
    this.selectedDay.set(0);
    this.changeDetector.detectChanges();
    window.print();
    this.selectedDay.set(previousDay);
  }
}
