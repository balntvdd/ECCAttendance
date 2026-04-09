// Full admin frontend JS adapted from original frontend/admin.html
// API_BASE forced to relative path to ensure same-origin requests
const API_BASE = '';

const tabs   = document.querySelectorAll("[data-tab-target]");
const panels = document.querySelectorAll(".dash-panel");
const dashboardSessionSelect = document.getElementById("dashboardSessionSelect");
const scannerSessionSelect   = document.getElementById("scannerSessionSelect");
const reportSessionSelect    = document.getElementById("reportSessionSelect");
const reportScope            = document.getElementById("reportScope");
const sessionTableBody       = document.getElementById("sessionTableBody");
const startScannerBtn = document.getElementById("startScannerBtn");
const stopScannerBtn  = document.getElementById("stopScannerBtn");
const backCameraBtn   = document.getElementById("backCameraBtn");
let currentSessions = [];
let html5QrCode = null;
let activeCameraId = null;
let availableCameras = [];
let cameraRunning = false;
let isProcessing = false;
let userStartedScanner = false;

function showToast(msg, type = "info") {
  const c = document.getElementById("toastContainer");
  if (!c) return;
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  const icons = {
    success: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="toast-icon"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="toast-icon"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="toast-icon"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info:    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="toast-icon"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  };
  t.innerHTML = `${icons[type]||icons.info}<span class="toast-msg">${msg}</span><button class="toast-close" onclick="removeToast(this.parentElement)">×</button>`;
  c.appendChild(t);
  const tid = setTimeout(() => removeToast(t), 5000);
  t._tid = tid;
}
function removeToast(t) {
  if (!t || !t.parentElement) return;
  clearTimeout(t._tid);
  t.classList.add("removing");
  setTimeout(() => t.remove(), 280);
}

// Tab switching
tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    panels.forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    const target = document.getElementById(tab.dataset.tabTarget);
    if (target) target.classList.add("active");
    if (tab.dataset.tabTarget === 'studentsTab') loadStudents();
  });
});

// Students list
async function loadStudents() {
  const q = document.getElementById('studentsSearch')?.value || '';
  const section = document.getElementById('studentsSectionFilter')?.value || '';
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (section) params.set('section', section);
  const body = document.getElementById('studentsTableBody');
  try {
    if (body) body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:22px;color:var(--text-500);">Loading…</td></tr>`;
    const data = await apiFetch(`${API_BASE}/api/students/?${params.toString()}`, { method: 'GET' });
    renderStudents(data.students || []);
  } catch (err) {
    if (body) body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:22px;color:var(--danger);">Failed to load students.</td></tr>`;
    showToast(err.message || 'Failed to load students', 'error');
  }
}

