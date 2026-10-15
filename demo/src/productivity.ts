import type { Assignment, Course } from './domain';

export type DeadlineWindow = 'all' | 'today' | 'week' | 'overdue' | 'undated';
const DAY = 86_400_000;
export const hasDeadline = (value: number) => Number.isFinite(value) && value < 1e15;

export function matchesDeadline(item: Assignment, window: DeadlineWindow, now: number) {
  if (window === 'all') return true;
  if (window === 'undated') return !hasDeadline(item.dueAt);
  if (!hasDeadline(item.dueAt)) return false;
  if (window === 'overdue') return item.dueAt <= now;
  if (window === 'week') return item.dueAt > now && item.dueAt < now + 7 * DAY;
  const start = Math.floor((now + 8 * 3_600_000) / DAY) * DAY - 8 * 3_600_000;
  return item.dueAt >= start && item.dueAt < start + DAY;
}

export function matchesAssignment(item: Assignment, courses: Course[], query: string) {
  const course = courses.find(c => c.id === item.courseId);
  const text = `${item.title} ${course?.name || ''} ${course?.code || ''}`.toLocaleLowerCase();
  return query.trim().toLocaleLowerCase().split(/\s+/).every(word => text.includes(word));
}

export function orderCourses(courses: Course[], pinned: string[]) {
  const ids = new Set(pinned);
  // Stable partition preserves the server's course order within each group.
  return [...courses.filter(c => ids.has(c.id)), ...courses.filter(c => !ids.has(c.id))];
}

const escapeIcs = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const stamp = (value: number) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
// RFC 5545 folds content lines at 75 UTF-8 octets, without splitting a code point.
export function foldCalendarLine(line: string) {
  const encoder = new TextEncoder();
  let current = '', length = 0;
  const result: string[] = [];
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (length + size > 75) { result.push(current); current = ' '; length = 1; }
    current += char; length += size;
  }
  result.push(current);
  return result.join('\r\n');
}

export function assignmentCalendar(items: Assignment[], courses: Course[], now: number, demo = false) {
  const events = items.filter(a => a.submission === 'unsubmitted' && hasDeadline(a.dueAt)).map(a => {
    const course = courses.find(c => c.id === a.courseId);
    const description = `${demo ? '演示作业，非真实截止日期。\n' : ''}${course?.name || '课程'}\n导出时尚未提交；此文件为日历快照，提交或改期后请重新导出。`;
    return [
      'BEGIN:VEVENT', `UID:${encodeURIComponent(a.courseId)}-${encodeURIComponent(a.id)}@canvas-suixing.local`,
      `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(a.dueAt)}`, `DTEND:${stamp(a.dueAt + 60_000)}`,
      `SUMMARY:${escapeIcs(`${demo ? '[演示] ' : ''}${a.title} · 截止`)}`,
      `DESCRIPTION:${escapeIcs(description)}`, 'END:VEVENT',
    ];
  });
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Canvas Suixing//Assignments//ZH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...events.flat(), 'END:VCALENDAR'];
  return { count: events.length, text: lines.map(foldCalendarLine).join('\r\n') + '\r\n' };
}
