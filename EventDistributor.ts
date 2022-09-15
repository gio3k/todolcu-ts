/**
 * EventDistributor, part of LibLCU.ts
 * Callback handling / callback handling functionality
 * @author lotuspar, 2022
 * @file eventdist.ts
 */

type Callback = (...args: any[]) => void;
type EventKey = (string);

enum Events {
  Clean = '_event_distributor_clean',
  EventKeyRemoved = '_event_distributor_ekr',
}
export { Events as EventDistributorEvents };

export default class EventDistributor {
  private events: Map<EventKey, (WeakRef<Callback> | Callback)[]>;

  private finalizer: FinalizationRegistry<EventKey>;

  private dirty: EventKey[] = [];

  public eventDistributorSettings = {
    // Requires keys to be registered
    enforceEventRegistration: true,

    // Changes type of reference being made when none provided
    assumeWeak: false,

    // Amount of keys in the dirty array to hold before forcing a clean
    forceCleanThreshold: 3,
  };

  constructor() {
    this.events = new Map();
    this.finalizer = new FinalizationRegistry((key: EventKey) => {
      this.pushDirty(key);
    });

    this.registerEvents(Object.values(Events));

    this.on(Events.Clean, () => {
      this.clean();
    });
  }

  /**
   * Register events
   * @param keys Event keys to register
   */
  protected registerEvents(keys: EventKey[]) {
    keys.forEach((key) => {
      if (!this.events.has(key)) {
        this.events.set(key, []);
      }
    });
  }

  /**
   * Get event keys
   * @returns Event keys
   */
  public getEvents() {
    return this.events.keys();
  }

  /**
   * Add callback for event key
   * @param key Event key
   * @param callback Event callback
   * @param weak Store callback reference weakly? (lets the callback be GCd)
   */
  public on(key: EventKey, callback: Callback, weak?: boolean): void {
    if (!this.events.has(key)) {
      if (this.eventDistributorSettings.enforceEventRegistration) {
        throw new Error(`Unknown event key ${key}`);
      }
      this.events.set(key, []);
    }

    this.finalizer.register(callback, key);
    this.events.get(key)!.push(
      (weak ?? this.eventDistributorSettings.assumeWeak) ? new WeakRef(callback) : callback,
    );
  }

  /**
   * Call event callbacks
   * @param key Event key
   * @param args Event args
   */
  public call(key: EventKey, ...args: any[]): void {
    this.events.get(key)?.forEach((callback) => {
      if (!(callback instanceof WeakRef)) {
        callback(...args);
      } else {
        const deref = callback.deref();
        if (deref === undefined) {
          this.pushDirty(key);
        } else {
          deref(...args);
        }
      }
    });
  }

  /**
   * Clear event callbacks
   * @param key Event key
   */
  protected clear(key: EventKey): void {
    this.events.set(key, []);
  }

  /**
   * Get amount of event callbacks
   * @param key Event key
   * @returns Amount of callbacks for event
   */
  protected count(key: EventKey): number {
    return this.events.get(key)?.length ?? 0;
  }

  /**
   * Sweep event map for broken references and clean up
   */
  private clean(): void {
    if (this.dirty.length === 0) {
      return;
    }

    // For each dirty event name...
    // note: the Set stops duplicate keys from being cleaned
    [...new Set(this.dirty)].forEach((dirtyKey: EventKey) => {
      // Make sure event exists...
      if (this.events.has(dirtyKey)) {
        // Event exists.
        // Filter out broken references from event callbacks.
        const cleaned = this.events.get(dirtyKey)!.filter((callback) => {
          // If callback isn't a weak reference then just let it through
          if (!(callback instanceof WeakRef)) {
            return true;
          }

          // If callback is a weak reference only let active references through
          return (callback.deref() !== undefined);
        });

        // Check for empty callback array:
        if (cleaned.length === 0) {
          // No callbacks after clean
          // First remove callback key from map
          this.events.set(dirtyKey, []);

          // Call key empty event:
          this.call(Events.EventKeyRemoved, dirtyKey);
        } else {
          // Still callbacks
          // Update event
          this.events.set(dirtyKey, cleaned);
        }
      }
    });
  }

  private pushDirty(key: EventKey) {
    this.dirty.push(key);
    if (this.dirty.length >= this.eventDistributorSettings.forceCleanThreshold) {
      this.call(Events.Clean);
    }
  }
}
