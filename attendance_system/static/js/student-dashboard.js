// Student Dashboard JavaScript
// API_BASE is defined inline in the template so the dashboard uses the same backend path.

let cachedStudentData = null;

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

// Tab switching
document.querySelectorAll(".sidebar-nav-link[data-tab-target]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sidebar-nav-link").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".dash-panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    const target = document.getElementById(btn.dataset.tabTarget);
    if (target) {
      target.classList.add("active");
      if (btn.dataset.tabTarget === 'attendanceTab') {
        loadFullAttendance();
      }
    }
  });
});

// Load student data from localStorage
function loadStudentData() {
  const registrationDataStr = localStorage.getItem("ecc_registration_data");
  if (!registrationDataStr) {
    showToast("No registration data found. Please register first.", "error");
    return null;
  }
  
  try {
    const registrationData = JSON.parse(registrationDataStr);
    cachedStudentData = registrationData;
    return registrationData;
  } catch (e) {
    showToast("Invalid registration data. Please re-register.", "error");
    return null;
  }
}

// Load dashboard data
async function loadDashboardData() {
  const studentData = loadStudentData();
  if (!studentData) return;
  
  // Update UI with student info
  document.getElementById("studentId").textContent = studentData.student_id;
  document.getElementById("profileStudentId").textContent = studentData.student_id;
  document.getElementById("profileName").textContent = studentData.name || "Not provided";
  document.getElementById("profileSection").textContent = studentData.section;
  document.getElementById("profileTeacher").textContent = studentData.favorite_teacher;
  
  try {
    // Fetch attendance data from the backend so the dashboard reflects actual session state.
    const response = await fetch(`${API_BASE}/api/student-attendance/?student_id=${studentData.student_id}`);
    const data = await response.json();
    
    if (response.ok) {
      // Update profile UI from backend data to ensure accuracy.
      document.getElementById("studentId").textContent = data.student.student_id;
      document.getElementById("profileStudentId").textContent = data.student.student_id;
      document.getElementById("profileName").textContent = data.student.name || "Not provided";
      document.getElementById("profileSection").textContent = data.student.section;
      document.getElementById("profileTeacher").textContent = data.student.favorite_teacher;

      const localDeviceFingerprint = localStorage.getItem("ecc_device_fingerprint") || "";
      if (data.student.device_fingerprint && localDeviceFingerprint && data.student.device_fingerprint !== localDeviceFingerprint) {
        showToast("Your current device does not match the registered device. Dashboard data is still available, but please verify your device.", "warning");
      }

      // Update stats
      document.getElementById("presentCount").textContent = data.stats.total_present;
      document.getElementById("lateCount").textContent = data.stats.total_late;
      document.getElementById("absentCount").textContent = data.stats.total_absent;
      document.getElementById("attendancePercentage").textContent = `${data.stats.attendance_percentage}%`;

      // Update recent logs
      const tbody = document.getElementById("attendanceTableBody");
      tbody.innerHTML = "";
      
      if (!data.recent_logs || data.recent_logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 2rem; color: var(--text-secondary);">No attendance records found</td></tr>';
      } else {
        data.recent_logs.forEach(log => {
          const row = document.createElement("tr");
          const date = new Date(log.date).toLocaleDateString();
          const statusClass = log.status.toLowerCase();
          row.innerHTML = `
            <td>${date}</td>
            <td>${log.session_code}</td>
            <td><span class="status-pill status-${statusClass}">${log.status}</span></td>
          `;
          tbody.appendChild(row);
        });
      }

      renderAttendanceTrendChart(data.trend || []);
    } else {
      showToast(data.error || "Failed to load attendance data", "error");
    }
  } catch (error) {
    showToast("Network error loading dashboard data", "error");
  }
}