function renderStudents(list) {
  const body = document.getElementById('studentsTableBody');
  if (!body) return;
  body.innerHTML = '';
  if (!list || !list.length) {
    body.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:22px;color:var(--text-500);">No students found.</td></tr>`;
    return;
  }
  list.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-primary">${s.student_id}</td>
      <td>${s.full_name}</td>
      <td>${s.course || ''}</td>
      <td>${s.year_level || ''}</td>
      <td>${s.section || ''}</td>
      <td>${s.email || ''}</td>
      <td>${s.date_registered || ''}</td>
      <td>${s.status || ''}</td>`;
    body.appendChild(tr);
  });
}

function getCookie(name) {
  const v = `; ${document.cookie}`;
  const p = v.split(`; ${name}=`);
  return p.length === 2 ? p.pop().split(";").shift() : "";
}

// Wrapper for admin API requests that ensures CSRF tokens are attached for
// non-GET requests and automatically parses JSON responses.
async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const method = (options.method || "GET").toUpperCase();
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    headers["X-CSRFToken"] = getCookie("csrftoken");
  }
  const res = await fetch(url, { credentials: "include", ...options, headers });
  if (res.headers.get("content-type")?.includes("application/json")) {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }
  if (!res.ok) throw new Error("Request failed");
  return res;
}

function fillSessionSelect(el, placeholder = "Select session") {
  if (!el) return;
  const cur = el.value;
  el.innerHTML = `<option value="">${placeholder}</option>`;
  currentSessions.forEach(s => {
    const o = document.createElement("option");
    o.value = s.session_code;
    o.textContent = `${s.session_code} | ${s.section}`;
    el.appendChild(o);
  });
  if (currentSessions.some(s => s.session_code === cur)) el.value = cur;
  else if (currentSessions[0]) el.value = currentSessions[0].session_code;
}

function renderSessions(sessions) {
  if (!sessionTableBody) return;
  sessionTableBody.innerHTML = "";
  if (!sessions.length) {
    sessionTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-500);">No sessions available.</td></tr>`;
    return;
  }
  sessions.forEach(s => {
    const timeStatus = s.time_status || s.status;
    const statusLabel = timeStatus === "LATE_WINDOW" ? "Late Window" :
                        timeStatus === "TIMED_OUT" ? "Timed Out" :
                        timeStatus === "ENDED" ? "Ended" :
                        timeStatus === "CLOSED" ? "Closed" : "Active";
    const statusColor = timeStatus === "ACTIVE" ? "var(--success-400)" :
                        timeStatus === "LATE_WINDOW" ? "var(--warning-400)" :
                        timeStatus === "TIMED_OUT" ? "var(--error-400)" :
                        timeStatus === "ENDED" ? "var(--text-600)" : "var(--text-500)";
    
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="td-primary">${s.session_code}</td>
      <td>${s.section}</td><td>${s.subject}</td><td>${s.date}</td>
      <td>${s.time_in_start} – ${s.time_out_start}</td>
      <td><span style="color:${statusColor};font-weight:600;font-size:0.8125rem;">${statusLabel}</span></td>`;
    sessionTableBody.appendChild(tr);
  });
}

function renderSummary(summary) {
  const titleEl = document.getElementById("selectedSessionTitle");
  const statusEl = document.getElementById("selectedSessionStatus");
  const presentEl = document.getElementById("presentCount");
  const lateEl = document.getElementById("lateCount");
  const absentEl = document.getElementById("absentCount");
  const metaEl = document.getElementById("sessionMeta");
  const absentList = document.getElementById("absentList");
  if (!titleEl || !statusEl || !presentEl || !lateEl || !absentEl || !metaEl || !absentList) return;
  if (!summary) {
    titleEl.textContent = "No session selected";
    statusEl.textContent = "Waiting for data";
    presentEl.textContent = "0";
    lateEl.textContent = "0";
    absentEl.textContent = "0";
    metaEl.innerHTML = "";
    absentList.innerHTML = `<div style="color:var(--text-500);font-size:0.875rem;padding:8px 0;">No attendance data available.</div>`;
    return;
  }
  titleEl.textContent = `${summary.session.session_code} | ${summary.session.section}`;
  
  // Get status badge with time-based status
  const timeStatus = summary.session.time_status || summary.session.status;
  const statusLabel = timeStatus === "LATE_WINDOW" ? "Late Window" :
                      timeStatus === "TIMED_OUT" ? "Timed Out" :
                      timeStatus === "ENDED" ? "Ended" : "Active";
  const statusStyle = timeStatus === "ACTIVE" ? "color:var(--success-400);" :
                      timeStatus === "LATE_WINDOW" ? "color:var(--warning-400);" :
                      timeStatus === "TIMED_OUT" ? "color:var(--error-400);" :
                      timeStatus === "ENDED" ? "color:var(--text-600);" : "";
  statusEl.innerHTML = `<span style="font-size:0.75rem;opacity:0.8;">${summary.session.subject}</span><span style="${statusStyle}font-weight:600;margin-left:8px;">${statusLabel}</span>`;
  
  presentEl.textContent = summary.counts.present;
  lateEl.textContent    = summary.counts.late;
  absentEl.textContent  = summary.counts.absent;

  // Enhanced session metadata with schedule information
  const schedule = summary.session.schedule || {};
  metaEl.innerHTML = `
    <div class="detail-row"><span class="detail-row-k">Date</span><span class="detail-row-v">${summary.session.date}</span></div>
    <div class="detail-row"><span class="detail-row-k">Status</span><span class="detail-row-v" style="${statusStyle}">${statusLabel}</span></div>
    <div style="border-top:1px solid rgba(255,255,255,0.08);margin:12px 0;"></div>
    <div class="detail-row"><span class="detail-row-k">Start Time</span><span class="detail-row-v">${schedule.start_time || summary.session.time_in_start}</span></div>
    <div class="detail-row"><span class="detail-row-k">Attendance Deadline</span><span class="detail-row-v">${schedule.attendance_deadline || summary.session.time_in_end}</span></div>
    <div class="detail-row"><span class="detail-row-k">Late Cutoff</span><span class="detail-row-v">${schedule.late_cutoff || summary.session.time_out_start}</span></div>
    <div class="detail-row"><span class="detail-row-k">Final End</span><span class="detail-row-v">${schedule.final_end || '—'}</span></div>
    <div style="border-top:1px solid rgba(255,255,255,0.08);margin:12px 0;"></div>
    <div class="detail-row"><span class="detail-row-k">Total Students</span><span class="detail-row-v">${summary.counts.total_students}</span></div>`;

  absentList.innerHTML = "";
  if (!summary.absent.length) {
    absentList.innerHTML = `<div style="color:var(--text-500);font-size:0.875rem;padding:8px 0;">No absent students for this session.</div>`;
    return;
  }
  summary.absent.forEach(stu => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `<span class="list-item-id">${stu.student_id}</span><span class="list-item-name">${stu.name}</span><span class="list-item-sec">${stu.section}</span>`;
    absentList.appendChild(div);
  });
}

// Bootstrap admin dashboard state when the page initially loads.
// Loads the authenticated user, available sessions, and initial summary data.
async function loadBootstrap() {
  const data = await apiFetch(`${API_BASE}/api/portal-bootstrap/`, { method: "GET" });
  const portalUserEl = document.getElementById("portalUser");
  if (portalUserEl) portalUserEl.textContent = data.user.username || sessionStorage.getItem("ecc_admin_user") || "Admin";
  currentSessions = data.sessions || [];
  fillSessionSelect(dashboardSessionSelect, "Latest session");
  fillSessionSelect(scannerSessionSelect,   "Scan session");
  fillSessionSelect(reportSessionSelect,    "All matching sessions");
  renderSessions(currentSessions);
  renderSummary(data.selected_session);
  syncReportScope();
}

function syncReportScope(summary) {
  if (!reportScope) return;
  if (summary) {
    reportScope.innerHTML = `
      <div class="detail-row"><span class="detail-row-k">Session</span><span class="detail-row-v">${summary.session.session_code} | ${summary.session.section}</span></div>
      <div class="detail-row"><span class="detail-row-k">Subject</span><span class="detail-row-v">${summary.session.subject}</span></div>
      <div class="detail-row"><span class="detail-row-k">Date</span><span class="detail-row-v">${summary.session.date}</span></div>
      <div class="detail-row"><span class="detail-row-k">Time Window</span><span class="detail-row-v">${summary.session.time_in_start} – ${summary.session.time_out_start}</span></div>`;
  } else {
    reportScope.innerHTML = `
      <div class="detail-row"><span class="detail-row-k">Session</span><span class="detail-row-v">${reportSessionSelect?.value || "All matching sessions"}</span></div>
      <div class="detail-row"><span class="detail-row-k">Section</span><span class="detail-row-v">${document.getElementById("reportSectionFilter")?.value || "All sections"}</span></div>
      <div class="detail-row"><span class="detail-row-k">Date</span><span class="detail-row-v">${document.getElementById("reportDateFilter")?.value || "All dates"}</span></div>`;
  }
}

async function loadReport() {
  const sessionCode = reportSessionSelect?.value;
  if (!sessionCode) {
    showToast("Please select a session to generate the report.", "warning");
    return;
  }
  const btn = document.getElementById("generateReportBtn");
  const orig = btn?.innerHTML;
  if (btn) { btn.innerHTML = '<span class="spinner"></span> Loading…'; btn.classList.add("btn-loading"); }
  try {
    const data = await apiFetch(`${API_BASE}/api/session-report/${encodeURIComponent(sessionCode)}/`, { method: "GET" });
    syncReportScope(data);
    renderReportTable(data);
  } catch (err) {
    showToast(err.message || "Failed to load report.", "error");
  } finally {
    if (btn) { btn.innerHTML = orig; btn.classList.remove("btn-loading"); }
  }
}

function renderReportTable(summary) {
  const wrap  = document.getElementById("reportTableWrap");
  const strip = document.getElementById("reportCountStrip");
  const tbody = document.getElementById("reportTableBody");
  if (!tbody || !wrap || !strip) return;

  const statusColors = { present: "#22c55e", late: "#f59e0b", absent: "#ef4444" };
  strip.innerHTML = ["present","late","absent"].map(k => `
    <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;background:color-mix(in srgb,${statusColors[k]} 15%,transparent);border:1px solid color-mix(in srgb,${statusColors[k]} 35%,transparent);font-size:0.8rem;font-weight:600;color:${statusColors[k]};">
      ${k.charAt(0).toUpperCase()+k.slice(1)}: ${summary.counts[k]}
    </span>`).join("") +
    `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;background:var(--glass-bg);border:1px solid var(--border);font-size:0.8rem;font-weight:600;color:var(--text-300);">
      Total Students: ${summary.counts.total_students}
    </span>`;

  tbody.innerHTML = "";

  const allRows = [];
  (summary.present || []).forEach(s => allRows.push({ ...s, status: "PRESENT" }));
  (summary.late || []).forEach(s    => allRows.push({ ...s, status: "LATE"    }));
  (summary.absent || []).forEach(s  => allRows.push({ ...s, status: "ABSENT", time_in: "", time_out: "" }));

  if (!allRows.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:28px;color:var(--text-500);">No attendance records for this session.</td></tr>`;
    wrap.style.display = "block";
    return;
  }

  const badgeStyle = {
    PRESENT: "background:color-mix(in srgb,#22c55e 15%,transparent);color:#22c55e;border:1px solid color-mix(in srgb,#22c55e 35%,transparent);",
    LATE:    "background:color-mix(in srgb,#f59e0b 15%,transparent);color:#f59e0b;border:1px solid color-mix(in srgb,#f59e0b 35%,transparent);",
    ABSENT:  "background:color-mix(in srgb,#ef4444 15%,transparent);color:#ef4444;border:1px solid color-mix(in srgb,#ef4444 35%,transparent);",
  };

  allRows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="text-align:center;color:var(--text-500);font-size:0.8rem;">${idx + 1}</td>
      <td class="td-primary">${row.name}</td>
      <td>${row.student_id}</td>
      <td style="font-size:0.875rem;">${row.time_in  || "<span style='color:var(--text-500);'>—</span>"}</td>
      <td style="font-size:0.875rem;">${row.time_out || "<span style='color:var(--text-500);'>—</span>"}</td>
      <td style="text-align:center;"><span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:0.75rem;font-weight:700;letter-spacing:.04em;${badgeStyle[row.status]}">${row.status}</span></td>`;
    tbody.appendChild(tr);
  });

  wrap.style.display = "block";
}

