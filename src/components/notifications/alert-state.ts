/**
 * Pure helpers for the in-app notification alert (banner shown when staff
 * access the site while unread notifications exist). Keeping the dismissal
 * logic pure makes it unit-testable without React.
 */

/** Stable key for a set of unread notification ids (order-independent). */
export function alertKey(ids: string[]): string {
  return [...ids].sort().join("|");
}

/**
 * Shows the banner when there is at least one unread notification and the
 * current unread set differs from the set the user dismissed. A NEW
 * notification therefore re-shows the banner even after a dismissal.
 */
export function shouldShowAlert(unreadIds: string[], dismissedKey: string | null): boolean {
  if (unreadIds.length === 0) return false;
  return alertKey(unreadIds) !== dismissedKey;
}
