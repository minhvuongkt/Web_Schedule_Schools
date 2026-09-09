import { prisma } from "@/server/db";
import {
  sendWebPush,
  type PushPayload,
} from "@/server/domain/web-push";

/**
 * Web Push delivery (server side). VAPID keys come from the environment:
 *   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (generate: npm run vapid:generate)
 *   VAPID_SUBJECT (mailto:…, optional — defaults to a placeholder)
 * Push is disabled gracefully when the keys are absent.
 */

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!subject || !subject.startsWith("mailto:")) {
    return {
      publicKey,
      privateKey,
      subject: "mailto:admin@school.local",
    };
  }
  return { publicKey, privateKey, subject };
}

export interface SubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/** Stores (or refreshes) a browser push subscription for the current user. */
export async function savePushSubscription(
  userId: string,
  input: SubscriptionInput,
): Promise<void> {
  const endpoint = new URL(input.endpoint);
  if (endpoint.protocol !== "https:") {
    throw new Error("Push endpoint must use HTTPS");
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    },
    update: {
      userId,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    },
  });
}

/** Removes the user's subscription for an endpoint (browser unsubscribed). */
export async function removePushSubscription(
  userId: string,
  endpoint: string,
): Promise<void> {
  await prisma.pushSubscription.deleteMany({
    where: { userId, endpoint },
  });
}

function urlForNotificationType(type: string): string {
  switch (type) {
    case "TIMETABLE_PUBLISHED":
      return "/tkb";
    case "TIMETABLE_CHANGED":
      return "/gv";
    default:
      return "/gv/thong-bao";
  }
}

/**
 * Delivers the newest unseen notification of each user to their devices.
 * Called (fire-and-forget) after notification rows commit — never awaited
 * by the mutating request. Subscriptions that the push service reports gone
 * (404/410) are deleted; transient failures keep the subscription so the
 * next event retries.
 */
export async function deliverPendingPush(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const vapid = getVapidConfig();
  if (!vapid) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });
  if (subscriptions.length === 0) return;

  for (const subscription of subscriptions) {
    const latest = await prisma.notificationRecipient.findFirst({
      where: {
        userId: subscription.userId,
        notification: { createdAt: { gt: subscription.lastNotifiedAt } },
      },
      orderBy: { notification: { createdAt: "desc" } },
      select: {
        notificationId: true,
        notification: {
          select: { type: true, title: true, body: true, createdAt: true },
        },
      },
    });
    if (!latest) continue;

    const payload: PushPayload = {
      title: latest.notification.title,
      body: latest.notification.body,
      url: urlForNotificationType(latest.notification.type),
      tag: latest.notificationId,
    };
    const result = await sendWebPush(
      {
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
      payload,
      vapid,
    );
    if (result.gone) {
      await prisma.pushSubscription
        .delete({ where: { id: subscription.id } })
        .catch(() => undefined);
      continue;
    }
    if (result.ok) {
      await prisma.pushSubscription
        .update({
          where: { id: subscription.id },
          data: { lastNotifiedAt: latest.notification.createdAt },
        })
        .catch(() => undefined);
    }
  }
}
