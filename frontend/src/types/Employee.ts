// Shared types for the employee/manager subsystem (see docs/employee-backend-plan.md).

/**
 * `admin` is the platform realm: only it can sign in at /admin/login and reach
 * /api/admin. It is not a superset of `manager` — a manager runs the /manager
 * dashboards and is refused by the admin console. Every employee-side
 * privilege is keyed on `role === 'manager'`, so an `admin` in the employee
 * realm is treated as an ordinary employee.
 */
export type EmployeeRole = 'employee' | 'manager' | 'admin';

export type LeaveType = 'casual' | 'sick' | 'earned' | 'unpaid';
export type DayType = 'full_day' | 'first_half' | 'second_half';
export type LeaveStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'cancelled';

export type TaskStatus = 'Not Started' | 'In Progress' | 'On Hold' | 'Pending' | 'Completed';
export type Priority = 'High' | 'Medium' | 'Low';

export type QueryStatus = 'open' | 'in_review' | 'resolved' | 'raised_again';

export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'late'
  | 'half_day'
  | 'leave'
  | 'on_break'
  | 'on_call';

export interface EmployeeUser {
  _id: string;
  email: string;
  role: EmployeeRole;
  firstName: string;
  lastName: string;
  phone?: string;
  department?: string;
  designation?: string;
  employeeCode: string;
  manager?: string | { _id: string; firstName: string; lastName: string; employeeCode?: string } | null;
  job?: {
    joinDate?: string | null;
    status?: 'active' | 'on_leave' | 'terminated' | 'inactive';
    isActive?: boolean;
  };
  profile?: { bio?: string; imageUrl?: string; skills?: string[] };
  leaveBalances?: Record<LeaveType, { total: number; used: number }>;
  createdAt?: string;
}

export interface AttendanceRecord {
  _id?: string;
  employee?: string;
  date?: string;
  status?: AttendanceStatus;
  checkIn?: string | null;
  checkOut?: string | null;
  breakMinutes?: number;
  workingMinutes?: number;
  overtimeMinutes?: number;
}

export interface LeaveBalanceBucket {
  label: string;
  total: number;
  used: number;
  remaining: number;
}

export interface LeaveRequest {
  _id?: string;
  employee?: string | { _id: string; firstName: string; lastName: string; employeeCode?: string };
  leaveType: LeaveType;
  dayType?: DayType;
  fromDate: string;
  toDate: string;
  days: number;
  reason?: string;
  contactWhileOnLeave?: string;
  status: LeaveStatus;
  reviewedBy?: string | null;
  reviewNote?: string;
}

export interface Task {
  _id?: string;
  taskId?: string;
  title: string;
  description?: string;
  assignedTo?: string | { _id: string; firstName: string; lastName: string; employeeCode?: string };
  assignedBy?: string | { _id: string; firstName: string; lastName: string; employeeCode?: string };
  dueDate?: string | null;
  priority: Priority;
  status: TaskStatus;
  /**
   * Storage keys, not URLs (e.g. "tasks/attachments/spec-1.png"). They must be
   * signed via /api/upload/get-file-url before they can be opened.
   */
  attachments?: string[] | null;
  createdAt?: string;
}

export interface Query {
  _id?: string;
  employee?: string | { _id: string; firstName: string; lastName: string; employeeCode?: string };
  task?: string | { _id: string; taskId: string; title: string };
  message: string;
  status: QueryStatus;
  review?: string;
  createdAt?: string;
}

export interface TaskSummary {
  total: number;
  completed: number;
  inProgress: number;
  onHold?: number;
  pending?: number;
  overdue?: number;
}

export interface AttendanceToday {
  status?: string;
  leaveType?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  breakStart?: string | null;
  breakMinutes?: number;
  workingMinutes?: number;
  overtimeMinutes?: number;
}

export interface EmployeeDashboardData {
  attendanceToday?: AttendanceToday;
  attendanceMonth?: {
    dayMap?: Record<string, { status: string; date: string }>;
    summary?: {
      totalWorkingMinutes?: number;
      totalBreakMinutes?: number;
      totalOvertimeMinutes?: number;
    };
  };
  summary?: {
    startDate?: string;
    endDate?: string;
    totalWorkingMinutes?: number;
    totalOvertimeMinutes?: number;
    presentDays?: number;
    leaveDays?: number;
    tasksCompleted?: number;
  };
  recentActivity?: { type: string; at: string; meta?: any }[];
  meetings?: { _id: string; title: string; startTime: string; status: string }[];
  taskSummary?: TaskSummary;
  todayWorkSummary?: {
    totalTasks?: number;
    completed?: number;
    inProgress?: number;
    onHold?: number;
    pending?: number;
    workingMinutes?: number;
    breakMinutes?: number;
    overtimeMinutes?: number;
    meetingsCount?: number;
  };
  leaveBalance?: Record<string, LeaveRequest[]>;
}

export interface TeamAttendanceStats {
  date?: string;
  total?: number;
  present?: number;
  late?: number;
  absent?: number;
  presentPct?: number;
  latePct?: number;
  absentPct?: number;
  onLeave?: number;
  onLeavePct?: number;
  onBreak?: number;
  onBreakPct?: number;
  onCall?: number;
  onCallPct?: number;
  abnormal?: number;
  abnormalPct?: number;
  onBreakNames?: string[];
  onCallNames?: string[];
  abnormalNames?: string[];
  onCallMeetings?: { name: string; title: string | null; with: string }[];
}

export interface EmployeeReportDay {
  date: string;
  status: "present" | "late" | "absent" | "leave";
  leaveType?: string;
  checkIn?: string | null;
  checkOut?: string | null;
  workingMinutes?: number;
  breakMinutes?: number;
  overtimeMinutes?: number;
}

