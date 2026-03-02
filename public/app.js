const statusEl = document.getElementById("status");
const winnerEl = document.getElementById("winner");
const listEl = document.getElementById("book-list");
const slotTitleEl = document.getElementById("slot-title");
const slotAuthorEl = document.getElementById("slot-author");
const slotMachineEl = document.querySelector(".slot-machine");
const lightFrameEl = document.getElementById("light-frame");
const leverEl = document.getElementById("lever-handle");
const currentHostEl = document.getElementById("current-host");
const membersLoadedEl = document.getElementById("members-loaded");
const hostOrderEl = document.getElementById("host-order");
const inviteToEl = document.getElementById("invite-to");
const inviteLocationEl = document.getElementById("invite-location");
const confettiCanvas = document.getElementById("confetti-canvas");
const confettiCtx = confettiCanvas.getContext("2d");

const modalEl = document.getElementById("modal");
const modalTextEl = document.getElementById("modal-text");
const modalYesBtn = document.getElementById("modal-yes");
const modalNoBtn = document.getElementById("modal-no");

let books = [];
let organizer = null;
let lights = [];
let lightTimer = null;
let rollTimer = null;
let rolling = false;
let confettiParticles = [];
let confettiFrame = null;

const LEVER_TOP = 8;
const LEVER_BOTTOM = 124;
const LEVER_TRIGGER = 84;

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#b00020" : "#1f1b16";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function updateSlot(book) {
  if (!book) {
    slotTitleEl.textContent = "No unread books";
    slotAuthorEl.textContent = "";
    return;
  }
  slotTitleEl.textContent = book.title;
  slotAuthorEl.textContent = book.author || "Unknown author";
}

function renderBooks() {
  listEl.innerHTML = "";
  books.forEach((book) => {
    const li = document.createElement("li");
    li.textContent = `${book.title} — ${book.author || "Unknown author"}`;
    listEl.appendChild(li);
  });
  updateSlot(books[0] || null);
}

function placeLights() {
  lightFrameEl.querySelectorAll(".light").forEach((el) => el.remove());
  lights = [];
  const rect = lightFrameEl.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const edgeCount = 9;

  function addLight(left, top) {
    const el = document.createElement("span");
    el.className = "light";
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    lightFrameEl.appendChild(el);
    lights.push(el);
  }

  for (let i = 0; i < edgeCount; i++) {
    const x = 8 + (i * (width - 24)) / (edgeCount - 1);
    addLight(x, 6);
    addLight(x, height - 18);
  }
  for (let i = 1; i < edgeCount - 1; i++) {
    const y = 8 + (i * (height - 24)) / (edgeCount - 1);
    addLight(6, y);
    addLight(width - 18, y);
  }
}

function randomizeLights() {
  lights.forEach((light) => {
    const hue = Math.floor(Math.random() * 360);
    const color = `hsl(${hue} 88% 60%)`;
    light.classList.remove("yellow");
    light.style.background = color;
    light.style.boxShadow = `0 0 10px ${color}`;
  });
}

function startLightRoll() {
  stopLightRoll();
  lightTimer = setInterval(randomizeLights, 90);
}

function stopLightRoll() {
  if (lightTimer) clearInterval(lightTimer);
  lightTimer = null;
}

async function blinkYellow(times = 10) {
  for (let i = 0; i < times; i++) {
    lights.forEach((light) => {
      light.classList.toggle("yellow", i % 2 === 0);
      if (i % 2 === 0) {
        light.style.background = "";
        light.style.boxShadow = "";
      }
    });
    await sleep(110);
  }
}

function resizeConfettiCanvas() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}

