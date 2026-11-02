// Sheet "settings" (Opzioni): Contenuti per adulti (18+, asks for confirmation when turning on), musica, effetti,
// qualità grafica (auto/bassa/media/alta), vibrazione, corsa automatica; Salva partita, Nuova partita.
// Writes ctx.save.state.settings and emits settings:change {key, value}.
import { el, onTap } from '../dom.js';
import { icon } from '../icons.js';
import { sheets, section, toggle } from './kit.js';

export function render(ctx, root, data = {}) {
  const s = (ctx.save.state.settings ||= {});
  const set = (key, value) => {
    s[key] = value;
    ctx.save.commit?.();
    ctx.bus.emit('settings:change', { key, value });
  };

  // ── 18+ ──
  const adult = toggle(!!s.adult, async (on, t) => {
    if (on) {
      const ok = await ctx.ui.confirm('Confermi di avere almeno 18 anni e di voler attivare le scene romantiche per adulti?', { yes: 'Sì, attiva', no: 'Annulla' });
      if (!ok) { t.classList.remove('on'); adultT.set(false); return; }
    }
    s.adultAsked = true;
    set('adult', on);
    ctx.ui?.toast?.(on ? 'Contenuti 18+ attivati' : 'Contenuti 18+ disattivati', { icon: on ? 'heart' : 'heartEmpty' });
  });
  const adultT = adult;
  const adultRow = el('div.st-row.adult', el('span.st-ic', { html: icon('heart') }),
    el('div.st-body', el('div.st-title', 'Contenuti per adulti ', el('span.st-badge', '18+')), el('div.st-sub', 'Scene romantiche con le 14 ragazze di Valmora. Spento di base.')), adult.el);

  // ── audio ──
  const slider = (key, label, ic, apply) => {
    const v = s[key] ?? 0.7;
    const out = el('span.st-val.num', Math.round(v * 100) + '%');
    const inp = el('input.st-range', { type: 'range', min: '0', max: '1', step: '0.05', value: String(v), 'aria-label': label });
    const paint = () => inp.style.setProperty('--p', (inp.value * 100).toFixed(0) + '%');
    paint();
    inp.addEventListener('input', () => { const x = +inp.value; out.textContent = Math.round(x * 100) + '%'; paint(); apply(x); });
    inp.addEventListener('change', () => { set(key, +inp.value); ctx.audio?.sfx?.('ui_tap'); });
    return el('div.st-row', el('span.st-ic', { html: icon(ic) }), el('div.st-body', el('div.st-title', label), inp), out);
  };
  const music = slider('music', 'Musica', 'music', x => { s.music = x; ctx.audio?.setVolumes?.({ music: x }); });
  const sfx = slider('sfx', 'Effetti sonori', 'sound', x => { s.sfx = x; ctx.audio?.setVolumes?.({ sfx: x }); });

  // ── quality ──
  const Q = [['auto', 'Auto'], ['low', 'Bassa'], ['mid', 'Media'], ['high', 'Alta']];
  const seg = el('div.seg', Q.map(([id, label]) => {
    const b = el('button.seg-b' + ((s.quality || 'auto') === id ? '.on' : ''), { type: 'button', 'data-id': id }, label);
    onTap(b, () => {
      seg.querySelectorAll('.seg-b').forEach(x => x.classList.toggle('on', x === b));
      ctx.quality?.set?.(id);
      set('quality', id);
      qNote.textContent = tierNote();
    });
    return b;
  }));
  const tierNote = () => `In uso: ${({ low: 'bassa', mid: 'media', high: 'alta' })[ctx.quality?.tier] || '—'}`;
  const qNote = el('div.st-sub', tierNote());
  const quality = el('div.st-row.col', el('div.st-line', el('span.st-ic', { html: icon('quality') }), el('div.st-body', el('div.st-title', 'Qualità grafica'), qNote)), seg);

  // ── toggles ──
  const tg = (key, label, sub, ic) => el('div.st-row', el('span.st-ic', { html: icon(ic) }), el('div.st-body', el('div.st-title', label), sub ? el('div.st-sub', sub) : null),
    toggle(!!s[key], on => { set(key, on); if (key === 'haptics' && on) ctx.haptic?.(15); }).el);
  const haptics = tg('haptics', 'Vibrazione', 'Piccoli feedback al tocco', 'hand');
  const autoRun = tg('autoRun', 'Corsa automatica', 'Corri sempre, senza tenere premuto', 'run');

  // ── save / new game ──
  const saveB = el('button.btn.leaf.block', { type: 'button' }, el('span', { html: icon('save') }), 'Salva partita');
  const newB = el('button.btn.coral.block', { type: 'button' }, el('span', { html: icon('sparkle') }), 'Nuova partita');
  onTap(saveB, () => {
    const ok = ctx.save?.flush?.();
    ctx.ui?.toast?.(ok === false ? 'Impossibile salvare su questo dispositivo' : 'Partita salvata', { icon: ok === false ? 'close' : 'save' });
  });
  onTap(newB, async () => {
    const ok = await ctx.ui.confirm('Iniziare una nuova partita? Il salvataggio attuale verrà cancellato. Le opzioni restano.', { yes: 'Sì, ricomincia', no: 'No' });
    if (!ok) return;
    sheets().close();
    if (ctx.ui?.titleOpen?.()) { ctx.ui.hideTitle?.(); }
    await ctx.fade?.out?.(400, '#fff');
    ctx.startGame?.(true);
    await ctx.fade?.in?.(500);
  });

  const meta = el('div.st-meta', `Leggende di Valmora · v${ctx.VERSION || '2'}`, ctx.save?.available === false ? ' · salvataggio non disponibile' : '');
  root.append(
    section('Contenuti', adultRow),
    section('Audio', music, sfx),
    section('Grafica e comandi', quality, haptics, autoRun),
    data.fromTitle ? null : section('Partita', el('div.st-btns', saveB, newB)),
    meta);
}