function renderAttendanceTrendChart(trend) {
  const chart = document.getElementById("attendanceTrendChart");
  if (!chart) return;
  chart.innerHTML = "";

  if (!Array.isArray(trend) || trend.length === 0) {
    chart.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">No attendance trend data available.</div>';
    return;
  }

  const svgNS = "http://www.w3.org/2000/svg";
  const width = Math.max(360, chart.offsetWidth || chart.getBoundingClientRect().width || 760);
  const height = 260;
  const margin = { top: 30, right: 24, bottom: 52, left: 56 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const statusScale = { ABSENT: 0, LATE: 1, PRESENT: 2 };
  const colors = { PRESENT: '#4ade80', LATE: '#facc15', ABSENT: '#f87171' };

  const points = trend.map((entry, index) => {
    const statusValue = statusScale[entry.status] ?? 0;
    return {
      x: margin.left + (innerWidth * index) / Math.max(1, trend.length - 1),
      y: margin.top + innerHeight - (innerHeight * statusValue) / 2,
      label: entry.label,
      status: entry.status,
      color: colors[entry.status] || colors.ABSENT,
    };
  });

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'trend-svg');

  const gridLevels = [
    { y: margin.top, label: 'Present' },
    { y: margin.top + innerHeight / 2, label: 'Late' },
    { y: margin.top + innerHeight, label: 'Absent' },
  ];

  gridLevels.forEach(level => {
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', margin.left);
    line.setAttribute('x2', width - margin.right);
    line.setAttribute('y1', level.y);
    line.setAttribute('y2', level.y);
    line.setAttribute('stroke', 'rgba(255,255,255,0.08)');
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);

    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', margin.left - 12);
    label.setAttribute('y', level.y + 4);
    label.setAttribute('fill', 'rgba(255,255,255,0.68)');
    label.setAttribute('font-size', '11');
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('font-family', 'Inter, system-ui, sans-serif');
    label.textContent = level.label;
    svg.appendChild(label);
  });

  const linePath = document.createElementNS(svgNS, 'path');
  let pathD = '';
  if (points.length > 0) {
    pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const current = points[i];
      const controlX = (prev.x + current.x) / 2;
      pathD += ` C ${controlX} ${prev.y} ${controlX} ${current.y} ${current.x} ${current.y}`;
    }
  }

  const areaPath = document.createElementNS(svgNS, 'path');
  if (points.length > 0) {
    const first = points[0];
    const last = points[points.length - 1];
    areaPath.setAttribute('d', `${pathD} L ${last.x} ${margin.top + innerHeight} L ${first.x} ${margin.top + innerHeight} Z`);
  }
  areaPath.setAttribute('fill', 'rgba(29, 155, 240, 0.14)');
  svg.appendChild(areaPath);

  linePath.setAttribute('d', pathD);
  linePath.setAttribute('fill', 'none');
  linePath.setAttribute('stroke', '#38bdf8');
  linePath.setAttribute('stroke-width', '3.5');
  linePath.setAttribute('stroke-linecap', 'round');
  linePath.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(linePath);

  const labelInterval = width < 520 ? 2 : 1;
  points.forEach((point, index) => {
    const marker = document.createElementNS(svgNS, 'circle');
    marker.setAttribute('cx', point.x);
    marker.setAttribute('cy', point.y);
    marker.setAttribute('r', '5');
    marker.setAttribute('fill', point.color);
    marker.setAttribute('stroke', '#111827');
    marker.setAttribute('stroke-width', '2');
    svg.appendChild(marker);

    if (index % labelInterval === 0 || index === points.length - 1) {
      const label = document.createElementNS(svgNS, 'text');
      label.setAttribute('x', point.x);
      label.setAttribute('y', height - margin.bottom + 22);
      label.setAttribute('fill', 'rgba(255,255,255,0.75)');
      label.setAttribute('font-size', width < 520 ? '10' : '11');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-family', 'Inter, system-ui, sans-serif');
      label.textContent = point.label;
      svg.appendChild(label);
    }
  });

  chart.appendChild(svg);

  const legend = document.createElement('div');
  legend.className = 'trend-legend';
  legend.innerHTML = `
    <span><span class="legend-swatch" style="background:#4ade80"></span>Present</span>
    <span><span class="legend-swatch" style="background:#facc15"></span>Late</span>
    <span><span class="legend-swatch" style="background:#f87171"></span>Absent</span>
  `;
  chart.appendChild(legend);
}

// Load full attendance history
async function loadFullAttendance() {
  const studentData = cachedStudentData || loadStudentData();
  if (!studentData) return;
  
  const fromDate = document.getElementById("attendanceFromDate").value;
  const toDate = document.getElementById("attendanceToDate").value;
  const statusFilter = document.getElementById("attendanceStatusFilter").value;
  
  let url = `${API_BASE}/api/student-attendance-full/?student_id=${studentData.student_id}`;
  if (fromDate) url += `&from_date=${fromDate}`;
  if (toDate) url += `&to_date=${toDate}`;
  if (statusFilter && statusFilter !== 'all') url += `&status=${statusFilter}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (response.ok) {
      const tbody = document.getElementById("fullAttendanceTableBody");
      tbody.innerHTML = "";
      
      if (data.records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-secondary);">No attendance records found</td></tr>';
      } else {
        data.records.forEach(record => {
          const row = document.createElement("tr");
          const date = new Date(record.date).toLocaleDateString();
          const timeIn = record.time_in ? new Date(record.time_in).toLocaleTimeString() : "-";
          const timeOut = record.time_out ? new Date(record.time_out).toLocaleTimeString() : "-";
          const statusClass = record.status.toLowerCase();
          
          row.innerHTML = `
            <td>${date}</td>
            <td>${record.session_code}</td>
            <td>${record.subject}</td>
            <td><span class="status-pill status-${statusClass}">${record.status}</span></td>
            <td>${timeIn}</td>
          `;
          tbody.appendChild(row);
        });
      }
    } else {
      showToast(data.error || "Failed to load attendance history", "error");
    }
  } catch (error) {
    showToast("Network error loading attendance history", "error");
  }
}

// Event listeners
const filterAttendanceBtn = document.getElementById("filterAttendanceBtn");
if (filterAttendanceBtn) {
  filterAttendanceBtn.addEventListener("click", loadFullAttendance);
}

const sidebarToggle = document.getElementById('sidebarToggle');
if (sidebarToggle) {
  sidebarToggle.addEventListener('click', () => { document.body.classList.toggle('mobile-nav-open'); });
}

document.querySelectorAll('.dash-sidebar .sidebar-nav-link, .dash-sidebar a').forEach(el => {
  el.addEventListener('click', () => { document.body.classList.remove('mobile-nav-open'); });
});

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
  loadDashboardData();
  loadFullAttendance();
});