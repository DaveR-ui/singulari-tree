import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ToggleGroupComponent, type ToggleOption } from './toggle-group';

const OPTIONS: ToggleOption[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

async function setup(
  inputs: { value?: string; disabled?: boolean; options?: ToggleOption[] } = {},
): Promise<ComponentFixture<ToggleGroupComponent>> {
  await TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();
  const fixture = TestBed.createComponent(ToggleGroupComponent);
  fixture.componentRef.setInput('options', inputs.options ?? OPTIONS);
  if (inputs.value !== undefined) fixture.componentRef.setInput('value', inputs.value);
  if (inputs.disabled !== undefined) fixture.componentRef.setInput('disabled', inputs.disabled);
  fixture.detectChanges();
  return fixture;
}

function segment(
  fixture: ComponentFixture<ToggleGroupComponent>,
  value: string,
): HTMLButtonElement {
  return (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    `[data-testid="toggle-segment-${value}"]`,
  )!;
}

describe('ToggleGroupComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders one segment per option and flags the selected one', async () => {
    const fixture = await setup({ value: 'dark' });

    expect(segment(fixture, 'dark').getAttribute('aria-pressed')).toBe('true');
    expect(segment(fixture, 'light').getAttribute('aria-pressed')).toBe('false');
    expect(segment(fixture, 'light').textContent).toContain('Light');
  });

  it('emits the picked value', async () => {
    const fixture = await setup({ value: 'dark' });
    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((value) => emitted.push(value));

    segment(fixture, 'light').click();

    expect(emitted).toEqual(['light']);
  });

  it('disables every segment', async () => {
    const fixture = await setup({ disabled: true });

    expect(segment(fixture, 'dark').disabled).toBe(true);
    expect(segment(fixture, 'light').disabled).toBe(true);
  });
});
