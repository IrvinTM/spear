export interface SyncStatus {
  lastSync: string | null;
  status: 'success' | 'partial' | 'failed' | 'never';
  coursesCount: number;
  assignmentsCount: number;
  todosCount: number;
  error?: string;
}

export interface TodoItem {
  id: number;
  title: string;
  description: string | null;
  sourceType: string;
  dueDate: string | null;
  status: string;
  courseName?: string;
  draftStatus?: string | null;
}

export interface EmailItem {
  id: number;
  messageId: string;
  fromAddress: string;
  fromName: string | null;
  subject: string;
  bodyText: string | null;
  summary: string | null;
  hasDeadline: boolean;
  isRead: boolean;
  receivedAt: string;
}

export interface MaterialItem {
  id: number;
  courseId?: number;
  courseName: string;
  name: string;
  type: string;
  url: string | null;
  filename: string | null;
  sectionName?: string | null;
  localPath?: string | null;
  fileStatus?: string | null;
  fileSize?: number | null;
  fileError?: string | null;
}

export interface CourseMaterialGroup {
  courseId: number;
  courseName: string;
  materials: MaterialItem[];
  summary?: string;
}

export type AttentionEventType = 'exam' | 'assignment' | 'project' | 'quiz' | 'workshop' | 'other';
export type AttentionUrgency = 'immediate' | 'this_week' | 'next_week' | 'upcoming' | 'future' | 'past';

export interface AttentionEvent {
  id: number;
  courseId: number;
  courseName: string;
  courseCode?: string;
  title: string;
  eventType: AttentionEventType;
  startDate: string | null;
  dueDate: string | null;
  dateLabel: string;
  weekNumber: number | null;
  weight: string | null;
  description: string | null;
  sourceDocument: string | null;
  priority: number;
  urgency: AttentionUrgency;
  daysRemaining?: number | null;
  status: 'upcoming' | 'in_progress' | 'completed' | 'dismissed';
}

export interface AttentionData {
  currentWeek: number;
  currentWeekLabel: string;
  currentDate: string;
  thisWeekEvents: AttentionEvent[];
  upcomingEvents: AttentionEvent[];
  topEvents: AttentionEvent[];
  allEvents: AttentionEvent[];
  summary: string;
  lastAnalyzedAt: string | null;
}

