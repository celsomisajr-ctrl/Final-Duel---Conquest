// Keyboard, mouse and touch input. Produces a movement vector in simulation space and
// forwards discrete actions (cast, rank up, recall) to callbacks.
export interface Actions { cast(slot: number, useMouse: boolean): void; rankUp(slot: number): void; recall(): void; board(on: boolean): void; shop(): void }
const SLOT: Record<string, number> = { q: 0, '1': 0, e: 1, '2': 1, r: 2, '3': 2 };

export class Input {
  private keys = new Set<string>(); private joy = { id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  mouse = { x: 0, y: 0, seen: false }; touch = false; enabled = false;
  constructor(private surface: HTMLElement, private stick: HTMLElement, private act: Actions) {
    addEventListener('keydown', (e) => {
      if (!this.enabled || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'tab') { e.preventDefault(); act.board(true); return; }
      if (e.repeat) return;
      if (k in SLOT) { if (e.shiftKey || e.ctrlKey || e.altKey) { e.preventDefault(); act.rankUp(SLOT[k]); } else act.cast(SLOT[k], true); }
      else if (k === 'b') act.recall(); else if (k === 'p') act.shop();
      this.keys.add(k);
    });
    addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); this.keys.delete(k); if (k === 'tab') act.board(false); });
    addEventListener('blur', () => { this.keys.clear(); this.endJoy(); });
    surface.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.seen = true; } else if (e.pointerId === this.joy.id) this.moveJoy(e.clientX, e.clientY); });
    surface.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.pointerType !== 'touch') return;
      this.touch = true; this.mouse.seen = false;
      if (this.joy.id < 0 && e.clientX < innerWidth * 0.5) { this.joy.id = e.pointerId; this.joy.ox = e.clientX; this.joy.oy = e.clientY; this.joy.x = this.joy.y = 0; stick.hidden = false; stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; this.moveJoy(e.clientX, e.clientY); }
    });
    const up = (e: PointerEvent) => { if (e.pointerId === this.joy.id) this.endJoy(); };
    surface.addEventListener('pointerup', up); surface.addEventListener('pointercancel', up);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  private moveJoy(x: number, y: number) { let dx = (x - this.joy.ox) / 48, dy = (y - this.joy.oy) / 48; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } this.joy.x = l < 0.18 ? 0 : dx; this.joy.y = l < 0.18 ? 0 : dy; const nub = this.stick.firstElementChild as HTMLElement; nub.style.transform = `translate(${dx * 34}px,${dy * 34}px)`; }
  private endJoy() { this.joy.id = -1; this.joy.x = this.joy.y = 0; this.stick.hidden = true; }
  /** Movement in simulation space. Screen-up is north for Blue and south for Red (whose camera is turned around). */
  vector(flip: boolean) {
    let x = this.joy.x, y = -this.joy.y;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1; if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y += 1; if (k.has('s') || k.has('arrowdown')) y -= 1;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return flip ? { mx: -x, my: -y } : { mx: x, my: y };
  }
}
