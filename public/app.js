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
  const w = rect.width;
  const h = rect.height;
  const inset = 6;
  const ls = 12;
  const half = ls / 2;

  // Usable range for light centers on each side
  const xRange = w - 2 * inset - ls; // w - 24
  const yRange = h - 2 * inset - ls; // h - 24

  // Choose a single spacing so all 4 sides feel even
  const spacing = 26;
  const hCount = Math.max(2, Math.round(xRange / spacing) + 1);
  const vCount = Math.max(2, Math.round(yRange / spacing) + 1);

  function addLight(left, top) {
    const el = document.createElement("span");
    el.className = "light";
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    lightFrameEl.appendChild(el);
    lights.push(el);
  }

  // Top and bottom rows (corners included)
  for (let i = 0; i < hCount; i++) {
    const cx = inset + half + (i / (hCount - 1)) * xRange;
    addLight(cx - half, inset);           // top
    addLight(cx - half, h - inset - ls); // bottom
  }
  // Left and right columns (corners already placed by top/bottom)
  for (let i = 1; i <= vCount - 2; i++) {
    const cy = inset + half + (i / (vCount - 1)) * yRange;
    addLight(inset, cy - half);           // left
    addLight(w - inset - ls, cy - half); // right
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
  for (let i = 0; i < 220; i++) {
    const fromLeft = i % 2 === 0;
    confettiParticles.push({
      x: fromLeft ? -20 : confettiCanvas.width + 20,
      y: Math.random() * confettiCanvas.height * 0.85,
      vx: fromLeft ? 4 + Math.random() * 8 : -4 - Math.random() * 8,
      vy: -5 + Math.random() * 4,
      life: 70 + Math.random() * 60,
      size: 7 + Math.random() * 9,
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

async function showScheduleModal(defaultDateTime) {
  modalContentEl.innerHTML = `
    <h3>Calendar Scheduling</h3>
    <label>Date & Time</label>
    <input id="modal-date" type="datetime-local" value="${defaultDateTime || ""}" />
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
      cleanup();
      resolve({ ok: true, date });
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

async function runHostAndInviteFlow(selectedBook, prefetchedOrganizer = null) {
  const orgData = prefetchedOrganizer || await api("/api/organizer");
  const members = orgData.members || [];
  if (!members.length) {
    setStatus("No members found in Notion members DB.", true);
    return;
  }

  let chosenHost = orgData.nextHost || orgData.currentHost || members[0];
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

  // Fire host update without waiting — it doesn't affect anything downstream
  api("/api/host/set", {
    method: "POST",
    body: JSON.stringify({ memberId: chosenHost.id })
  }).catch((err) => setStatus(err.message, true));

  const schedule = await showScheduleModal(defaultDateTimeLocal());
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
    setStatus("Invite not sent. Book not marked as read.");
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
      location: chosenHost.address || "TBD",
      description: `Book: ${selectedBook.title} by ${selectedBook.author || "Unknown author"}`
    })
  });

  // Mark the book as read in Notion only after invites go out
  await api("/api/books/confirm", {
    method: "POST",
    body: JSON.stringify({ id: selectedBook.id })
  });
  await loadBooks();
  setStatus("Invite sent!");
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
    await sleep(1400);
    const result = await pickPromise;
    clearInterval(rollTimer);
    rollTimer = null;
    stopLightRoll();

    const selected = result.selected;
    updateSlot(selected);
    winnerEl.textContent = `Selected: ${selected.title}`;
    launchConfetti();

    // Pre-fetch organizer in parallel with the blink so the host popup is instant
    const [, organizerData] = await Promise.all([
      blinkYellow(4),
      api("/api/organizer").catch(() => null)
    ]);

    const confirmBook = await showChoiceModal("<h3>Confirm book?</h3>", "Yes", "No");
    if (confirmBook) {
      // Keep the winner visible in the slot; book is marked read only after invite is sent
      await runHostAndInviteFlow(selected, organizerData);
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
  let moved = false;

  leverEl.addEventListener("pointerdown", (event) => {
    if (rolling) return;
    active = true;
    pulled = false;
    moved = false;
    startY = event.clientY;
    leverEl.setPointerCapture(event.pointerId);
  });

  leverEl.addEventListener("pointermove", (event) => {
    if (!active || rolling) return;
    const delta = event.clientY - startY;
    if (Math.abs(delta) > 8) moved = true;
    const top = setLeverTop(LEVER_TOP + delta);
    if (top >= LEVER_TRIGGER) pulled = true;
  });

  leverEl.addEventListener("pointerup", async () => {
    if (!active) return;
    active = false;
    const triggered = pulled || !moved; // full drag OR a tap
    if (triggered && !rolling) {
      setLeverTop(LEVER_BOTTOM);
      await sleep(70);
      rollBooks();
      await sleep(300);
      resetLever(); // spring back up
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