async function handleSessionCreate(e) {
  e.preventDefault();
  const btn = document.getElementById("createSessionBtn");
  const orig = btn?.innerHTML;
  if (btn) { btn.innerHTML = '<span class="spinner"></span> Creating…'; btn.classList.add("btn-loading"); }
  const payload = {
    section: document.getElementById("sessionSection")?.value,
    subject: document.getElementById("sessionSubject")?.value.trim(),
    time_in_start: document.getElementById("timeInStart")?.value,
    time_in_end:   document.getElementById("timeInEnd")?.value,
    time_out_start:document.getElementById("timeOutStart")?.value,
  };
  try {
    const data = await apiFetch(`${API_BASE}/api/start-session/`, { method: "POST", body: JSON.stringify(payload) });
    const sessionCode = data.session.session_code;
    
    // Update session code display
    const codeWrapper = document.getElementById("sessionCodeWrapper");
    const noSessionMessage = document.getElementById("noSessionMessage");
    const codeValue = document.getElementById("sessionCodeValue");
    const msgEl = document.getElementById("sessionCreationMessage");
    const metaEl = document.getElementById("sessionCreationMeta");
    
    if (codeWrapper) codeWrapper.style.display = "block";
    if (noSessionMessage) noSessionMessage.style.display = "none";
    if (codeValue) codeValue.textContent = sessionCode;
    if (msgEl) msgEl.textContent = `Created: ${sessionCode}`;
    if (metaEl) metaEl.innerHTML = `
      <div class="detail-row"><span class="detail-row-k">Section</span><span class="detail-row-v">${data.session.section}</span></div>
      <div class="detail-row"><span class="detail-row-k">Subject</span><span class="detail-row-v">${data.session.subject}</span></div>
      <div class="detail-row"><span class="detail-row-k">Window</span><span class="detail-row-v">${data.session.time_in_start} to ${data.session.time_in_start}</span></div>`;
    document.getElementById("sessionForm")?.reset();
    showToast(`Session ${sessionCode} created successfully!`, "success");
    await loadDashboard();
  } catch (err) { showToast(err.message || "Failed to create session.", "error"); }
  finally { if (btn) { btn.innerHTML = orig; btn.classList.remove("btn-loading"); } }
}

