import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

const proxyToken = () => `motf_${randomBytes(18).toString("hex")}`;

// Anchor the event to the CURRENT week so the demo always looks live.
// Monday 09:00 of this week.
const MONDAY = new Date();
const day = MONDAY.getDay(); // 0 Sun .. 6 Sat
const diffToMon = (day === 0 ? -6 : 1) - day;
MONDAY.setDate(MONDAY.getDate() + diffToMon);
MONDAY.setHours(9, 0, 0, 0);

function at(dayOffset: number, hour: number, min = 0) {
  const d = new Date(MONDAY);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, min, 0, 0);
  return d;
}
const eod = (dayOffset: number) => at(dayOffset, 23, 59);

async function main() {
  console.log("Resetting data...");
  await prisma.judgeNote.deleteMany();
  await prisma.conflictOfInterest.deleteMany();
  await prisma.judgeAssignment.deleteMany();
  await prisma.teamCheckpoint.deleteMany();
  await prisma.checkpoint.deleteMany();
  await prisma.aIReview.deleteMany();
  await prisma.score.deleteMany();
  await prisma.apiCall.deleteMany();
  await prisma.commit.deleteMany();
  await prisma.checkIn.deleteMany();
  await prisma.message.deleteMany();
  await prisma.scheduleItem.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();

  // ---- Checkpoints (KCL structure) ----
  const cpDefs = [
    { key: "problem_statement", label: "Problem statement", requirement: "1-2 lines: what you're solving, for whom.", dueAt: eod(0), order: 1, requiresText: true, autoPlateCap: false, disqualifies: false },
    { key: "plan", label: "Plan / architecture", requirement: "Tech stack + rough build plan. No code required.", dueAt: eod(1), order: 2, requiresText: true, autoPlateCap: false, disqualifies: false },
    { key: "v1_slice", label: "V1 functional slice", requirement: "Something that runs — doesn't need to be polished.", dueAt: eod(2), order: 3, requiresText: true, autoPlateCap: true, disqualifies: false },
    { key: "feature_complete", label: "Feature-complete", requirement: "Core functionality working; remaining work is polish.", dueAt: eod(3), order: 4, requiresText: true, autoPlateCap: false, disqualifies: false },
    { key: "feature_freeze", label: "Feature freeze", requirement: "No new functionality — fixes/polish/demo prep only.", dueAt: eod(4), order: 5, requiresText: false, autoPlateCap: false, disqualifies: false },
    { key: "final", label: "Final submission", requirement: "2-min video (problem + solution), repo link, description.", dueAt: eod(5), order: 6, requiresText: true, autoPlateCap: false, disqualifies: true },
  ];
  const checkpoints = await Promise.all(cpDefs.map((c) => prisma.checkpoint.create({ data: c })));
  const cpByKey = Object.fromEntries(checkpoints.map((c) => [c.key, c]));

  // ---- Staff ----
  const organizer = await prisma.user.create({
    data: { email: "organizer@motf.dev", name: "Priya Nair", role: "organizer", university: "KCL" },
  });
  const [garry, ada, ken] = await Promise.all([
    prisma.user.create({ data: { email: "judge.garry@motf.dev", name: "Garry T.", role: "judge", expertise: "commercial", university: "Panel" } }),
    prisma.user.create({ data: { email: "judge.ada@motf.dev", name: "Ada L.", role: "judge", expertise: "technical", university: "Panel" } }),
    prisma.user.create({ data: { email: "judge.ken@motf.dev", name: "Ken O.", role: "judge", expertise: "technical", university: "Panel" } }),
  ]);
  await prisma.judgeAssignment.createMany({
    data: [
      { judgeId: garry.id, bracket: "cup" },
      { judgeId: garry.id, bracket: "plate" },
      { judgeId: ada.id, bracket: "cup" },
      { judgeId: ken.id, bracket: "plate" },
    ],
  });

  // ---- Schedule (KCL day structure) ----
  await prisma.scheduleItem.createMany({
    data: [
      { startsAt: at(0, 9), title: "Opening address + rules briefing", location: "Bush House Auditorium", description: "Cup/Plate split criteria announced. Team formation closes EOD." },
      { startsAt: at(1, 14), title: "Speaker slot 1", location: "Bush House (S)", description: "Free build day." },
      { startsAt: at(2, 18), title: "Cross-university networking evening", location: "Strand Campus", description: "Sponsors + partner societies." },
      { startsAt: at(3, 14), title: "Speaker slot 2", location: "Bush House (S)", description: "Free build day." },
      { startsAt: at(4, 16), title: "Flagship speaker + evening social", location: "Great Hall", description: "Feature freeze from EOD." },
      { startsAt: at(5, 12), title: "Final submissions lock", location: "Online", description: "YC-style: video + repo." },
      { startsAt: at(6, 13), title: "Cup / Plate panels + winner announcement", location: "Great Hall", description: "Panels run in parallel; joint announcement, evening." },
      ...[0, 1, 2, 3, 4].map((d) => ({ startsAt: at(d, 18), title: "Mandatory 6pm check-in", location: "Wherever you are", description: "Log progress regardless of milestone status." })),
    ],
  });

  // ---- Teams ----
  type Sub = { key: string; day: number; hour: number; content: string }; // checkpoint submission
  type TeamSpec = {
    name: string; project: string; desc: string; repo?: string; bracket: string;
    members: [string, string, string?][];
    checkIns: [number, number, string, string?, string?][];
    subs: Sub[];
    submitted?: boolean; video?: string;
    prepanelScores?: { judge: "garry" | "ada" | "ken"; vals: Record<string, number> }[];
    // Proxied AI calls: [day, hour, provider, model, count] — bursts of activity.
    api?: [number, number, string, string, number][];
    logApiContent?: boolean;
  };

  const judgeMap = { garry, ada, ken };

  const teamSpecs: TeamSpec[] = [
    {
      name: "Loop", project: "StudyLoop", desc: "Spaced-repetition tutor that builds decks from your lecture notes.",
      repo: "https://github.com/vercel/next.js", bracket: "cup",
      members: [["Deshawn Brooks", "MIT", "backend,infra"], ["Lena Ortiz", "Berkeley", "product,frontend"], ["Sam Iyer", "KCL", "ML,design"]],
      subs: [
        { key: "problem_statement", day: 0, hour: 16, content: "Students waste revision time on inefficient re-reading. We build spaced-repetition decks automatically from lecture notes." },
        { key: "plan", day: 1, hour: 15, content: "Next.js + Postgres, FSRS scheduling, PDF/notes ingestion via an LLM parser." },
        { key: "v1_slice", day: 2, hour: 20, content: "Deployed slice: upload notes -> generated deck -> review flow. https://studyloop.demo" },
        { key: "feature_complete", day: 3, hour: 21, content: "Analytics dashboard + onboarding done." },
      ],
      checkIns: [
        [0, 13, "Scoped the idea, set up Next.js + Postgres, auth working.", "Own SR algo vs FSRS."],
        [1, 18, "Note ingestion parses PDFs into cards.", "PDF parsing flaky on scanned notes."],
        [2, 18, "Switched to FSRS, much better. Deck + review flow done."],
        [3, 18, "Pivoted onboarding after user tests — 3 clicks to first deck.", undefined, "https://example.com/demo.png"],
      ],
      submitted: true, video: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      prepanelScores: [
        { judge: "garry", vals: { technical: 9, originality: 7, business: 8, pitch: 8, team: 9 } },
        { judge: "ada", vals: { technical: 9, originality: 8, business: 7, pitch: 8, team: 9 } },
      ],
      // Steady, heavy usage that tracks the commit trail — a "healthy" signal.
      api: [
        [0, 14, "openai", "gpt-4o-mini", 22],
        [1, 16, "openai", "gpt-4o", 40],
        [2, 19, "anthropic", "claude-sonnet-4-6", 31],
        [3, 20, "openai", "gpt-4o", 27],
      ],
    },
    {
      name: "Signal", project: "CrisisMap", desc: "Real-time volunteer coordination map for local disasters.",
      repo: "https://github.com/facebook/react", bracket: "unassigned",
      members: [["Tomas Novak", "CMU", "maps,frontend"], ["Aisha Rahman", "Oxford", "backend,data"]],
      subs: [
        { key: "problem_statement", day: 0, hour: 20, content: "Local disaster response is chaotic; volunteers lack a live coordination view." },
        { key: "plan", day: 1, hour: 22, content: "React + websockets + Postgres, SMS via Twilio." },
        // NB: no v1_slice submission on/before Wed -> auto Plate cap.
      ],
      checkIns: [
        [0, 18, "Team formed late but got the map rendering with live pins."],
        [2, 22, "Long day — websocket layer for live updates.", "Scaling socket connections; behind on the slice."],
        [3, 18, "Volunteer matching working, but we missed the Wed slice checkpoint."],
      ],
      api: [
        [0, 19, "openai", "gpt-4o-mini", 9],
        [2, 21, "anthropic", "claude-haiku-4-5", 14],
      ],
    },
    {
      name: "Forge", project: "PromptForge", desc: "Version control and eval harness for LLM prompts.",
      repo: "https://github.com/prisma/prisma", bracket: "cup",
      members: [["Maya Chen", "Stanford", "fullstack,LLM"], ["Sofia Marino", "ETH Zurich", "eval,python"], ["Jack Owens", "Imperial", "frontend"]],
      subs: [
        { key: "problem_statement", day: 0, hour: 12, content: "Teams ship prompt regressions blind. We give prompts version control + eval gates." },
        { key: "plan", day: 1, hour: 11, content: "Diff-based prompt store, eval runner across 3 providers." },
        { key: "v1_slice", day: 2, hour: 12, content: "Eval runner + side-by-side diff live. https://promptforge.demo" },
        { key: "feature_complete", day: 3, hour: 17, content: "Regression alerts on eval score drops." },
      ],
      checkIns: [
        [0, 13, "Repo up, decided on diff-based prompt store."],
        [1, 18, "Eval runner works against 3 providers."],
        [2, 18, "Built the side-by-side diff view."],
        [3, 18, "Added regression alerts. Feeling good."],
      ],
      prepanelScores: [
        { judge: "garry", vals: { technical: 8, originality: 8, business: 9, pitch: 7, team: 8 } },
      ],
      // Opted into content logging; heavy multi-provider eval workload (on brand).
      logApiContent: true,
      api: [
        [0, 13, "anthropic", "claude-sonnet-4-6", 33],
        [1, 12, "openai", "gpt-4o", 48],
        [1, 15, "anthropic", "claude-opus-4-8", 20],
        [2, 12, "openai", "gpt-4o-mini", 61],
        [3, 17, "anthropic", "claude-sonnet-4-6", 44],
      ],
    },
    {
      name: "Nimbus", project: "StudyBuddy", desc: "Study-group matcher for large lecture courses.",
      repo: undefined, bracket: "unassigned",
      members: [["Grace Kim", "UCL", "design,frontend"]],
      subs: [
        { key: "problem_statement", day: 1, hour: 9, content: "Hard to find study partners in 400-person modules." }, // late (due Mon)
        // missed plan + v1_slice -> plate capped + flagged.
      ],
      checkIns: [[3, 18, "Struggled to lock an idea, going with a study-group matcher.", "Scope keeps changing; solo team."]],
    },
  ];

  for (const spec of teamSpecs) {
    const team = await prisma.team.create({
      data: {
        name: spec.name, projectName: spec.project, description: spec.desc, repoUrl: spec.repo,
        bracket: spec.bracket,
        videoUrl: spec.submitted ? spec.video : undefined,
        submittedAt: spec.submitted ? at(5, 11) : undefined,
        proxyToken: proxyToken(),
        logApiContent: spec.logApiContent ?? false,
      },
    });

    const members = await Promise.all(
      spec.members.map(([name, university, skills], i) =>
        prisma.user.create({
          data: {
            email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@motf.dev`,
            name, university, skills: skills ?? "",
            bio: i === 0 ? `Team lead on ${spec.project}.` : "",
            role: "participant", teamId: team.id,
          },
        }),
      ),
    );

    for (const [d, h, text, stuckOn, link] of spec.checkIns) {
      await prisma.checkIn.create({
        data: { teamId: team.id, authorName: members[0].name, text, stuckOn: stuckOn ?? null, link: link ?? null, createdAt: at(d, h) },
      });
    }

    for (const s of spec.subs) {
      await prisma.teamCheckpoint.create({
        data: { teamId: team.id, checkpointId: cpByKey[s.key].id, content: s.content, submittedAt: at(s.day, s.hour) },
      });
    }

    for (const ps of spec.prepanelScores ?? []) {
      const judge = judgeMap[ps.judge];
      for (const [criterion, value] of Object.entries(ps.vals)) {
        await prisma.score.create({
          data: { teamId: team.id, judgeId: judge.id, criterion, phase: "prepanel", value },
        });
      }
    }

    for (const [d, h, provider, model, n] of spec.api ?? []) {
      const endpoint = provider === "anthropic" ? "v1/messages" : "v1/chat/completions";
      await prisma.apiCall.createMany({
        data: Array.from({ length: n }, (_, i) => ({
          teamId: team.id, provider, endpoint, model,
          requestSize: 800 + Math.floor(Math.random() * 4000),
          responseSize: 1500 + Math.floor(Math.random() * 12000),
          status: 200,
          createdAt: at(d, h, (i * 47) % 60),
        })),
      });
    }

    await prisma.message.create({
      data: { channel: team.id, senderId: members[0].id, text: "Standup in 10 in our corner.", createdAt: at(1, 9) },
    });
  }

  // Conflict of interest: Ada knows someone on Forge, recuse her.
  const forge = await prisma.team.findFirst({ where: { name: "Forge" } });
  await prisma.conflictOfInterest.create({
    data: { judgeId: ada.id, teamId: forge!.id, reason: "Former labmate on the team." },
  });

  // Announcements
  await prisma.message.createMany({
    data: [
      { channel: "announcements", senderId: organizer.id, text: "Welcome to the KCL AI Hackathon! Cup/Plate split criteria are in the rules briefing. Submissions lock Saturday.", createdAt: at(0, 9, 30) },
      { channel: "announcements", senderId: organizer.id, text: "Reminder: mandatory 6pm check-in every build day. It feeds your judge log.", createdAt: at(1, 10) },
    ],
  });

  console.log("Seed complete. Event anchored to this week (Mon-Sun).");
  console.log("\nSign in (email only, no password):");
  console.log("  organizer@motf.dev              organizer");
  console.log("  judge.garry@motf.dev            judge (commercial, Cup+Plate)");
  console.log("  judge.ada@motf.dev              judge (technical, Cup; COI on Forge)");
  console.log("  maya.chen@motf.dev              participant, team Forge (live — post check-ins here)");
  console.log("  grace.kim@motf.dev              participant, team Nimbus (struggling, Plate-capped)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
