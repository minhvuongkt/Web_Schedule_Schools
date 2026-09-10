"use client";

import { ClassPicker, useStudentClass } from "@/components/student/class-picker";

interface Props {
  classes: { code: string; grade: number }[];
  initialClass: string | null;
  classInfo: { code: string; grade: number; homeroomTeacherName: string | null } | null;
  schoolName: string | null;
}

const GRADE_LABEL: Record<number, string> = {
  6: "Khối 6",
  7: "Khối 7",
  8: "Khối 8",
  9: "Khối 9",
};

export function StudentProfileClient({ classes, initialClass, classInfo, schoolName }: Props) {
  const { selected, onChange } = useStudentClass(initialClass, classes, "/hsv/ho-so");

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-zinc-900">Hồ sơ</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Lớp của bạn được lưu trên máy này (không cần tài khoản).
        </p>
      </header>

      <section className="mb-4 rounded-lg border border-zinc-200 bg-white p-4">
        <label className="block text-xs font-medium text-zinc-500">Lớp của tôi</label>
        <div className="mt-1.5">
          <ClassPicker classes={classes} selected={selected} onChange={onChange} />
        </div>
        {classInfo ? (
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Khối</dt>
              <dd className="font-medium text-zinc-900">
                {GRADE_LABEL[classInfo.grade] ?? classInfo.grade}
              </dd>
            </div>
            {classInfo.homeroomTeacherName ? (
              <div className="flex justify-between">
                <dt className="text-zinc-500">Giáo viên chủ nhiệm</dt>
                <dd className="font-medium text-zinc-900">
                  {classInfo.homeroomTeacherName}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
        <h2 className="text-xs font-medium text-zinc-500">Trường</h2>
        <p className="mt-1.5 font-medium text-zinc-900">
          {schoolName ?? "TRƯỜNG PTDTBT TH & THCS MĂNG CÀNH"}
        </p>
        <dl className="mt-3 space-y-1">
          <div className="flex justify-between">
            <dt className="text-zinc-500">Năm học</dt>
            <dd className="text-zinc-900">2026–2027</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Buổi sáng</dt>
            <dd className="text-zinc-900">07:00 – 11:05</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Buổi chiều</dt>
            <dd className="text-zinc-900">13:00 – 15:25</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-zinc-400">
          Lớp học thứ Bảy · Sáng có 5 tiết (thứ 6 khối 8–9)
        </p>
      </section>
    </div>
  );
}
