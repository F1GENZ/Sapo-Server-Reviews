import type { WorkerEnv } from './env';
import type { SapoQueueEvent } from './store-do';

export type EventsQueuePort = {
  send(event: SapoQueueEvent): Promise<boolean>;
};

export const createEventsQueue = (env: WorkerEnv): EventsQueuePort => ({
  async send(event: SapoQueueEvent): Promise<boolean> {
    const queue = env.EVENTS_QUEUE;
    if (!queue) return false;
    try {
      await queue.send(event);
      return true;
    } catch {
      // Safety: a queue failure must never fail the merchant-facing write; the durability sweep re-derives the work from the database.
      return false;
    }
  },
});
