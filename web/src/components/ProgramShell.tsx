import { NavLink, Outlet, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, ClipboardCheck, House, Settings, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { useProgram } from "../lib/queries";
import { ErrorNote, SchoolBadge, Spinner, TopBar } from "./ui";
import { asset } from "../lib/base";

/** Frame for one school: top bar, the page, and the tab bar at the bottom. */
export function ProgramShell() {
  const { slug = "" } = useParams();
  const program = useProgram(slug);

  const tabs = [
    { to: `/p/${slug}`, label: "Home", icon: House, end: true },
    { to: `/p/${slug}/session`, label: program.data ? weekdayName(program.data.sessionWeekday) : "Session", icon: ClipboardCheck },
    { to: `/p/${slug}/calendar`, label: "Calendar", icon: CalendarDays },
    { to: `/p/${slug}/tally`, label: "Tally", icon: Trophy },
    ...(program.data?.canManage ? [{ to: `/p/${slug}/settings`, label: "Setup", icon: Settings }] : []),
  ];

  return (
    <>
      <TopBar
        left={
          <Link to="/" aria-label="All schools" className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
            {program.data ? (
              <SchoolBadge program={program.data} size={36} />
            ) : (
              <img src={asset("logo.jpg")} alt="" className="h-9 w-9 rounded-lg object-cover" />
            )}
          </Link>
        }
        title={program.data?.name}
      />
      {program.data === undefined ? (
        program.isError ? (
        <div className="mx-auto max-w-2xl p-4">
          <ErrorNote error={program.error} onRetry={() => program.refetch()} />
        </div>
        ) : (
        <Spinner />
        )
      ) : (
        <Outlet context={program.data} />
      )}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-2xl">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${isActive ? "text-brand" : "text-muted"}`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}

function weekdayName(day: number): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day] ?? "Session";
}
