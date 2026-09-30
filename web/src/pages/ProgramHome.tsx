import { Link } from "react-router-dom";
import { ArrowRight, CalendarCheck, Users } from "lucide-react";
import { useProgramContext } from "../lib/program";
import { useSession } from "../lib/queries";
import { WEEKDAYS, longDate } from "../lib/dates";
import { Credit, Page } from "../components/ui";
import { asset } from "../lib/base";

export function ProgramHome() {
  const program = useProgramContext();
  const session = useSession(program.slug, program.nextSession);
  const day = WEEKDAYS[program.sessionWeekday];
  const mine = program.availabilityOptions.find((o) => o.id === session.data?.mine);
  const coming = session.data?.availability.filter(
    (a) => program.availabilityOptions.find((o) => o.id === a.optionId)?.tone !== "bad",
  ).length;

  return (
    <>
      <section
        className="bg-navy bg-cover bg-center px-4 pb-10 pt-8 text-white"
        style={{ backgroundImage: `linear-gradient(to bottom, rgba(22,34,79,.92), rgba(22,34,79,.55) 45%, #16224f), url(${asset("hero.jpg")})` }}
      >
        <div className="mx-auto max-w-2xl">
          <p className="text-center font-display text-sm uppercase tracking-[0.25em]">Ambassadors Football</p>
          <p className="text-center font-display text-sm uppercase tracking-[0.25em]">{program.name}</p>
          {program.tagline && (
            <p className="mt-1 text-center font-display text-xs uppercase tracking-[0.25em] text-sky-300">{program.tagline}</p>
          )}
          <h1 className="mt-16 font-display text-4xl leading-[1.05] drop-shadow">Show up ready.<br />Serve together.</h1>
          <p className="mt-4 max-w-md text-white/85">
            Welcome, coaches. Confirm your {day} availability and stay in the loop with updates from the team.
          </p>
          <Link to="session" className="btn mt-6 bg-white px-6 py-3.5 text-navy">
            {mine ? `You said: ${mine.label}` : `Confirm ${day} availability`} <ArrowRight className="h-4 w-4" />
          </Link>
          {program.coordinatorName && (
            <p className="mt-8 font-display text-xs uppercase tracking-[0.2em] text-white/80">
              {program.coordinatorName} — {program.kind === "club" ? "Club" : "Intramural"} Coordinator
            </p>
          )}
        </div>
      </section>

      <Page>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link to="session" className="card flex items-start gap-3 hover:ring-brand">
            <CalendarCheck className="mt-0.5 h-6 w-6 text-brand" />
            <div>
              <p className="eyebrow">Next session</p>
              <p className="mt-1 font-bold">{longDate(program.nextSession)}</p>
              <p className="text-sm text-muted">
                {session.data ? `${coming} coach${coming === 1 ? "" : "es"} coming so far` : "Checking who is coming…"}
              </p>
            </div>
          </Link>
          <div className="card flex items-start gap-3">
            <Users className="mt-0.5 h-6 w-6 text-brand" />
            <div>
              <p className="eyebrow">Coordinator</p>
              <p className="mt-1 font-bold">
                {program.coordinators.map((c) => c.name).join(", ") || program.coordinatorName || "Not set yet"}
              </p>
              <p className="text-sm text-muted">Edits roles and the schedule for {program.name}.</p>
            </div>
          </div>
        </div>

        {program.notes && (
          <div className="card mt-4">
            <p className="eyebrow">About this {program.kind}</p>
            <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{program.notes}</p>
          </div>
        )}
        <Credit />
      </Page>
    </>
  );
}