function copySessionCode() {
  const codeEl = document.getElementById("sessionCodeValue");
  const btn = document.getElementById("copySessionCodeBtn");
  if (!codeEl || !btn) return;
  
  const sessionCode = codeEl.textContent.trim();
  if (!sessionCode || sessionCode === "—") {
    showToast("No session code to copy", "warning");
    return;
  }
  
  // Copy to clipboard using modern API
  navigator.clipboard.writeText(sessionCode).then(() => {
    // Visual feedback
    btn.classList.add("copied");
    const origHTML = btn.innerHTML;
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Copied';
    
    showToast("Session code copied to clipboard", "success");
    
    // Reset button after 2 seconds
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.innerHTML = origHTML;
    }, 2000);
  }).catch(() => {
    showToast("Failed to copy session code", "error");
  });
}

async function processQR(decoded) {
  const el = document.getElementById("result");
  try {
    const data = await apiFetch(`${API_BASE}/api/verify-attendance/`, {
      method: "POST",
      body: JSON.stringify({ raw: decoded, session_code: scannerSessionSelect?.value }),
    });
    if (el) {
      el.className = "scan-result success";
      el.innerHTML = `
        <div class="scan-ok">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          ${data.message}
        </div>
        <div class="scan-detail-txt">${data.student} (${data.student_id})</div>
        <div class="scan-detail-txt">${data.section} · ${data.session_code}</div>
        <div class="scan-detail-txt">${new Date(data.time).toLocaleString()}</div>`;
    }
    showToast(`Attendance recorded: ${data.student}`, "success");
    await loadDashboard();
  } catch (err) {
    if (el) {
      el.className = "scan-result error";
      el.innerHTML = `<div class="scan-err"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>${err.message}</div>`;
      showToast(err.message, "error");
    }
  } finally { 
    isProcessing = false;
    await restartScanner(); 
  }
}

