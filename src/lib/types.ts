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
