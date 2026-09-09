import { listClasses } from "@/server/services/timetable-read.service";
import { getClassNotifications } from "@/server/services/student-view.service";
import { StudentNotificationsClient } from "./student-notifications-client";

export const dynamic = "force-dynamic";

export default async function StudentNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ lop?: string }>;
}) {
  const { lop } = await searchParams;
  const classes = await listClasses();
  let urlClass: string | undefined;
  if (lop) {
    const upper = lop.trim().toUpperCase();
    urlClass = classes.some((c) => c.code === upper) ? upper : undefined;
  }
  // Notifications only exist for stored/selected classes; without a class
  // pick the client redirects with the stored choice.
  const notifications = urlClass ? await getClassNotifications(urlClass) : [];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-4">
      <StudentNotificationsClient
        classes={classes.map((c) => ({ code: c.code, grade: c.grade }))}
        initialClass={urlClass ?? null}
        initialNotifications={notifications}
      />
    </main>
  );
}
