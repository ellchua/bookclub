const statusEl = document.getElementById("status");
const winnerEl = document.getElementById("winner");
const slotTitleEl = document.getElementById("slot-title");
const slotAuthorEl = document.getElementById("slot-author");
const slotMachineEl = document.querySelector(".slot-machine");
const lightFrameEl = document.getElementById("light-frame");
const leverEl = document.getElementById("lever-handle");
const confettiCanvas = document.getElementById("confetti-canvas");
const confettiCtx = confettiCanvas.getContext("2d");

const modalEl = document.getElementById("modal");
const modalContentEl = document.getElementById("modal-content");
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
  updateSlot(books[0] || null);
}

function placeLights() {
  lightFrameEl.querySelectorAll(".light").forEach((el) => el.remove());
  lights = [];
  const rect = lightFrameEl.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const perSide = 10;
  const seen = new Set();

  function addLight(left, top) {
    const key = `${Math.round(left)}-${Math.round(top)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const el = document.createElement("span");
    el.className = "light";
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    lightFrameEl.appendChild(el);
    lights.push(el);
  }

  for (let i = 0; i < perSide; i++) {
    const x = 8 + (i * (width - 24)) / (perSide - 1);
    const y = 8 + (i * (height - 24)) / (perSide - 1);
    addLight(x, 6);
    addLight(x, height - 18);
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

function showChoiceModal(html, yesLabel = "Yes", noLabel = "No") {
  modalContentEl.innerHTML = html;
  modalYesBtn.textContent = yesLabel;
  modalNoBtn.textContent = noLabel;
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

async function showScheduleModal(defaultDateTime, defaultLocation) {
  modalContentEl.innerHTML = `
    <h3>Calendar Scheduling</h3>
    <label>Date & Time</label>
    <input id="modal-date" type="datetime-local" value="${defaultDateTime || ""}" />
    <label>Location</label>
    <input id="modal-location" type="text" value="${defaultLocation || ""}" />
  `;
  modalYesBtn.textContent = "Confirm";
  modalNoBtn.textContent = "Cancel";
  modalEl.classList.remove("hidden");

  return new Promise((resolve) => {
    function cleanup() {
      modalEl.classList.add("hidden");
      modalYesBtn.removeEventListener("click", onYes);
      modalNoBtn.removeEventListener("click", onNo);
    }
    function onYes() {
      const date = document.getElementById("modal-date").value;
      const location = document.getElementById("modal-location").value.trim();
      cleanup();
      resolve({ ok: true, date, location });
    }
    function onNo() {
      cleanup();
      resolve({ ok: false });
    }
    modalYesBtn.addEventListener("click", onYes);
    modalNoBtn.addEventListener("click", onNo);
  });
}

function defaultDateTimeLocal() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(19, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

async function runHostAndInviteFlow(selectedBook) {
  organizer = await api("/api/organizer");
  const members = organizer.members || [];
  if (!members.length) {
    setStatus("No members found in Notion members DB.", true);
    return;
  }

  let chosenHost = organizer.nextHost || organizer.currentHost || members[0];
  const confirmNext = await showChoiceModal(
    `<h3>Next host: ${chosenHost.name}</h3><p>Confirm host or choose another?</p>`,
    "Confirm",
    "Choose Another"
  );

  if (!confirmNext) {
    const options = members
      .map((m) => `<option value="${m.id}">${m.name}</option>`)
      .join("");
    const chooseAnother = await showChoiceModal(
      `<h3>Choose Host</h3><select id="host-select">${options}</select>`,
      "Use Selected",
      "Cancel"
    );
    if (!chooseAnother) {
      setStatus("Host selection canceled.");
      return;
    }
    const selectedId = document.getElementById("host-select").value;
    chosenHost = members.find((m) => m.id === selectedId) || chosenHost;
  }

  await api("/api/host/set", {
    method: "POST",
    body: JSON.stringify({ memberId: chosenHost.id })
  });

  const schedule = await showScheduleModal(defaultDateTimeLocal(), chosenHost.address || "");
  if (!schedule.ok || !schedule.date) {
    setStatus("Scheduling canceled.");
    return;
  }

  const sendNow = await showChoiceModal(
    "<h3>Send calendar invite?</h3><p>This will email all member addresses from Notion.</p>",
    "Yes",
    "No"
  );
  if (!sendNow) {
    setStatus("Invite not sent.");
    return;
  }

  const to = members.map((m) => m.email).filter(Boolean);
  await api("/api/invite", {
    method: "POST",
    body: JSON.stringify({
      to,
      title: `Book Club at ${chosenHost.name}`,
      hostName: chosenHost.name,
      date: schedule.date,
      location: schedule.location || chosenHost.address || "TBD",
      description: `Book: ${selectedBook.title} by ${selectedBook.author || "Unknown author"}`
    })
  });

  setStatus("Invite sent.");
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

    const confirmBook = await showChoiceModal("<h3>Confirm book?</h3>", "Yes", "No");
    if (confirmBook) {
      await api("/api/books/confirm", {
        method: "POST",
        body: JSON.stringify({ id: selected.id })
      });
      await loadBooks();
      setStatus("Book confirmed and marked as read.");
      await runHostAndInviteFlow(selected);
      slotMachineEl.classList.remove("rolling");
      rolling = false;
      return;
    }

    const again = await showChoiceModal("<h3>Spin again?</h3>", "Yes", "No");
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

async function loadBooks() {
  try {
    const data = await api("/api/books");
    books = data.books;
    renderBooks();
    setStatus(`Loaded ${books.length} unread books.`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

document.getElementById("refresh-books").addEventListener("click", loadBooks);
window.addEventListener("resize", () => {
  resizeConfettiCanvas();
  placeLights();
});

resizeConfettiCanvas();
placeLights();
wireLever();
resetLever();
loadBooks();
