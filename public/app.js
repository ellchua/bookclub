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
const confirmBookBtn = document.getElementById("confirm-book");
const spinAgainBtn = document.getElementById("spin-again");

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
      modalYesBtn.removeEventListener("pointerdown", onYes);
      modalNoBtn.removeEventListener("pointerdown", onNo);
    }
    function onYes() {
      cleanup();
      resolve(true);
    }
    function onNo() {
      cleanup();
      resolve(false);
    }
    modalYesBtn.addEventListener("pointerdown", onYes);
    modalNoBtn.addEventListener("pointerdown", onNo);
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
      modalYesBtn.removeEventListener("pointerdown", onYes);
      modalNoBtn.removeEventListener("pointerdown", onNo);
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
    modalYesBtn.addEventListener("pointerdown", onYes);
    modalNoBtn.addEventListener("pointerdown", onNo);
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

  const membersWithEmail = members.filter((m) => m.email);
  const checklistHtml = membersWithEmail
    .map((m) => `
      <label style="display:flex;align-items:center;gap:8px;margin:6px 0;cursor:pointer">
        <input type="checkbox" value="${m.email}" checked style="width:auto;margin:0"> ${m.name} <span style="color:#999;font-size:13px">(${m.email})</span>
      </label>`)
    .join("");

  const sendNow = await showChoiceModal(
    `<h3>Send calendar invite?</h3>${checklistHtml}`,
    "Send",
    "Cancel"
  );
  if (!sendNow) {
    setStatus("Invite not sent. Book not marked as read.");
    return;
  }

  const to = Array.from(document.querySelectorAll("#modal input[type=checkbox]:checked"))
    .map((cb) => cb.value);
  if (!to.length) {
    setStatus("No recipients selected. Invite not sent.");
    return;
  }
  let inviteSent = false;
  try {
    await api("/api/invite", {
      method: "POST",
      body: JSON.stringify({
        to,
        title: `Book Club at ${chosenHost.name}'s`,
        hostName: chosenHost.name,
        date: schedule.date,
        location: chosenHost.address || "TBD",
        description: `Book: ${selectedBook.title} by ${selectedBook.author || "Unknown author"}`
      })
    });
    inviteSent = true;
  } catch (err) {
    const markAnyway = await showChoiceModal(
      `<h3>Invite failed</h3><p>${err.message}</p><p>Mark book as read in Notion anyway?</p>`,
      "Yes, mark it",
      "No"
    );
    if (!markAnyway) {
      setStatus("Book not marked as read.", true);
      return;
    }
  }

  await api("/api/books/confirm", {
    method: "POST",
    body: JSON.stringify({ id: selectedBook.id })
  });
  await loadBooks({ render: false });
  setStatus(inviteSent ? "Invite sent!" : "Book marked as read (invite not sent).");
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

  const SPIN_DURATION = 5000;
  const spinStart = Date.now();
  function scheduleNextBook() {
    const remaining = SPIN_DURATION - (Date.now() - spinStart);
    if (remaining <= 0) return;
    // Slow down over the last 2000ms: delay eases from 70ms → 550ms
    const slowWindow = 2000;
    const t = remaining > slowWindow ? 0 : 1 - remaining / slowWindow;
    const delay = 70 + Math.pow(t, 2) * 480;
    rollTimer = setTimeout(() => {
      updateSlot(books[Math.floor(Math.random() * books.length)]);
      scheduleNextBook();
    }, delay);
  }
  scheduleNextBook();

  try {
    await sleep(SPIN_DURATION);
    const result = await pickPromise;
    if (rollTimer) { clearTimeout(rollTimer); rollTimer = null; }
    stopLightRoll();

    const selected = result.selected;
    updateSlot(selected);
    winnerEl.textContent = `Selected: ${selected.title}`;
    launchConfetti();

    // Start organizer fetch in background immediately
    const organizerPromise = api("/api/organizer").catch(() => null);
    await blinkYellow(4);

    confirmBookBtn.disabled = false;
    spinAgainBtn.disabled = false;
    setStatus("Confirm the book or spin again.");

    const action = await new Promise((resolve) => {
      confirmBookBtn.onclick = () => resolve("confirm");
      spinAgainBtn.onclick = () => resolve("spin");
    });

    confirmBookBtn.disabled = true;
    spinAgainBtn.disabled = true;

    if (action === "confirm") {
      const organizerData = await organizerPromise;
      await runHostAndInviteFlow(selected, organizerData);
      slotMachineEl.classList.remove("rolling");
      rolling = false;
      return;
    }

    // spin again
    slotMachineEl.classList.remove("rolling");
    rolling = false;
    await sleep(120);
    await rollBooks();
    return;
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    if (rollTimer) clearTimeout(rollTimer);
    stopLightRoll();
    confirmBookBtn.onclick = null;
    spinAgainBtn.onclick = null;
    confirmBookBtn.disabled = true;
    spinAgainBtn.disabled = true;
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

async function loadBooks({ render = true } = {}) {
  try {
    const data = await api("/api/books");
    books = data.books.sort(() => Math.random() - 0.5);
    if (render) renderBooks();
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
