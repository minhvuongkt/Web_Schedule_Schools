/**
 * In-process notification event bus for the SSE push channel
 * (/api/notifications/stream). A globalThis singleton survives Next dev HMR.
 * Single-instance (same trade-off as the in-memory rate limiter — see
 * docs/deployment.md; SSE connections additionally poll as a cross-instance
 * fallback is not needed for the current single-node deployment).
 */

export interface NotificationEvent {
  userId: string;
}

type Listener = (event: NotificationEvent) => void;

const globalForEvents = globalThis as unknown as {
  __tkbNotificationEvents?: Set<Listener>;
};

const listeners: Set<Listener> = (globalForEvents.__tkbNotificationEvents ??= new Set());

/** Registers a listener; returns an unsubscribe function. */
export function subscribeToNotifications(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Notifies open SSE streams that new notifications exist for these users.
 * Call AFTER the creating transaction commits (never inside it).
 */
export function publishNotificationsChanged(userIds: string[]): void {
  if (listeners.size === 0) return;
  for (const userId of userIds) {
    for (const listener of listeners) {
      try {
        listener({ userId });
      } catch {
        // a broken stream must never break the mutating request
      }
    }
  }
}
