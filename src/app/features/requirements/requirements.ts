import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/auth/supabase.service';

interface Master { id: string; code: string; name: string; sort_sequence: number }
interface RequirementForm { title: string; description: string; requirement_type: string; priority: string; status: string }
interface PullRequest { id: string; provider: string; repository_name: string; pr_number: string; pr_url: string; pr_status: string }
interface Requirement extends RequirementForm { id: string; type_name: string; priority_name: string; status_name: string; created_at: string; created_by: string; modified_at: string | null; modified_by: string | null; pr_count: number; prs: PullRequest[] }
interface List { items: Requirement[]; pagination: { page: number; page_size: number; total: number; total_pages: number } }
type PRForm = Omit<PullRequest, 'id'>;
const blank = (): RequirementForm => ({ title: '', description: '', requirement_type: 'FEATURE', priority: 'MEDIUM', status: 'PENDING' });

@Component({
  selector: 'app-requirements', imports: [FormsModule, DatePipe],
  templateUrl: './requirements.html', styleUrl: './requirements.css',
})
export class Requirements {
  private readonly auth = inject(SupabaseService);
  @ViewChild('titleInput') titleInput?: ElementRef<HTMLInputElement>;
  @ViewChild('prUrlInput') prUrlInput?: ElementRef<HTMLInputElement>;
  @ViewChild('addButton') addButton?: ElementRef<HTMLButtonElement>;
  readonly types = signal<Master[]>([]); readonly priorities = signal<Master[]>([]); readonly statuses = signal<Master[]>([]);
  readonly items = signal<Requirement[]>([]); readonly loading = signal(false); readonly lookupReady = signal(false);
  readonly error = signal(''); readonly formError = signal(''); readonly fields = signal<Record<string, string>>({});
  readonly success = signal(''); readonly saving = signal(false); readonly prSaving = signal(false);
  readonly editing = signal(false); readonly detail = signal<Requirement | null>(null); readonly prEditing = signal(false);
  readonly prError = signal(''); readonly prFields = signal<Record<string, string>>({});
  readonly total = signal(0); readonly pages = signal(0); readonly page = signal(1);
  filters = { search: '', requirement_type: '', priority: '', status: '' };
  form = blank(); prForm: PRForm = this.blankPR(); prId = '';
  private listVersion = 0; private detailVersion = 0;
  constructor() { void this.initialize(); }
  private blankPR(): PRForm { return { provider: 'GITHUB', repository_name: '', pr_number: '', pr_url: '', pr_status: 'OPEN' }; }
  private async api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    await this.auth.initialized;
    const token = this.auth.user() ? await this.auth.token() : null;
    const response = await fetch(`/api/${path}`, { method, cache: 'no-store', headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(typeof data.error === 'string' ? data.error : 'ดำเนินการไม่สำเร็จ'), { fields: data.fields || {} });
    return data;
  }
  async initialize(): Promise<void> {
    this.error.set(''); this.loading.set(true);
    try {
      const [types, priorities, statuses] = await Promise.all([
        this.api<Master[]>('masters/requirement-types'), this.api<Master[]>('masters/requirement-priorities'), this.api<Master[]>('masters/requirement-statuses'),
      ]);
      this.types.set(types); this.priorities.set(priorities); this.statuses.set(statuses); this.lookupReady.set(true);
      await this.load();
    } catch (e) { this.error.set(this.message(e)); this.loading.set(false); }
  }
  async load(page = this.page()): Promise<void> {
    const version = ++this.listVersion;
    this.loading.set(true); this.error.set(''); this.page.set(page);
    const query = new URLSearchParams({ page: String(page), page_size: '20' });
    for (const [key, value] of Object.entries(this.filters)) if (value.trim()) query.set(key, value.trim());
    try {
      const result = await this.api<List>(`requirements?${query}`);
      if (version !== this.listVersion) return;
      if (page > 1 && !result.items.length && result.pagination.total) { await this.load(Math.max(1, result.pagination.total_pages)); return; }
      this.items.set(result.items); this.total.set(result.pagination.total); this.pages.set(result.pagination.total_pages);
    } catch (e) { if (version === this.listVersion) this.error.set(this.message(e)); }
    finally { if (version === this.listVersion) this.loading.set(false); }
  }
  hasFilters(): boolean { return Object.values(this.filters).some(value => !!value.trim()); }
  retry(): void { if (this.lookupReady()) void this.load(); else void this.initialize(); }
  create(): void {
    ++this.detailVersion; this.detail.set(null); this.form = blank(); this.editing.set(true); this.prEditing.set(false);
    this.formError.set(''); this.fields.set({}); this.success.set(''); this.focusTitle();
  }
  async edit(id: string): Promise<void> {
    const version = ++this.detailVersion; this.error.set('');
    try {
      const record = await this.api<Requirement>(`requirements/${id}`);
      if (version !== this.detailVersion) return;
      this.detail.set(record); this.form = { title: record.title, description: record.description ?? '', requirement_type: record.requirement_type, priority: record.priority, status: record.status };
      this.editing.set(true); this.prEditing.set(false); this.formError.set(''); this.fields.set({}); this.focusTitle();
    } catch (e) { if (version === this.detailVersion) this.error.set(this.message(e)); }
  }
  cancel(): void { ++this.detailVersion; this.editing.set(false); this.prEditing.set(false); this.addButton?.nativeElement.focus(); }
  private focusTitle(): void { setTimeout(() => this.titleInput?.nativeElement.focus()); }
  inactive(options: Master[], code: string): boolean { return !!code && !options.some(option => option.code === code); }
  async save(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true); this.formError.set(''); this.fields.set({});
    try {
      const current = this.detail();
      const record = await this.api<Requirement>(current ? `requirements/${current.id}` : 'requirements', current ? 'PATCH' : 'POST', this.form);
      // Keep detail open after creation so related PRs can be added immediately.
      await this.edit(record.id); this.success.set('บันทึก Requirement แล้ว'); await this.load();
    } catch (e) { this.formError.set(this.message(e)); this.fields.set(this.errorFields(e)); }
    finally { this.saving.set(false); }
  }
  openPR(pr?: PullRequest): void {
    this.prId = pr?.id || ''; this.prForm = pr ? { provider: pr.provider, repository_name: pr.repository_name ?? '', pr_number: pr.pr_number ?? '', pr_url: pr.pr_url, pr_status: pr.pr_status } : this.blankPR();
    this.prError.set(''); this.prFields.set({}); this.prEditing.set(true); setTimeout(() => this.prUrlInput?.nativeElement.focus());
  }
  async savePR(): Promise<void> {
    const requirement = this.detail(); if (!requirement || this.prSaving()) return;
    this.prSaving.set(true); this.prError.set(''); this.prFields.set({});
    try {
      await this.api(this.prId ? `requirement-prs/${this.prId}` : `requirements/${requirement.id}/prs`, this.prId ? 'PATCH' : 'POST', this.prForm);
      this.detail.set(await this.api<Requirement>(`requirements/${requirement.id}`)); this.prEditing.set(false);
      this.success.set('บันทึก PR แล้ว'); await this.load();
    } catch (e) { this.prError.set(this.message(e)); this.prFields.set(this.errorFields(e)); }
    finally { this.prSaving.set(false); }
  }
  safeURL(value: string): string | null { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; } }
  private message(e: unknown): string { return e instanceof Error ? e.message : 'เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่'; }
  private errorFields(e: unknown): Record<string, string> { return (e as { fields?: Record<string, string> })?.fields || {}; }
}
