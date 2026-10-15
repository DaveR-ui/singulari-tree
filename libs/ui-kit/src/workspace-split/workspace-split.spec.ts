import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceSplitComponent } from './workspace-split';

@Component({
  selector: 'st-workspace-split-test-host',
  imports: [WorkspaceSplitComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <st-workspace-split [showDetail]="showDetail" detailTitle="Commit">
      <div detail data-testid="projected-detail">detail</div>
      <div data-testid="projected-primary">primary</div>
    </st-workspace-split>
  `,
})
class WorkspaceSplitTestHost {
  showDetail = false;
}

async function setup(showDetail = false): Promise<ComponentFixture<WorkspaceSplitTestHost>> {
  await TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  }).compileComponents();
  const fixture = TestBed.createComponent(WorkspaceSplitTestHost);
  fixture.componentInstance.showDetail = showDetail;
  fixture.detectChanges();
  return fixture;
}

function el(fixture: ComponentFixture<WorkspaceSplitTestHost>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('WorkspaceSplitComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders only the primary pane when the detail is hidden', async () => {
    const fixture = await setup(false);

    expect(el(fixture).querySelector('[data-testid="workspace-detail"]')).toBeNull();
    expect(el(fixture).querySelector('[data-testid="projected-primary"]')).not.toBeNull();
  });

  it('renders the pinned detail pane, its header and the projected detail', async () => {
    const fixture = await setup(true);

    expect(el(fixture).querySelector('[data-testid="workspace-detail"]')).not.toBeNull();
    expect(el(fixture).querySelector('[data-testid="workspace-detail-header"]')?.textContent).toContain(
      'Commit',
    );
    expect(el(fixture).querySelector('[data-testid="projected-detail"]')).not.toBeNull();
    expect(el(fixture).querySelector('[data-testid="projected-primary"]')).not.toBeNull();
  });
});
