// In-match interface: bars, skill buttons, minimap, scoreboard, shop, notifications.
import { CFG } from '../core/shared/config';
import { BUFFS, HEROES } from '../entities/heroes';
import { ITEMS, MONSTERS } from '../entities/units';
import { CAMPS, LANES, RIVER, SPAWN } from '../maps/conquest/map';
import type { GameClient } from '../modes/conquest/client';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const TEAM = ['#4fb0ff', '#ff5c5c'];
function set(el: HTMLElement, text: string) { if (el.textContent !== text) el.textContent = text; }
function html(el: HTMLElement, h: string) { if ((el as any)._h !== h) { (el as any)._h = h; el.innerHTML = h; } }

export interface HudActions { cast(slot: number): void; rankUp(slot: number): void; recall(): void; buy(k: string): void }

export class Hud {
  private cls = ''; shopOpen = false; boardOpen = false;
  constructor(private c: GameClient, private act: HudActions) {
    $('#skills').addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!b) return; e.preventDefault();
      const slot = +(b.dataset.slot || -1);
      if (b.classList.contains('up')) act.rankUp(slot); else if (b.dataset.recall) act.recall(); else if (slot >= 0) act.cast(slot);
    });
    $('#shop-items').addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (b && !b.disabled) act.buy(b.dataset.k!); });
    $('#b-shop').onclick = () => this.toggleShop(); $('#shop-x').onclick = () => this.toggleShop(false);
    $('#b-board').onclick = () => { this.boardOpen = !this.boardOpen; };
  }
  toggleShop(v = !this.shopOpen) { this.shopOpen = v; }

  private build(cls: string) {
    this.cls = cls; const d = HEROES[cls], keys = ['Q', 'E', 'R'];
    $('#skills').innerHTML = `<div class="skill recall"><span class="pips"></span><button class="cast" data-recall="1" aria-label="Recall to base"><kbd>B</kbd>Recall</button></div>` +
      d.skills.map((s, i) => `<div class="skill${s.ult ? ' ult' : ''}" id="sk${i}"><button class="up" data-slot="${i}" aria-label="Upgrade ${esc(s.name)}" hidden>+</button><span class="pips"></span><button class="cast" data-slot="${i}" title="${esc(s.desc)}"><kbd>${keys[i]}</kbd>${esc(s.name)}<span class="cd" hidden></span></button></div>`).join('');
  }

  update() {
    const c = this.c, m = c.me; if (!m) return;
    const cls = c.roster.find((r) => r.pid === c.you)?.cls || 'swordsman'; if (cls !== this.cls) this.build(cls);
    const d = HEROES[cls];
    set($('#k0'), String(c.score[0])); set($('#k1'), String(c.score[1])); set($('#clock'), clock(c.time));
    set($('#lv'), String(m.lv)); set($('#gold'), String(m.g));
    $('#hp').style.width = (100 * m.hp) / m.mh + '%'; set($('#hp-t'), `${m.hp} / ${m.mh}`);
    $('#mp').style.width = (100 * m.mp) / m.mm + '%'; set($('#mp-t'), `${m.mp} / ${m.mm}`);
    $('#xp').style.width = m.lv >= CFG.maxLevel ? '100%' : (100 * m.xp) / CFG.xpToLevel[m.lv - 1] + '%';
    const buffs = [...Object.keys(m.b).map((k) => `${BUFFS[k]?.name || k} ${m.b[k]}s`), ...(c.teamBuffs[c.team] || []).map((k) => BUFFS[k]?.name || k)];
    html($('#buffs'), buffs.map((b) => `<span>${esc(b)}</span>`).join(''));
    d.skills.forEach((s, i) => {
      const el = $('#sk' + i), rank = m.r[i], max = i === 2 ? CFG.ultMaxRank : CFG.basicMaxRank;
      const can = m.sp > 0 && rank < max && m.lv >= (i === 2 ? CFG.ultLevels[rank] : CFG.basicRankLevel(rank + 1));
      (el.querySelector('.up') as HTMLElement).hidden = !can;
      set(el.querySelector('.pips') as HTMLElement, '●'.repeat(rank) + '○'.repeat(max - rank));
      const cost = s.mana[0] + s.mana[1] * (Math.max(1, rank) - 1), cd = el.querySelector('.cd') as HTMLElement;
      el.classList.toggle('off', !rank || m.mp < cost || !m.al);
      cd.hidden = !(m.cd[i] > 0); if (m.cd[i] > 0) set(cd, m.cd[i] >= 1 ? String(Math.ceil(m.cd[i])) : m.cd[i].toFixed(1));
    });
    // objectives line
    const ep = (i: number, key: string) => (c.camps[0] & (1 << (CAMPS.length - 2 + i)) ? `<b>${MONSTERS[key].name} is up</b>` : `${MONSTERS[key].name} in ${clock(c.camps[1 + i] || 0)}`);
    html($('#objectives'), `${ep(0, 'colossus')} · ${ep(1, 'emberwyrm')}`);
    html($('#feed'), c.feed.map((f) => `<li class="${f.cls}">${esc(f.text)}</li>`).join(''));
    const bn = $('#banner'); bn.hidden = !c.banner; if (c.banner) set(bn, c.banner.text);
    const st = $('#status');
    if (c.status === 'reconnecting') { st.hidden = false; html(st, 'Connection lost<small>Reconnecting… your seat is being held</small>'); }
    else if (!m.al) { st.hidden = false; html(st, `Defeated<small>Respawning in ${Math.ceil(m.rs)}s</small>`); }
    else if (m.rc > 0) { st.hidden = false; html(st, `Recalling<small>${m.rc.toFixed(1)}s. Moving or taking damage cancels it</small>`); }
    else st.hidden = true;
    const stale = performance.now() - c.lastSnapAt > 1500;
    set($('#net'), c.solo ? 'Solo' : stale ? 'No signal' : `${Math.round(c.rtt)} ms`); $('#net').style.color = stale ? '#ff5c5c' : c.rtt > 220 ? '#f6b24a' : '';
    $('#board').hidden = !this.boardOpen; if (this.boardOpen) html($('#board-rows'), boardRows(c, c.board.map((r) => [r[0], r[4], r[1], r[2], r[3], r[5], r[7]])));
    $('#shop').hidden = !this.shopOpen;
    if (this.shopOpen) {
      const home = !m.al || Math.hypot(m.x - SPAWN[c.team].x, m.y - SPAWN[c.team].y) <= CFG.sanctuaryRadius;
      set($('#shop-hint'), home ? `You have ${m.g} gold. One of each item, up to ${CFG.maxItems}.` : 'Return to your Sanctuary (or recall with B) to buy.');
      html($('#shop-items'), Object.values(ITEMS).map((it) => { const own = m.it.includes(it.key); return `<button data-k="${it.key}" class="${own ? 'own' : ''}" ${own || !home || m.g < it.cost ? 'disabled' : ''}><span>${esc(it.name)}</span><small>${esc(it.desc)}</small><b>${own ? 'Owned' : it.cost + ' gold'}</b></button>`; }).join(''));
    }
    this.minimap();
  }

  private minimap() {
    const c = this.c, cv = $<HTMLCanvasElement>('#minimap'), g = cv.getContext('2d')!, S = cv.width, k = S / 200, flip = c.team === 1;
    const X = (x: number) => (flip ? 200 - x : x) * k, Y = (y: number) => (flip ? y : 200 - y) * k;
    g.clearRect(0, 0, S, S); g.fillStyle = '#1b3a26'; g.fillRect(0, 0, S, S);
    g.lineCap = 'round'; g.strokeStyle = '#2f7fa6'; g.lineWidth = 5; g.beginPath(); g.moveTo(X(RIVER[0].x), Y(RIVER[0].y)); g.lineTo(X(RIVER[1].x), Y(RIVER[1].y)); g.stroke();
    g.strokeStyle = '#8a7650'; g.lineWidth = 6; g.lineJoin = 'round';
    for (const l of LANES) { g.beginPath(); l.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y)))); g.stroke(); }
    CAMPS.forEach((cd, i) => { if (!(c.camps[0] & (1 << i))) return; const epic = MONSTERS[cd.key].epic; g.fillStyle = epic ? '#f6b24a' : '#d9cc99'; g.beginPath(); g.arc(X(cd.x), Y(cd.y), epic ? 4.5 : 2.2, 0, 7); g.fill(); });
    for (const s of c.structs) { if (s.hp <= 0) continue; g.fillStyle = TEAM[s.team]; const r = s.kind === 'core' ? 6 : 3.5; g.fillRect(X(s.x) - r, Y(s.y) - r, r * 2, r * 2); g.strokeStyle = '#0c0a14'; g.lineWidth = 1; g.strokeRect(X(s.x) - r, Y(s.y) - r, r * 2, r * 2); }
    for (const u of c.units.values()) if (u.kind === 'minion') { g.fillStyle = TEAM[u.team]; g.fillRect(X(u.x) - 1, Y(u.y) - 1, 2, 2); }
    const dot = (x: number, y: number, team: number, me: boolean) => { g.fillStyle = TEAM[team]; g.beginPath(); g.arc(X(x), Y(y), 4, 0, 7); g.fill(); g.lineWidth = me ? 2 : 1; g.strokeStyle = me ? '#fff' : '#0c0a14'; g.stroke(); };
    for (const f of c.far) if (f[3] && f[0] !== c.you) dot(f[1] / 10, f[2] / 10, c.teamOf(f[0]), false);
    for (const u of c.units.values()) if (u.kind === 'hero' && u.pid !== c.you) dot(u.x, u.y, u.team, false);
    if (c.me?.al) dot(c.pred.x, c.pred.y, c.team, true);
  }
}

/** rows: [pid, level, kills, deaths, assists, gold, connected?] */
export function boardRows(c: GameClient, rows: number[][]) {
  return [0, 1].map((team) => rows.filter((r) => c.teamOf(r[0]) === team).map((r) => { const ro = c.roster.find((x) => x.pid === r[0]);
    return `<tr class="${team ? 'red' : 'blue'}${r[0] === c.you ? ' me' : ''}${r[6] === 0 ? ' gone' : ''}"><td>${esc(ro?.name || '?')} <small>${HEROES[ro?.cls || '']?.name || ''}</small></td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td>${r[5]}</td></tr>`; }).join('')).join('');
}