function launchConfetti() {
  confettiParticles = [];
  const colors = ["#ffdf52", "#ff6f61", "#5cc8ff", "#8ee16b", "#c38bff"];
  for (let i = 0; i < 140; i++) {
    const fromLeft = i % 2 === 0;
    confettiParticles.push({
      x: fromLeft ? -20 : confettiCanvas.width + 20,
      y: Math.random() * confettiCanvas.height * 0.9,
      vx: fromLeft ? 2 + Math.random() * 5 : -2 - Math.random() * 5,
      vy: -2 + Math.random() * 4,
      life: 50 + Math.random() * 50,
      size: 3 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  if (confettiFrame) cancelAnimationFrame(confettiFrame);
  function step() {
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    confettiParticles = confettiParticles.filter((p) => p.life > 0);
    confettiParticles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.life -= 1;
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(p.x, p.y, p.size, p.size * 0.7);
    });
    if (confettiParticles.length) confettiFrame = requestAnimationFrame(step);
  }
  step();
}

function showModal(text) {
  modalTextEl.textContent = text;
  modalEl.classList.remove("hidden");
  return new Promise((resolve) => {
    function cleanup() {
      modalEl.classList.add("hidden");
      modalYesBtn.removeEventListener("click", onYes);
      modalNoBtn.removeEventListener("click", onNo);
    }
    function onYes() {
      cleanup();
      resolve(true);
    }
    function onNo() {
      cleanup();
      resolve(false);
    }
    modalYesBtn.addEventListener("click", onYes);
    modalNoBtn.addEventListener("click", onNo);
  });
}

async function rollBooks() {
  if (rolling) return;
  if (!books.length) {
    setStatus("No unread books loaded to roll.", true);
    return;
  }

  rolling = true;
  slotMachineEl.classList.add("rolling");
  setStatus("Rolling...");
  winnerEl.textContent = "";

  const pickPromise = api("/api/books/pick", { method: "POST" });
  startLightRoll();

  rollTimer = setInterval(() => {
    const random = books[Math.floor(Math.random() * books.length)];
    updateSlot(random);
  }, 85);

  try {
    await sleep(2200);
    const result = await pickPromise;
    clearInterval(rollTimer);
    rollTimer = null;
    stopLightRoll();

    const selected = result.selected;
    updateSlot(selected);
    winnerEl.textContent = `Selected: ${selected.title}`;
    launchConfetti();
    await blinkYellow(10);

    const confirm = await showModal("Confirm book?");
    if (confirm) {
      await api("/api/books/confirm", {
        method: "POST",
        body: JSON.stringify({ id: selected.id })
      });
      setStatus("Confirmed. Book marked as read in Notion.");
      await loadBooks();
      slotMachineEl.classList.remove("rolling");
      rolling = false;
      return;
    }

    const again = await showModal("Spin again?");
    if (again) {
      slotMachineEl.classList.remove("rolling");
      rolling = false;
      await sleep(120);
      await rollBooks();
      return;
    }
    setStatus("Selection canceled. Book left unmarked.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    if (rollTimer) clearInterval(rollTimer);
    stopLightRoll();
    slotMachineEl.classList.remove("rolling");
    rolling = false;
    resetLever();
  }
}

function setLeverTop(top) {
  const clamped = Math.max(LEVER_TOP, Math.min(LEVER_BOTTOM, top));
  leverEl.style.top = `${clamped}px`;
  return clamped;
}

function resetLever() {
  leverEl.style.transition = "top 160ms ease-out";
  leverEl.style.top = `${LEVER_TOP}px`;
  setTimeout(() => {
    leverEl.style.transition = "";
  }, 180);
}

function wireLever() {
  let active = false;
  let startY = 0;
  let pulled = false;

  leverEl.addEventListener("pointerdown", (event) => {
    if (rolling) return;
    active = true;
    pulled = false;
    startY = event.clientY;
    leverEl.setPointerCapture(event.pointerId);
  });

  leverEl.addEventListener("pointermove", (event) => {
    if (!active || rolling) return;
    const delta = event.clientY - startY;
    const top = setLeverTop(LEVER_TOP + delta);
    if (top >= LEVER_TRIGGER) pulled = true;
  });

  leverEl.addEventListener("pointerup", async () => {
    if (!active) return;
    active = false;
    if (pulled && !rolling) {
      setLeverTop(LEVER_BOTTOM);
      await sleep(70);
      rollBooks();
    } else {
      resetLever();
    }
  });
}

function renderOrganizer() {
  const members = organizer?.members || [];
  const currentHost = organizer?.currentHost?.name || "Not set";
  const nextHost = organizer?.nextHost?.name || "Not set";
  currentHostEl.textContent = `Current host: ${currentHost} | Next host: ${nextHost}`;
  membersLoadedEl.textContent = `Loaded ${members.length} members from Notion.`;
  inviteToEl.value = organizer?.inviteTo || "";
  inviteLocationEl.value = organizer?.suggestedLocation || "";

  hostOrderEl.innerHTML = "";
  members.forEach((member, index) => {
    const li = document.createElement("li");
    const prefix = index === 0 ? "Now" : `${index + 1}`;
    li.textContent = `${prefix}: ${member.name}${member.currentHost ? " (Current Host)" : ""}`;
    hostOrderEl.appendChild(li);
  });
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
    hostName: organizer?.nextHost?.name || organizer?.currentHost?.name || "Host TBD",
    location: inviteLocationEl.value.trim(),
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
document.getElementById("skip-host").addEventListener("click", skipHost);
document.getElementById("invite-form").addEventListener("submit", sendInvite);
window.addEventListener("resize", () => {
  resizeConfettiCanvas();
  placeLights();
});

resizeConfettiCanvas();
placeLights();
wireLever();
resetLever();
loadBooks();
loadOrganizer();
