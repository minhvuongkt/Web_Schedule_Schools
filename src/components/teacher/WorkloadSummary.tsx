interface WorkloadSummaryProps {
  expectedTeaching: number;
  scheduled: number;
  difference: number;
  dutyLessons: number;
}

interface StatCardProps {
  label: string;
  value: number;
  tone?: string;
  note?: string;
  signed?: boolean;
}

function StatCard({ label, value, tone, note, signed }: StatCardProps) {
  const display = signed && value > 0 ? `+${value}` : `${value}`;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
        {display}
        {note ? (
          <span className={`ml-1.5 text-sm font-medium ${tone ?? ""}`}>
            {note}
          </span>
        ) : null}
      </p>
    </div>
  );
}

export function WorkloadSummary({
  expectedTeaching,
  scheduled,
  difference,
  dutyLessons,
}: WorkloadSummaryProps) {
  const differenceTone =
    difference > 0
      ? "text-emerald-700"
      : difference < 0
        ? "text-amber-700"
        : "";
  const differenceNote =
    difference > 0 ? "thừa" : difference < 0 ? "thiếu" : undefined;

  return (
    <section
      aria-label="Tổng kết khối lượng công tác trong tuần"
      className="grid grid-cols-2 gap-3 md:grid-cols-4"
    >
      <StatCard label="Dự kiến (được phân công)" value={expectedTeaching} />
      <StatCard label="Đã xếp lịch" value={scheduled} />
      <StatCard
        label="Chênh lệch"
        value={difference}
        tone={differenceTone}
        note={differenceNote}
        signed
      />
      <StatCard label="Phân công kiêm nhiệm" value={dutyLessons} />
    </section>
  );
}
