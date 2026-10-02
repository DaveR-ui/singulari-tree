import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import type { RepoCardView } from '@singularitree/ui-kit';
import { GithubAccountStore } from '@features/github-account/github-account.store';
import { toRepoCardView } from '@features/github-account/repo-card-view';
import { RepoDrawer } from './ui/repo-drawer/repo-drawer';
import { ShellHeader } from './ui/shell-header/shell-header';
import { ShellMenubar } from './ui/shell-menubar/shell-menubar';
import { ShellToolbar } from './ui/shell-toolbar/shell-toolbar';
import { SidebarLeft } from './ui/sidebar-left/sidebar-left';

/**
 * Application shell: header + menubar + toolbar chrome, a route-driven center
 * region and the repository drawer. Layout state (width/collapse/pin) is
 * persisted to localStorage; drawer data comes from `GithubAccountStore`.
 */
@Component({
  selector: 'st-layout',
  standalone: true,
  imports: [RouterOutlet, ShellHeader, ShellMenubar, ShellToolbar, SidebarLeft, RepoDrawer],
  templateUrl: './layout.html',
  styleUrls: ['./layout.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutComponent implements OnInit {
  readonly gh = inject(GithubAccountStore);

  // -- responsive --
  private readonly MOBILE_BP = 1024;
  private readonly LS_RIGHT_W = 'st:rightWidth';
  private readonly LS_RIGHT_COL = 'st:rightCollapsed';
  private readonly LS_RIGHT_PIN = 'st:rightPinned';

  readonly rightWidth = signal(320);
  readonly rightCollapsed = signal(false);
  readonly rightPinned = signal(true);
  readonly leftCollapsed = signal(false);
  /** Controlled workspace selection for `<st-sidebar-left>`. */
  readonly activeWorkspace = signal('history');
  readonly viewportW = signal(typeof window !== 'undefined' ? window.innerWidth : 1280);
  readonly isMobile = computed(() => this.viewportW() < this.MOBILE_BP);
  readonly isOverlay = computed(() => this.isMobile() || !this.rightPinned());

  /** GitHub account repos mapped to the drawer's presentational view model. */
  readonly repoCards = computed<RepoCardView[]>(() => this.gh.repos().map(toRepoCardView));

  // drag state
  private dragging = false;
  private dragStartX = 0;
  private dragStartW = 320;

  constructor() {
    // persist side effects
    effect(() => {
      const w = this.rightWidth();
      try {
        localStorage.setItem(this.LS_RIGHT_W, String(w));
      } catch {}
    });
    effect(() => {
      const c = this.rightCollapsed();
      try {
        localStorage.setItem(this.LS_RIGHT_COL, String(c));
      } catch {}
    });
    effect(() => {
      const p = this.rightPinned();
      try {
        localStorage.setItem(this.LS_RIGHT_PIN, String(p));
      } catch {}
    });
  }

  async ngOnInit(): Promise<void> {
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

    await this.gh.refreshStatus();
    if (this.gh.authenticated()) {
      await this.gh.loadRepos();
    }
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
    if (this.rightPinned() && !this.isMobile()) {
      this.rightCollapsed.set(false);
    }
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
