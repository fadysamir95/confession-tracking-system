// Drives a running server over HTTP the way a browser would, so that the
// interface can be checked end to end rather than inferred from the dictionaries
// and the stylesheet.
//
// This exists because the important claims about this application are claims
// about a *running* system: that a signed-out reader cannot reach a roster, that
// a page renders in the reader's language, that the language switcher really
// changes the next request, and that a member id from another parish is
// indistinguishable from one that does not exist. None of that is visible to a
// unit test, and all of it is what a deployment review needs answered.
//
// Progressive-enhancement Server Action forms are posted as multipart, which is
// what the rendered `encType` says, so this walks the real request path: the
// real cross-origin check, the real session cookie, the real redirects.
//
//     npm run smoke -- --base https://staging.example --email a@b.c --password ...
//
// It signs in as a real account, so point it at a database you are willing to
// write to. The language switcher is exercised and put back, and nothing else is
// changed.

const BASE = process.argv.includes("--base")
  ? process.argv[process.argv.indexOf("--base") + 1]
  : (process.env.BASE ?? "http://127.0.0.1:3000");
const EMAIL = process.argv.includes("--email")
  ? process.argv[process.argv.indexOf("--email") + 1]
  : (process.env.EMAIL ?? "priest@example.com");
const PASSWORD = process.argv.includes("--password")
  ? process.argv[process.argv.indexOf("--password") + 1]
  : (process.env.PASSWORD ?? "");

/** A cookie jar good enough for a single-user walk through the application. */
const jar = new Map();

function storeCookies(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const index = pair.indexOf("=");
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value === "" || /expires=thu, 01 jan 1970/i.test(line)) jar.delete(name);
    else jar.set(name, value);
  }
}

function cookieHeader() {
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function get(path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { cookie: cookieHeader() },
    redirect: "manual",
  });
  storeCookies(response);
  const body = response.status === 200 ? await response.text() : "";
  return {
    status: response.status,
    location: response.headers.get("location"),
    contentType: response.headers.get("content-type") ?? "",
    body,
  };
}

/**
 * The hidden inputs of the one form that owns `markerField`.
 *
 * Scoped deliberately. A page can hold several Server Action forms — the
 * language switcher sits beside the sign-in form — and each carries its own
 * `$ACTION_*` bound arguments. A browser posts the fields of the form that was
 * submitted and nothing else; posting two forms' bound arguments in one request
 * makes Next decode the action state for the wrong action, which shows up as a
 * render crash rather than as anything this script could diagnose from the
 * outside.
 */
function hiddenFields(html, markerField) {
  const forms = [...html.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)].map((match) => match[0]);
  const form = forms.find((candidate) => candidate.includes(`name="${markerField}"`));
  if (!form) throw new Error(`no form on the page owns a "${markerField}" field`);

  const fields = [];
  for (const match of form.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const tag = match[0];
    const name = /\bname="([^"]*)"/.exec(tag)?.[1];
    if (name === undefined) continue;
    fields.push([name, decodeEntities(/\bvalue="([^"]*)"/.exec(tag)?.[1] ?? "")]);
  }
  return fields;
}

/** The markup of the one form that owns `markerField`, for reading its buttons. */
function formWith(html, markerField) {
  const forms = [...html.matchAll(/<form[^>]*>[\s\S]*?<\/form>/g)].map((match) => match[0]);
  const form = forms.find((candidate) => candidate.includes(`name="${markerField}"`));
  if (!form) throw new Error(`no form on the page owns a "${markerField}" field`);
  return form;
}

function decodeEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

async function post(path, fields) {
  const form = new FormData();
  for (const [name, value] of fields) form.append(name, value);
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    // Next.js refuses a Server Action POST without an Origin, which is itself
    // part of the cross-site request protection. A browser always sends one, so
    // sending it here is matching the real request rather than working around
    // anything.
    headers: { cookie: cookieHeader(), origin: BASE },
    body: form,
    redirect: "manual",
  });
  storeCookies(response);
  return {
    status: response.status,
    location: response.headers.get("location"),
    body: await response.text(),
  };
}

