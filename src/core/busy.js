// Global lock: dialogue, battles, scenes and sheets push a tag; while any tag is held the player
// does not move from input, interactions pause and the UI hides the touch controls.
export function createBusy({ bus }) {
  const tags = [];
  const emit = () => bus.emit('busy:change', { busy: tags.length > 0, tags: [...tags] });
  return {
    get tags() { return [...tags]; },
    is: () => tags.length > 0,
    has: tag => tags.includes(tag),
    /** Emergency: drop every tag except `keep` (integration watchdog for locks left by a broken scene). */
    forceClear(keep = []) { for (let i = tags.length - 1; i >= 0; i--) if (!keep.includes(tags[i])) tags.splice(i, 1); emit(); },
    /** Push a tag; returns release() (idempotent). */
    push(tag = 'busy') {
      tags.push(tag); emit();
      let done = false;
      return () => { if (done) return; done = true; const i = tags.lastIndexOf(tag); if (i >= 0) tags.splice(i, 1); emit(); };
    },
  };
}
