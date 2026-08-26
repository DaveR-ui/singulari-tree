import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  OnInit,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';

interface MockCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
  branches: string[];
  lane: number;
  dot: string;
  selected?: boolean;
}

interface RepoCard {
  name: string;
  branch: string;
  path: string;
}

@Component({
  selector: 'st-layout',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './layout.html',
  styleUrls: ['./layout.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutComponent implements OnInit {
  // -- responsive --
  private readonly MOBILE_BP = 1024;
  private readonly LS_RIGHT_W = 'st:rightWidth';
  private readonly LS_RIGHT_COL = 'st:rightCollapsed';
  private readonly LS_RIGHT_PIN = 'st:rightPinned';

  readonly rightWidth = signal(320);
  readonly rightCollapsed = signal(false);
  readonly rightPinned = signal(true);
  readonly leftCollapsed = signal(false);
  readonly viewportW = signal(typeof window !== 'undefined' ? window.innerWidth : 1280);
  readonly isMobile = computed(() => this.viewportW() < this.MOBILE_BP);

  // left sidebar sections
  readonly workspaceExpanded = signal(true);
  readonly branchesExpanded = signal(true);
  readonly tagsExpanded = signal(false);
  readonly remotesExpanded = signal(true);
  readonly davidExpanded = signal(true);
  readonly originExpanded = signal(true);

  // center
  readonly selectedHash = signal('a3f9c2e');
  readonly showRemoteBranches = signal(true);
  readonly branchFilter = signal('All Branches');
  readonly orderFilter = signal('Date Order');

  readonly isOverlay = computed(() => this.isMobile() || !this.rightPinned());
  readonly rightVisible = computed(() => !this.rightCollapsed() || this.isOverlay());

  // mock data
  readonly repoCards: RepoCard[] = [
    { name: 'DFCustomerPortal_SPA_AIR.X', branch: 'main', path: 'C:\\Work\\DFCustomerPortal_SPA_AIR.X' },
    { name: 'singulariTree', branch: 'feature/layout-shell', path: 'D:\\SingulariTree' },
    { name: 'go-core', branch: 'main', path: 'D:\\SingulariTree\\apps\\go-core' },
    { name: 'design-tokens', branch: 'dev', path: 'D:\\Tokens' },
  ];

  readonly commits: MockCommit[] = [
    { hash: 'a3f9c2e', message: 'feat(layout): shell grid + right drawer persistence', author: 'David', date: '2 hours ago', branches: ['origin/feature/layout-shell', 'origin/main'], lane: 0, dot: '#0a84ff', selected: true },
    { hash: 'b91d0f1', message: 'fix(graph): lane assignment for merge commits', author: 'Laura', date: '3 hours ago', branches: [], lane: 1, dot: '#ff3b30' },
    { hash: 'c44a8b2', message: 'chore: update proto contracts', author: 'David', date: 'yesterday', branches: [], lane: 0, dot: '#0a84ff' },
    { hash: 'd12e773', message: 'feat(ipc): supervisor queue drain on restart', author: 'Ana', date: 'yesterday', branches: [], lane: 2, dot: '#af52de' },
    { hash: 'e7a901c', message: 'Merge branch hotfix/csp into develop', author: 'GitHub', date: '2 days ago', branches: [], lane: 0, dot: '#30d158' },
    { hash: 'f003ae4', message: 'docs: roadmap-mvp week 4', author: 'David', date: '3 days ago', branches: ['tag: v0.1.0'], lane: 1, dot: '#ff9f0a' },
    { hash: '10bc2ff', message: 'refactor(go): hexagonal ports', author: 'Laura', date: '4 days ago', branches: [], lane: 0, dot: '#0a84ff' },
    { hash: '22a1d09', message: 'initial commit', author: 'David', date: '1 week ago', branches: [], lane: 0, dot: '#0a84ff' },
  ];

  // drag state
  private dragging = false;
  private dragStartX = 0;
  private dragStartW = 320;

  constructor() {
    // persist side effects
    effect(() => {
      const w = this.rightWidth();
      try { localStorage.setItem(this.LS_RIGHT_W, String(w)); } catch {}
    });
    effect(() => {
      const c = this.rightCollapsed();
      try { localStorage.setItem(this.LS_RIGHT_COL, String(c)); } catch {}
    });
    effect(() => {
      const p = this.rightPinned();
      try { localStorage.setItem(this.LS_RIGHT_PIN, String(p)); } catch {}
    });
  }

  ngOnInit(): void {
    try {
      const w = localStorage.getItem(this.LS_RIGHT_W);
      if (w) {
        const n = parseInt(w, 10);
        if (!isNaN(n) && n >= 240 && n <= 560) this.rightWidth.set(n);
      }
      const c = localStorage.getItem(this.LS_RIGHT_COL);
      if (c !== null) this.rightCollapsed.set(c === 'true');
      const p = localStorage.getItem(this.LS_RIGHT_PIN);
      if (p !== null) this.rightPinned.set(p === 'true');
    } catch {}
    this.viewportW.set(typeof window !== 'undefined' ? window.innerWidth : 1280);
  }

  @HostListener('window:resize')
  onResize(): void {
    this.viewportW.set(window.innerWidth);
  }

  toggleRight(): void {
    this.rightCollapsed.update((v) => !v);
  }

  toggleLeft(): void {
    this.leftCollapsed.update((v) => !v);
  }

  togglePin(): void {
    this.rightPinned.update((v) => !v);
    // when pinning on desktop, ensure visible
    if (this.rightPinned() && this.isMobile()) {
      // on mobile pinning has no effect, keep overlay
    }
    if (this.rightPinned() && !this.isMobile()) {
      this.rightCollapsed.set(false);
    }
  }

  selectCommit(hash: string): void {
    this.selectedHash.set(hash);
  }

  // -- resizable drag handle
  onDragStart(event: MouseEvent): void {
    if (this.isOverlay()) return;
    this.dragging = true;
    this.dragStartX = event.clientX;
    this.dragStartW = this.rightWidth();
    event.preventDefault();
    const onMove = (e: MouseEvent) => {
      if (!this.dragging) return;
      const dx = this.dragStartX - e.clientX;
      let nw = this.dragStartW + dx;
      nw = Math.max(240, Math.min(560, nw));
      this.rightWidth.set(nw);
    };
    const onUp = () => {
      this.dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  closeOverlay(): void {
    if (this.isOverlay()) this.rightCollapsed.set(true);
  }
}
