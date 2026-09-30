import { getPool } from "./db.js";

/**
 * Database migrations, applied in order at startup. Each runs once, inside a
 * transaction, and is recorded in schema_migrations. Never edit one that has
 * shipped: add a new one after it.
 */
const migrations: { id: string; sql: string }[] = [
  {
    id: "001_init",
    sql: `
      CREATE TABLE users (
        id            serial PRIMARY KEY,
        email         text NOT NULL,
        name          text NOT NULL,
        password_hash text NOT NULL,
        -- Every new account is a 'user'. Admins are made by the creator or
        -- another admin. The creator is set by the CREATOR_EMAIL variable.
        role          text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
        created_at    timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX users_email_idx ON users (lower(email));

      -- An intramural or a club at a partner school.
      CREATE TABLE programs (
        id                   serial PRIMARY KEY,
        slug                 text NOT NULL UNIQUE,
        name                 text NOT NULL,
        short_code           text NOT NULL,
        kind                 text NOT NULL CHECK (kind IN ('intramural', 'club')),
        color                text NOT NULL DEFAULT '#2F5BD3',
        coordinator_name     text NOT NULL DEFAULT '',
        tagline              text NOT NULL DEFAULT '',
        -- The school's own requirements, written up after the survey.
        notes                text NOT NULL DEFAULT '',
        session_weekday      int  NOT NULL DEFAULT 2 CHECK (session_weekday BETWEEN 0 AND 6),
        availability_options jsonb NOT NULL,
        default_roles        jsonb NOT NULL,
        default_schedule     jsonb NOT NULL,
        teams                jsonb NOT NULL,
        categories           jsonb NOT NULL,
        archived             boolean NOT NULL DEFAULT false,
        position             int NOT NULL DEFAULT 0,
        created_at           timestamptz NOT NULL DEFAULT now()
      );

      -- The coordinator(s) of one program: admins for that program only.
      CREATE TABLE program_admins (
        program_id int NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
        user_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (program_id, user_id)
      );

      -- One session day of one program. A row exists only once somebody
      -- changes that day; until then the program defaults are shown.
      -- version goes up by one on every change, so two admins editing at once
      -- cannot silently overwrite each other.
      CREATE TABLE sessions (
        id         serial PRIMARY KEY,
        program_id int  NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
        date       date NOT NULL,
        schedule   jsonb NOT NULL,
        roles      jsonb NOT NULL,
        version    int  NOT NULL DEFAULT 1,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by int REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE (program_id, date)
      );

      CREATE TABLE availability (
        program_id int  NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
        date       date NOT NULL,
        user_id    int  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        option_id  text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (program_id, date, user_id)
      );

      CREATE TABLE updates (
        id         serial PRIMARY KEY,
        program_id int  NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
        user_id    int  REFERENCES users(id) ON DELETE SET NULL,
        author     text NOT NULL,
        body       text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX updates_program_idx ON updates (program_id, created_at DESC);

      CREATE TABLE tally_events (
        id              serial PRIMARY KEY,
        program_id      int  NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
        team_id         text NOT NULL,
        category        text NOT NULL,
        amount          int  NOT NULL,
        user_id         int  REFERENCES users(id) ON DELETE SET NULL,
        author          text NOT NULL,
        -- Set by the phone. A request retried after a timeout carries the same
        -- id, so it is counted once.
        client_event_id text UNIQUE,
        created_at      timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX tally_events_program_idx ON tally_events (program_id, created_at DESC);

      -- "Reset all points" records a reset rather than deleting the history.
      -- Standings count only the events after the latest reset.
      CREATE TABLE tally_resets (
        id         serial PRIMARY KEY,
        program_id int NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
        user_id    int REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    id: "002_seed_schools",
    sql: `
      INSERT INTO programs
        (slug, name, short_code, kind, color, coordinator_name, tagline, notes, position,
         availability_options, default_roles, default_schedule, teams, categories)
      VALUES
      ('rafiki', 'Rafiki Classical', 'RC', 'intramural', '#14A38B', 'Denilson Mwenjwa',
       'Football. Faith. Future.', '', 1,
       '[{"id":"early","label":"I will arrive by 1 PM for coaches fellowship","tone":"good"},
         {"id":"on_time","label":"I will arrive by 3:15 PM","tone":"ok"},
         {"id":"absent","label":"I will not be able to attend","tone":"bad"}]',
       '["Setup & Equipment","Player Check-in","Warmup Lead","Match Coordination","TTG Video Facilitator","Gate / Player Release"]',
       '[{"time":"13:00","activity":"Arrive to Rafiki"},
         {"time":"13:10","activity":"Checking & Prayer"},
         {"time":"13:40","activity":"Affirm one another / Prayer time / Preview TTG Season 6 / arrange player feedback per category"},
         {"time":"14:40","activity":"Walk to field / Setup of equipment"},
         {"time":"15:15","activity":"Arrival of players, Checking in players"},
         {"time":"15:20","activity":"Start of warmup (Play)"},
         {"time":"15:30","activity":"Small Sided Play (Matches)"},
         {"time":"16:05","activity":"Players walk to TTR"},
         {"time":"16:10","activity":"Players watch TTG Videos (Season 6)"},
         {"time":"16:40","activity":"Release players to front Security Gate"},
         {"time":"16:50","activity":"Coaches walk to Security Gate"},
         {"time":"17:00","activity":"Coaches leave Rafiki"}]',
       '[{"id":"wisdom","name":"Wisdom","color":"#FACC15"},
         {"id":"justice","name":"Justice","color":"#C4A5F5"},
         {"id":"fortitude","name":"Fortitude","color":"#F59C9C"},
         {"id":"temperance","name":"Temperance","color":"#93C5FD"}]',
       '["Under 7","Under 9","Under 11","Under 13"]'),

      ('daniels', 'Daniels School', 'DS', 'intramural', '#2F5BD3', '', 'Football. Faith. Future.',
       'Requirements to be added after the survey.', 2,
       '[{"id":"yes","label":"I will be there","tone":"good"},
         {"id":"late","label":"I will be late","tone":"ok"},
         {"id":"absent","label":"I will not be able to attend","tone":"bad"}]',
       '["Setup & Equipment","Player Check-in","Warmup Lead","Match Coordination"]',
       '[]', '[]', '["Under 9","Under 11","Under 13"]'),

      ('icc-imara', 'ICC Imara', 'ICC', 'club', '#D8412F', '', 'Football. Faith. Future.',
       'Requirements to be added after the survey.', 3,
       '[{"id":"yes","label":"I will be there","tone":"good"},
         {"id":"late","label":"I will be late","tone":"ok"},
         {"id":"absent","label":"I will not be able to attend","tone":"bad"}]',
       '["Setup & Equipment","Player Check-in","Warmup Lead","Match Coordination"]',
       '[]', '[]', '["Under 9","Under 11","Under 13"]'),

      ('rosslyn', 'Rosslyn Academy', 'RA', 'club', '#8B4FD1', '', 'Football. Faith. Future.',
       'Requirements to be added after the survey.', 4,
       '[{"id":"yes","label":"I will be there","tone":"good"},
         {"id":"late","label":"I will be late","tone":"ok"},
         {"id":"absent","label":"I will not be able to attend","tone":"bad"}]',
       '["Setup & Equipment","Player Check-in","Warmup Lead","Match Coordination"]',
       '[]', '[]', '["Under 9","Under 11","Under 13"]');
    `,
  },
  {
    // Abel and James are super admins: the only people who create accounts.
    // Public sign-up is gone; a new account must set its own password on
    // first sign-in.
    id: "003_super_admins",
    sql: `
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'superadmin'));
      ALTER TABLE users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
    `,
  },
  {
    // Each school's own logo: a file shipped with the app ("logos/x.png") or
    // one uploaded from Setup (a small data: URL). Empty shows the initials.
    id: "004_program_logos",
    sql: `
      ALTER TABLE programs ADD COLUMN logo text NOT NULL DEFAULT '';
      UPDATE programs SET logo = 'logos/rafiki.png'    WHERE slug = 'rafiki';
      UPDATE programs SET logo = 'logos/daniels.png'   WHERE slug = 'daniels';
      UPDATE programs SET logo = 'logos/icc-imara.png' WHERE slug = 'icc-imara';
      UPDATE programs SET logo = 'logos/rosslyn.png'   WHERE slug = 'rosslyn';
    `,
  },
  {
    // What each school calls its coordinator ("School Sports Coordinator" at
    // Daniels). Empty means the default for the kind of program. Plus the
    // details Abel sent on 2026-10-01, each only where the field was still
    // untouched, so nothing edited in Setup is overwritten.
    id: "005_coordinator_titles_and_school_details",
    sql: `
      ALTER TABLE programs ADD COLUMN coordinator_title text NOT NULL DEFAULT '';

      UPDATE programs SET coordinator_title = 'Intramural Coordinator'
       WHERE slug = 'rosslyn' AND coordinator_title = '';
      UPDATE programs SET default_schedule =
        '[{"time":"09:30","activity":"Session starts"},{"time":"11:30","activity":"Session ends"}]'
       WHERE slug = 'rosslyn' AND default_schedule = '[]'::jsonb;

      UPDATE programs SET coordinator_title = 'School Sports Coordinator'
       WHERE slug = 'daniels' AND coordinator_title = '';
      UPDATE programs SET notes =
        'Felix Mwendwa manages school-based football engagement at the Daniels School.' || E'\\n\\n' ||
        'Activities: coaching sessions, skill development drills, and character mentoring integrated with sports.'
       WHERE slug = 'daniels' AND notes = 'Requirements to be added after the survey.';
    `,
  },
];

export async function migrate(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    // One server at a time: a second instance waits here instead of racing.
    await client.query("SELECT pg_advisory_lock(424242)");
    const done = new Set(
      (await client.query<{ id: string }>("SELECT id FROM schema_migrations")).rows.map((r) => r.id),
    );
    for (const m of migrations) {
      if (done.has(m.id)) continue;
      await client.query("BEGIN");
      try {
        await client.query(m.sql);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
        await client.query("COMMIT");
        console.log(`[migrate] applied ${m.id}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(424242)").catch(() => {});
    client.release();
  }
}
