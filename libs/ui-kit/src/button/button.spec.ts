import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ButtonComponent } from './button';

@Component({
  selector: 'st-button-test-host',
  imports: [ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <st-button [pressed]="pressed()">
      <span>Label</span>
    </st-button>
  `,
})
class ButtonTestHost {
  readonly pressed = signal<boolean | null>(null);
}

async function setup(): Promise<ComponentFixture<ButtonTestHost>> {
  await TestBed.configureTestingModule({
    imports: [ButtonTestHost],
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();
  const fixture = TestBed.createComponent(ButtonTestHost);
  fixture.detectChanges();
  return fixture;
}

function inner(fixture: ComponentFixture<ButtonTestHost>): HTMLButtonElement {
  return (fixture.nativeElement as HTMLElement).querySelector('button')!;
}

describe('ButtonComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('forwards aria-pressed to the inner button', async () => {
    const fixture = await setup();

    fixture.componentInstance.pressed.set(true);
    fixture.detectChanges();
    expect(inner(fixture).getAttribute('aria-pressed')).toBe('true');

    fixture.componentInstance.pressed.set(false);
    fixture.detectChanges();
    expect(inner(fixture).getAttribute('aria-pressed')).toBe('false');
  });

  it('renders no aria-pressed by default', async () => {
    const fixture = await setup();

    expect(inner(fixture).hasAttribute('aria-pressed')).toBe(false);
  });
});
