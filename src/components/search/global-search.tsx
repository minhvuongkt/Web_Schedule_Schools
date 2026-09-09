"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";

/**
 * Public global search (spec §21): diacritics-insensitive across classes,
 * subjects and teachers. Results render whenever available (no hidden
 * open-state to get stuck); Escape closes, focus reopens.
 */

interface SearchResults {
  classes: { code: string; title: string; subtitle: string; href: string }[];
  teachers: { id: string; title: string; subtitle: string; fullName: string }[];
  subjects: { code: string; title: string; subtitle: string; href: string }[];
}

const EMPTY: SearchResults = { classes: [], teachers: [], subjects: [] };

export function GlobalSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = q.trim();
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (query.length < 2) {
        if (!cancelled) setResults(null);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const body = await res.json();
        if (!cancelled) {
          const safe: SearchResults = {
            classes: Array.isArray(body?.classes) ? body.classes : [],
            teachers: Array.isArray(body?.teachers) ? body.teachers : [],
            subjects: Array.isArray(body?.subjects) ? body.subjects : [],
          };
          setResults(safe);
          setDismissed(false);
        }
      } catch {
        if (!cancelled) setResults(EMPTY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDismissed(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const showDropdown =
    !dismissed && q.trim().length >= 2 && (results !== null || loading);
  const total =
    (results?.classes.length ?? 0) +
    (results?.teachers.length ?? 0) +
    (results?.subjects.length ?? 0);

  const go = (href: string) => {
    setDismissed(true);
    router.push(href);
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
          <Icon name="search" size={18} />
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setDismissed(false);
          }}
          onFocus={() => setDismissed(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results?.classes.length === 1 && total === 1) {
              go(results.classes[0].href);
            }
          }}
          placeholder="Tìm lớp, môn học, giáo viên… (vd: 8A, toan, Nguyen Thi)"
          aria-label="Tìm kiếm"
          className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-10 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
        />
      </div>

      {showDropdown && (
        <div className="absolute z-40 mt-1.5 w-full rounded-lg border border-zinc-200 bg-white shadow-lg">
          {loading && results === null && (
            <p className="px-3 py-3 text-sm text-zinc-400">Đang tìm…</p>
          )}
          {results !== null && total === 0 && !loading && (
            <p className="px-3 py-3 text-sm text-zinc-500">
              Không tìm thấy kết quả cho “{q.trim()}”.
            </p>
          )}

          {results && results.classes.length > 0 && (
            <Section label="Lớp">
              {results.classes.map((c) => (
                <Row key={c.code} onClick={() => go(c.href)} title={c.title} subtitle={c.subtitle} />
              ))}
            </Section>
          )}
          {results && results.subjects.length > 0 && (
            <Section label="Môn học">
              {results.subjects.map((s) => (
                <Row key={s.code} onClick={() => go(s.href)} title={s.title} subtitle={s.subtitle} />
              ))}
            </Section>
          )}
          {results && results.teachers.length > 0 && (
            <Section label="Giáo viên">
              {results.teachers.map((t) => (
                <Row
                  key={t.id}
                  onClick={() => go("/dang-nhap")}
                  title={t.title}
                  subtitle={`${t.subtitle} · xem lịch dạy (cần đăng nhập)`}
                />
              ))}
            </Section>
          )}
          {results && results.teachers.length > 0 && (
            <p className="border-t border-zinc-100 px-3 py-2 text-xs text-zinc-400">
              Lịch dạy của giáo viên yêu cầu{" "}
              <Link href="/dang-nhap" className="font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-900 hover:decoration-zinc-600">
                đăng nhập
              </Link>
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
        {label}
      </p>
      {children}
    </div>
  );
}

function Row({
  onClick,
  title,
  subtitle,
}: {
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full px-3 py-2 text-left hover:bg-zinc-50"
    >
      <span className="block text-sm font-medium text-zinc-900">{title}</span>
      <span className="block text-xs text-zinc-500">{subtitle}</span>
    </button>
  );
}