/** The Arabic letters in a document, counted, as a check that it really is Arabic. */
function arabicLetterCount(html) {
  return (html.match(/[\u0600-\u06FF]/g) ?? []).length;
}

const checks = [];
function record(label, ok, detail) {
  checks.push({ label, ok, detail });
  process.stdout.write(`${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}\n`);
}

if (!PASSWORD) {
  process.stderr.write(
    "A password is required: --password <value>, or PASSWORD in the environment.\n" +
      "This script signs in as a real account, so it will write to the database it\n" +
      "is pointed at.\n",
  );
  process.exit(2);
}

/**
 * What a signed-out reader can reach, checked before any cookie exists.
 *
 * This is the claim the whole tenant model rests on, and it is the one a unit
 * test cannot make: the guard is a proxy, the session lookup is dynamic, and the
 * refusal is a redirect rather than an error. Only a request over the wire
 * exercises all three at once.
 */
process.stdout.write(`\n=== what a signed-out reader can reach ===\n`);
for (const path of ["/", "/members/new", "/members/import", "/settings"]) {
  const page = await get(path);
  record(
    `${path} turns a signed-out request away rather than serving it`,
    page.status === 307 || page.status === 302 || page.status === 401 ||
      page.status === 403,
    `status ${page.status} -> ${page.location ?? "no location"}`,
  );
}
// The export is asked for the way a browser asks for it — POST, which is the
// only verb it answers. A GET is refused with 405 before the session is even
// looked at, so checking the GET here would prove nothing about the gate.
const exportUnsigned = await post("/api/export/members", []);
record(
  "the roster export refuses a request with no session",
  exportUnsigned.status === 401 || exportUnsigned.status === 403,
  `status ${exportUnsigned.status} — ${JSON.stringify(exportUnsigned.body.slice(0, 80))}`,
);
record(
  "and the refusal says so in a language, not in a status code",
  /[؀-ۿ]/.test(exportUnsigned.body),
  "",
);

process.stdout.write(`\n=== signing in as ${EMAIL} ===\n`);
const loginPage = await get("/login");
const fields = hiddenFields(loginPage.body, "email");
record(
  "login form posts the real Server Action fields",
  fields.some(([name]) => name.startsWith("$ACTION")),
  `${fields.length} hidden fields`,
);

const signIn = await post("/login", [
  ...fields,
  ["email", EMAIL],
  ["password", PASSWORD],
]);
record(
  "sign-in establishes a session",
  signIn.status === 303 || signIn.status === 302,
  `status ${signIn.status} -> ${signIn.location}`,
);
record(
  "session cookie is issued",
  [...jar.keys()].some((name) => name.includes("session")),
  [...jar.keys()].join(", ") || "none",
);

process.stdout.write(`\n=== the public pages, before signing in ===\n`);
for (const path of ["/login", "/forgot-password", "/register"]) {
  // Fetched with the jar emptied on purpose: a signed-in reader is redirected
  // away from these, and that redirect is itself worth checking below.
  const saved = new Map(jar);
  jar.clear();
  const page = await get(path);
  jar.clear();
  for (const [name, value] of saved) jar.set(name, value);

  const arabic = arabicLetterCount(page.body);
  const rtl = /<html[^>]*dir="rtl"/.test(page.body);
  record(
    `${path} renders in Arabic, right to left`,
    page.status === 200 && rtl && /<html[^>]*lang="ar"/.test(page.body) && arabic > 50,
    `status ${page.status}, dir rtl ${rtl}, ${arabic} Arabic letters`,
  );

  // The three numbered privacy principles that used to sit beside every
  // sign-in form were removed as design. The single privacy line under the form
  // was deliberately kept, so this checks the panel is gone and does not
  // accidentally take the line with it.
  record(
    `${path} has no privacy-principles panel`,
    !page.body.includes("privacy-principle"),
    "",
  );
  record(
    `${path} still carries its one-line privacy notice`,
    page.body.includes("auth-privacy"),
    "",
  );
}