function updateScannerButtons() {
  if (!startScannerBtn || !stopScannerBtn || !backCameraBtn) return;
  startScannerBtn.disabled = cameraRunning;
  stopScannerBtn.disabled  = !cameraRunning;
  backCameraBtn.disabled   = !cameraRunning || !availableCameras || availableCameras.length < 2;
}

async function restartScanner() {
  if (!html5QrCode || cameraRunning || isProcessing || !userStartedScanner) return;
  
  // Detect camera only when user explicitly starts scanner
  if (!activeCameraId) {
    try {
      console.log("📷 Detecting cameras...");
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras.length) {
        const el = document.getElementById("result");
        if (el) el.innerHTML = `<div style="color:var(--text-500);">❌ No camera found on this device.</div>`;
        console.warn("⚠️ No cameras available");
        return;
      }
      availableCameras = cameras;
      console.log(`📷 ${cameras.length} camera(s) detected`);
      // Prefer back camera if available, else front camera
      const backCam = cameras.find(cam => cam.label.toLowerCase().includes('back'));
      activeCameraId = backCam ? backCam.id : cameras[0].id;
      console.log("📷 Using camera:", activeCameraId);
    } catch (err) {
      const el = document.getElementById("result");
      if (el) el.innerHTML = `<div style="color:var(--danger);">❌ Camera error: ${err?.message || "Permission denied"}</div>`;
      console.error("❌ Camera detection error:", err?.message);
      return;
    }
  }
  
  try {
    await html5QrCode.start(activeCameraId, { fps: 10, qrbox: 240 },
      async (decoded) => { 
        if (cameraRunning && !isProcessing) { 
          cameraRunning = false;
          await html5QrCode.stop().catch(() => {}); 
          await processQR(decoded); 
        } 
      },
      () => {}
    );
    cameraRunning = true; updateScannerButtons();
  } catch (err) { 
    const el = document.getElementById("result");
    if (el && el.textContent.includes("waiting")) {
      el.textContent = "Camera unavailable or permission denied.";
    }
    cameraRunning = false;
    updateScannerButtons();
  }
}

