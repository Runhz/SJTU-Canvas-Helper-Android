export type Submission = 'unsubmitted' | 'submitted' | 'late' | 'unknown';
export interface Assignment {
  id: string; courseId: string; title: string; description: string; dueAt: number;
  requirementFiles?:CourseFile[]; submittedFiles?:CourseFile[]; submission: Submission; submittedAt?: number; attachments?: string[]; allowedExtensions?:string[]; uploadAllowed?:boolean; locked?:boolean; htmlUrl?:string;
}
export interface Course { id: string; name: string; code: string; teacher: string; color: 'blue' | 'sand' | 'green' | 'purple'; glyph: string; files: CourseFile[]; filesLoaded?:boolean;fileLoading?:boolean;fileError?:string;term?: {id:string;name:string;startAt?:number;endAt?:number} }
export interface CourseFile { id: string; name: string; size: string; kind: string; updated: string; raw?:Record<string,unknown> }
export interface DownloadTask { id: string; courseId: string; name: string; progress: number; status: 'running' | 'completed' | 'cancelled' | 'queued' | 'waiting' | 'failed'; path?:string; resourceId?:string; reason?:number }
export interface Reminder { id: string; assignmentId: string; title: string; body: string; createdAt: number; read: boolean; demo?: boolean }
export interface ReminderSettings { enabled: boolean; offsets: number[]; overdue: boolean }
export const HOUR = 3600_000;
export const DEFAULT_REMINDERS: ReminderSettings = { enabled: true, offsets: [24 * HOUR, 2 * HOUR, HOUR / 2], overdue: true };
export const courses: Course[] = [
  { id: 'theory', name: '毛泽东思想和中国特色社会主义理论体系概论', code: 'MARX1204-2026-2027-1', teacher: '示例课程', color: 'sand', glyph: 'book', files: [] },
  { id: 'net', name: '计算机网络', code: 'CS3310', teacher: '王老师', color: 'blue', glyph: 'network', files: [
    { id: 'net1', name: '第 5 讲 · 网络层.pdf', size: '4.2 MB', kind: 'PDF', updated: '今天' },
    { id: 'net2', name: '实验 2 · Socket 编程说明.pdf', size: '1.8 MB', kind: 'PDF', updated: '昨天' },
    { id: 'net3', name: '实验资源与示例代码.zip', size: '12.6 MB', kind: 'ZIP', updated: '10月12日' },
  ] },
  { id: 'math', name: '概率论与数理统计', code: 'MA1208', teacher: '陈老师', color: 'sand', glyph: 'sigma', files: [
    { id: 'math1', name: '第四章 · 随机变量的数字特征.pdf', size: '3.6 MB', kind: 'PDF', updated: '今天' },
    { id: 'math2', name: '习题 4 · 参考公式.docx', size: '284 KB', kind: 'DOCX', updated: '10月13日' },
  ] },
  { id: 'os', name: '操作系统', code: 'CS2303', teacher: '李老师', color: 'green', glyph: 'cpu', files: [
    { id: 'os1', name: '进程调度与同步.pptx', size: '6.8 MB', kind: 'PPTX', updated: '昨天' },
    { id: 'os2', name: '实验 1 · Shell 实现.zip', size: '2.1 MB', kind: 'ZIP', updated: '10月12日' },
  ] },
  { id: 'ml', name: '机器学习', code: 'AI2611', teacher: '周老师', color: 'purple', glyph: 'spark', files: [
    { id: 'ml1', name: '线性回归与梯度下降.pdf', size: '5.1 MB', kind: 'PDF', updated: '10月13日' },
    { id: 'ml2', name: '作业 2 · notebook.ipynb', size: '168 KB', kind: 'IPYNB', updated: '10月12日' },
  ] },
];
export function createAssignments(now: number): Assignment[] {
  const description = '请根据课程资料独立完成本次作业，将答案或代码整理后上传。此处为交互演示，要求及日期均为示例，未连接真实课程。';
  return [
    { id: 'a1', courseId: 'net', title: '实验 2：Socket 编程', dueAt: now + 5 * HOUR + 42 * 60_000, submission: 'unsubmitted', description },
    { id: 'a2', courseId: 'math', title: '习题 4：期望与方差', dueAt: now + 29 * HOUR, submission: 'unsubmitted', description },
    { id: 'a3', courseId: 'os', title: '实验 1：实现一个 Shell', dueAt: now + 76 * HOUR, submission: 'unsubmitted', description },
    { id: 'a4', courseId: 'ml', title: '作业 2：线性回归', dueAt: now - 14 * HOUR, submission: 'unsubmitted', description },
    { id: 'a5', courseId: 'net', title: '习题 3：数据链路层', dueAt: now - 36 * HOUR, submission: 'submitted', submittedAt: now - 40 * HOUR, attachments: ['习题3.pdf'], description },
    { id: 'a6', courseId: 'math', title: '习题 3：连续型随机变量', dueAt: now + 48 * HOUR, submission: 'submitted', submittedAt: now - 3 * HOUR, attachments: ['习题3_解答.pdf'], description },
  ];
}
export function sortAssignments(items: Assignment[]) { return [...items].sort((a, b) => a.dueAt - b.dueAt || a.id.localeCompare(b.id)); }
export function statusOf(item: Assignment, now: number) {
  if (item.submission === 'unknown') return {text:'状态待核对',tone:'gray'};
  if (item.submission === 'late') return { text: '已迟交', tone: 'amber' };
  if (item.submission === 'submitted') return { text: '已提交', tone: 'green' };
  if (item.dueAt <= now) return { text: '已逾期', tone: 'red' };
  if (item.dueAt - now <= 24 * HOUR) return { text: '即将截止', tone: 'amber' };
  return { text: '待提交', tone: 'gray' };
}
export function countdown(dueAt: number, now: number) {
  if (dueAt >= 1e15) return '未设截止日期';
  const overdue = dueAt <= now;
  const minutes = Math.ceil(Math.abs(dueAt - now) / 60_000);
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), mins = minutes % 60;
  const value = days > 0 ? `${days} 天 ${hours} 小时` : hours > 0 ? `${hours} 小时 ${mins} 分钟` : `${Math.max(1, mins)} 分钟`;
  return overdue ? `已逾期 ${value}` : `还剩 ${value}`;
}
export function formatDate(timestamp: number, withTime = true) {
  if (timestamp >= 1e15) return '未设截止日期';
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } as const : {}) }).format(date);
}
export function submitDemo(items: Assignment[], id: string, attachments: string[], now: number) {
  if (!attachments.length) throw new Error('请至少选择一个附件');
  return items.map(item => item.id === id ? { ...item, attachments, submittedAt: now, submission: (now > item.dueAt ? 'late' : 'submitted') as Submission } : item);
}
export function reminderCandidates(items: Assignment[], settings: ReminderSettings, now: number, seen: ReadonlySet<string>): Reminder[] {
  if (!settings.enabled) return [];
  return items.flatMap(item => {
    if (item.submission !== 'unsubmitted') return [];
    if (item.dueAt >= 1e15) return [];
    const remaining = item.dueAt - now;
    const threshold = remaining <= 0 ? (settings.overdue ? 'overdue' : undefined) : [...settings.offsets].sort((a,b) => a-b).find(offset => remaining <= offset);
    if (threshold === undefined) return [];
    const id = `${item.id}:${item.dueAt}:${threshold}`;
    if (seen.has(id)) return [];
    return [{ id, assignmentId: item.id, title: remaining <= 0 ? '有一项作业逾期未提交' : '作业即将截止', body: `${item.title} · ${countdown(item.dueAt, now)}`, createdAt: now, read: false }];
  });
}
export function downloadProgress(tasks: DownloadTask[]) {
  return tasks.map(t => t.status === 'running' ? { ...t, progress: Math.min(100, t.progress + 7), status: t.progress + 7 >= 100 ? 'completed' as const : t.status } : t);
}
