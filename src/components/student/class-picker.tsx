"use client";

/**
 * Class picker for students (no accounts): stored in localStorage and shared
 * across /hsv pages. Falls back to URL param (?lop=) so deep links work.
 *
 * useStudentClass keeps the dropdown in sync in every direction:
 * - picking a class updates the dropdown IMMEDIATELY (optimistic state),
 *   stores the choice and navigates with ?lop=;
 * - arriving via deep link / back button (?lop= changed elsewhere) updates
 *   the dropdown from the URL prop;
 * - opening a page without ?lop= restores the stored class once.
 */
import { useEffect } from "react";
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
    <label className="relative inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white pl-2.5 pr-1 py-1 text-sm shadow-sm focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Lớp</span>
      <select
        value={selected ?? ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Chọn lớp"
        className="max-w-[7rem] cursor-pointer appearance-none bg-transparent pr-5 font-semibold text-zinc-900 focus:outline-none"
      >
        {selected === null ? (
          <option value="">Chọn lớp…</option>
        ) : null}
        {classes.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-1.5 h-4 w-4 text-zinc-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </label>
  );
}

/**
 * Shared class-selection state for student pages.
 *
 * The URL (?lop=) is the SINGLE source of truth — no mirrored state, so the
 * dropdown can never desync: picking a class navigates (the native select
 * keeps the user's choice visible until the server payload arrives), deep
 * links and back/forward navigation update the dropdown from the prop, and
 * the stored class is only used to fill in a missing ?lop=.
 *
 * @param initialClass class from the ?lop= search param (null when absent)
 * @param classes      all classes (for validating the stored value)
 * @param basePath     page route, e.g. "/hsv" or "/hsv/thoi-khoa-bieu"
 *                     (navigation keeps the user on the same page)
 */
export function useStudentClass(
  initialClass: string | null,
  classes: { code: string; grade: number }[],
  basePath: string,
): { selected: string | null; onChange: (code: string) => void } {
  const router = useRouter();

  // Persist the URL class; when the URL has none, restore the stored one.
  useEffect(() => {
    if (initialClass !== null) {
      studentClassStorage().set(initialClass);
      return;
    }
    const stored = studentClassStorage().get();
    if (stored && classes.some((c) => c.code === stored)) {
      router.replace(`${basePath}?lop=${encodeURIComponent(stored)}`);
    }
  }, [initialClass, classes, router, basePath]);

  const onChange = (code: string) => {
    studentClassStorage().set(code);
    router.push(`${basePath}?lop=${encodeURIComponent(code)}`);
  };

  return { selected: initialClass, onChange };
}

export function useNavigateToClass() {
  const router = useRouter();
  return (code: string) => {
    studentClassStorage().set(code);
    router.push(`/hsv?lop=${encodeURIComponent(code)}`);
  };
}