async function stopScanner() {
  userStartedScanner = false;
  if (!html5QrCode || !cameraRunning) { 
    cameraRunning = false;
    isProcessing = false;
    updateScannerButtons(); 
    return; 
  }
  try { 
    await html5QrCode.stop(); 
  } catch (err) {
    console.error("Error stopping scanner:", err);
  }
  cameraRunning = false; 
  isProcessing = false;
  updateScannerButtons();
  const el = document.getElementById("result");
  if (el) { 
    el.className = "scan-result"; 
    el.innerHTML = `<span style="color:var(--text-500);">Scanner stopped.</span>`; 
  }
}

async function initScannerLibrary() {
  // Initialize the scanner library itself (not the camera)
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("reader");
    console.log("✅ Scanner library initialized");
  }
}

async function initScanner() {
  // First ensure library is ready
  await initScannerLibrary();
  
  // Always setup file upload, regardless of camera availability
  const qrInput = document.getElementById("qr-input");
  if (qrInput) {
    // Remove any existing listeners by cloning
    const newQrInput = qrInput.cloneNode(true);
    qrInput.parentNode.replaceChild(newQrInput, qrInput);
    
    newQrInput.addEventListener("change", async (e) => {
      console.log("📁 File input changed, file selected:", e.target.files[0]?.name);
      const file = e.target.files[0]; 
      if (!file) {
        console.warn("⚠️ No file selected");
        return;
      }
      
      console.log("📝 File details:", { name: file.name, size: file.size, type: file.type });
      
      if (isProcessing) {
        console.warn("⚠️ Already processing a scan");
        showToast("Please wait for the current scan to finish.", "warning");
        return;
      }
      
      if (cameraRunning) { 
        console.log("🛑 Stopping camera");
        await html5QrCode.stop().catch(() => {}); 
        cameraRunning = false; 
      }
      
      const el = document.getElementById("result");
      try {
        // Ensure library is initialized before scanning
        await initScannerLibrary();
        
        isProcessing = true;
        showToast("Scanning QR code from image...", "info");
        
        console.log("🔍 Calling scanFile with File object...");
        try {
          // scanFile() expects a File object directly, NOT a DataURL!
          const decoded = await html5QrCode.scanFile(file, false);
          console.log("✨ QR decoded successfully:", decoded);
          console.log("🔍 Decoded content type:", typeof decoded, "value:", decoded);
          
          if (decoded) {
            console.log("📤 Sending to processQR:", decoded);
            await processQR(decoded);
          } else {
            throw new Error("No QR data returned from decoder");
          }
        } catch (scanErr) {
          console.error("❌ scanFile error:", scanErr);
          isProcessing = false;
          const errMsg = scanErr?.message || String(scanErr) || "Could not read QR image";
          console.log("📢 Error details:", errMsg);
          
          if (el) {
            el.className = "scan-result error";
            el.innerHTML = `<div class="scan-err"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>Invalid or unclear QR code. Try: Better lighting, sharper image, different angle.</div>`;
          }
          showToast(`Could not read QR: ${errMsg}`, "error");
          
          // Only restart if user explicitly started scanner
          if (userStartedScanner) {
            await restartScanner();
          }
        }
      } catch (err) {
        console.error("❌ Outer catch error:", err);
        isProcessing = false;
        if (el) {
          el.className = "scan-result error";
          el.innerHTML = `<div class="scan-err"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>${err?.message || "Could not read QR image."}</div>`;
        }
        
        // Only restart if user explicitly started scanner
        if (userStartedScanner) {
          await restartScanner();
        }
      } finally {
        // Reset the file input so the same file can be selected again
        console.log("🔄 Resetting file input");
        e.target.value = "";
      }
    });
  }
}

