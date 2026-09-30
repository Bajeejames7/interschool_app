import { BASE } from "./base";
import { reportConnection } from "./offline";

// Talking to the server. The login token lives in localStorage so a coach
// stays signed in on their phone.

const TOKEN_KEY = "ambassadors.token";
const ME_KEY = "ambassadors.me";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: the session lasts until the tab closes */
  }
}

/** Who is signed in, kept so the app can open offline without asking the server. */
export function getStoredMe(): Me | null {
  try {
    return JSON.parse(localStorage.getItem(ME_KEY) ?? "null");
  } catch {
    return null;
  }
}

export function setStoredMe(me: Me | null): void {
  try {
    if (me) localStorage.setItem(ME_KEY, JSON.stringify(me));
    else localStorage.removeItem(ME_KEY);
  } catch {
    /* private mode */
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: any) {
    super(message);
  }
}

/** Called when the server says the login is no longer valid. */
let onSignedOut: () => void = () => {};
export function handleSignedOut(fn: () => void) {
  onSignedOut = fn;
}

export async function api<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${BASE}api${path}`, {
      method: init.method ?? "GET",
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    reportConnection(false);
    throw new ApiError(0, "No connection. Check your internet and try again.", null);
  }
  reportConnection(true);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith("/auth/login")) onSignedOut();
    throw new ApiError(res.status, body?.error ?? "Something went wrong. Try again.", body);
  }
  return body as T;
}

/** A fresh id per tap, so a retried request is counted once by the server. */
export function eventId(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// ---- shapes returned by the server -------------------------------------------------

export interface Me {
  id: number;
  email: string;
  name: string;
  role: "user" | "admin" | "superadmin";
  isSuperAdmin: boolean;
  isAdmin: boolean;
  mustChangePassword: boolean;
  coordinates: number[];
}

export interface AvailabilityOption {
  id: string;
  label: string;
  tone: "good" | "ok" | "bad";
}
export interface ScheduleItem {
  time: string;
  activity: string;
}
export interface Team {
  id: string;
  name: string;
  color: string;
}

export interface Program {
  id: number;
  slug: string;
  name: string;
  shortCode: string;
  kind: "intramural" | "club";
  color: string;
  coordinatorName: string;
  /** e.g. "School Sports Coordinator"; empty means the default for the kind. */
  coordinatorTitle: string;
  tagline: string;
  notes: string;
  sessionWeekday: number;
  availabilityOptions: AvailabilityOption[];
  defaultRoles: string[];
  defaultSchedule: ScheduleItem[];
  teams: Team[];
  categories: string[];
  archived: boolean;
  /** "logos/x.png" shipped with the app, an uploaded data: URL, or "" for initials. */
  logo: string;
  /** "backgrounds/x.jpg" shipped with the app, an uploaded data: URL, or "" for the default photo. */
  background: string;
  canManage: boolean;
}

export interface ProgramDetail extends Program {
  coordinators: { id: number; name: string }[];
  today: string;
  nextSession: string;
}

export interface Role {
  name: string;
  assignee: string;
}

export interface Session {
  date: string;
  isSessionDay: boolean;
  schedule: ScheduleItem[];
  roles: Role[];
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  availability: { userId: number; name: string; optionId: string; updatedAt: string }[];
  mine: string | null;
}

export interface MonthDay {
  date: string;
  edited: boolean;
  replies: number;
  coming: number;
}

export interface Tally {
  teams: (Team & { points: number; lastBy: string | null; lastAt: string | null })[];
  resetAt: string | null;
  resetBy: string | null;
  recent: { id: number; teamId: string; category: string; amount: number; author: string; createdAt: string }[];
}

export interface Update {
  id: number;
  author: string;
  body: string;
  createdAt: string;
  canDelete: boolean;
}

export interface Person {
  id: number;
  email: string;
  name: string;
  role: "user" | "admin" | "superadmin";
  isSuperAdmin: boolean;
  pendingFirstSignIn: boolean;
  created_at: string;
  coordinates: { id: number; name: string }[];
}
