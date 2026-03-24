const express = require("express");
const path = require("path");
const { Client } = require("@notionhq/client");
const { Resend } = require("resend");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

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
const memberOrderProperty = process.env.NOTION_MEMBER_ORDER_PROPERTY || "Order";
const builtinHostOrderNames = [
  "Andrea",
  "Ayan",
  "Ellora",
  "Quentin",
  "Maggie",
  "Dario",
  "Tiziana"
];


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

function getMemberOrder(page) {
  const prop = getPropertyValue(page, memberOrderProperty);
  if (!prop || prop.type !== "number") return 0;
  return prop.number || 0;
}

function getMemberAddress(page) {
  const prop = getPropertyValue(page, memberAddressProperty);
  if (!prop) { console.log(`[address] property "${memberAddressProperty}" not found for page ${page.id}`); return ""; }
  console.log(`[address] type="${prop.type}" value=${JSON.stringify(prop)}`);
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
    currentHost: getMemberCurrentHost(page),
    order: getMemberOrder(page)
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

async function setCurrentHost(memberId, existingMembers = null) {
  const members = existingMembers || await fetchMembersFromNotion();
  await Promise.all(
    members.map((member) =>
      notion.pages.update({
        page_id: member.id,
        properties: {
          [memberCurrentHostProperty]: { checkbox: member.id === memberId }
        }
      })
    )
  );
}

async function writeMemberOrders(orderedMembers) {
  await Promise.all(
    orderedMembers.map((member, idx) =>
      notion.pages.update({
        page_id: member.id,
        properties: { [memberOrderProperty]: { number: idx + 1 } }
      })
    )
  );
}

function sortByOrder(members) {
  return [...members].sort((a, b) => {
    if (!a.order) return 1;
    if (!b.order) return -1;
    return a.order - b.order;
  });
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

function buildICSInvite({ title, description, location, startUTC, endUTC, organizer, attendees = [] }) {
  const uid = `bookclub-${Date.now()}@local`;
  const now = toICSDate(new Date());
  const start = toICSDate(startUTC);
  const end = toICSDate(endUTC);

  const lines = [
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
  ];

  if (organizer) {
    lines.push(`ORGANIZER:mailto:${organizer}`);
  }
  for (const email of attendees) {
    lines.push(`ATTENDEE;RSVP=TRUE:mailto:${email}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

async function getOrganizerState() {
  const members = await fetchMembersFromNotion();
  if (!members.length) {
    return { members: [], currentHost: null, nextHost: null, suggestedLocation: "", inviteTo: "" };
  }

  let orderedMembers;
  const hasOrders = members.some((m) => m.order > 0);

  if (!hasOrders) {
    // First run: seed order from built-in sequence and write to Notion
    const orderedIds = getBuiltInHostOrderIds(members);
    orderedMembers = orderedIds.map((id) => members.find((m) => m.id === id)).filter(Boolean);
    members.forEach((m) => {
      if (!orderedMembers.some((om) => om.id === m.id)) orderedMembers.push(m);
    });
    await writeMemberOrders(orderedMembers);
  } else {
    orderedMembers = sortByOrder(members);
  }

  let currentHost = orderedMembers.find((m) => m.currentHost) || null;
  if (!currentHost) {
    currentHost = orderedMembers[0];
    await setCurrentHost(currentHost.id, members);
  }

  const nextHost = orderedMembers.length > 1 ? orderedMembers[1] : orderedMembers[0];

  return {
    members: orderedMembers,
    currentHost,
    nextHost,
    suggestedLocation: nextHost?.address || "",
    inviteTo: orderedMembers.map((m) => m.email).filter(Boolean).join(", ")
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
    const members = await fetchMembersFromNotion();
    if (members.length < 2) {
      return res.status(400).json({ error: "Need at least 2 members to skip host." });
    }

    const ordered = sortByOrder(members);
    const currentHost = ordered.find((m) => m.currentHost) || ordered[0];
    const currentIdx = ordered.findIndex((m) => m.id === currentHost.id);
    const nextHost = ordered[(currentIdx + 1) % ordered.length];

    const withoutCurrent = ordered.filter((m) => m.id !== currentHost.id);
    const nextPos = withoutCurrent.findIndex((m) => m.id === nextHost.id);
    withoutCurrent.splice(nextPos + 1, 0, currentHost);

    await Promise.all([
      setCurrentHost(nextHost.id, members),
      writeMemberOrders(withoutCurrent)
    ]);

    const organizer = await getOrganizerState();
    res.json({ ok: true, skipped: currentHost.name, currentHost: nextHost.name, organizer });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/host/set", async (req, res) => {
  try {
    const { memberId } = req.body;
    if (!memberId) return res.status(400).json({ error: "memberId is required." });

    const members = await fetchMembersFromNotion();
    const target = members.find((m) => m.id === memberId);
    if (!target) return res.status(404).json({ error: "Member not found." });

    // Get current order from Notion and rotate so current host is first
    const sorted = sortByOrder(members);
    const currentHost = sorted.find((m) => m.currentHost);
    const currentIdx = currentHost ? sorted.findIndex((m) => m.id === currentHost.id) : 0;
    const ordered =
      currentIdx > 0
        ? [...sorted.slice(currentIdx), ...sorted.slice(0, currentIdx)]
        : [...sorted];

    // ordered[0] = current host (A), ordered[1] = natural next host (B)
    const naturalNextHost = ordered.length > 1 ? ordered[1] : null;

    let newOrdered;
    if (naturalNextHost && naturalNextHost.id !== memberId) {
      // User skipped the natural next host (B); insert B right after new host (C)
      // ordered = [A, B, C, D, E] → desired: [C, B, D, E, A]
      const remaining = ordered.filter(
        (m) => m.id !== memberId && m.id !== naturalNextHost.id
      );
      newOrdered = [target, naturalNextHost, ...remaining.slice(1), ...remaining.slice(0, 1)];
    } else {
      // User confirmed the natural next host — normal rotation
      const idx = ordered.findIndex((m) => m.id === memberId);
      newOrdered = idx > 0 ? [...ordered.slice(idx), ...ordered.slice(0, idx)] : [...ordered];
    }

    await Promise.all([
      setCurrentHost(memberId, members),
      writeMemberOrders(newOrdered)
    ]);

    const organizer = await getOrganizerState();
    res.json({ ok: true, currentHost: target.name, organizer });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/invite", async (req, res) => {
  const { to, eventName, hostName, title, description, location, date } = req.body;
  if (!Array.isArray(to) || !to.length) {
    return res.status(400).json({ error: "to must be a non-empty array of email addresses." });
  }

  const startUTC = parseDateTime(date);
  if (!startUTC) {
    return res.status(400).json({ error: "Invalid date." });
  }
  const endUTC = new Date(startUTC.getTime() + 60 * 60 * 1000);

  if (!process.env.RESEND_API_KEY) {
    return res.status(400).json({ error: "RESEND_API_KEY is not configured." });
  }

  const subject = title || `${eventName || "Book Club"} at ${hostName ? `${hostName}'s` : "Host TBD"}`;
  const from = "Book Club <bookclub@ellora.ch>";
  const ics = buildICSInvite({
    title: subject,
    description: description || "Book Club discussion",
    location: location || "TBD",
    startUTC,
    endUTC,
    organizer: from,
    attendees: to
  });

  console.log(`[invite] Sending to ${to.length} recipients: ${to.join(", ")}`);
  console.log(`[invite] Subject: ${subject}`);
  console.log(`[invite] Date: ${startUTC.toISOString()}`);

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const dateStr = startUTC.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const timeStr = startUTC.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
    await resend.emails.send({
      from,
      to,
      subject,
      text: `${description}\n\nDate: ${dateStr} at ${timeStr} UTC\nLocation: ${location || "TBD"}\n\nA calendar invite is attached.`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h2 style="color:#5c3d1e">📖 Spilling the Tea Book Club</h2>
          <p style="font-size:16px">${description}</p>
          <table style="border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:4px 12px 4px 0;color:#888">📅 Date</td><td style="padding:4px 0"><strong>${dateStr}</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#888">⏰ Time</td><td style="padding:4px 0"><strong>${timeStr} UTC</strong></td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#888">📍 Location</td><td style="padding:4px 0"><strong>${location || "TBD"}</strong></td></tr>
          </table>
          <p style="color:#888;font-size:13px">A calendar invite (.ics) is attached — open it to add this event to your calendar.</p>
        </div>
      `,
      attachments: [
        {
          filename: "book-club-invite.ics",
          content: Buffer.from(ics).toString("base64")
        }
      ]
    });
  } catch (err) {
    console.error(`[invite] Resend error:`, err);
    return res.status(500).json({ error: err.message });
  }

  console.log(`[invite] Successfully sent to ${to.length} recipients`);
  res.json({ ok: true, sentTo: to.length });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Book club app running on http://localhost:${PORT}`);
});