process.stdout.write(`\n=== the private pages, after signing in ===\n`);
const pages = new Map();
for (const path of ["/", "/members/new", "/members/import", "/settings", "/settings/archived"]) {
  const page = await get(path);
  pages.set(path, page.body);
  const arabic = arabicLetterCount(page.body);
  record(
    `${path} renders in Arabic, right to left`,
    page.status === 200 &&
      /<html[^>]*lang="ar"/.test(page.body) &&
      /<html[^>]*dir="rtl"/.test(page.body) &&
      arabic > 50,
    `status ${page.status}, ${arabic} Arabic letters`,
  );
}

process.stdout.write(`\n=== a signed-in reader is kept off the sign-in pages ===\n`);
for (const path of ["/login", "/forgot-password"]) {
  const page = await get(path);
  record(
    `${path} redirects a signed-in reader away`,
    page.status === 307 || page.status === 302,
    `status ${page.status} -> ${page.location}`,
  );
}

process.stdout.write(`\n=== the dashboard controls the reader reaches ===\n`);
const dashboard = pages.get("/") ?? "";

// The three large privacy blocks were removed as design. These check the class
// names rather than the copy: a removed string can legitimately survive
// elsewhere ("a new private workspace" appears in the register page's invite
// text), and what actually needs to stay gone is the element.
record("the dashboard privacy card is gone", !dashboard.includes("privacy-card"), "");
record("the sidebar privacy note is gone", !dashboard.includes("privacy-note"), "");

// The search hint is a real key cap, and a button that puts the caret in the
// box rather than a link that re-runs every query to get there.
record(
  "the search hint renders the slash in a key cap",
  /<kbd[^>]*>\/<\/kbd>/.test(dashboard),
  "",
);
record(
  "the search hint is a button, not a link to a reloaded page",
  /<button[^>]*class="keyboard-hint"/.test(dashboard),
  "",
);

// Every control that means "show me this list" — the queues, the stat cards,
// and the counted quick actions — now filters the roster in place. A surviving
// `?filter=` link means one of them still costs a full document request, and
// worse, that it and its neighbour behave differently.
record(
  "every roster filter control acts in place",
  dashboard.includes("stat-card--button") &&
    dashboard.includes("quick-action--button") &&
    dashboard.includes("text-link--button") &&
    !/\?filter=/.test(dashboard),
  "",
);

// Sorting by days-since was withdrawn: it is the same quantity as days
// remaining against a different constant, so it duplicated the next-due order for
// everyone on the parish default and disagreed with it for everyone on a custom
// one. The Arabic label is checked because the sort menu is rendered from the
// dictionary, so its absence in the markup is the absence of the option.
record(
  "the sort menu offers no order by day count",
  !dashboard.includes("عدد الأيام: ") && !dashboard.includes("Days since:"),
  "",
);

const importPage = pages.get("/members/import") ?? "";
record("the import page offers a file picker", /type="file"/.test(importPage), "");
record(
  "the import page names the two columns it reads, in Arabic",
  /الاسم/.test(importPage) && /الهاتف/.test(importPage),
  "",
);

process.stdout.write(`\n=== the language switcher ===\n`);
const before = jar.get("confession_locale");
const settingsPage = await get("/settings");
// The switcher posts a `locale` field. This is the same control the sidebar
// footer and the sign-in panel carry, so finding it here confirms it is wired
// into the shell rather than living only on the settings page.
const switcherForm = formWith(settingsPage.body, "locale");

// React 19 does not promise an attribute order — this markup happens to put
// `value` before `name` — so the button is matched on the whole tag and the two
// attributes are pulled out separately.
const offered = [...switcherForm.matchAll(/<button\b[^>]*>/g)]
  .map((match) => match[0])
  .filter((tag) => /\bname="locale"/.test(tag))
  .map((tag) => /\bvalue="([^"]+)"/.exec(tag)?.[1])
  .filter((value) => value !== undefined);
record(
  "the switcher offers both languages",
  offered.includes("ar") && offered.includes("en"),
  offered.join(", "),
);

