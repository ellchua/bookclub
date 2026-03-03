# Book Club Slot Machine

A vibecoded project — built by tinkering, tweaking, and iterating with Claude Code. Not production-grade software, just a fun personal tool that actually gets used.

A private web app for a book club with friends. Instead of manually picking the next book, members pull a slot machine lever to randomly select one from an unread list pulled live from Notion. Once a book is chosen, the app walks through confirming the host, scheduling the meeting, and sending calendar invites to all members — all from the same interface.

Hosted on a private custom domain.

---

## What it does

- **Slot machine roller** — pulls unread books from a Notion database and randomly selects one with a slot machine animation
- **Host rotation** — tracks the hosting order across sessions; suggests the next host automatically and allows choosing someone else, adjusting the sequence accordingly
- **Calendar invites** — after confirming a book and host, sends a `.ics` calendar invite via email to all members with the date, time, and host's address as the location
- **Notion as the source of truth** — books, members, host order, addresses, and emails all live in Notion; the app reads and writes directly to it
- **Mobile-friendly** — works on phone and desktop; lever can be dragged or tapped

---

## Tech stack

- **Backend**: Node.js + Express
- **Frontend**: Vanilla HTML, CSS, JavaScript (no framework)
- **Database**: Notion (via the Notion API)
- **Email**: Nodemailer over SMTP (Gmail)
- **Hosting**: Railway
- **Domain**: Netlify DNS → Railway

---

## Notion setup

The app connects to two Notion databases:

### Books database
| Property | Type | Notes |
|----------|------|-------|
| Title | Title | Book title |
| Author | Text | Author name |
| Read | Checkbox | Checked = already read, excluded from roller |

### Members database
| Property | Type | Notes |
|----------|------|-------|
| Name | Title | Member name |
| Email | Email | Used for calendar invites |
| Address | Text | Used as meeting location in the invite |
| Current Host | Checkbox | Marks who is currently hosting |
| Order | Number | Rotation sequence; auto-managed by the app |

---

## Config

Secrets and API keys live in a `.env` file (not committed). Connections include a Notion integration for books and members data, and Gmail via an App Password for outgoing invite emails.

## Deployment

Hosted on [Railway](https://railway.app), connected to this GitHub repo. Every push to `main` triggers an automatic redeploy. Environment variables are set in the Railway dashboard.

The host rotation order is stored in the **Order** column of the Notion members database, so it persists across redeploys without any additional storage.
