import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'country/CN', loadComponent: () => import('./features/china/china-dashboard').then(module => module.ChinaDashboard), title: 'China Provinces · Atlas' },
  { path: '', pathMatch: 'full', redirectTo: 'beijing' },
  { path: 'beijing', loadComponent: () => import('./features/beijing/beijing').then((module) => module.Beijing), title: 'ปักกิ่ง 7 วัน 6 คืน · Roava' },
  { path: 'continent/:continentCode', loadComponent: () => import('./features/dashboard/asia-dashboard/asia-dashboard').then((module) => module.AsiaDashboard), title: 'World Atlas · Atlas' },
  { path: 'trips', loadComponent: () => import('./features/trips/trip-list/trip-list').then((module) => module.TripList), title: 'Journeys · Atlas' },
  { path: 'city/:countryCode/:cityCode', loadComponent: () => import('./features/cities/city-memory/city-memory').then((module) => module.CityMemory), title: 'City Memory · Atlas' },
  { path: '**', redirectTo: 'trips' },
];
