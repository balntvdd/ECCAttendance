// Student portal behavior (migrated from inline template)
// Expects `API_BASE` to be defined on the page as a relative or absolute base URL.

// Show a toast notification message in the student portal UI.
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
// Remove a toast notification and clean up its timer.
function removeToast(t) {
  if (!t || !t.parentElement) return;
  clearTimeout(t._tid);
  t.classList.add("removing");
  setTimeout(() => t.remove(), 280);
}

// Tab navigation for the unregistered student portal UI.
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// Register form and cookie helper functions used throughout the portal.
const registerBtn = document.getElementById("registerBtn");
function getCookie(name) {
  const v = `; ${document.cookie}`;
  const p = v.split(`; ${name}=`);
  return p.length === 2 ? p.pop().split(";").shift() : "";
}
// Set a cookie for storing registration, keys, and UI state.
function setCookie(name, value, days = 365) {
  // Create a new expiration date for the cookie and write a same-site cookie.
  const d = new Date();
  d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
  document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/;SameSite=Lax`;
}

function getStoredPrivateKey() {
  try {
    const v = localStorage.getItem("ecc_private_key");
    if (v) return v;
  } catch (e) {}
  return getCookie("ecc_private_key");
}

function setStoredPrivateKey(value) {
  try {
    localStorage.setItem("ecc_private_key", value);
  } catch (e) {}
  setCookie("ecc_private_key", value);
}

function getStoredPublicKey() {
  try {
    const v = localStorage.getItem("ecc_public_key");
    if (v) return v;
  } catch (e) {}
  return getCookie("ecc_public_key");
}

function setStoredPublicKey(value) {
  try {
    localStorage.setItem("ecc_public_key", value);
  } catch (e) {}
  setCookie("ecc_public_key", value);
}

function arrayBufferToHex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function base64UrlToUint8Array(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, "=");
  const raw = window.atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

async function generateEccKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const jwkPrivate = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);

  const dBytes = base64UrlToUint8Array(jwkPrivate.d);
  const xBytes = base64UrlToUint8Array(jwkPrivate.x);
  const yBytes = base64UrlToUint8Array(jwkPrivate.y);

  return {
    privateKey: arrayBufferToHex(dBytes),
    publicKey: arrayBufferToHex(xBytes) + arrayBufferToHex(yBytes),
  };
}

function clearActivationPrompt() {
  const section = document.getElementById("browserActivationPrompt");
  if (section) section.remove();
}

function renderActivationPrompt(studentId, deviceFingerprint, options = {}) {
  const container = document.getElementById("alreadyRegistered");
  if (!container || !studentId) return;

  clearActivationPrompt();

  const message = options.message || "This browser is not registered. Do you want to activate this browser as your device?";
  const prompt = document.createElement("div");
  prompt.id = "browserActivationPrompt";
  prompt.style.cssText = "border:1px solid rgba(15,23,42,.08);padding:1rem 1.1rem;border-radius:16px;background:rgba(255,255,255,.82);box-shadow:0 20px 45px rgba(15,23,42,.06);margin-top:1.25rem;text-align:left;";
  prompt.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:0.9rem;flex-wrap:wrap;">
      <div style="flex:1;min-width:220px;">
        <p style="margin:0 0 0.8rem;color:var(--text-700);font-weight:600;">${message}</p>
        <p style="margin:0;color:var(--text-500);font-size:0.95rem;line-height:1.5;">
          Activating this browser will generate a fresh signing key pair locally and replace the current authorized device for your account.
        </p>
      </div>
      <button type="button" class="btn btn-primary" id="activateBrowserBtn" style="white-space:nowrap;">Activate this browser</button>
    </div>
  `;
  container.appendChild(prompt);

  const btn = document.getElementById("activateBrowserBtn");
  if (btn) {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      const original = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span> Activating…';
      try {
        await activateBrowserForStudent(studentId, deviceFingerprint);
      } catch (err) {
        showToast(err.message || "Activation failed. Please try again.", "error");
      } finally {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    });
  }
}

