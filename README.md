# Book Club App

Simple browser app to run your book club:
- Reads unread books from a Notion database
- Spins a wheel and picks a random book
- Marks the winner as read in Notion
- Uses Notion members DB for host rotation
- Supports skipping host and reordering after the chosen host
- Optionally sends calendar invites by email (`.ics`)

## 1. Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:
- `NOTION_API_KEY`
- `NOTION_BOOKS_DATABASE_ID`
- `NOTION_BOOK_TITLE_PROPERTY` (usually `Name`)
- `NOTION_BOOK_READ_PROPERTY` (checkbox, usually `Read`)

Optional member DB for invite autofill:
- `NOTION_MEMBERS_DATABASE_ID`
- `NOTION_MEMBER_NAME_PROPERTY` (usually `Name`)
- `NOTION_MEMBER_EMAIL_PROPERTY` (usually `Email`)
- `NOTION_MEMBER_CURRENT_HOST_PROPERTY` (checkbox, usually `Current Host`)

Optional for invite emails:
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`

## 2. Notion Database Requirements

Books database needs:
- Title property matching `NOTION_BOOK_TITLE_PROPERTY`
- Checkbox property matching `NOTION_BOOK_READ_PROPERTY`
  - `false` means unread (eligible for wheel)
  - `true` means read (excluded)

Optional members database:
- Name property matching `NOTION_MEMBER_NAME_PROPERTY`
- Email property matching `NOTION_MEMBER_EMAIL_PROPERTY`
- Checkbox property matching `NOTION_MEMBER_CURRENT_HOST_PROPERTY`
  - one row should be checked as current host

## 3. Run

```bash
npm start
```

Open:
[http://localhost:3000](http://localhost:3000)

## Notes

- Selecting a winner flips the book's read checkbox to `true` in Notion.
- Meeting organizer order comes from members DB entry order, with skip reordering persisted in `data/club.json`.
- Invite subject/title is formatted as `Event Name @ Host Name`.
- Invite form uses one `Date` field; calendar event duration defaults to 1 hour.