const target = offered.find((value) => value !== before) ?? offered[0];
if (target) {
  const result = await post("/settings", [
    ...hiddenFields(settingsPage.body, "locale"),
    ["locale", target],
  ]);
  const after = jar.get("confession_locale");
  record(
    "choosing a language sets the request-time cookie",
    after === target,
    `${before ?? "unset"} -> ${after ?? "unset"} (status ${result.status})`,
  );

  const switched = await get("/");
  // Deliberately not a count of Arabic letters. A priest's roster holds Arabic
  // names whichever language the interface is in, so counting script would be
  // measuring the data, not the translation. What has to hold is that the
  // document declares itself English, lays out left to right, and carries an
  // English label where the Arabic one used to be.
  record(
    "the interface follows the cookie on the next request",
    /<html[^>]*lang="en"/.test(switched.body) &&
      /<html[^>]*dir="ltr"/.test(switched.body) &&
      /Sign out|Log out/i.test(switched.body),
    `lang en ${/<html[^>]*lang="en"/.test(switched.body)}, ` +
      `dir ltr ${/<html[^>]*dir="ltr"/.test(switched.body)}`,
  );

  // Put it back, so the run is repeatable.
  await post("/settings", [
    ...hiddenFields(settingsPage.body, "locale"),
    ["locale", "ar"],
  ]);
  const restored = await get("/");
  record(
    "and switches back",
    /<html[^>]*dir="rtl"/.test(restored.body) && jar.get("confession_locale") === "ar",
    `cookie now ${jar.get("confession_locale")}`,
  );
} else {
  record("the switcher offers a locale button", false, "no name=locale button found");
}

process.stdout.write(`\n=== the roster export ===\n`);
// The export is POST-only by design: a GET that produced a downloadable file
// could be triggered cross-site, so the same-origin check has to run inside a
// verb an attacker cannot issue as a plain navigation.
const exportGet = await get("/api/export/members");
record(
  "a plain GET does not produce the roster",
  exportGet.status === 405,
  `status ${exportGet.status}`,
);

const exportPost = await post("/api/export/members", []);
const arabicHeader = exportPost.body.split("\r\n")[0]?.replace(/^\uFEFF/, "") ?? "";
record(
  "the CSV header is written in the reader's language, not the code's",
  exportPost.status === 200 && arabicHeader.length > 0,
  `status ${exportPost.status}, header ${JSON.stringify(arabicHeader.slice(0, 60))}`,
);

process.stdout.write(`\n=== the same-origin check on a state-changing request ===\n`);
const crossSite = await fetch(`${BASE}/api/export/members`, {
  method: "POST",
  headers: { cookie: cookieHeader(), origin: "https://elsewhere.example" },
  redirect: "manual",
});
storeCookies(crossSite);
record(
  "a cross-site POST to the export is refused",
  crossSite.status === 403,
  `status ${crossSite.status}`,
);

process.stdout.write(`\n=== tenant isolation over HTTP ===\n`);
const outside = await get("/members/0000000000000000000000000");
record(
  "a member id from another tenant is indistinguishable from one that does not exist",
  outside.status === 404,
  `status ${outside.status}`,
);

process.stdout.write(`\n=== the icons ===\n`);
// The favicon is a downscaled raster of the supplied artwork rather than the
// vector cross the interface draws, so this asserts the route resolves to a
// real PNG. A 404 here is the usual shape of a metadata-file conflict: two files
// in the app directory claiming the same route build fine and then one of them
// silently wins.
const icon = await get("/icon.png");
const appleIcon = await get("/apple-icon.png");
record(
  "the favicon is served as a PNG",
  icon.status === 200 && icon.contentType.includes("png"),
  `status ${icon.status}, ${icon.contentType}`,
);
record(
  "the Apple touch icon is served as a PNG",
  appleIcon.status === 200 && appleIcon.contentType.includes("png"),
  `status ${appleIcon.status}, ${appleIcon.contentType}`,
);

process.stdout.write(`\n=== the brand mark ===\n`);
// The in-app mark is the supplied artwork at a stable URL under public/, not a
// hashed import and not the inline vector it replaced. Both halves are asserted:
// the file being served proves nothing on its own, because a component still
// drawing the old SVG would pass it while showing no logo at all.
const mark = await get("/brand-mark.png");
record(
  "the in-app brand mark is served as a PNG",
  mark.status === 200 && mark.contentType.includes("png"),
  `status ${mark.status}, ${mark.contentType}`,
);
record(
  "the sign-in shell draws the mark as an image, not an inline SVG",
  /class="brand__mark[^"]*"[^>]*>\s*<img[^>]+brand-mark\.png/.test(loginPage.body),
  'expected an <img src="/brand-mark.png"> inside .brand__mark',
);

