const express = require("express");
const path = require("path");
const fs = require("fs");
const { Client } = require("@notionhq/client");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "club.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const notionEnabled =
  !!process.env.NOTION_API_KEY && !!process.env.NOTION_BOOKS_DATABASE_ID;
const notion = notionEnabled
  ? new Client({ auth: process.env.NOTION_API_KEY })
  : null;

const titlePropertyName = process.env.NOTION_BOOK_TITLE_PROPERTY || "Name";
const authorPropertyName = process.env.NOTION_BOOK_AUTHOR_PROPERTY || "Author";
const readPropertyName = process.env.NOTION_BOOK_READ_PROPERTY || "Read";
const membersDatabaseId = process.env.NOTION_MEMBERS_DATABASE_ID || "";
const memberNameProperty = process.env.NOTION_MEMBER_NAME_PROPERTY || "Name";
const memberEmailProperty = process.env.NOTION_MEMBER_EMAIL_PROPERTY || "Email";
const memberAddressProperty = process.env.NOTION_MEMBER_ADDRESS_PROPERTY || "Address";
const memberCurrentHostProperty =
  process.env.NOTION_MEMBER_CURRENT_HOST_PROPERTY || "Current Host";
const builtinHostOrderNames = [
  "Andrea",
  "Ayan",
  "Ellora",
  "Quentin",
  "Maggie",
  "Dario",
  "Tiziana"
];

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ hostOrder: [], upcomingDates: [] }, null, 2)
    );
  }
}

function readClubData() {
  ensureDataFile();
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  if (!Array.isArray(data.hostOrder)) data.hostOrder = [];
  if (!Array.isArray(data.upcomingDates)) data.upcomingDates = [];
  return data;
}

function writeClubData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function richTextToString(richText) {
  if (!Array.isArray(richText)) return "";
  return richText.map((item) => item.plain_text || "").join("");
}

function getPropertyValue(page, propName) {
  return page.properties?.[propName] || null;
}

function getPageTitle(page) {
  const prop = getPropertyValue(page, titlePropertyName);
  if (!prop) return "Untitled";

  if (prop.type === "title") return richTextToString(prop.title) || "Untitled";
  if (prop.type === "rich_text") return richTextToString(prop.rich_text) || "Untitled";
  if (prop.type === "formula" && prop.formula?.type === "string")
    return prop.formula.string || "Untitled";
  return "Untitled";
}

function getBookAuthor(page) {
  const prop = getPropertyValue(page, authorPropertyName);
  if (!prop) return "Unknown author";
  if (prop.type === "rich_text") return richTextToString(prop.rich_text) || "Unknown author";
  if (prop.type === "title") return richTextToString(prop.title) || "Unknown author";
  if (prop.type === "select") return prop.select?.name || "Unknown author";
  if (prop.type === "multi_select") {
    const names = (prop.multi_select || []).map((x) => x.name).filter(Boolean);
    return names.join(", ") || "Unknown author";
  }
  if (prop.type === "formula" && prop.formula?.type === "string")
    return prop.formula.string || "Unknown author";
  return "Unknown author";
}

async function fetchBooksFromNotion() {
  if (!notionEnabled) {
    throw new Error(
      "Notion is not configured. Set NOTION_API_KEY and NOTION_BOOKS_DATABASE_ID."
    );
  }

  const response = await notion.databases.query({
    database_id: process.env.NOTION_BOOKS_DATABASE_ID,
    filter: {
      and: [
        { property: titlePropertyName, title: { is_not_empty: true } },
        { property: readPropertyName, checkbox: { equals: false } }
      ]
    }
  });

  return response.results.map((page) => ({
    id: page.id,
    title: getPageTitle(page),
    author: getBookAuthor(page)
  }));
}

function getMemberName(page) {
  const prop = getPropertyValue(page, memberNameProperty);
  if (!prop) return "Unknown";
  if (prop.type === "title") return richTextToString(prop.title) || "Unknown";
  if (prop.type === "rich_text") return richTextToString(prop.rich_text) || "Unknown";
  return "Unknown";
}

