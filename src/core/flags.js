// Progression flags (story/world gates) stored in save.state.flags.
export function createFlags({ save, bus }) {
  const s = () => (save.state.flags ||= {});
  return {
    get: name => s()[name],
    has: name => !!s()[name],
    set(name, value = true) { if (s()[name] === value) return; s()[name] = value; save.commit(); bus.emit('flag:set', { name, value }); },
    all: () => ({ ...s() }),
  };
}
