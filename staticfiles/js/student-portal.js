// Student portal behavior (migrated from inline template)
// Expects `API_BASE` to be defined on the page (small inline var in the template).

function showToast(msg, type = "info") {
  const c = document.getElementById("toastContainer");
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

// Tabs
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// Register
const registerBtn = document.getElementById("registerBtn");
function getCookie(name) {
  const v = `; ${document.cookie}`;
  const p = v.split(`; ${name}=`);
  return p.length === 2 ? p.pop().split(";").shift() : "";
}

// Device fingerprint generation and management
function generateDeviceFingerprint() {
  let deviceId = localStorage.getItem("ecc_device_fingerprint");
  if (!deviceId) {
    // Generate UUID v4 as device fingerprint
    deviceId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
    localStorage.setItem("ecc_device_fingerprint", deviceId);
  }
  return deviceId;
}

function getStoredDeviceFingerprint() {
  return localStorage.getItem("ecc_device_fingerprint") || generateDeviceFingerprint();
}

document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const orig = registerBtn.innerHTML;
  registerBtn.innerHTML = '<span class="spinner"></span> Registering…';
  registerBtn.classList.add("btn-loading");

  // Combine name fields and convert to uppercase
  const firstName = document.getElementById("firstName").value.trim().toUpperCase();
  const middleInitial = document.getElementById("middleInitial").value.trim().toUpperCase();
  const lastName = document.getElementById("lastName").value.trim().toUpperCase();
  const suffix = document.getElementById("suffix").value.trim().toUpperCase();

  // Build full name
  let fullName = firstName;
  if (middleInitial) fullName += ` ${middleInitial}`;
  fullName += ` ${lastName}`;
  if (suffix) fullName += ` ${suffix}`;
  fullName = fullName.trim();

  // Validate email format
  const email = document.getElementById("email").value.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    showToast("Please enter a valid email address.", "error");
    registerBtn.innerHTML = orig; registerBtn.classList.remove("btn-loading"); return;
  }

  const deviceFingerprint = generateDeviceFingerprint();
  const payload = {
    student_id: document.getElementById("student_id").value.trim(),
    name: fullName,
    email: email,
    section: document.getElementById("section").value,
    favorite_teacher: document.getElementById("favorite_teacher").value.trim(),
    device_fingerprint: deviceFingerprint,
  };
  try {
    // Fetch CSRF token before POST
    await fetch(`${API_BASE}/api/csrf/`, { credentials: "include" });

    const headers = { "Content-Type": "application/json" };
    const csrfToken = getCookie("csrftoken");
    if (csrfToken) headers["X-CSRFToken"] = csrfToken;

    const res = await fetch(`${API_BASE}/api/register/`, {
      method: "POST", 
      headers: headers,
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Registration failed.", "error");
      registerBtn.innerHTML = orig; registerBtn.classList.remove("btn-loading"); return;
    }
    
    // Store registration data for device recognition
    const registrationData = {
      student_id: payload.student_id,
      favorite_teacher: payload.favorite_teacher,
      device_fingerprint: deviceFingerprint,
    };
    localStorage.setItem("ecc_registration_data", JSON.stringify(registrationData));
    
    // Switch to registered state immediately after successful registration
    // Hide tab bar completely
    document.querySelector('.tab-bar').style.display = 'none';
    
    // Update header for registered students
    const headerH1 = document.querySelector('.student-header h1');
    const headerP = document.querySelector('.student-header p');
    if (headerH1) headerH1.textContent = 'Welcome back! Generate your attendance QR pass.';
    if (headerP) headerP.textContent = 'Your registration is complete. Simply enter a session code to generate a fresh QR pass for attendance.';
    
    // Update success message for new registration
    const successTitle = document.querySelector('#alreadyRegistered h3');
    if (successTitle) successTitle.textContent = 'You are successfully registered!';
    
    // Hide registration form and show registered state
    const registerForm = document.getElementById("registerForm");
    const alreadyRegistered = document.getElementById("alreadyRegistered");
    if (registerForm) {
      registerForm.style.display = "none";
      registerForm.hidden = true;
    }
    if (alreadyRegistered) {
      alreadyRegistered.style.display = 'block';
      alreadyRegistered.hidden = false;
    }
    
    registerBtn.innerHTML = orig; registerBtn.classList.remove("btn-loading");
  } catch {
    showToast(`Cannot connect to backend`, "error");
    registerBtn.innerHTML = orig; registerBtn.classList.remove("btn-loading");
  }
});

