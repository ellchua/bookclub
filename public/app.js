const statusEl = document.getElementById("status");
const wheelLabelEl = document.getElementById("wheel");
const winnerEl = document.getElementById("winner");
const listEl = document.getElementById("book-list");
const currentHostEl = document.getElementById("current-host");
const membersLoadedEl = document.getElementById("members-loaded");
const hostOrderEl = document.getElementById("host-order");
const inviteToEl = document.getElementById("invite-to");
const canvas = document.getElementById("wheel-canvas");
const ctx = canvas.getContext("2d");

let books = [];
let organizer = null;
let wheelRotation = 0;

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#b00020" : "#1f1b16";
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function sliceColor(index) {
  const palette = ["#c05c2e", "#2e6f68", "#4d7cbf", "#8a5ca1", "#b99439", "#3a9155"];
  return palette[index % palette.length];
}

function truncateLabel(text, maxLen = 20) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}...`;
}

function drawWheel() {
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.min(w, h) / 2 - 8;

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(wheelRotation);

  if (!books.length) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#f2f2f2";
    ctx.fill();
    ctx.strokeStyle = "#d0d0d0";
    ctx.stroke();
    ctx.fillStyle = "#666";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No books", 0, 6);
    ctx.restore();
    return;
  }

  const sliceAngle = (Math.PI * 2) / books.length;
  books.forEach((book, i) => {
    const start = i * sliceAngle;
    const end = start + sliceAngle;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = sliceColor(i);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.rotate(start + sliceAngle / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px sans-serif";
    ctx.fillText(truncateLabel(book.title), radius - 10, 4);
    ctx.restore();
  });

  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(cx - 12, 4);
  ctx.lineTo(cx + 12, 4);
  ctx.lineTo(cx, 24);
  ctx.closePath();
  ctx.fillStyle = "#1f1b16";
  ctx.fill();
}

function renderBooks() {
  listEl.innerHTML = "";
  books.forEach((book) => {
    const li = document.createElement("li");
    li.textContent = book.title;
    listEl.appendChild(li);
  });
  wheelLabelEl.textContent = books.length ? "Ready to spin" : "No unread books loaded";
  drawWheel();
}

function renderOrganizer() {
  const members = organizer?.members || [];
  const currentHost = organizer?.currentHost?.name || "Not set";
  currentHostEl.textContent = `Current host: ${currentHost}`;
  membersLoadedEl.textContent = `Loaded ${members.length} members from Notion.`;
  inviteToEl.value = organizer?.inviteTo || "";

  hostOrderEl.innerHTML = "";
  members.forEach((member, index) => {
    const li = document.createElement("li");
    const prefix = index === 0 ? "Now" : `${index + 1}`;
    li.textContent = `${prefix}: ${member.name}${member.currentHost ? " (Current Host)" : ""}`;
    hostOrderEl.appendChild(li);
  });
}

async function loadBooks() {
  try {
    const data = await api("/api/books");
    books = data.books;
    renderBooks();
    setStatus(`Loaded ${books.length} unread books from Notion.`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function loadOrganizer() {
  try {
    organizer = await api("/api/organizer");
    renderOrganizer();
  } catch (error) {
    membersLoadedEl.textContent = error.message;
    setStatus(error.message, true);
  }
}

async function animateSpin(durationMs = 2600) {
  const start = performance.now();
  const startRotation = wheelRotation;
  const extraTurns = Math.PI * 2 * (4 + Math.random() * 2);
  const target = startRotation + extraTurns;

  return new Promise((resolve) => {
    function frame(now) {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      wheelRotation = startRotation + (target - startRotation) * eased;
      drawWheel();
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

async function spinBook() {
  if (!books.length) {
    setStatus("No unread books loaded to spin.", true);
    return;
  }

  wheelLabelEl.classList.add("spinning");
  try {
    await animateSpin();
    const result = await api("/api/books/spin", { method: "POST" });
    wheelLabelEl.textContent = result.selected.title;
    winnerEl.textContent = `Winner: ${result.selected.title}`;
    setStatus("Book selected and marked as read in Notion.");
    await loadBooks();
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    wheelLabelEl.classList.remove("spinning");
  }
}

async function skipHost() {
  try {
    const result = await api("/api/host/skip", { method: "POST" });
    organizer = result.organizer;
    renderOrganizer();
    setStatus(`Skipped ${result.skipped}. New host: ${result.currentHost}.`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function sendInvite(event) {
  event.preventDefault();
  const eventName = document.getElementById("invite-event-name").value.trim();
  const payload = {
    to: inviteToEl.value
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    eventName,
    hostName: organizer?.currentHost?.name || "Host TBD",
    location: document.getElementById("invite-location").value.trim(),
    description: document.getElementById("invite-description").value.trim(),
    date: document.getElementById("invite-date").value
  };

  try {
    const result = await api("/api/invite", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    setStatus(`Invite sent to ${result.sentTo} people.`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

document.getElementById("refresh-books").addEventListener("click", loadBooks);
document.getElementById("spin-btn").addEventListener("click", spinBook);
document.getElementById("skip-host").addEventListener("click", skipHost);
document.getElementById("invite-form").addEventListener("submit", sendInvite);

drawWheel();
loadBooks();
loadOrganizer();