export interface EmployeeMonthlyReport {
  member: {
    _id: string;
    name: string;
    employeeCode?: string;
    department?: string;
  };
  summary: {
    present: number;
    late: number;
    absent: number;
    onLeave: number;
    workingMinutes: number;
    breakMinutes: number;
    overtimeMinutes: number;
    attendanceRate: number;
  };
  days: EmployeeReportDay[];
}

export interface TeamAttendanceRow {
  _id: string;
  name: string;
  employeeCode?: string;
  department?: string;
  role?: string;
  attendance?: string;
  activity?: string;
  checkIn?: string | null;
  checkOut?: string | null;
  workingMinutes?: number;
  breakMinutes?: number;
  lateMinutes?: number;
}

export interface ManagerDashboardData {
  date?: string;
  attendanceToday?: AttendanceToday;
  attendance?: TeamAttendanceStats;
  attendanceRows?: TeamAttendanceRow[];
  pendingLeaves?: LeaveRequest[];
  taskSummary?: TaskSummary;
  tasks?: Task[];
  queries?: Query[];
  alerts?: { category: string; text: string; time: string }[];
  recentActivity?: { type: string; at: string; meta?: any }[];
}

export type EmployeeJobStatus = 'active' | 'on_leave' | 'terminated' | 'inactive';

export interface ManagerOption {
  _id: string;
  firstName: string;
  lastName: string;
  employeeCode?: string;
  department?: string;
  designation?: string;
}

// A row from GET /admin/employees. The list projection is narrower than
// EmployeeUser (no personal block) and always populates the manager.
export interface AdminEmployeeListItem {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeCode?: string;
  role: EmployeeRole;
  phone?: string;
  department?: string;
  designation?: string;
  manager?: ManagerOption | string | null;
  job?: { status?: EmployeeJobStatus; isActive?: boolean };
  profile?: { bio?: string; imageUrl?: string; skills?: string[] };
  createdAt?: string;
}

// The full record from GET /admin/employees/:id, as returned by sanitizeEmployee.
export interface AdminEmployeeDetail extends AdminEmployeeListItem {
  personal?: {
    dateOfBirth?: string | null;
    gender?: string;
    address?: string;
    emergencyContact?: string;
  };
  job?: {
    joinDate?: string | null;
    status?: EmployeeJobStatus;
    isActive?: boolean;
  };
  leaveBalances?: Record<LeaveType, { total: number; used: number }>;
  updatedAt?: string;
}

export interface AdminEmployeeListResponse {
  employees: AdminEmployeeListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminEmployeeStats {
  total: number;
  byRole: Record<string, number>;
  byDepartment: { department: string; count: number }[];
  byStatus: Record<string, number>;
}

/**
 * An entry from GET /admin/managers — the accounts that can be assigned as
 * reports-to. The server only returns role "manager", so this list is safe to
 * feed straight into a picker.
 */
export interface AdminManagerOption {
  _id: string;
  firstName: string;
  lastName: string;
  employeeCode?: string;
  department?: string;
  job?: { status?: EmployeeJobStatus; isActive?: boolean };
}

/** Request body for POST /admin/employees. */
export interface AdminCreateEmployeePayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: EmployeeRole;
  phone?: string;
  department?: string;
  designation?: string;
  /** Omitted for no manager, null to clear, otherwise a manager id. */
  manager?: string | null;
  status?: EmployeeJobStatus;
}

/** Request body for PATCH /admin/employees/:id. Role and status live on /job. */
export interface AdminEditEmployeePayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  department?: string;
  designation?: string;
  bio?: string;
  manager?: string | null;
}

/**
 * Request body for PATCH /admin/employees/:id/job.
 *
 * `role` is settable here because approval is where a signup is turned into a
 * real account, and the role is decided then — the signup form itself only ever
 * creates employees. Status, role and manager go out in one call so an account
 * never lands active-but-unassigned, or assigned as a manager without the role
 * to match.
 *
 * `manager` is omitted rather than nulled when there is no reports-to: omitting
 * it leaves any existing manager alone, whereas null clears it deliberately.
 */
export interface AdminJobDecisionPayload {
  status: EmployeeJobStatus;
  role?: EmployeeRole;
  manager?: string | null;
}

export interface Availability {
  status: "available" | "unavailable";
  expectedEndAt?: string | null;
}

// A row from GET /team/available - every active employee or manager, with
// inTeam marking the ones already reporting to the current manager.
export interface AvailableEmployee {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  employeeCode?: string;
  department?: string;
  designation?: string;
  role: EmployeeRole;
  manager?: string | null;
  job?: { joinDate?: string | null };
  inTeam: boolean;
  availability?: Availability;
}

// Scoped directory an employee may invite: their teammates and their manager.
export interface Colleague {
  _id: string;
  firstName: string;
  lastName: string;
  employeeCode?: string;
  department?: string;
  designation?: string;
  role: EmployeeRole;
  manager?: string | null;
  isManager: boolean;
  availability?: Availability;
}

export interface ActiveMeeting {
  _id: string;
  title: string;
  meetingLink?: string | null;
  participants: Array<{ _id: string; firstName: string; lastName: string; employeeCode?: string }>;
  startTime: string;
  endTime?: string | null;
  durationMin?: number;
  status: "scheduled" | "active" | "ended" | "cancelled";
  actualStartedAt?: string | null;
  actualEndedAt?: string | null;
  expectedDuration?: number;
  expectedEndAt?: string | null;
  actualDuration?: number;
}

