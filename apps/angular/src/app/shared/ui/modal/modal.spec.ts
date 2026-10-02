import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ModalComponent } from './modal';

interface SetupOptions {
  open?: boolean;
  title?: string;
  closeOnBackdrop?: boolean;
}

async function setup(opts: SetupOptions = {}): Promise<ComponentFixture<ModalComponent>> {
  await TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();

  const fixture = TestBed.createComponent(ModalComponent);
  const ref = fixture.componentRef;
  ref.setInput('open', opts.open ?? true);
  ref.setInput('title', opts.title ?? '');
  if (opts.closeOnBackdrop !== undefined) ref.setInput('closeOnBackdrop', opts.closeOnBackdrop);
  fixture.detectChanges();
  return fixture;
}

function query<T extends Element>(
  fixture: ComponentFixture<ModalComponent>,
  testId: string,
): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${testId}"]`);
}

describe('ModalComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders nothing while closed', async () => {
    const fixture = await setup({ open: false, title: 'Fetch' });

    expect(query(fixture, 'modal')).toBeNull();
    expect(query(fixture, 'modal-title')).toBeNull();
  });

  it('renders the title when open', async () => {
    const fixture = await setup({ open: true, title: 'Fetch remotes' });

    expect(query(fixture, 'modal')).not.toBeNull();
    expect(query(fixture, 'modal-title')?.textContent?.trim()).toBe('Fetch remotes');
    expect(query(fixture, 'modal')?.getAttribute('aria-modal')).toBe('true');
  });

  it('emits closed when the close button is clicked', async () => {
    const fixture = await setup();
    let emitted = 0;
    fixture.componentInstance.closed.subscribe(() => emitted++);

    query<HTMLButtonElement>(fixture, 'modal-close')?.click();

    expect(emitted).toBe(1);
  });

  it('emits closed on Escape while open', async () => {
    const fixture = await setup();
    let emitted = 0;
    fixture.componentInstance.closed.subscribe(() => emitted++);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(emitted).toBe(1);
  });

  it('ignores Escape while closed', async () => {
    const fixture = await setup({ open: false });
    let emitted = 0;
    fixture.componentInstance.closed.subscribe(() => emitted++);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(emitted).toBe(0);
  });

  it('emits closed when the backdrop is clicked', async () => {
    const fixture = await setup();
    let emitted = 0;
    fixture.componentInstance.closed.subscribe(() => emitted++);

    query<HTMLElement>(fixture, 'modal-backdrop')?.click();

    expect(emitted).toBe(1);
  });

  it('does not close on backdrop click when closeOnBackdrop is false', async () => {
    const fixture = await setup({ closeOnBackdrop: false });
    let emitted = 0;
    fixture.componentInstance.closed.subscribe(() => emitted++);

    query<HTMLElement>(fixture, 'modal-backdrop')?.click();

    expect(emitted).toBe(0);
  });

  it('does not close when a click originates inside the panel', async () => {
    const fixture = await setup();
    let emitted = 0;
    fixture.componentInstance.closed.subscribe(() => emitted++);

    query<HTMLElement>(fixture, 'modal')?.click();

    expect(emitted).toBe(0);
  });
});
