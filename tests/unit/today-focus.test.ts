import { describe, expect, it } from "vitest";

import type {
  TeacherDayDto,
  TeacherLessonDto,
} from "@/server/services/teacher-view.service";
import {
  computeTodayFocus,
  flattenDay,
  isTeaching,
  minutesOf,
} from "@/components/teacher/today-focus";

function lesson(overrides: Partial<TeacherLessonDto> = {}): TeacherLessonDto {
  return {
    className: "6A",
    subjectName: "Toán",
    componentName: null,
    status: "NORMAL",
    substitutingFor: null,
    ...overrides,
  };
}

function day(lessons: TeacherLessonDto[]): TeacherDayDto {
  return {
    date: "2026-09-10",
    dayLabelVi: "Thứ Năm 10/09",
    isToday: true,
    lessonCount: lessons.length,
    sessions: [
      {
        code: "MORNING",
        labelVi: "Buổi sáng",
        periods: lessons.map((l, i) => ({
          orderNo: i + 1,
          startTime: `0${7 + i}:00`,
          endTime: `0${7 + i}:45`,
          lesson: l,
        })),
      },
    ],
  };
}

describe("minutesOf", () => {
  it("parses HH:mm into minutes since midnight", () => {
    expect(minutesOf("07:00")).toBe(420);
    expect(minutesOf("13:45")).toBe(825);
  });
});

describe("isTeaching", () => {
  it("counts NORMAL lessons", () => {
    expect(isTeaching(lesson())).toBe(true);
  });

  it("excludes CANCELLED and handed-away SUBSTITUTED lessons", () => {
    expect(isTeaching(lesson({ status: "CANCELLED" }))).toBe(false);
    expect(isTeaching(lesson({ status: "SUBSTITUTED" }))).toBe(false);
  });

  it("keeps SUBSTITUTED slots the teacher covers as substitute", () => {
    expect(
      isTeaching(lesson({ status: "SUBSTITUTED", substitutingFor: "Nguyễn A" })),
    ).toBe(true);
  });
});

describe("computeTodayFocus", () => {
  it("returns null when there is no day", () => {
    expect(computeTodayFocus(null, 600)).toBeNull();
  });

  it("marks the in-progress lesson as current and the following as next", () => {
    const focus = computeTodayFocus(day([lesson(), lesson(), lesson()]), 7 * 60 + 20);
    expect(focus?.current?.periodNo).toBe(1);
    expect(focus?.next?.periodNo).toBe(2);
    expect(focus?.finished).toBe(0);
    expect(focus?.total).toBe(3);
    expect(focus?.minutesToNext).toBe(40);
  });

  it("between lessons: no current, next is the upcoming one", () => {
    const focus = computeTodayFocus(day([lesson(), lesson()]), 7 * 60 + 50);
    expect(focus?.current).toBeNull();
    expect(focus?.next?.periodNo).toBe(2);
    expect(focus?.finished).toBe(1);
    expect(focus?.minutesToNext).toBe(10);
  });

  it("after the last lesson: nothing remains", () => {
    const focus = computeTodayFocus(day([lesson()]), 9 * 60);
    expect(focus?.current).toBeNull();
    expect(focus?.next).toBeNull();
    expect(focus?.finished).toBe(1);
    expect(focus?.total).toBe(1);
    expect(focus?.minutesToNext).toBeNull();
  });

  it("treats a missing endTime as a 45-minute lesson", () => {
    const dto = day([lesson()]);
    dto.sessions[0].periods[0].endTime = null;
    const focus = computeTodayFocus(dto, 7 * 60 + 44);
    expect(focus?.current?.periodNo).toBe(1);
  });

  it("ignores cancelled and substituted-away lessons", () => {
    const dto = day([
      lesson({ status: "CANCELLED" }),
      lesson(),
      lesson({ status: "SUBSTITUTED" }),
    ]);
    const focus = computeTodayFocus(dto, 6 * 60);
    expect(focus?.total).toBe(1);
    expect(focus?.next?.periodNo).toBe(2);
  });
});

describe("flattenDay", () => {
  it("flattens sessions and periods in order", () => {
    const slots = flattenDay(day([lesson(), lesson()]));
    expect(slots.map((slot) => slot.periodNo)).toEqual([1, 2]);
    expect(slots[0].startTime).toBe("07:00");
  });
});