async function logout() {
  try { await apiFetch(`${API_BASE}/api/logout/`, { method: "POST", body: JSON.stringify({}) }); } catch {}
  sessionStorage.removeItem("ecc_admin_user");
  window.location.replace("/portal/login/");
}

async function loadDashboard() {
  const btn = document.getElementById("refreshDashboardBtn");
  const orig = btn?.innerHTML;
  if (btn) { btn.innerHTML = '<span class="spinner"></span> Refreshing...'; btn.classList.add("btn-loading"); }
  try {
    const params = new URLSearchParams();
    if (dashboardSessionSelect?.value) params.set("session_code", dashboardSessionSelect.value);
    if (document.getElementById("dashboardSectionFilter")?.value) params.set("section", document.getElementById("dashboardSectionFilter").value);
    if (document.getElementById("dashboardDateFilter")?.value) params.set("date", document.getElementById("dashboardDateFilter").value);
    const data = await apiFetch(`${API_BASE}/api/dashboard/?${params}`, { method: "GET" });
    currentSessions = data.sessions;
    fillSessionSelect(dashboardSessionSelect, "Latest session");
    fillSessionSelect(scannerSessionSelect, "Scan session");
    fillSessionSelect(reportSessionSelect, "All matching sessions");
    renderSessions(currentSessions);
    renderSummary(data.selected_session);
    syncReportScope();
  } catch {
    showToast("Failed to refresh dashboard.", "error");
  } finally {
    if (btn) { btn.innerHTML = orig; btn.classList.remove("btn-loading"); }
  }
}

