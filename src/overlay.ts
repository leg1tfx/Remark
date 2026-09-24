// Central show/hide controller for every overlay (modals, menus, find bar, toast, drop zone).
//
// Each overlay has exactly one owner of its visibility: the running animations are stopped
// before a new one starts, and a generation counter makes sure a finished hide never
// re-hides an overlay that was opened again in the meantime. `.hidden` (display:none) is
// the only resting "closed" state, so no invisible layer can ever keep blocking clicks.
import { animate as _animate, easeInOut } from "motion";

const animate = _animate as (...args: any[]) => any;

// Keyframes already contain the overshoot (e.g. scale 0.88 → 1.02 → 1), so a plain
// ease-out curve is enough. Passing motion's spring generator as `ease` is not valid in
// motion v12: it throws inside motion's frame loop and freezes every running animation.
const popEase = [0.22, 1, 0.36, 1];
const springy = { type: "spring", bounce: 0.35 };

type Controls = { stop?: () => void; finished?: Promise<unknown> };

export type OverlayKind = "modal" | "menu" | "bar" | "fade" | "toast";

export interface OverlayOptions {
  kind: OverlayKind;
  /** Element that gets the "pop" animation (dialog panel, toast card, drop box). */
  inner?: HTMLElement;
  /** Called on Escape / backdrop click. Defaults to hiding the overlay. */
  onDismiss?: () => void;
}

interface Entry extends OverlayOptions {
  el: HTMLElement;
  open: boolean;
  gen: number;
  anims: Controls[];
  returnFocus: HTMLElement | null;
}

const entries = new Map<HTMLElement, Entry>();
/** Open overlays that react to Escape, most recently opened last. */
const stack: Entry[] = [];

// Hard upper bound for exit animations; the overlay is hidden even if an animation never settles.
const EXIT_TIMEOUT_MS = 350;

export function registerOverlay(el: HTMLElement, opts: OverlayOptions): void {
  entries.set(el, { ...opts, el, open: !el.classList.contains("hidden"), gen: 0, anims: [], returnFocus: null });
}

function getEntry(el: HTMLElement): Entry {
  let e = entries.get(el);
  if (!e) {
    registerOverlay(el, { kind: "fade" });
    e = entries.get(el)!;
  }
  return e;
}

function stopAnims(e: Entry): void {
  for (const a of e.anims) {
    try { a.stop?.(); } catch { /* already finished */ }
  }
  e.anims = [];
}

function resetStyles(e: Entry): void {
  for (const node of [e.el, e.inner]) {
    if (!node) continue;
    node.style.opacity = "";
    node.style.transform = "";
    node.style.height = "";
  }
  e.el.style.pointerEvents = "";
}

function dismissible(e: Entry): boolean {
  return e.kind === "modal" || e.kind === "menu" || e.kind === "bar";
}

function removeFromStack(e: Entry): void {
  const i = stack.indexOf(e);
  if (i >= 0) stack.splice(i, 1);
}

function enter(e: Entry): Controls[] {
  const { el, inner } = e;
  switch (e.kind) {
    case "modal":
      el.style.opacity = "0";
      if (inner) { inner.style.opacity = "0"; inner.style.transform = "scale(0.88) translateY(30px)"; }
      void el.offsetHeight;
      return [
        animate(el, { opacity: [0, 1] }, { duration: 0.25, ease: easeInOut }),
        inner && animate(inner, { opacity: [0, 1], scale: [0.88, 1.02, 1], y: [30, -4, 0] }, { duration: 0.45, ease: popEase }),
      ].filter(Boolean);
    case "toast":
      if (inner) { inner.style.opacity = "0"; inner.style.transform = "scale(0.85) translateY(30px)"; }
      void el.offsetHeight;
      return [
        animate(el, { opacity: [0, 1] }, { duration: 0.2, ease: easeInOut }),
        inner && animate(inner, { opacity: [0, 1], scale: [0.85, 1.05, 1], y: [30, -4, 0] }, { duration: 0.55, ease: popEase }),
      ].filter(Boolean);
    case "menu":
      return [animate(el, { opacity: [0, 1], scale: [0.93, 1], y: [-10, 0] }, { duration: 0.2, ease: easeInOut })];
    case "bar":
      return [animate(el, { height: ["0px", "36px"], opacity: [0, 1] }, { duration: 0.15, ease: easeInOut })];
    case "fade":
      return [
        animate(el, { opacity: [0, 1] }, { duration: 0.15, ease: easeInOut }),
        inner && animate(inner, { scale: [0.92, 1] }, { ...springy, duration: 0.3 }),
      ].filter(Boolean);
  }
}