// QR Generate - with automatic 30-second refresh
const generateQrBtn = document.getElementById("generateQrBtn");
let qrRefreshInterval = null;
let qrCountdownInterval = null;
let currentQrData = null;

document.getElementById("qrForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const orig = generateQrBtn.innerHTML;
  generateQrBtn.innerHTML = '<span class="spinner"></span> Generating…';
  generateQrBtn.classList.add("btn-loading");

  const studentId = document.getElementById("qr_student_id").value.trim();
  const sessionCode = document.getElementById("session_code").value.trim().toUpperCase();
  
  // Validate inputs
  if (!studentId || !sessionCode) {
    showToast("Please enter both Student ID and Session Code.", "error");
    generateQrBtn.innerHTML = orig; generateQrBtn.classList.remove("btn-loading");
    return;
  }
  
  const deviceFingerprint = getStoredDeviceFingerprint();
  const payload = {
    session_code: sessionCode,
    student_id: studentId,
    device_fingerprint: deviceFingerprint,
  };
  
  try {
    // Fetch CSRF token before POST
    await fetch(`${API_BASE}/api/csrf/`, { credentials: "include" });

    const headers = { "Content-Type": "application/json" };
    const csrfToken = getCookie("csrftoken");
    if (csrfToken) headers["X-CSRFToken"] = csrfToken;

    const res = await fetch(`${API_BASE}/api/generate-qr/`, {
      method: "POST", 
      headers: headers,
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    
    // Handle device mismatch - trigger OTP verification
    if (res.status === 403 && data.device_mismatch) {
      showToast("Device verification required. An OTP has been sent to your email.", "warning");
      generateQrBtn.innerHTML = orig; generateQrBtn.classList.remove("btn-loading");
      showOTPModal(studentId, deviceFingerprint, sessionCode, data.masked_email);
      return;
    }
    
    if (!res.ok) {
      showToast(data.error || "QR generation failed.", "error");
      generateQrBtn.innerHTML = orig; generateQrBtn.classList.remove("btn-loading"); return;
    }

    // Store QR data for refresh
    currentQrData = {
      studentId: studentId,
      sessionCode: sessionCode,
      deviceFingerprint: deviceFingerprint,
    };

    // Clear existing intervals
    if (qrRefreshInterval) clearInterval(qrRefreshInterval);
    if (qrCountdownInterval) clearInterval(qrCountdownInterval);

    // Display the QR
    displayQrCode(data);
    generateQrBtn.innerHTML = orig; generateQrBtn.classList.remove("btn-loading");

    // Set up auto-refresh every 30 seconds
    qrRefreshInterval = setInterval(() => {
      refreshQrCode(studentId, sessionCode, deviceFingerprint);
    }, 30000);
  } catch {
    showToast(`Cannot connect to backend`, "error");
    generateQrBtn.innerHTML = orig; generateQrBtn.classList.remove("btn-loading");
  }
});

const qrHelpLink = document.getElementById("qrHelpLink");
if (qrHelpLink) {
  qrHelpLink.addEventListener("click", (e) => {
    e.preventDefault();
    const studentId = document.getElementById("qr_student_id").value.trim();
    const sessionCode = document.getElementById("session_code").value.trim().toUpperCase();
    if (!studentId || !sessionCode) {
      showToast("Please enter your Student ID and Session Code first.", "error");
      return;
    }
    const deviceFingerprint = getStoredDeviceFingerprint();
    showOTPModal(studentId, deviceFingerprint, sessionCode, null);
  });
}

// Display QR code with timestamp and countdown timer
function displayQrCode(data) {
  const qrDisplay = document.getElementById("qrDisplay");
  qrDisplay.innerHTML = "";

  // Parse timestamp
  const qrTime = new Date(data.timestamp);
  const generatedText = qrTime.toLocaleTimeString();

  QRCode.toCanvas(data.raw_payload, { width: 260, margin: 2 }, (err, canvas) => {
    if (err) { showToast("Could not render QR code.", "error"); return; }

    const wrap = document.createElement("div");
    wrap.className = "qr-ready";
    
    // Add timestamp and countdown timer
    const timerContainer = document.createElement("div");
    timerContainer.id = "qrTimerContainer";
    timerContainer.style.cssText = "text-align: center; margin-bottom: 12px; font-size: 0.85rem;";
    timerContainer.innerHTML = `
      <div style="color: var(--slate-400); margin-bottom: 4px;">Generated: ${generatedText}</div>
      <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" style="color: var(--blue-400);"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span id="qrCountdown" style="font-weight: 600; color: var(--blue-400);">30s</span>
        <span style="color: var(--slate-400);">until refresh</span>
      </div>
    `;
    wrap.appendChild(timerContainer);
    wrap.appendChild(canvas);

    const dl = document.createElement("a");
    dl.className = "btn btn-secondary btn-sm";
    dl.href = canvas.toDataURL("image/png");
    dl.download = `qr-${data.student_id}-${data.session_code}.png`;
    dl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download QR Pass`;
    wrap.appendChild(dl);

    const note = document.createElement("p");
    note.className = "qr-note";
    note.textContent = "QR pass auto-refreshes every 30 seconds for security. Present this to the teacher scanner for attendance.";
    wrap.appendChild(note);

    qrDisplay.appendChild(wrap);
    showToast("QR pass generated successfully!", "success");

    // Start countdown timer
    startCountdownTimer();
  });
}

// Countdown timer
function startCountdownTimer() {
  let seconds = 30;
  
  if (qrCountdownInterval) clearInterval(qrCountdownInterval);
  
  qrCountdownInterval = setInterval(() => {
    seconds--;
    const countdownEl = document.getElementById("qrCountdown");
    if (countdownEl) {
      countdownEl.textContent = `${seconds}s`;
      // Change color as time runs out
      if (seconds <= 10) {
        countdownEl.style.color = "var(--warning, #f59e0b)";
      } else if (seconds <= 5) {
        countdownEl.style.color = "var(--error, #ef4444)";
      }
    }
    
    if (seconds <= 0) {
      clearInterval(qrCountdownInterval);
    }
  }, 1000);
}

// Refresh QR code
async function refreshQrCode(studentId, sessionCode, deviceFingerprint) {
  try {
    const headers = { "Content-Type": "application/json" };
    const csrfToken = getCookie("csrftoken");
    if (csrfToken) headers["X-CSRFToken"] = csrfToken;

    const payload = {
      session_code: sessionCode,
      student_id: studentId,
      device_fingerprint: deviceFingerprint,
    };

    const res = await fetch(`${API_BASE}/api/generate-qr/`, {
      method: "POST",
      headers: headers,
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      displayQrCode(data);
    }
  } catch (err) {
    console.log("QR refresh: Connection error (will retry in 30s)");
  }
}

// OTP Modal and verification with favorite teacher
function showOTPModal(studentId, deviceFingerprint, sessionCode, maskedEmail) {
  // Create modal HTML with two-step verification
  const modalHTML = `
    <div class="otp-modal-overlay" id="otpOverlay">
      <div class="otp-modal">
        <div class="otp-modal-header">
          <h3>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" style="display:inline-block; margin-right:8px; vertical-align:middle;">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v4"/>
            </svg>
            Verify Device
          </h3>
          <button type="button" class="otp-modal-close" onclick="closeOTPModal()">×</button>
        </div>
        <div class="otp-modal-body">
          <div id="otpStep1" style="display:block;">
            <p id="otpMessage" style="margin-bottom:24px; color: var(--text-300);">Enter your registered Google account and favorite teacher to send a verification code.</p>
            <form id="otpStep1Form">
              <div class="field-group">
                <label class="field-label" for="otp_email">Registered Gmail Address</label>
                <input type="email" id="otp_email" placeholder="your.email@ua.edu" autocomplete="email">
              </div>
              <div class="field-group">
                <label class="field-label" for="otp_favorite_teacher">Favorite Teacher</label>
                <input type="text" id="otp_favorite_teacher" placeholder="e.g. Mr. Smith" autocomplete="off">
              </div>
              <button type="submit" class="btn btn-primary" id="otpSendBtn" style="margin-top:16px;">
                Send verification code
              </button>
            </form>
          </div>
          <div id="otpStep2" style="display:none;">
            <p id="otpSentMessage" style="margin-bottom:24px; color: var(--text-300);">A code has been sent to your registered email. Enter it below to verify your device.</p>
            <form id="otpStep2Form" style="display:block;">
              <div class="field-group">
                <label class="field-label" for="otp_code">Verification Code</label>
                <input type="text" id="otp_code" placeholder="000000" maxlength="6" autocomplete="one-time-code" style="font-family: 'Courier New', monospace; font-size: 1.4rem; letter-spacing: 0.25em; text-align: center; font-weight:700;">
              </div>
              <button type="submit" class="btn btn-primary" id="otpVerifyBtn" style="margin-top:16px;">
                Verify code and continue
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML("beforeend", modalHTML);
  
  let otpCodeValue = ""; // Store OTP code between steps
  let savedFavoriteTeacher = "";
  
  async function requestOTP(email, favoriteTeacher) {
    try {
      const headers = { "Content-Type": "application/json" };
      const csrfToken = getCookie("csrftoken");
      if (csrfToken) headers["X-CSRFToken"] = csrfToken;
      
      const res = await fetch(`${API_BASE}/api/generate-otp/`, {
        method: "POST",
        headers: headers,
        credentials: "include",
        body: JSON.stringify({
          student_id: studentId,
          device_fingerprint: deviceFingerprint,
          email: email,
          favorite_teacher: favoriteTeacher,
        }),
      });
      
      const data = await res.json();
      const messageEl = document.getElementById("otpMessage");
      const step1El = document.getElementById("otpStep1");
      const step2El = document.getElementById("otpStep2");
      const otpSentMessage = document.getElementById("otpSentMessage");
      
      if (!res.ok) {
        messageEl.textContent = data.error || "Failed to send verification code. Please try again.";
        messageEl.style.color = "var(--error, #ef4444)";
        return;
      }
      
      savedFavoriteTeacher = favoriteTeacher;
      messageEl.textContent = `A code has been sent to ${data.masked_email || email}. Enter it below.`;
      messageEl.style.color = "var(--text-300)";
      step1El.style.display = "none";
      step2El.style.display = "block";
      otpSentMessage.textContent = `A code has been sent to ${data.masked_email || email}. Enter it below to continue.`;
      document.getElementById("otp_code").focus();
    } catch (err) {
      const messageEl = document.getElementById("otpMessage");
      messageEl.textContent = "Connection error. Please try again.";
      messageEl.style.color = "var(--error, #ef4444)";
    }
  }
  
  document.getElementById("otpStep1Form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("otp_email").value.trim();
    const favoriteTeacher = document.getElementById("otp_favorite_teacher").value.trim();
    
    if (!email || !favoriteTeacher) {
      showToast("Please enter your registered email and your favorite teacher.", "error");
      return;
    }
    
    const sendBtn = document.getElementById("otpSendBtn");
    const origText = sendBtn.innerHTML;
    sendBtn.innerHTML = '<span class="spinner"></span> Sending…';
    sendBtn.disabled = true;
    
    await requestOTP(email, favoriteTeacher);
    sendBtn.innerHTML = origText;
    sendBtn.disabled = false;
  });
  
  document.getElementById("otpStep2Form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const otpCode = document.getElementById("otp_code").value.trim();
    
    if (otpCode.length !== 6 || !/^\d+$/.test(otpCode)) {
      showToast("OTP must be 6 digits.", "error");
      return;
    }
    
    const verifyBtn = document.getElementById("otpVerifyBtn");
    const origText = verifyBtn.innerHTML;
    verifyBtn.innerHTML = '<span class="spinner"></span> Verifying…';
    verifyBtn.disabled = true;
    
    try {
      const headers = { "Content-Type": "application/json" };
      const csrfToken = getCookie("csrftoken");
      if (csrfToken) headers["X-CSRFToken"] = csrfToken;
      
      const res = await fetch(`${API_BASE}/api/verify-otp/`, {
        method: "POST",
        headers: headers,
        credentials: "include",
        body: JSON.stringify({
          student_id: studentId,
          device_fingerprint: deviceFingerprint,
          otp_code: otpCode,
          favorite_teacher: savedFavoriteTeacher,
        }),
      });
      
      const data = await res.json();
      if (!res.ok) {
        let errorMsg = data.error || "Verification failed.";
        if (data.attempts_left !== undefined) {
          errorMsg += ` (${data.attempts_left} attempts remaining)`;
        }
        showToast(errorMsg, "error");
        verifyBtn.innerHTML = origText;
        verifyBtn.disabled = false;
        return;
      }
      
      showToast("Device verified successfully! You can now generate the QR pass.", "success");

      try {
        const registrationDataStr = localStorage.getItem("ecc_registration_data");
        const registrationData = registrationDataStr ? JSON.parse(registrationDataStr) : null;
        if (registrationData && registrationData.student_id === studentId) {
          registrationData.device_fingerprint = deviceFingerprint;
          localStorage.setItem("ecc_registration_data", JSON.stringify(registrationData));
        } else {
          localStorage.setItem(
            "ecc_registration_data",
            JSON.stringify({
              student_id: studentId,
              favorite_teacher: savedFavoriteTeacher,
              device_fingerprint: deviceFingerprint,
            })
          );
        }

      } catch (storageErr) {
        console.warn("Could not update registration data after OTP verification.", storageErr);
      }

      closeOTPModal();
    } catch (err) {
      showToast("Connection error during verification.", "error");
      verifyBtn.innerHTML = origText;
      verifyBtn.disabled = false;
    }
  });
}

function closeOTPModal() {
  const overlay = document.getElementById("otpOverlay");
  if (overlay) {
    overlay.remove();
  }
}

// Check registration status on page load
function checkRegistrationStatus() {
  const registrationDataStr = localStorage.getItem("ecc_registration_data");
  
  // Default state: show registration form only, hide device-locked state
  const registerForm = document.getElementById("registerForm");
  const alreadyRegistered = document.getElementById("alreadyRegistered");
  const tabBar = document.querySelector('.tab-bar');

  if (tabBar) tabBar.style.display = 'flex';
  if (registerForm) {
    registerForm.style.display = 'block';
    registerForm.hidden = false;
  }
  if (alreadyRegistered) {
    alreadyRegistered.style.display = 'none';
    alreadyRegistered.hidden = true;
  }
  
  // Reset header to default
  const headerH1 = document.querySelector('.student-header h1');
  const headerP = document.querySelector('.student-header p');
  if (headerH1) headerH1.textContent = 'Register once. Generate a secure QR pass every session.';
  if (headerP) headerP.textContent = 'Your attendance identity is tied to your student account and verified device. If you switch devices, verify with OTP to continue.';
  
  if (!registrationDataStr) return;
  
  try {
    const registrationData = JSON.parse(registrationDataStr);
    const currentDeviceFingerprint = getStoredDeviceFingerprint();
    
    if (registrationData.device_fingerprint === currentDeviceFingerprint) {
      // Device recognized and student registered - switch to registered state
      // Hide tab bar completely
      document.querySelector('.tab-bar').style.display = 'none';
      
      // Hide all tab panes except register-panel
      document.querySelectorAll('.tab-pane').forEach(pane => {
        if (pane.id === 'register-panel') {
          pane.classList.add('active');
        } else {
          pane.classList.remove('active');
        }
      });
      
      // Update header for registered students
      if (headerH1) headerH1.textContent = 'Welcome back! Generate your attendance QR pass.';
      if (headerP) headerP.textContent = 'Your registration is complete. Simply enter a session code to generate a fresh QR pass for attendance.';
      
      // Update message for returning registered user
      const successTitle = document.querySelector('#alreadyRegistered h3');
      if (successTitle) successTitle.textContent = 'You are already registered';
      
      // Hide registration form elements and show already registered state
      const registerForm = document.getElementById("registerForm");
      const alreadyRegistered = document.getElementById("alreadyRegistered");
      if (registerForm) {
        registerForm.style.display = "none";
        registerForm.hidden = true;
      }
      if (alreadyRegistered) {
        alreadyRegistered.style.display = 'block';
        alreadyRegistered.hidden = false;
      }
      
      // Pre-populate QR panel with student ID (for when they navigate to QR)
      document.getElementById("qr_student_id").value = registrationData.student_id;
    }
  } catch (e) {
    // Invalid data, clear it and stay in unregistered state
    localStorage.removeItem("ecc_registration_data");
  }
}

// Switch to QR panel
function switchToQrPanel() {
  // For registered students, tabs are hidden, so directly show QR panel
  document.querySelectorAll('.tab-pane').forEach(pane => {
    if (pane.id === 'qr-panel') {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });
  
  // Scroll to top to show the QR form
  window.scrollTo(0, 0);
}

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  checkRegistrationStatus();
  
  // Handle URL hash for tab navigation
  const hash = window.location.hash.substring(1);
  if (hash) {
    // Check if tabs are visible (unregistered students)
    const tabBar = document.querySelector('.tab-bar');
    if (tabBar && tabBar.style.display !== 'none') {
      // Use normal tab navigation for unregistered students
      const tabBtn = document.querySelector(`.tab-btn[data-tab="${hash}"]`);
      if (tabBtn) {
        tabBtn.click();
      }
    } else {
      // For registered students, directly show the panel
      document.querySelectorAll('.tab-pane').forEach(pane => {
        if (pane.id === hash) {
          pane.classList.add('active');
        } else {
          pane.classList.remove('active');
        }
      });
    }
  }
});