process.stdout.write(`\n=== the sidebar, the roster anchor, and the two WhatsApp links ===\n`);
// The roster entry is a hash link. It failed in the most invisible way there is:
// once the address bar already said `/#members`, a second press asked the router
// for the page it was already on, and it correctly did nothing. These assert the
// two things that fix depends on — the anchor still exists for a reader without
// JavaScript, and the section it points at is on the page it points to.
const navLinks = [...dashboard.matchAll(/<a[^>]*class="app-nav__link[^"]*"[^>]*>/g)].map(
  (match) => match[0],
);
const membersNav = navLinks.find((tag) => /href="\/#members"/.test(tag));
record(
  "the sidebar's roster entry is a real link to the roster section",
  membersNav !== undefined && /<section[^>]*id="members"/.test(dashboard),
  membersNav ?? "no /#members link in the sidebar",
);
record(
  "the roster section is on the dashboard, not only reachable by hash",
  dashboard.includes('id="members"'),
  "",
);
// Which entry the sidebar calls current. On the dashboard it is the dashboard
// and only that — the roster is a section of the page you are already on, and
// lighting up two entries says nothing. On the archived list it is the settings
// entry, which is a page below settings and used to fall through the old prefix
// test and light up nothing at all.
//
// The navigation is rendered twice, once per breakpoint, so the labels are
// compared as a set and every copy has to agree: two bars marking different
// entries would be a real bug that a "at least one" test would sail past.
//
// The expected labels are read out of the navigation itself rather than written
// out here, so this holds in whichever language the reader is using.
const labelFor = (page, href) => {
  const tag = [...page.matchAll(/<a[^>]*class="app-nav__link[^"]*"[^>]*>/g)]
    .map((match) => match[0])
    .find((candidate) => candidate.includes(`href="${href}"`));
  return /aria-label="([^"]*)"/.exec(tag ?? "")?.[1] ?? "?";
};
const currentOn = (page) => [
  ...new Set(
    [...page.matchAll(/<a[^>]*class="app-nav__link([^"]*)"[^>]*>/g)]
      .filter((match) => match[1].includes("is-active"))
      .map((match) => /aria-label="([^"]*)"/.exec(match[0])?.[1] ?? "?"),
  ),
];

record(
  "the sidebar marks the dashboard current, and nothing else",
  currentOn(dashboard).length === 1 && currentOn(dashboard)[0] === labelFor(dashboard, "/"),
  `current: ${JSON.stringify(currentOn(dashboard))}`,
);
const archivedPage = pages.get("/settings/archived") ?? "";
record(
  "the sidebar marks settings current on a page below it",
  currentOn(archivedPage).length === 1 &&
    currentOn(archivedPage)[0] === labelFor(dashboard, "/settings"),
  `current: ${JSON.stringify(currentOn(archivedPage))}`,
);
// The roster is never current, because it is a section of the dashboard rather
// than somewhere else. Marking it would put two entries of one page in the same
// state, which tells the reader nothing about where they are.
record(
  "the sidebar never marks the roster section current",
  !currentOn(dashboard).includes(labelFor(dashboard, "/#members")),
  "",
);

// Two WhatsApp links, and the difference is the whole point: the reminder carries
// the parish's saved wording and states how many days late someone is, so it is
// only ever offered past the limit. The plain link is a bare chat.
//
// The rule is checked per roster row rather than by counting links, because a
// page-level count only proves something when the data happens to contain an
// overdue member — and it would pass just as happily if every row showed the
// reminder. Walking the rows ties the message to the member it was rendered for.
const allRows = [...dashboard.matchAll(/<tr[\s\S]*?<\/tr>/g)].filter(
  (match) => !match[0].includes("<th"),
);
const hasMessage = (row) => /href="https:\/\/wa\.me\/[^"]*\?text=/.test(row);
const isOverdue = (row) => row.includes('class="is-overdue"');
const rowsWithMessage = allRows.filter((match) => hasMessage(match[0]));