function exit(e: Entry): Controls[] {
  const { el, inner } = e;
  switch (e.kind) {
    case "modal":
      return [
        inner && animate(inner, { opacity: [1, 0], scale: [1, 0.93], y: [0, -16] }, { duration: 0.15, ease: easeInOut }),
        animate(el, { opacity: [1, 0] }, { duration: 0.15, ease: easeInOut }),
      ].filter(Boolean);
    case "toast":
      return [
        inner && animate(inner, { opacity: [1, 0], scale: [1, 0.9], y: [0, -20] }, { duration: 0.18, ease: easeInOut }),
        animate(el, { opacity: [1, 0] }, { duration: 0.18, ease: easeInOut }),
      ].filter(Boolean);
    case "menu":
      return [animate(el, { opacity: [1, 0], scale: [1, 0.95], y: [0, -6] }, { duration: 0.12, ease: easeInOut })];
    case "bar":
      return [animate(el, { opacity: [1, 0] }, { duration: 0.1, ease: easeInOut })];
    case "fade":
      return [animate(el, { opacity: [1, 0] }, { duration: 0.12, ease: easeInOut })];
  }
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
}

export function isOverlayOpen(el: HTMLElement): boolean {
  return entries.get(el)?.open ?? false;
}

export function showOverlay(el: HTMLElement): void {
  const e = getEntry(el);
  e.gen++;
  stopAnims(e);
  const wasOpen = e.open;
  e.open = true;
  el.style.pointerEvents = "";
  el.classList.remove("hidden");
  if (dismissible(e)) {
    removeFromStack(e);
    stack.push(e);
  }
  if (e.kind === "modal" && !wasOpen) {
    e.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el.setAttribute("aria-hidden", "false");
  }
  try {
    e.anims = enter(e);
  } catch {
    resetStyles(e);
  }
  if (e.kind === "modal" && !wasOpen) {
    const target = e.inner ?? el;
    requestAnimationFrame(() => {
      if (!e.open || target.contains(document.activeElement)) return;
      const first = target.querySelector<HTMLElement>("[autofocus]") ?? focusables(target)[0];
      first?.focus();
    });
  }
}

export function hideOverlay(el: HTMLElement): Promise<void> {
  const e = entries.get(el);
  if (!e || !e.open) return Promise.resolve();
  e.open = false;
  const gen = ++e.gen;
  stopAnims(e);
  removeFromStack(e);
  // A fading overlay must not swallow clicks meant for the UI underneath.
  el.style.pointerEvents = "none";
  let anims: Controls[] = [];
  try { anims = exit(e); } catch { /* hide without animation */ }
  e.anims = anims;
  const finished = Promise.all(anims.map((a) => Promise.resolve(a.finished).catch(() => {})));
  const timeout = new Promise((r) => setTimeout(r, EXIT_TIMEOUT_MS));
  return Promise.race([finished, timeout]).then(() => {
    if (e.gen !== gen) return; // re-opened in the meantime
    e.anims = [];
    el.classList.add("hidden");
    resetStyles(e);
    if (e.kind === "modal") {
      el.setAttribute("aria-hidden", "true");
      if (e.returnFocus?.isConnected && !stack.length) e.returnFocus.focus();
      e.returnFocus = null;
    }
  });
}

export function toggleOverlay(el: HTMLElement): void {
  if (isOverlayOpen(el)) hideOverlay(el);
  else showOverlay(el);
}

/** Close the most recently opened overlay. Returns false when nothing was open. */
export function dismissTopOverlay(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  if (top.onDismiss) top.onDismiss();
  else hideOverlay(top.el);
  return true;
}

// Keep keyboard focus inside the topmost modal.
document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Tab") return;
  const top = [...stack].reverse().find((e) => e.kind === "modal");
  if (!top) return;
  const root = top.inner ?? top.el;
  const items = focusables(root);
  if (!items.length) { ev.preventDefault(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (!active || !root.contains(active)) {
    ev.preventDefault();
    first.focus();
  } else if (ev.shiftKey && active === first) {
    ev.preventDefault();
    last.focus();
  } else if (!ev.shiftKey && active === last) {
    ev.preventDefault();
    first.focus();
  }
});
