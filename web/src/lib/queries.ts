import { QueryClient, useQuery } from "@tanstack/react-query";
import { api, type MonthDay, type Person, type Program, type ProgramDetail, type Session, type Tally, type Update } from "./api";

/**
 * How every phone stays in step: the server is the only copy of the data.
 * Each screen re-reads what it shows every few seconds while it is open, at
 * once when the phone comes back to the app or back online, and straight
 * after any change made on this phone.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 5000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: "always",
      refetchOnReconnect: "always",
      staleTime: 0,
      // Kept for a week so the saved copy survives the app being closed.
      gcTime: 7 * 24 * 60 * 60 * 1000,
      retry: (count, err: any) => err?.status !== 401 && err?.status !== 403 && err?.status !== 404 && count < 2,
    },
    // Data restored from the saved copy lives as long as freshly loaded data.
    hydrate: { queries: { gcTime: 7 * 24 * 60 * 60 * 1000 } },
  },
});

export const keys = {
  programs: ["programs"] as const,
  program: (slug: string) => ["program", slug] as const,
  session: (slug: string, date: string) => ["session", slug, date] as const,
  month: (slug: string, month: string) => ["month", slug, month] as const,
  tally: (slug: string) => ["tally", slug] as const,
  updates: (slug: string) => ["updates", slug] as const,
  people: ["people"] as const,
};

export const usePrograms = () =>
  useQuery({ queryKey: keys.programs, queryFn: () => api<Program[]>("/programs"), refetchInterval: 30000 });

export const useProgram = (slug: string) =>
  useQuery({ queryKey: keys.program(slug), queryFn: () => api<ProgramDetail>(`/programs/${slug}`), refetchInterval: 30000 });

export const useSession = (slug: string, date: string) =>
  useQuery({ queryKey: keys.session(slug, date), queryFn: () => api<Session>(`/programs/${slug}/sessions/${date}`) });

export const useMonth = (slug: string, month: string) =>
  useQuery({ queryKey: keys.month(slug, month), queryFn: () => api<MonthDay[]>(`/programs/${slug}/months/${month}`), refetchInterval: 15000 });

export const useTally = (slug: string) =>
  useQuery({ queryKey: keys.tally(slug), queryFn: () => api<Tally>(`/programs/${slug}/tally`), refetchInterval: 3000 });

export const useUpdates = (slug: string) =>
  useQuery({ queryKey: keys.updates(slug), queryFn: () => api<Update[]>(`/programs/${slug}/updates`), refetchInterval: 10000 });

export const usePeople = () =>
  useQuery({ queryKey: keys.people, queryFn: () => api<Person[]>("/users"), refetchInterval: 15000 });