async function downloadReport(format) {
  const params = new URLSearchParams();
  if (reportSessionSelect?.value) params.set("session_code", reportSessionSelect.value);
  if (document.getElementById("reportSectionFilter")?.value) params.set("section", document.getElementById("reportSectionFilter").value);
  if (document.getElementById("reportDateFilter")?.value) params.set("date", document.getElementById("reportDateFilter").value);
  params.set("format", format);

  showToast(`Downloading ${format.toUpperCase()} report...`, "info");

  try {
    const res = await fetch(`${API_BASE}/api/reports/export/?${params}`, {
      method: "GET",
      credentials: "include",
      headers: { "X-CSRFToken": getCookie("csrftoken") },
    });

    if (!res.ok) {
      let message = "Failed to download report.";
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        message = data.error || data.detail || message;
      }
      throw new Error(message);
    }

    const disposition = res.headers.get("content-disposition") || "";
    const match = disposition.match(/filename=\"?([^\"]+)\"?/i);
    const blob = await res.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = match?.[1] || `attendance-report.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  } catch (err) {
    showToast(err.message || "Failed to download report.", "error");
  }
}

document.getElementById("refreshDashboardBtn")?.addEventListener("click", loadDashboard);
document.getElementById("sessionForm")?.addEventListener("submit", handleSessionCreate);
document.getElementById("copySessionCodeBtn")?.addEventListener("click", copySessionCode);
document.getElementById("generateReportBtn")?.addEventListener("click", loadReport);
document.getElementById("downloadCsvBtn")?.addEventListener("click", () => downloadReport("csv"));
document.getElementById("downloadPdfBtn")?.addEventListener("click", () => downloadReport("pdf"));
document.getElementById("reportSessionSelect")?.addEventListener("change", () => { syncReportScope(); document.getElementById("reportTableWrap").style.display = "none"; });
document.getElementById("reportSectionFilter")?.addEventListener("change", () => { syncReportScope(); document.getElementById("reportTableWrap").style.display = "none"; });
document.getElementById("reportDateFilter")?.addEventListener("change",    () => { syncReportScope(); document.getElementById("reportTableWrap").style.display = "none"; });
document.getElementById("logoutBtn")?.addEventListener("click", logout);
startScannerBtn?.addEventListener("click", async () => {
  try {
    userStartedScanner = true;
    await initScanner();
    await restartScanner();
  } catch (e) { 
    userStartedScanner = false;
    showToast('Camera initialization failed.', 'error'); 
  }
});
stopScannerBtn?.addEventListener("click",  stopScanner);

async function switchToBackCamera() {
  if (!cameraRunning || !availableCameras || availableCameras.length < 2) {
    showToast("Multiple cameras not available.", "warning");
    return;
  }
  
  try {
    // Find back camera, else use first camera that's not current
    const backCam = availableCameras.find(cam => cam.label.toLowerCase().includes('back'));
    const nextCameraId = backCam ? backCam.id : availableCameras.find(cam => cam.id !== activeCameraId)?.id;
    
    if (!nextCameraId) {
      showToast("No alternative camera available.", "warning");
      return;
    }
    
    console.log("🔄 Switching to camera:", nextCameraId);
    activeCameraId = nextCameraId;
    cameraRunning = false;
    
    // Stop current camera
    await html5QrCode.stop().catch(() => {});
    
    // Start with new camera
    await html5QrCode.start(activeCameraId, { fps: 10, qrbox: 240 },
      async (decoded) => { 
        if (cameraRunning && !isProcessing) { 
          cameraRunning = false;
          await html5QrCode.stop().catch(() => {}); 
          await processQR(decoded); 
        } 
      },
      () => {}
    );
    cameraRunning = true;
    updateScannerButtons();
    showToast("Switched to back camera.", "success");
  } catch (err) {
    console.error("❌ Camera switch error:", err?.message);
    showToast(`Camera switch failed: ${err?.message || "Unknown error"}`, "error");
    cameraRunning = false;
    updateScannerButtons();
  }
}

backCameraBtn?.addEventListener("click", switchToBackCamera);

const studentsSearchBtn = document.getElementById('studentsSearchBtn');
if (studentsSearchBtn) studentsSearchBtn.addEventListener('click', loadStudents);
const studentsFilter = document.getElementById('studentsSectionFilter');
if (studentsFilter) studentsFilter.addEventListener('change', loadStudents);
const studentsSearchInput = document.getElementById('studentsSearch');
if (studentsSearchInput) studentsSearchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); loadStudents(); } });

const sidebarToggle = document.getElementById('sidebarToggle');
const mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
if (sidebarToggle) {
  sidebarToggle.addEventListener('click', () => { document.body.classList.toggle('mobile-nav-open'); });
}
document.querySelectorAll('.dash-sidebar .sidebar-nav-link, .dash-sidebar a').forEach(el => { el.addEventListener('click', () => { document.body.classList.remove('mobile-nav-open'); }); });
if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', () => { document.body.classList.remove('mobile-nav-open'); logout(); });

updateScannerButtons();

// Initialize scanner file upload on page load
initScanner().catch(err => console.warn("⚠️ Scanner init warning:", err));

// Wait a moment for session cookie to be fully set before bootstrapping
setTimeout(() => {
  loadBootstrap().catch(() => { window.location.replace("/portal/login/"); });
}, 300);
