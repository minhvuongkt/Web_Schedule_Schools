"use client";

/**
 * Class picker for students (no accounts): stored in localStorage and shared
 * across /hsv pages. Falls back to URL param (?lop=) so deep links work.
 */
import { useRouter } from "next/navigation";

const STORAGE_KEY = "tkb.studentClass";

export function studentClassStorage(): {
  get: () => string | null;
  set: (code: string) => void;
} {
  return {
    get: () => {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(STORAGE_KEY);
    },
    set: (code: string) => {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(STORAGE_KEY, code);
    },
  };
}

export function ClassPicker({
  classes,
  selected,
  onChange,
}: {
  classes: { code: string; grade: number }[];
  selected: string | null;
  onChange: (code: string) => void;
}) {
  return (
    <select
      value={selected ?? ""}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Chọn lớp"
      className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
    >
      {classes.map((c) => (
        <option key={c.code} value={c.code}>
          Lớp {c.code}
        </option>
      ))}
    </select>
  );
}

export function useNavigateToClass() {
  const router = useRouter();
  return (code: string) => {
    studentClassStorage().set(code);
    router.push(`/hsv?lop=${encodeURIComponent(code)}`);
  };
}
