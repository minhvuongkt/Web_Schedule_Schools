export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationsResponse {
  notifications: NotificationDto[];
}

const TYPE_LABELS_VI: Record<string, string> = {
  TIMETABLE_PUBLISHED: "Đã công bố thời khóa biểu",
  TIMETABLE_CHANGED: "Thời khóa biểu thay đổi",
  ROOM_CHANGED: "Thay đổi phòng học",
  TEACHER_CHANGED: "Thay đổi giáo viên",
  LESSON_CANCELLED: "Hủy tiết học",
  SUBSTITUTION_ASSIGNED: "Được phân công dạy thay",
  MAKEUP_LESSON_CREATED: "Bổ sung tiết học",
  ANNOUNCEMENT: "Thông báo chung",
  SYSTEM: "Hệ thống",
};

export function notificationTypeLabelVi(type: string): string {
  return TYPE_LABELS_VI[type] ?? type;
}
