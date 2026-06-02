// Minimal typed pub/sub used to decouple the simulation from the UI: sim emits
// events ("eliminated", "roundEnd", "pickup"), the HUD/audio subscribe. Generic
// over a caller-supplied event map so payloads stay type-checked.

export class EventBus<Events extends Record<string, unknown>> {
  private handlers: {
    [K in keyof Events]?: Set<(payload: Events[K]) => void>;
  } = {};

  on<K extends keyof Events>(
    event: K,
    handler: (payload: Events[K]) => void,
  ): () => void {
    let set = this.handlers[event];
    if (!set) {
      set = new Set();
      this.handlers[event] = set;
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.handlers[event]?.forEach((handler) => handler(payload));
  }

  clear(): void {
    this.handlers = {};
  }
}
