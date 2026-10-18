import { Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/auth/supabase.service';
import { ApiMediaStorage } from '../../core/storage/api-media.storage';

interface Master { id: string; code: string; name: string; sort_sequence: number }
interface Attachment { id: string; profiles_id: string }
interface RequirementImage { key: string; id: string | null; profiles_id: string | null; file?: File; url: string; name: string; error: string }
interface RequirementForm { title: string; description: string; requirement_type: string; priority: string; status: string; attachments: Attachment[] }
interface PullRequest { id: string; provider: string; repository_name: string; pr_number: string; pr_url: string; pr_status: string }
interface Requirement extends RequirementForm { id: string; attachments_id?: string | null; attachments_profiles_id?: string | null; type_name: string; priority_name: string; status_name: string; created_at: string; created_by: string; modified_at: string | null; modified_by: string | null; pr_count: number; prs: PullRequest[] }
interface List { items: Requirement[]; pagination: { page: number; page_size: number; total: number; total_pages: number } }
type PRForm = Omit<PullRequest, 'id'>;
const blank = (): RequirementForm => ({ title: '', description: '', requirement_type: 'FEATURE', priority: 'MEDIUM', status: 'PENDING', attachments: [] });

@Component({
  selector: 'app-requirements', imports: [FormsModule, DatePipe, RouterLink], providers: [ApiMediaStorage],
  templateUrl: './requirements.html', styleUrl: './requirements.css',
})
export class Requirements implements OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly editorPage = !!this.route.snapshot.data['editor'];
  readonly requirementId = this.route.snapshot.paramMap.get('id');
  private readonly auth = inject(SupabaseService);
  private readonly media = inject(ApiMediaStorage);
  readonly images = signal<RequirementImage[]>([]); readonly imageError = signal('');
  private imageSequence = 0;
  canAttach(): boolean { return !!this.auth.user(); }
  private clearImage(): void {
    for (const image of this.images()) if (image.url) URL.revokeObjectURL(image.url);
    this.images.set([]); this.imageError.set('');
  }
  ngOnDestroy(): void { ++this.detailVersion; this.clearImage(); }
  chooseImage(event: Event): void {
    const input = event.target as HTMLInputElement, files = Array.from(input.files ?? []); input.value = '';
    if (!files.length || this.saving()) return;
    const supported = ['image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif','image/bmp'];
    if (!this.canAttach() || files.some(file => !supported.includes(file.type) || !file.size || file.size > 25 * 1024 * 1024)) {
      this.imageError.set('กรุณาเข้าสู่ระบบและเลือกรูปภาพขนาดไม่เกิน 25 MB'); return;
    }
    if (this.images().length + files.length > 20) { this.imageError.set('แนบรูปได้สูงสุด 20 รูป'); return; }
    this.imageError.set('');
    this.images.set([...this.images(), ...files.map(file => ({ key: `draft-${++this.imageSequence}`, id: null, profiles_id: null, file, url: URL.createObjectURL(file), name: file.name, error: '' }))]);
  }
  removeImage(key: string): void {
    if (this.saving()) return;
    const image = this.images().find(item => item.key === key);
    if (image?.url) URL.revokeObjectURL(image.url);
    this.images.set(this.images().filter(item => item.key !== key)); this.imageError.set('');
  }
  private async loadImage(requirementId: string, image: RequirementImage, version: number): Promise<void> {
    try {
      const token = this.auth.user() ? await this.auth.token() : null;
      const response = await fetch(`/api/requirements/${requirementId}/images/${image.id}?profile=${image.profiles_id}`, { cache: 'no-store', headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error('โหลดรูปแนบไม่สำเร็จ กรุณาเปิดรายการอีกครั้ง');
      const blob = await response.blob();
      if (version !== this.detailVersion || !this.images().some(item => item.key === image.key)) return;
      const url = URL.createObjectURL(blob);
      this.images.set(this.images().map(item => item.key === image.key ? { ...item, url } : item));
    } catch (error) {
      if (version === this.detailVersion) this.images.set(this.images().map(item => item.key === image.key ? { ...item, error: this.message(error) } : item));
    }
  }
  @ViewChild('titleInput') titleInput?: ElementRef<HTMLInputElement>;
  @ViewChild('prUrlInput') prUrlInput?: ElementRef<HTMLInputElement>;
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
  constructor() { if (this.editorPage && !this.requirementId) this.create(); void this.initialize(); }
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
      if (!this.editorPage) await this.load();
      else if (this.requirementId) await this.edit(this.requirementId);
      this.loading.set(false);
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
  retry(): void { if (this.lookupReady() && !this.editorPage) void this.load(); else void this.initialize(); }
  create(): void {
    if (this.saving() || this.prSaving()) return;
    if (!this.editorPage || this.requirementId) { void this.router.navigate(['/requirements/new']); return; }
    this.clearImage();
    ++this.detailVersion; this.detail.set(null); this.form = blank(); this.editing.set(true); this.prEditing.set(false);
    this.formError.set(''); this.fields.set({}); this.success.set(''); this.focusTitle();
  }
  async edit(id: string): Promise<void> {
    if (!this.editorPage) { await this.router.navigate(['/requirements', id]); return; }
    const version = ++this.detailVersion; this.error.set('');
    try {
      const record = await this.api<Requirement>(`requirements/${id}`);
      if (version !== this.detailVersion) return;
      this.clearImage();
      const attachments = record.attachments ?? (record.attachments_id && record.attachments_profiles_id ? [{ id: record.attachments_id, profiles_id: record.attachments_profiles_id }] : []);
      this.detail.set(record); this.form = { title: record.title, description: record.description ?? '', requirement_type: record.requirement_type, priority: record.priority, status: record.status, attachments };
      const images = attachments.map((image, index) => ({ key: `${image.profiles_id}/${image.id}`, ...image, url: '', name: `รูปแนบ ${index + 1}`, error: '' }));
      this.images.set(images);
      for (const image of images) void this.loadImage(record.id, image, version);
      this.editing.set(true); this.prEditing.set(false); this.formError.set(''); this.fields.set({}); this.focusTitle();
    } catch (e) { if (version === this.detailVersion) this.error.set(this.message(e)); }
  }
  cancel(): void { if (this.saving() || this.prSaving()) return; void this.router.navigate(['/requirements']); }
  private focusTitle(): void { setTimeout(() => this.titleInput?.nativeElement.focus()); }
  inactive(options: Master[], code: string): boolean { return !!code && !options.some(option => option.code === code); }
  async save(): Promise<void> {
    if (this.saving()) return;
    const version = this.detailVersion;
    this.saving.set(true); this.formError.set(''); this.fields.set({});
    try {
      const current = this.detail();
      for (const image of this.images()) {
        if (!image.file) continue;
        const uploaded = await this.media.save(image.file, current?.id || 'requirement', undefined, 'requirement');
        if (version !== this.detailVersion) return;
        const owner = this.auth.user()?.id;
        if (!owner) throw new Error('กรุณาเข้าสู่ระบบเพื่อแนบรูป');
        this.images.set(this.images().map(item => item.key === image.key ? { ...item, id: uploaded.id, profiles_id: owner, file: undefined } : item));
      }
      this.form.attachments = this.images().map(image => ({ id: image.id!, profiles_id: image.profiles_id! }));
      const record = await this.api<Requirement>(current ? `requirements/${current.id}` : 'requirements', current ? 'PATCH' : 'POST', this.form);
      // Keep detail open after creation so related PRs can be added immediately.
      await this.edit(record.id); this.success.set('บันทึก Requirement แล้ว');
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
      this.success.set('บันทึก PR แล้ว');
    } catch (e) { this.prError.set(this.message(e)); this.prFields.set(this.errorFields(e)); }
    finally { this.prSaving.set(false); }
  }
  safeURL(value: string): string | null { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; } }
  private message(e: unknown): string { return e instanceof Error ? e.message : 'เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่'; }
  private errorFields(e: unknown): Record<string, string> { return (e as { fields?: Record<string, string> })?.fields || {}; }
}