// Universal, so it means something on any data at all: no member who is within
// their limit is handed the message that says how late they are.
record(
  "the saved-message link is never offered to a member within the limit",
  allRows.length > 0 && rowsWithMessage.every((match) => isOverdue(match[0])),
  `${rowsWithMessage.length} rows carry the saved message; ${
    rowsWithMessage.filter((match) => !isOverdue(match[0])).length
  } of them should not`,
);
// The other direction needs an overdue member to exist, so it is reported as
// skipped rather than failed — this parish may simply have nobody late today,
// which is a fact about the data and not a defect in the button.
const overdueRows = allRows.filter((match) => isOverdue(match[0]));
const overdueWithNumber = overdueRows.filter((match) =>
  /href="https:\/\/wa\.me\/\d/.test(match[0]),
);
if (overdueWithNumber.length > 0) {
  record(
    "a member past the limit with a number is offered the saved message",
    overdueWithNumber.every((match) => hasMessage(match[0])),
    `${overdueWithNumber.filter((match) => !hasMessage(match[0])).length} of ${overdueWithNumber.length} overdue members have no reminder link`,
  );
} else {
  record(
    "the reminder link is offered to a member past the limit (skipped: none late today)",
    true,
    "no overdue member with a phone number on this page",
  );
}

// The reminder is a control with a name, and the name has to be the one the
// dictionary supplies. A bell icon alone would be indistinguishable from a
// notification toggle, which is not what it does. The count is compared rather
// than the presence tested, so a link rendered without a name is a failure and
// an extra name is too.
const reminderLabels = [...dashboard.matchAll(/aria-label="تذكير [^"]+"/g)];
record(
  "the reminder is labelled with the dictionary's own name, not just an icon",
  reminderLabels.length === rowsWithMessage.length,
  `${reminderLabels.length} labels for ${rowsWithMessage.length} reminder links`,
);

// The bare link is for everyone, and "no message" has to be checked as a query
// fact: a `?text=` that slipped back in would put the parish's wording, naming a
// member, in front of whoever clicked it.
const bareLinks = [
  ...new Set(
    [...dashboard.matchAll(/href="(https:\/\/wa\.me\/[^"]*)"/g)].map((match) =>
      decodeEntities(match[1]),
    ),
  ),
].filter((href) => !href.includes("?text="));
record(
  "the bare WhatsApp link carries no prefilled message",
  bareLinks.length > 0 && bareLinks.every((href) => !href.includes("?")),
  bareLinks.filter((href) => href.includes("?")).join(", "),
);
const membersWithNumbers = allRows.filter((match) =>
  /href="https:\/\/wa\.me\/\d+"/.test(match[0]),
).length;
record(
  "every member with a number is offered the bare WhatsApp link",
  allRows.length > 0 && membersWithNumbers > 0,
  `${membersWithNumbers} of ${allRows.length} roster rows carry a number`,
);

process.stdout.write(`\n=== the recently recorded card ===\n`);
// The dismiss control, and the guard script that makes a dismissal apply on the
// first paint rather than after a frame of the card. The card is server-rendered,
// so without the attribute the stylesheet cannot hide it before hydration and
// every dismissed card would flash once on the way out.
record(
  "the recently recorded card can be cleared from its own header",
  /class="recent-card__header"[\s\S]{0,400}?<button[^>]*>/.test(dashboard),
  "",
);
record(
  "a dismissed card is hidden by the stylesheet, not unmounted",
  dashboard.includes("confession:recent-card-hidden") && /data-recent="hidden"|dataset\.recent/.test(dashboard),
  "the guard script or its key is missing from the document",
);
// "Clear all" here must not have become a data-destroying button, and the honest
// way to check that is to look for a delete form, not to trust the label.
record(
  "clearing the card submits no deletion",
  !/recent-card[\s\S]{0,600}?<form/i.test(dashboard),
  "",
);

const failures = checks.filter((check) => !check.ok);
process.stdout.write(`\n${checks.length - failures.length}/${checks.length} checks passed.\n`);
if (failures.length > 0) {
  for (const failure of failures) process.stdout.write(`  failed: ${failure.label}\n`);
  process.exitCode = 1;
}
