// Entry point: mode select, Conquest lobby, and the match loop.
import { GameClient } from './modes/conquest/client';
import { HEROES, HERO_KEYS } from './entities/heroes';
import { Renderer } from './rendering/gl';
import { drawOverlay, drawScene, initMap } from './rendering/scene';
import { Hud, boardRows } from './ui/hud';
import { Input } from './ui/input';
import { CODE_ALPHABET, ROOM_CODE } from './server/host';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const client = new GameClient();
const screens = { menu: $('#menu'), lobby: $('#lobby'), game: $('#game') };
let renderer: Renderer | null = null, ov: CanvasRenderingContext2D | null = null, last = performance.now(), endShown = false;
const cam = { x: 100, y: 100 };

const nameEl = $<HTMLInputElement>('#name'), codeEl = $<HTMLInputElement>('#code');
try { nameEl.value = localStorage.getItem('fdc.name') || ''; } catch { /* private mode */ }
const myName = () => { const n = nameEl.value.trim() || 'Player'; try { localStorage.setItem('fdc.name', n); } catch { /* ignore */ } return n; };
const online = location.protocol === 'http:' || location.protocol === 'https:';
const wsUrl = (code: string) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/${code}`;
function goOnline(code: string) {
  if (!online) return void ($('#menu-msg').textContent = 'Online rooms need the hosted game. Solo play works from this file.');
  if (!ROOM_CODE.test(code)) return void ($('#menu-msg').textContent = 'Room codes are 5 letters or digits.');
  $('#menu-msg').textContent = 'Connecting…'; client.connect(wsUrl(code), code, myName());
}
$('#solo').onclick = () => { $('#menu-msg').textContent = ''; client.connect(null, 'SOLO', myName()); };
$('#create').onclick = () => { let c = ''; const r = crypto.getRandomValues(new Uint8Array(5)); for (const b of r) c += CODE_ALPHABET[b % CODE_ALPHABET.length]; goOnline(c); };
$('#join').onclick = () => goOnline(codeEl.value.trim().toUpperCase());
codeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#join').click(); });
const invited = new URLSearchParams(location.search).get('room'); if (invited) codeEl.value = invited.toUpperCase().slice(0, 5);

$('#leave').onclick = () => { client.leave(); render(); };
$('#copy').onclick = async () => { const link = `${location.origin}${location.pathname}?room=${client.code}`; try { await navigator.clipboard.writeText(link); $('#lobby-msg').textContent = 'Invite link copied.'; } catch { $('#lobby-msg').textContent = link; } };
$('#ready').onclick = () => client.setReady(!client.lobby.players.find((p) => p.id === client.myId)?.ready);
$('#start').onclick = () => client.start();
$<HTMLInputElement>('#fill').onchange = (e) => client.setFill((e.target as HTMLInputElement).checked);
document.querySelectorAll<HTMLElement>('[data-team]').forEach((b) => (b.onclick = () => client.setTeam(+b.dataset.team!)));
$('#heroes').innerHTML = HERO_KEYS.map((k) => `<button data-k="${k}"><span class="dot" style="background:${HEROES[k].color}"></span>${HEROES[k].name}<small>${HEROES[k].role}</small></button>`).join('');
$('#heroes').onclick = (e) => { const b = (e.target as HTMLElement).closest('button'); if (b) client.setHero(b.dataset.k!); };
$('#b-quit').onclick = () => { if (confirmLeave()) { client.leave(); render(); } };
$('#end-again').onclick = () => { $('#end').hidden = true; endShown = false; if (client.solo) client.connect(null, 'SOLO', myName()); else { client.result = null; render(); } };
$('#end-menu').onclick = () => { $('#end').hidden = true; endShown = false; client.leave(); client.result = null; render(); };
let leaveArmed = 0;
function confirmLeave() { const now = performance.now(); if (now - leaveArmed < 3000) return true; leaveArmed = now; client.say('Press Leave again to quit the match.', 'sys'); return false; }

client.onError = (m) => { $('#menu-msg').textContent = m; $('#lobby-msg').textContent = m; };
client.onChange = render;

function aimFor(slot: number, useMouse: boolean) {
  const cls = client.roster.find((r) => r.pid === client.you)?.cls || 'swordsman', range = HEROES[cls].skills[slot].range;
  if (useMouse && input.mouse.seen && renderer) return renderer.unproject(input.mouse.x, input.mouse.y);
  return client.autoAim(range);
}
const input = new Input($('#game'), $('#stick'), {
  cast: (slot, useMouse) => { const a = aimFor(slot, useMouse); client.cast(slot, a.x, a.y); },
  rankUp: (slot) => client.rankUp(slot), recall: () => client.recall(), board: (on) => { hud.boardOpen = on; }, shop: () => hud.toggleShop(),
});
const hud = new Hud(client, { cast: (slot) => { const a = aimFor(slot, false); client.cast(slot, a.x, a.y); }, rankUp: (s) => client.rankUp(s), recall: () => client.recall(), buy: (k) => client.buy(k) });

function render() {
  const inMatch = client.status === 'match' || (client.status === 'reconnecting' && client.you >= 0) || !!client.result;
  const inLobby = !inMatch && (client.status === 'lobby' || client.status === 'connecting' || client.status === 'reconnecting') && !client.solo;
  screens.menu.hidden = inMatch || inLobby; screens.lobby.hidden = !inLobby; screens.game.hidden = !inMatch; input.enabled = inMatch && !client.result;
  if (inLobby) lobby();
  if (inMatch && !renderer) {
    try { renderer = new Renderer($<HTMLCanvasElement>('#gl')); initMap(renderer); ov = $<HTMLCanvasElement>('#ov').getContext('2d'); }
    catch (e) { client.leave(); $('#menu-msg').textContent = 'This browser cannot run Conquest (WebGL2 is unavailable).'; screens.menu.hidden = false; screens.game.hidden = true; return; }
  }
  if (client.result && !endShown) {
    endShown = true; const win = client.result.winner === client.team, el = $('#end');
    el.hidden = false; el.classList.toggle('win', win); el.classList.toggle('loss', !win);
    $('#end-k').textContent = `${client.result.winner ? 'Red' : 'Blue'} team destroyed the enemy Core in ${Math.floor(client.result.secs / 60)}:${String(client.result.secs % 60).padStart(2, '0')}`;
    $('#end-title').textContent = win ? 'Victory' : 'Defeat';
    $('#end-rows').innerHTML = boardRows(client, client.result.stats.map((r) => [r[0], r[4], r[1], r[2], r[3], r[5], 1]));
    $('#end-again').textContent = client.solo ? 'Play again' : 'Back to the room';
  }
}

function lobby() {
  const L = client.lobby, me = L.players.find((p) => p.id === client.myId);
  $('#lobby-code').textContent = client.code;
  for (const t of [0, 1]) {
    const ps = L.players.filter((p) => p.team === t);
    $('#team' + t).innerHTML = ps.map((p) => `<li class="${p.id === client.myId ? 'me' : ''}"><span class="dot" style="background:${HEROES[p.cls].color}"></span>${esc(p.name)}${p.host ? ' (host)' : ''}<small>${HEROES[p.cls].name}</small><span class="ok">${p.ready ? 'Ready' : ''}</span></li>`).join('') +
      Array.from({ length: 5 - ps.length }, () => `<li class="empty">${L.fill ? 'Bot will fill this seat' : 'Open seat'}</li>`).join('');
    const jb = document.querySelector<HTMLButtonElement>(`[data-team="${t}"]`)!; jb.hidden = !me || me.team === t || ps.length >= 5;
  }
  document.querySelectorAll<HTMLElement>('#heroes button').forEach((b) => b.classList.toggle('on', b.dataset.k === me?.cls));
  if (me) { const d = HEROES[me.cls]; $('#hero-info').innerHTML = `<b>${d.name}</b>, ${d.role.toLowerCase()}. ` + d.skills.map((s) => `<b>${esc(s.name)}</b>${s.ult ? ' (ultimate)' : ''}: ${esc(s.desc)}`).join(' '); }
  const host = client.isHost, others = L.players.filter((p) => p.id !== client.myId), allReady = others.every((p) => p.ready);
  $('#fill-wrap').hidden = !host; $<HTMLInputElement>('#fill').checked = L.fill;
  $('#ready').hidden = host; $('#ready').textContent = me?.ready ? 'Not ready' : 'Ready';
  $('#start').hidden = !host; $<HTMLButtonElement>('#start').disabled = !allReady;
  if (client.status === 'connecting') $('#lobby-msg').textContent = 'Connecting…';
  else if (client.status === 'reconnecting') $('#lobby-msg').textContent = 'Reconnecting…';
  else if (host) $('#lobby-msg').textContent = allReady ? (others.length ? 'Everyone is ready.' : 'Share the room code, or start now with bots.') : 'Waiting for everyone to be ready.';
  else $('#lobby-msg').textContent = me?.ready ? 'Waiting for the host to start.' : 'Pick a hero and press Ready.';
}

function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (screens.game.hidden || !renderer || !ov) return;
  const v = input.enabled ? input.vector(client.team === 1) : { mx: 0, my: 0 };
  client.input.mx = v.mx; client.input.my = v.my;
  client.update(dt);
  if (client.me) { const k = 1 - Math.exp(-dt * 10); cam.x += (client.pred.x - cam.x) * k; cam.y += (client.pred.y - cam.y) * k; if (Math.hypot(client.pred.x - cam.x, client.pred.y - cam.y) > 30) { cam.x = client.pred.x; cam.y = client.pred.y; } }
  renderer.resize(input.touch ? 1.25 : 1.5);
  const oc = ov.canvas, dpr = Math.min(devicePixelRatio || 1, 2); if (oc.width !== Math.round(renderer.w * dpr) || oc.height !== Math.round(renderer.h * dpr)) { oc.width = Math.round(renderer.w * dpr); oc.height = Math.round(renderer.h * dpr); }
  drawScene(renderer, client, cam, now / 1000, dt); drawOverlay(ov, renderer, client);
  if (client.me) hud.update();
}
requestAnimationFrame(frame);
render();
(window as any).__fdc = { client }; // handle for automated browser checks
