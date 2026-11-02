// Dialogue box and choice menus (ui area), Sun/Moon style: rounded white→cyan box at the bottom with the
// speaker's name tab, typewriter text (stable word wrap: the whole line is laid out, characters are revealed),
// bobbing ▼; choices are a vertical list of pill buttons above the box on the right. Tap anywhere / A advances.
// Pushes busy 'dialog' while open (released with a short linger, so chained lines don't flash the controls).
import { el, onTap, tapFeedback } from './dom.js';
import { icon } from './icons.js';

const CPS = 46;                                   // characters per second
const PAUSE = { '.': 0.16, '!': 0.16, '?': 0.16, '…': 0.22, ',': 0.06, ';': 0.08, ':': 0.08 };
const NAME_COLORS = ['#ff6a4d', '#2bb7c9', '#9b7fd1', '#ff5f9e', '#4f9a2c', '#e09a12', '#1673a8', '#d94a30'];
const hashColor = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return NAME_COLORS[Math.abs(h) % NAME_COLORS.length]; };

export function createDialog(ctx, root, focus) {
  const layer = el('div.layer.dlg-layer');
  const catcher = el('div.dlg-catch');
  const name = el('div.dlg-name');
  const text = el('div.dlg-text');
  const next = el('div.dlg-next', { html: '<svg viewBox="0 0 40 30" class="ic"><path d="M4 4 H36 L20 26 Z" fill="#ff6a4d" stroke="#2a2140" stroke-width="4" stroke-linejoin="round"/></svg>' });
  const box = el('div.dlg-box.panel', name, text, next);
  const choices = el('div.dlg-choices');
  const wrap = el('div.dlg-wrap', choices, box);
  layer.append(catcher, wrap);
  root.append(layer);

  let open = false, releaseBusy = null, lingerTimer = 0, popFocus = null;
  let chain = Promise.resolve();
  let cur = null;   // {chars:[span], n, t, done, resolve}

  // ── open / close with linger ──
  function ensureOpen() {
    clearTimeout(lingerTimer);
    if (!open) {
      open = true;
      layer.classList.add('on');
      if (!releaseBusy) releaseBusy = ctx.busy.push('dialog');
      ctx.bus.emit('ui:dialog', { open: true });
    }
    if (!popFocus) popFocus = focus.push({ ok: advance, back: backPress, menu: () => {}, nav });
  }
  function scheduleClose() {
    clearTimeout(lingerTimer);
    lingerTimer = setTimeout(() => {
      open = false;
      layer.classList.remove('on');
      box.classList.remove('show'); choices.replaceChildren(); choices.classList.remove('show');
      popFocus?.(); popFocus = null;
      const r = releaseBusy; releaseBusy = null;
      // release one frame later so the A press that closed us cannot reach ctx.interact
      setTimeout(() => r?.(), 30);
      ctx.bus.emit('ui:dialog', { open: false });
    }, 150);
  }

  // ── typewriter ──
  function setSpeaker(speaker, color) {
    const has = !!speaker;
    name.classList.toggle('hidden', !has);
    box.classList.toggle('narration', !has);
    box.classList.remove('prompt', 'romance');
    if (has) { name.textContent = speaker; name.style.setProperty('--nc', color || hashColor(speaker)); }
  }
  /** Parse *emphasis* and build one span per character. */
  function layout(line) {
    text.replaceChildren();
    const chars = [];
    let em = false;
    const frag = document.createDocumentFragment();
    let word = null;
    for (const ch of String(line ?? '')) {
      if (ch === '*') { em = !em; continue; }
      if (ch === '\n') { frag.append(el('br')); word = null; continue; }
      const s = el('span.ch' + (em ? '.em' : ''));
      s.textContent = ch;
      if (ch === ' ') { frag.append(s); word = null; }
      else { if (!word) { word = el('span.w'); frag.append(word); } word.append(s); }
      chars.push(s);
    }
    text.append(frag);
    return chars;
  }
  function showLine(line) {
    const chars = layout(line);
    cur.chars = chars; cur.n = 0; cur.t = 0; cur.done = chars.length === 0;
    next.classList.remove('on');
    box.classList.add('show');
    if (cur.done) finishLine();
  }
  function finishLine() {
    for (let i = cur.n; i < cur.chars.length; i++) cur.chars[i].classList.add('v');
    cur.n = cur.chars.length; cur.done = true;
    if (!cur.choice) next.classList.add('on');
    cur.onTyped?.();
  }
  function update(dt) {
    if (!cur || cur.done) return;
    cur.t += dt * (ctx.input?.isDown?.('a') && !cur.choice ? 2.5 : 1);
    while (cur.n < cur.chars.length && cur.t >= 0) {
      const s = cur.chars[cur.n++];
      s.classList.add('v');
      cur.t -= 1 / CPS + (PAUSE[s.textContent] || 0);
    }
    if (cur.n >= cur.chars.length) finishLine();
  }

  function advance() {
    if (!cur) return;
    if (cur.choice) { cur.choice.ok(); return; }
    if (!cur.done) { finishLine(); return; }
    tapFeedback();
    cur.i++;
    if (cur.i < cur.lines.length) showLine(cur.lines[cur.i]);
    else { const r = cur.resolve; cur = null; next.classList.remove('on'); r(); }
  }
  function backPress() {
    if (cur?.choice) { cur.choice.back(); return; }
    advance();
  }
  function nav(dx, dy) { cur?.choice?.nav(dy || dx); }

  catcher.addEventListener('pointerdown', e => { e.preventDefault(); });
  catcher.addEventListener('pointerup', () => { if (!cur?.choice) advance(); });
  box.addEventListener('pointerup', () => { if (!cur?.choice) advance(); else if (!cur.done) finishLine(); });

  /** Serialise calls (a say() while another is open waits its turn). */
  function enqueue(fn) {
    const p = chain.then(fn, fn);
    chain = p.catch(() => {});
    return p;
  }

  function say(speaker, lines, opts = {}) {
    const list = (Array.isArray(lines) ? lines : [lines]).filter(l => l != null && l !== '');
    if (!list.length) return Promise.resolve();
    return enqueue(() => new Promise(resolve => {
      ensureOpen();
      setSpeaker(speaker, opts.color);
      cur = { lines: list, i: 0, resolve: () => { scheduleClose(); resolve(); } };
      showLine(list[0]);
    }));
  }

  function choose(title, options, opts = {}) {
    const { cancel = true, style = 'default', cancelButton = cancel } = opts;
    const opt = (options || []).map(o => (typeof o === 'string' ? { label: o } : o || { label: '' }));
    return enqueue(() => new Promise(resolve => {
      ensureOpen();
      let sel = opt.findIndex(o => !o.disabled);
      const romance = style === 'romance';
      const buttons = opt.map((o, i) => {
        const b = el('button.choice' + (romance ? '.romance' : '') + (o.disabled ? '.disabled' : ''), { type: 'button' },
          o.icon ? el('span.ch-ic', { html: icon(o.icon) }) : (romance ? el('span.ch-ic', { html: icon('heart') }) : null),
          el('span.ch-body', el('span.ch-label', o.label), o.sub ? el('span.ch-sub', o.sub) : null));
        b.style.setProperty('--i', i);
        onTap(b, () => { if (!o.disabled) pick(i); });
        b.addEventListener('pointerenter', () => { if (!o.disabled) setSel(i); });
        return b;
      });
      if (cancel && cancelButton) {
        const back = el('button.choice.cancel', { type: 'button' }, el('span.ch-ic', { html: icon('back') }), el('span.ch-body', el('span.ch-label', 'Indietro')));
        back.style.setProperty('--i', buttons.length);
        onTap(back, () => pick(-1));
        buttons.push(back);
      }
      const setSel = i => { sel = i; buttons.forEach((b, j) => b.classList.toggle('sel', j === i)); };
      let done = false;
      function pick(i) {
        if (done) return; done = true;
        tapFeedback();
        if (i >= 0) buttons[i]?.classList.add('picked');
        setTimeout(() => {
          choices.classList.remove('show');
          choices.replaceChildren();
          const r = cur?.resolve; cur = null; r?.(i);
        }, i >= 0 ? 140 : 40);
      }
      const choice = {
        ok: () => { if (!cur.done) { finishLine(); return; } if (sel >= 0 && sel < opt.length && !opt[sel].disabled) pick(sel); else if (sel >= opt.length && cancel) pick(-1); },
        back: () => { if (cancel) pick(-1); },
        nav: d => {
          if (!d) return;
          const n = buttons.length; let i = sel;
          for (let k = 0; k < n; k++) { i = (i + (d > 0 ? 1 : -1) + n) % n; if (i >= opt.length || !opt[i].disabled) break; }
          setSel(i); tapFeedback();
        },
      };
      cur = { lines: [title || ''], i: 0, choice, resolve: v => { scheduleClose(); resolve(v); } };
      cur.onTyped = () => {
        choices.className = 'dlg-choices' + (romance ? ' romance' : '');
        choices.replaceChildren(...buttons);
        void choices.offsetWidth;
        choices.classList.add('show');
        setSel(sel);
      };
      if (title) { setSpeaker(opts.speaker || null, opts.color); box.classList.remove('narration'); box.classList.add('prompt'); box.classList.toggle('romance', romance); showLine(title); }
      else { box.classList.remove('show'); cur.done = true; cur.onTyped(); }
    }));
  }

  async function confirm(textLine, { yes = 'Sì', no = 'No' } = {}) {
    const i = await choose(textLine, [{ label: yes }, { label: no }], { cancel: true, cancelButton: false });
    return i === 0;
  }

  return { say, choose, confirm, update, get open() { return open; } };
}