async function activateBrowserForStudent(studentId, deviceFingerprint) {
  if (!studentId || !deviceFingerprint) {
    throw new Error("Unable to activate browser because student or device fingerprint is missing.");
  }

  const keys = await generateEccKeyPair();
  setStoredPrivateKey(keys.privateKey);
  setStoredPublicKey(keys.publicKey);

  try {
    await fetch(`${API_BASE}/api/csrf/`, { credentials: "include" });
    const headers = { "Content-Type": "application/json" };
    const csrfToken = getCookie("csrftoken");
    if (csrfToken) headers["X-CSRFToken"] = csrfToken;

    const res = await fetch(`${API_BASE}/api/activate-browser/`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({
        student_id: studentId,
        public_key: keys.publicKey,
        device_fingerprint: deviceFingerprint,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to activate this browser.");
    }

    clearActivationPrompt();
    showToast("This browser is now your active device.", "success");
    return data;
  } catch (err) {
    // If activation fails, remove stored keys that were created locally.
    try {
      localStorage.removeItem("ecc_private_key");
      localStorage.removeItem("ecc_public_key");
    } catch (e) {}
    setCookie("ecc_private_key", "");
    setCookie("ecc_public_key", "");
    throw err;
  }
}

// Device fingerprint generation and management
// Generate a device fingerprint from browser/hardware properties.
// Used to recognize the same device across browsers.
function generateDeviceFingerprint() {
  // Always compute fresh from hardware properties to ensure consistency across browsers
  const fingerprint = [
    navigator.platform || "",
    screen.width + 'x' + screen.height,
    screen.availWidth + 'x' + screen.availHeight,
    screen.colorDepth || "",
    screen.pixelDepth || "",
    navigator.hardwareConcurrency || "",
    navigator.maxTouchPoints || "",
    new Date().getTimezoneOffset(),
    screen.orientation ? screen.orientation.type : "",
    !!window.sessionStorage,
    !!window.localStorage,
    !!window.indexedDB,
  ].join('|');
  return btoa(fingerprint).replace(/[^a-zA-Z0-9]/g, '').substr(0, 32);
}

function getStoredDeviceFingerprint() {
  return generateDeviceFingerprint();
}

// Clear all stored student session cookies and temporary session storage.
function clearStudentSessionData() {
  setCookie("ecc_registration_data", "");
  setCookie("ecc_private_key", "");
  setCookie("ecc_public_key", "");
  try {
    localStorage.removeItem("ecc_private_key");
    localStorage.removeItem("ecc_public_key");
  } catch (e) {}
  sessionStorage.clear();
}

// Stop QR refresh and countdown timers when the student session becomes invalid.
function stopQrRefresh() {
  if (qrRefreshInterval) {
    clearInterval(qrRefreshInterval);
    qrRefreshInterval = null;
  }
  if (qrCountdownInterval) {
    clearInterval(qrCountdownInterval);
    qrCountdownInterval = null;
  }
}

// Handle backend responses for deleted or invalid student accounts.
// Clears stored registration state and forces the student back to the register form.
function handleDeletedStudentResponse(res, data) {
  const errorText = data && data.error ? String(data.error).toLowerCase() : "";
  if (
    res.status === 404 ||
    (data && data.reset_registration) ||
    errorText.includes("student not found") ||
    errorText.includes("invalid user") ||
    errorText.includes("unauthorized")
  ) {
    stopQrRefresh();
    clearStudentSessionData();
    showToast("Your account is no longer valid. Please register again.", "error");
    checkRegistrationStatus();
    return true;
  }
  return false;
}

// Verify that the stored student ID still exists in the backend on page load.
async function verifyStoredStudentOnLoad(studentId) {
  try {
    const res = await fetch(`${API_BASE}/api/check-student/?student_id=${encodeURIComponent(studentId)}`, {
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok || (data && data.exists === false)) {
      handleDeletedStudentResponse(res, data);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Student verification failed on load:", err);
    return true;
  }
}

function handleRegisterConfirmModalEscape(e) {
  if (e.key === "Escape") closeRegisterConfirmModal();
}

function closeRegisterConfirmModal() {
  const overlay = document.getElementById("registerConfirmOverlay");
  if (overlay) {
    const modal = overlay.querySelector(".otp-modal");
    overlay.style.opacity = "0";
    if (modal) modal.style.transform = "scale(0.9)";
    setTimeout(() => overlay.remove(), 300);
  }
  document.removeEventListener("keydown", handleRegisterConfirmModalEscape);
}

// Ask the student to confirm device/browser binding before calling the register API.
function showRegisterConfirmModal(payload, registerBtnOrig) {
  const modalHTML = `
    <div class="otp-modal-overlay" id="registerConfirmOverlay" style="opacity: 0; transition: opacity 0.3s ease;">
      <div class="otp-modal" style="max-width: 420px; transform: scale(0.9); transition: transform 0.3s ease;">
        <div class="otp-modal-header">
          <h3>Confirm registration</h3>
          <button type="button" class="otp-modal-close" onclick="closeRegisterConfirmModal()">×</button>
        </div>
        <div class="otp-modal-body" style="padding: 1rem 1.25rem;">
          <p style="margin:0 0 1.25rem; color: var(--text-300); line-height:1.6; text-align: center;">
            Are you sure you want to register on this device and browser?
          </p>
          <label class="register-confirm-check">
            <input type="checkbox" id="registerConfirmAck" />
            <span>I understand my attendance identity and signing key will be tied to this device and browser.</span>
          </label>
          <div style="display:flex; flex-direction:column; gap:0.75rem; margin-top:1.25rem;">
            <button type="button" class="btn btn-primary btn-full" id="registerConfirmContinue" disabled>
              Continue
            </button>
            <button type="button" class="btn btn-ghost btn-full" onclick="closeRegisterConfirmModal()">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);
  const overlay = document.getElementById("registerConfirmOverlay");
  const modal = overlay.querySelector(".otp-modal");
  const chk = document.getElementById("registerConfirmAck");
  const btnContinue = document.getElementById("registerConfirmContinue");

  chk.addEventListener("change", () => {
    btnContinue.disabled = !chk.checked;
  });

  setTimeout(() => {
    overlay.style.opacity = "1";
    modal.style.transform = "scale(1)";
  }, 10);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeRegisterConfirmModal();
  });
  document.addEventListener("keydown", handleRegisterConfirmModalEscape);

  btnContinue.addEventListener("click", async () => {
    if (!chk.checked) return;
    document.removeEventListener("keydown", handleRegisterConfirmModalEscape);
    overlay.style.opacity = "0";
    modal.style.transform = "scale(0.9)";
    setTimeout(() => overlay.remove(), 300);

    registerBtn.innerHTML = '<span class="spinner"></span> Registering…';
    registerBtn.classList.add("btn-loading");
    await submitStudentRegistration(payload, registerBtnOrig);
  });
}

// POST registration payload and apply the same success / error handling as before.
async function submitStudentRegistration(payload, registerBtnOrig) {
  const deviceFingerprint = payload.device_fingerprint;
  try {
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

    let data = {};
    try {
      data = await res.json();
    } catch (err) {
      const text = await res.text().catch(() => "Unable to parse backend response.");
      data = { error: text || "Unable to parse backend response." };
    }

    if (res.ok && data.already_registered) {
      const registrationData = {
        student_id: payload.student_id,
        device_fingerprint: deviceFingerprint,
      };
      setCookie("ecc_registration_data", JSON.stringify(registrationData));

      if (data.public_key) {
        setStoredPublicKey(data.public_key);
      }
      if (!getStoredPrivateKey()) {
        showToast(
          "This browser does not have your attendance signing key. Use the browser where you first registered to generate QR codes, or contact support for a device reset.",
          "warning"
        );
      }

      const registerFormEl = document.getElementById("registerForm");
      const alreadyRegistered = document.getElementById("alreadyRegistered");
      if (registerFormEl) {
        registerFormEl.style.display = "none";
        registerFormEl.hidden = true;
      }
      if (alreadyRegistered) {
        alreadyRegistered.style.display = "block";
        alreadyRegistered.hidden = false;
      }
      const headerH1 = document.querySelector('.student-header h1');
      const headerP = document.querySelector('.student-header p');
      if (headerH1) headerH1.textContent = 'Welcome back! Generate your attendance QR pass.';
      if (headerP) headerP.textContent = 'Your registration is complete. Simply enter a session code to generate a fresh QR pass for attendance.';
      const successTitle = document.querySelector('#alreadyRegistered h3');
      if (successTitle) successTitle.textContent = 'You are already registered';

      document.querySelector('.tab-bar').style.display = 'none';

      document.querySelectorAll('.tab-pane').forEach(pane => {
        if (pane.id === 'register-panel') {
          pane.classList.add('active');
        } else {
          pane.classList.remove('active');
        }
      });

      document.getElementById("qr_student_id").value = payload.student_id;

      showToast("Welcome back! Your account has been recognized.", "success");
      registerBtn.innerHTML = registerBtnOrig;
      registerBtn.classList.remove("btn-loading");
      return;
    }

    if (!res.ok) {
      const errorMsg = data.error || "Registration failed.";
      showToast(errorMsg, "error");
      registerBtn.innerHTML = registerBtnOrig;
      registerBtn.classList.remove("btn-loading");
      return;
    }

    const registrationData = {
      student_id: payload.student_id,
      device_fingerprint: deviceFingerprint,
    };
    setCookie("ecc_registration_data", JSON.stringify(registrationData));

    if (data.private_key) {
      setStoredPrivateKey(data.private_key);
    }
    if (data.public_key) {
      setStoredPublicKey(data.public_key);
    }

    document.querySelector('.tab-bar').style.display = 'none';

    const headerH1 = document.querySelector('.student-header h1');
    const headerP = document.querySelector('.student-header p');
    if (headerH1) headerH1.textContent = 'Welcome back! Generate your attendance QR pass.';
    if (headerP) headerP.textContent = 'Your registration is complete. Simply enter a session code to generate a fresh QR pass for attendance.';

    const successTitle = document.querySelector('#alreadyRegistered h3');
    if (successTitle) successTitle.textContent = 'You are successfully registered!';

    const registerFormEl = document.getElementById("registerForm");
    const alreadyRegistered = document.getElementById("alreadyRegistered");
    if (registerFormEl) {
      registerFormEl.style.display = "none";
      registerFormEl.hidden = true;
    }
    if (alreadyRegistered) {
      alreadyRegistered.style.display = 'block';
      alreadyRegistered.hidden = false;
    }
    registerBtn.innerHTML = registerBtnOrig;
    registerBtn.classList.remove("btn-loading");
  } catch {
    showToast(`Cannot connect to backend`, "error");
    registerBtn.innerHTML = registerBtnOrig;
    registerBtn.classList.remove("btn-loading");
  }
}

// Handle submission of the student registration form, including frontend validation.
document.getElementById("registerForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const orig = registerBtn.innerHTML;

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

  const email = document.getElementById("email").value.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    showToast("Please enter a valid email address.", "error");
    return;
  }

  const newStudentId = document.getElementById("student_id").value.trim();
  const section = document.getElementById("section").value;
  if (!newStudentId) {
    showToast("Please enter your Student ID.", "error");
    return;
  }
  if (!section) {
    showToast("Please select your section.", "error");
    return;
  }

  const deviceFingerprint = generateDeviceFingerprint();
  const payload = {
    student_id: newStudentId,
    name: fullName,
    email: email,
    section: section,
    device_fingerprint: deviceFingerprint,
  };

  showRegisterConfirmModal(payload, orig);
});

// QR Generate - with automatic 15-second refresh
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
  const privateKey = getStoredPrivateKey();

  if (!privateKey) {
    showToast("This browser is not registered. Activate this browser to generate a QR pass.", "warning");
    renderActivationPrompt(studentId, deviceFingerprint, {
      message: "This browser is not registered. Do you want to activate this browser as your device?",
    });
    generateQrBtn.innerHTML = orig; generateQrBtn.classList.remove("btn-loading");
    return;
  }
  
  const payload = {
    session_code: sessionCode,
    student_id: studentId,
    device_fingerprint: deviceFingerprint,
    private_key: privateKey,
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
    
    // Handle device mismatch - show modal
    if (res.status === 403 && data.show_modal) {
      showToast(data.modal_message, "error");
      generateQrBtn.innerHTML = orig; generateQrBtn.classList.remove("btn-loading");
      return;
    }
    
    if (!res.ok) {
        if (handleDeletedStudentResponse(res, data)) {
          generateQrBtn.innerHTML = orig; generateQrBtn.classList.remove("btn-loading");
          return;
        }
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

    // Set up auto-refresh every 15 seconds
    qrRefreshInterval = setInterval(() => {
      refreshQrCode(studentId, sessionCode, deviceFingerprint);
    }, 15000);
  } catch {
    showToast(`Cannot connect to backend`, "error");
    generateQrBtn.innerHTML = orig; generateQrBtn.classList.remove("btn-loading");
  }
});

const qrHelpLink = document.getElementById("qrHelpLink");
if (qrHelpLink) {
  qrHelpLink.addEventListener("click", (e) => {
    e.preventDefault();
    const studentId = document.getElementById("qr_student_id")?.value.trim() || "";
    showDeviceHelpModal(studentId);
  });
}

// Render the generated QR code and countdown UI after backend QR generation.
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
        <span id="qrCountdown" style="font-weight: 600; color: var(--blue-400);">15s</span>
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
    note.textContent = "QR pass auto-refreshes every 15 seconds for security. Present this to the teacher scanner for attendance.";
    wrap.appendChild(note);

    qrDisplay.appendChild(wrap);
    showToast("QR pass generated successfully!", "success");

    // Start countdown timer
    startCountdownTimer();
  });
}

// Start the 15-second countdown for the rendered QR pass.
function startCountdownTimer() {
  let seconds = 15;
  
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

// Refresh the QR code automatically every 15 seconds using the stored private key.
async function refreshQrCode(studentId, sessionCode, deviceFingerprint) {
  try {
    const headers = { "Content-Type": "application/json" };
    const csrfToken = getCookie("csrftoken");
    if (csrfToken) headers["X-CSRFToken"] = csrfToken;

    const privateKey = getStoredPrivateKey();
    if (!privateKey) {
      showToast("Private key not found. Please register again.", "error");
      return;
    }

    const payload = {
      session_code: sessionCode,
      student_id: studentId,
      device_fingerprint: deviceFingerprint,
      private_key: privateKey,
    };

    const res = await fetch(`${API_BASE}/api/generate-qr/`, {
      method: "POST",
      headers: headers,
      credentials: "include",
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      handleDeletedStudentResponse(res, data);
      return;
    }

    displayQrCode(data);
  } catch (err) {
    console.log("QR refresh: Connection error (will retry in 15s)");
  }
}

// Open a help modal with instructions for students who need to register a new device.
function showDeviceHelpModal(studentId) {
  const modalHTML = `
    <div class="otp-modal-overlay" id="deviceHelpOverlay">
      <div class="otp-modal" style="max-width: 520px;">
        <div class="otp-modal-header">
          <h3>Need a new device?</h3>
          <button type="button" class="otp-modal-close" onclick="closeDeviceHelpModal()">×</button>
        </div>
        <div class="otp-modal-body" style="padding: 1rem 1.25rem;">
          <p style="margin:0 0 1rem; color: var(--text-300); line-height:1.6;">
            Please include the following details in your email so we can verify your identity faster.
          </p>
          <ul style="margin:0 0 1rem 1.2rem; padding:0; color: var(--text-300); line-height:1.6; list-style:disc;">
            <li>Full Name</li>
            <li>Student ID</li>
            <li>Registered Email Address</li>
            <li>Reason for device change or lost device</li>
            <li>Optional proof of identity if needed</li>
          </ul>
          <p style="margin:0 0 1rem; color: var(--text-300); line-height:1.6;">
            If you lost your registered device or want to use a new one, please send an email to <a href="mailto:eccattendance.mail@gmail.com?subject=Device%20Registration%20Request&body=Hi%2C%20I%20want%20to%20register%20on%20a%20new%20device.%20My%20student%20ID%20is%3A%20${encodeURIComponent(studentId)}" style="color: var(--blue-400); text-decoration:underline;">eccattendance.mail@gmail.com</a> to confirm your identity.
          </p>
          <p style="margin:0 0 1rem; color: var(--text-300); line-height:1.6;">
            We will reply to your email shortly with instructions to register on a new device.
          </p>
          <div style="display:flex; justify-content:flex-end; gap:0.75rem; flex-wrap:wrap;">
            <button type="button" class="btn btn-ghost" onclick="closeDeviceHelpModal()">Close</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

// Close the device help modal overlay.
function closeDeviceHelpModal() {
  const overlay = document.getElementById("deviceHelpOverlay");
  if (overlay) {
    overlay.remove();
  }
}

// Show the student login modal for existing registered accounts.
function showLoginModal() {
  const modalHTML = `
    <div class="otp-modal-overlay" id="loginModalOverlay" style="opacity: 0; transition: opacity 0.3s ease;">
      <div class="otp-modal" style="max-width: 420px; transform: scale(0.9); transition: transform 0.3s ease;">
        <div class="otp-modal-header">
          <h3>Student Login</h3>
          <button type="button" class="otp-modal-close" onclick="closeLoginModal()">×</button>
        </div>
        <div class="otp-modal-body" style="padding: 1rem 1.25rem;">
          <p style="margin:0 0 1.5rem; color: var(--text-300); line-height:1.6; text-align: center;">
            Enter your registered student details to continue.
          </p>
          <form id="loginForm" class="student-form-stack">
            <div class="field-group">
              <label class="field-label" for="login_student_id">Student ID</label>
              <input type="text" id="login_student_id" maxlength="10" placeholder="e.g. 2024006969">
            </div>
            <div class="field-group">
              <label class="field-label" for="login_section">Section</label>
              <select id="login_section">
                <option value="">Select your section</option>
                <option>WMD-1A</option><option>WMD-1B</option><option>WMD-1C</option>
                <option>WMD-2A</option><option>WMD-2B</option><option>WMD-2C</option>
                <option>BSIT-3A</option><option>BSIT-3B</option>
                <option>BSIT-4A</option><option>BSIT-4B</option>
              </select>
            </div>
            <button type="submit" class="btn btn-primary btn-full" id="loginBtn">
              Log in
            </button>
          </form>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);
  const overlay = document.getElementById("loginModalOverlay");
  const modal = overlay.querySelector('.otp-modal');
  setTimeout(() => {
    overlay.style.opacity = '1';
    modal.style.transform = 'scale(1)';
  }, 10);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeLoginModal();
  });
  document.addEventListener("keydown", handleLoginModalEscape);
  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const orig = loginBtn.innerHTML;
    loginBtn.innerHTML = '<span class="spinner"></span> Logging in…';
    loginBtn.classList.add("btn-loading");

    const studentId = document.getElementById("login_student_id").value.trim();
    const section = document.getElementById("login_section").value;
    const deviceFingerprint = generateDeviceFingerprint();

    if (!studentId || !section) {
      showToast("Please enter both Student ID and Section.", "error");
      loginBtn.innerHTML = orig; loginBtn.classList.remove("btn-loading");
      return;
    }

    const payload = {
      student_id: studentId,
      section: section,
      device_fingerprint: deviceFingerprint,
    };

    try {
      // Fetch CSRF token before POST
      await fetch(`${API_BASE}/api/csrf/`, { credentials: "include" });

      const headers = { "Content-Type": "application/json" };
      const csrfToken = getCookie("csrftoken");
      if (csrfToken) headers["X-CSRFToken"] = csrfToken;

      const res = await fetch(`${API_BASE}/api/student-login/`, {
        method: "POST", 
        headers: headers,
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        if (handleDeletedStudentResponse(res, data)) {
          loginBtn.innerHTML = orig; loginBtn.classList.remove("btn-loading");
          closeLoginModal();
          return;
        }
        showToast(data.error || "Login failed.", "error");
        loginBtn.innerHTML = orig; loginBtn.classList.remove("btn-loading");
        return;
      }

      // Success
      handleLoginSuccess(data, deviceFingerprint);
      closeLoginModal();
      showToast("Login successful! Welcome back.", "success");
    } catch {
      showToast("Cannot connect to backend", "error");
      loginBtn.innerHTML = orig; loginBtn.classList.remove("btn-loading");
    }
  });
}

// Close the login modal and remove keyboard event listeners.
function closeLoginModal() {
  const overlay = document.getElementById("loginModalOverlay");
  if (overlay) {
    const modal = overlay.querySelector('.otp-modal');
    overlay.style.opacity = '0';
    modal.style.transform = 'scale(0.9)';
    setTimeout(() => overlay.remove(), 300);
  }
  document.removeEventListener("keydown", handleLoginModalEscape);
}

function handleLoginModalEscape(e) {
  if (e.key === "Escape") closeLoginModal();
}

// Apply login success state to the UI and store student registration details locally.
function handleLoginSuccess(data, deviceFingerprint) {
  // Store registration data for this browser's cookies
  const registrationData = {
    student_id: data.student.student_id,
    device_fingerprint: deviceFingerprint,
  };
  setCookie("ecc_registration_data", JSON.stringify(registrationData));

  if (data.public_key) {
    setStoredPublicKey(data.public_key);
  }
  if (data.private_key) {
    setStoredPrivateKey(data.private_key);
  }

  const hasPrivateKey = !!getStoredPrivateKey();
  const studentId = data.student.student_id;

  if (!hasPrivateKey) {
    showToast(
      "This browser is not registered. Do you want to activate this browser as your device?",
      "warning"
    );
    renderActivationPrompt(studentId, deviceFingerprint, {
      message: "This browser is not registered. Do you want to activate this browser as your device?",
    });
  } else if (data.device_mismatch) {
    showToast(data.message || "Your account is already registered on another device. This device is not authorized to generate a QR pass.", "warning");
    renderActivationPrompt(studentId, deviceFingerprint, {
      message: data.message || "This browser is not registered. Do you want to activate this browser as your device?",
    });
  } else {
    clearActivationPrompt();
  }

  const registerForm = document.getElementById("registerForm");
  const alreadyRegistered = document.getElementById("alreadyRegistered");
  if (registerForm) {
    registerForm.style.display = "none";
    registerForm.hidden = true;
  }
  if (alreadyRegistered) {
    alreadyRegistered.style.display = "block";
    alreadyRegistered.hidden = false;
  }
  const headerH1 = document.querySelector('.student-header h1');
  const headerP = document.querySelector('.student-header p');
  if (headerH1) headerH1.textContent = 'Welcome back! Generate your attendance QR pass.';
  if (headerP) headerP.textContent = 'Your registration is complete. Simply enter a session code to generate a fresh QR pass for attendance.';
  const successTitle = document.querySelector('#alreadyRegistered h3');
  if (successTitle) successTitle.textContent = 'You are already registered';
  
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
  
  // Pre-populate QR panel with student ID
  document.getElementById("qr_student_id").value = data.student.student_id;
  
  // Hide login prompt
  const loginPrompt = document.querySelector('#loginLink')?.parentElement;
  if (loginPrompt) loginPrompt.style.display = 'none';
}

// Check the saved registration state on page load and update the UI accordingly.
async function checkRegistrationStatus() {
  const registrationDataStr = getCookie("ecc_registration_data");
  
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
  if (headerP) headerP.textContent = 'Your attendance identity is tied to your student account and verified device. If you switch devices, contact support to register on a new device.';
  
  if (!registrationDataStr) return;
  
  try {
    const registrationData = JSON.parse(registrationDataStr);
    const currentDeviceFingerprint = getStoredDeviceFingerprint();

    const exists = await verifyStoredStudentOnLoad(registrationData.student_id);
    if (!exists) {
      return;
    }
    
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

      if (!getStoredPrivateKey()) {
        renderActivationPrompt(registrationData.student_id, currentDeviceFingerprint, {
          message: "This browser is not registered. Do you want to activate this browser as your device?",
        });
      }
    }
  } catch (e) {
  }
}

// Show the QR panel directly when a registered student navigates to it.
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

// Initialize student portal UI and event handlers when the page loads.
document.addEventListener("DOMContentLoaded", async () => {
  // Clear temporary authorization on page refresh
  try {
    await fetch(`${API_BASE}/api/csrf/`, { credentials: "include" });
    const headers = { "Content-Type": "application/json" };
    const csrfToken = getCookie("csrftoken");
    if (csrfToken) headers["X-CSRFToken"] = csrfToken;
    await fetch(`${API_BASE}/api/clear-temp-auth/`, {
      method: "POST",
      headers: headers,
      credentials: "include",
    });
  } catch (e) {
    console.warn("Failed to clear temp auth:", e);
  }

  await checkRegistrationStatus();

  // Add login prompt below register button
  const registerBtn = document.getElementById("registerBtn");
  if (registerBtn) {
    const loginPrompt = document.createElement("div");
    loginPrompt.style.cssText = "text-align: center; margin-top: 16px; font-size: 0.875rem; color: var(--text-300);";
    loginPrompt.innerHTML = 'Already registered? <a href="#" id="loginLink" style="font-weight: 600; color: var(--blue-400); text-decoration: none; cursor: pointer;" onmouseover="this.style.textDecoration=\'underline\'" onmouseout="this.style.textDecoration=\'none\'">Log in</a>';
    registerBtn.parentNode.insertBefore(loginPrompt, registerBtn.nextSibling);
    document.getElementById("loginLink").addEventListener("click", (e) => {
      e.preventDefault();
      showLoginModal();
    });
  }

  const deviceHelpLink = document.getElementById("deviceHelpLink");
  if (deviceHelpLink) {
    deviceHelpLink.addEventListener("click", (e) => {
      e.preventDefault();
      const registrationDataStr = getCookie("ecc_registration_data");
      let studentId = document.getElementById("qr_student_id")?.value.trim() || "";
      if (registrationDataStr) {
        try {
          const registrationData = JSON.parse(registrationDataStr);
          if (registrationData.student_id) {
            studentId = registrationData.student_id;
          }
        } catch (err) {
          // ignore invalid data
        }
      }
      showDeviceHelpModal(studentId || "");
    });
  }
  
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
