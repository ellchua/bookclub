# Book Club App

Simple browser app to run your book club:
- Reads unread books from a Notion database
- Uses a slot-style roller with lever interaction
- Shows title + author while rolling
- Confirms selection before marking as read in Notion
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
- `NOTION_BOOK_AUTHOR_PROPERTY` (usually `Author`)
- `NOTION_BOOK_READ_PROPERTY` (checkbox, usually `Read`)

Optional member DB for invite autofill:
- `NOTION_MEMBERS_DATABASE_ID`
- `NOTION_MEMBER_NAME_PROPERTY` (usually `Name`)
- `NOTION_MEMBER_EMAIL_PROPERTY` (usually `Email`)
- `NOTION_MEMBER_ADDRESS_PROPERTY` (usually `Address`)
- `NOTION_MEMBER_CURRENT_HOST_PROPERTY` (checkbox, usually `Current Host`)

Optional for invite emails:
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`

## 2. Notion Database Requirements

Books database needs:
- Title property matching `NOTION_BOOK_TITLE_PROPERTY`
- Author property matching `NOTION_BOOK_AUTHOR_PROPERTY`
- Checkbox property matching `NOTION_BOOK_READ_PROPERTY`
  - `false` means unread (eligible for wheel)
  - `true` means read (excluded)

Optional members database:
- Name property matching `NOTION_MEMBER_NAME_PROPERTY`
- Email property matching `NOTION_MEMBER_EMAIL_PROPERTY`
- Address property matching `NOTION_MEMBER_ADDRESS_PROPERTY`
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
- Roller flow: pick -> `Confirm book?` -> yes marks read, no asks `Spin again?`.
- Meeting organizer default built-in order is: Andrea, Ayan, Ellora, Quentin, Maggie, Dario, Tiziana.
- Skip host reordering is persisted in `data/club.json`.
- Invite subject/title is formatted as `Event Name @ Host Name`.
- Invite location auto-populates from the next host's `Address`.
- Invite form uses one `Date` field; calendar event duration defaults to 1 hour.