function getMemberEmail(page) {
  const prop = getPropertyValue(page, memberEmailProperty);
  if (!prop) return "";
  if (prop.type === "email") return prop.email || "";
  if (prop.type === "rich_text") return richTextToString(prop.rich_text);
  return "";
}

function getMemberCurrentHost(page) {
  const prop = getPropertyValue(page, memberCurrentHostProperty);
  if (!prop) return false;
  if (prop.type === "checkbox") return !!prop.checkbox;
  return false;
}

function getMemberAddress(page) {
  const prop = getPropertyValue(page, memberAddressProperty);
  if (!prop) return "";
  if (prop.type === "rich_text") return richTextToString(prop.rich_text);
  if (prop.type === "title") return richTextToString(prop.title);
  if (prop.type === "url") return prop.url || "";
  if (prop.type === "email") return prop.email || "";
  if (prop.type === "phone_number") return prop.phone_number || "";
  return "";
}

async function fetchMembersFromNotion() {
  if (!notionEnabled || !membersDatabaseId) {
    throw new Error("Members DB not configured. Set NOTION_MEMBERS_DATABASE_ID.");
  }

  const response = await notion.databases.query({
    database_id: membersDatabaseId,
    sorts: [{ timestamp: "created_time", direction: "ascending" }]
  });

  return response.results.map((page) => ({
    id: page.id,
    name: getMemberName(page),
    email: getMemberEmail(page),
    address: getMemberAddress(page),
    currentHost: getMemberCurrentHost(page)
  }));
}

function getBuiltInHostOrderIds(members) {
  const used = new Set();
  const byName = new Map(
    members.map((m) => [m.name.trim().toLowerCase(), m.id])
  );
  const ordered = [];

  for (const name of builtinHostOrderNames) {
    const id = byName.get(name.trim().toLowerCase());
    if (id && !used.has(id)) {
      ordered.push(id);
      used.add(id);
    }
  }
  for (const member of members) {
    if (!used.has(member.id)) {
      ordered.push(member.id);
      used.add(member.id);
    }
  }
  return ordered;
}

function orderMembers(members, hostOrder) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const ordered = [];
  for (const id of hostOrder) {
    const member = byId.get(id);
    if (member) ordered.push(member);
  }
  for (const member of members) {
    if (!ordered.some((m) => m.id === member.id)) ordered.push(member);
  }
  return ordered;
}

async function setCurrentHost(memberId) {
  const members = await fetchMembersFromNotion();
  await Promise.all(
    members.map((member) =>
      notion.pages.update({
        page_id: member.id,
        properties: {
          [memberCurrentHostProperty]: {
            checkbox: member.id === memberId
          }
        }
      })
    )
  );
}

