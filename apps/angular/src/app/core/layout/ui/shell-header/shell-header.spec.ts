import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ShellHeader, type ShellHeaderTab } from './shell-header';

const TABS: ShellHeaderTab[] = [
  { id: 'repo-1', label: 'alpha' },
  { id: 'repo-2', label: 'beta' },
];

async function setup(
  tabs: ShellHeaderTab[] = TABS,
  activeTab: string | null = 'repo-1',
): Promise<ComponentFixture<ShellHeader>> {
  await TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();
  const fixture = TestBed.createComponent(ShellHeader);
  fixture.componentRef.setInput('tabs', tabs);
  fixture.componentRef.setInput('activeTab', activeTab);
  fixture.detectChanges();
  return fixture;
}

function tabsEl(fixture: ComponentFixture<ShellHeader>): HTMLElement[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.st-tab'));
}

describe('ShellHeader', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders one tab per input and marks the active one', async () => {
    const fixture = await setup();

    const tabs = tabsEl(fixture);
    expect(tabs).toHaveLength(2);
    expect(tabs[0].textContent).toContain('alpha');
    expect(tabs[1].textContent).toContain('beta');
    expect(tabs[0].classList.contains('st-tab--active')).toBe(true);
    expect(tabs[1].classList.contains('st-tab--active')).toBe(false);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  });

  it('emits the tab id when a tab is clicked', async () => {
    const fixture = await setup();
    const emitted: string[] = [];
    fixture.componentInstance.tabSelected.subscribe((id) => emitted.push(id));

    tabsEl(fixture)[1].click();

    expect(emitted).toEqual(['repo-2']);
  });

  it('emits the tab id on Enter and Space', async () => {
    const fixture = await setup();
    const emitted: string[] = [];
    fixture.componentInstance.tabSelected.subscribe((id) => emitted.push(id));

    tabsEl(fixture)[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    tabsEl(fixture)[0].dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));

    expect(emitted).toEqual(['repo-1', 'repo-1']);
  });

  it('emits tabClosed without also selecting when the close control is used', async () => {
    const fixture = await setup();
    const selected: string[] = [];
    const closed: string[] = [];
    fixture.componentInstance.tabSelected.subscribe((id) => selected.push(id));
    fixture.componentInstance.tabClosed.subscribe((id) => closed.push(id));

    const close = tabsEl(fixture)[0].querySelector<HTMLButtonElement>('.st-tab__close')!;
    close.click();

    expect(closed).toEqual(['repo-1']);
    expect(selected).toEqual([]);
  });

  it('emits addRequested when the "+" control is clicked', async () => {
    const fixture = await setup();
    let added = 0;
    fixture.componentInstance.addRequested.subscribe(() => added++);

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.st-tab__add')!
      .click();

    expect(added).toBe(1);
  });

  it('renders no tabs for an empty list', async () => {
    const fixture = await setup([], null);

    expect(tabsEl(fixture)).toHaveLength(0);
  });
});
