"use client";

import { useEffect, useState } from "react";

/**
 * Live countdown "Bắt đầu sau X phút" for the next lesson. Ticks every 30s
 * (client-side display only; the target time comes from the server).
 */
export function NextLessonCountdown({ startTime }: { startTime: string }) {
  const [minutesAway, setMinutesAway] = useState<number | null>(null);

  useEffect(() => {
    const [h, m] = startTime.split(":").map(Number);
    const compute = () => {
      const now = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date());
      const [nh, nm] = now.split(":").map(Number);
      setMinutesAway(h * 60 + m - (nh * 60 + nm));
    };
    compute();
    const timer = setInterval(compute, 30_000);
    return () => clearInterval(timer);
  }, [startTime]);

  if (minutesAway === null) {
    return <span className="text-sm text-zinc-500">Tiết kế tiếp lúc {startTime}</span>;
  }
  if (minutesAway < 0) {
    return <span className="text-sm text-emerald-700">Đang diễn ra</span>;
  }
  if (minutesAway === 0) {
    return <span className="text-sm font-semibold text-emerald-700">Sắp bắt đầu!</span>;
  }
  if (minutesAway < 60) {
    return (
      <span className="text-sm font-medium text-blue-800">
        Bắt đầu sau {minutesAway} phút
      </span>
    );
  }
  return (
    <span className="text-sm text-zinc-500">
      Bắt đầu sau {Math.floor(minutesAway / 60)} giờ {minutesAway % 60} phút
    </span>
  );
}