function parseDateTime(dateTime) {
  const d = new Date(dateTime);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toICSDate(date) {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeICS(text) {
  return (text || "")
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

function buildICSInvite({ title, description, location, startUTC, endUTC }) {
  const uid = `bookclub-${Date.now()}@local`;
  const now = toICSDate(new Date());
  const start = toICSDate(startUTC);
  const end = toICSDate(endUTC);

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Book Club//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeICS(title)}`,
    `DESCRIPTION:${escapeICS(description)}`,
    `LOCATION:${escapeICS(location)}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

async function getOrganizerState() {
  const data = readClubData();
  const members = await fetchMembersFromNotion();
  if (!members.length) {
    return {
      members: [],
      currentHost: null,
      nextHost: null,
      suggestedLocation: "",
      inviteTo: ""
    };
  }

  if (!data.hostOrder.length) {
    data.hostOrder = getBuiltInHostOrderIds(members);
    writeClubData(data);
  }

  let orderedMembers = orderMembers(members, data.hostOrder);
  let currentHost = orderedMembers.find((m) => m.currentHost) || null;

  if (!currentHost) {
    currentHost = orderedMembers[0];
    await setCurrentHost(currentHost.id);
    orderedMembers = orderedMembers.map((m) => ({
      ...m,
      currentHost: m.id === currentHost.id
    }));
  }

  const currentIdx = orderedMembers.findIndex((m) => m.id === currentHost.id);
  if (currentIdx > 0) {
    orderedMembers = [
      ...orderedMembers.slice(currentIdx),
      ...orderedMembers.slice(0, currentIdx)
    ];
  }

  data.hostOrder = orderedMembers.map((m) => m.id);
  writeClubData(data);
  const nextHost = orderedMembers.length > 1 ? orderedMembers[1] : orderedMembers[0];

  return {
    members: orderedMembers,
    currentHost,
    nextHost,
    suggestedLocation: nextHost?.address || "",
    inviteTo: orderedMembers
      .map((m) => m.email)
      .filter(Boolean)
      .join(", ")
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, notionEnabled });
});

app.get("/api/books", async (_req, res) => {
  try {
    const books = await fetchBooksFromNotion();
    res.json({ books });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/books/pick", async (_req, res) => {
  try {
    const books = await fetchBooksFromNotion();
    if (!books.length) return res.status(404).json({ error: "No books found." });

    const selected = books[Math.floor(Math.random() * books.length)];
    res.json({ selected });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/books/confirm", async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Book id is required." });

    await notion.pages.update({
      page_id: id,
      properties: { [readPropertyName]: { checkbox: true } }
    });

    res.json({ ok: true, markedRead: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/organizer", async (_req, res) => {
  try {
    const organizer = await getOrganizerState();
    res.json(organizer);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/host/skip", async (_req, res) => {
  try {
    const data = readClubData();
    const members = await fetchMembersFromNotion();
    if (members.length < 2) {
      return res.status(400).json({ error: "Need at least 2 members to skip host." });
    }

    const ordered = orderMembers(members, data.hostOrder);
    const currentHost = ordered.find((m) => m.currentHost) || ordered[0];
    const currentIdx = ordered.findIndex((m) => m.id === currentHost.id);
    const nextIdx = (currentIdx + 1) % ordered.length;
    const nextHost = ordered[nextIdx];

    const withoutCurrent = ordered.filter((m) => m.id !== currentHost.id);
    const nextPos = withoutCurrent.findIndex((m) => m.id === nextHost.id);
    withoutCurrent.splice(nextPos + 1, 0, currentHost);

    await setCurrentHost(nextHost.id);
    data.hostOrder = withoutCurrent.map((m) => m.id);
    writeClubData(data);

    const organizer = await getOrganizerState();
    res.json({ ok: true, skipped: currentHost.name, currentHost: nextHost.name, organizer });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/invite", async (req, res) => {
  const { to, eventName, hostName, description, location, date } = req.body;
  if (!Array.isArray(to) || !to.length) {
    return res.status(400).json({ error: "to must be a non-empty array of email addresses." });
  }

  const startUTC = parseDateTime(date);
  if (!startUTC) {
    return res.status(400).json({ error: "Invalid date." });
  }
  const endUTC = new Date(startUTC.getTime() + 60 * 60 * 1000);

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(400).json({
      error: "SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env."
    });
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  const title = `${eventName || "Book Club"} @ ${hostName || "Host TBD"}`;
  const ics = buildICSInvite({
    title,
    description: description || "Book Club discussion",
    location: location || "TBD",
    startUTC,
    endUTC
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: to.join(","),
    subject: title,
    text: description || "Book Club meeting details attached.",
    alternatives: [{ contentType: "text/calendar; method=REQUEST", content: ics }],
    attachments: [
      {
        filename: "book-club-invite.ics",
        content: ics,
        contentType: "text/calendar"
      }
    ]
  });

  res.json({ ok: true, sentTo: to.length });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  ensureDataFile();
  console.log(`Book club app running on http://localhost:${PORT}`);
});
