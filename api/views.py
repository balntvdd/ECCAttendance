import base64
import csv
import io
import json
import re
import secrets
import string
from urllib.parse import unquote

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required, user_passes_test
from django.conf import settings
from django.db.models import Count, Q
from django.http import HttpResponse, JsonResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime, parse_time
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import BasePermission, IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_exempt #add

from .models import Attendance, SECTION_CHOICES, Session, Student, OTPVerification
from .utils import generate_keys, sign_message, verify_signature, send_otp_email, send_otp_email_async

try:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.units import inch
    from reportlab.pdfgen import canvas
except Exception:
    letter = None
    inch = None
    canvas = None


class IsStaffUser(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_staff)


def staff_required(view_func):
    return login_required(user_passes_test(lambda user: user.is_staff, login_url="/portal/login/")(view_func))


def serialize_session(session):
    schedule_info = session.get_schedule_info()
    return {
        "session_code": session.session_code,
        "section": session.section,
        "subject": session.subject or "General Session",
        "date": session.date.isoformat(),
        "status": session.status,
        "time_status": schedule_info["current_status"],
        "schedule": {
            "start_time": schedule_info["start_time"],
            "attendance_deadline": schedule_info["attendance_deadline"],
            "late_cutoff": schedule_info["late_cutoff"],
            "final_end": schedule_info["final_end"],
        },
        "time_in_start": session.time_in_start.strftime("%H:%M"),
        "time_in_end": session.time_in_end.strftime("%H:%M"),
        "time_out_start": session.time_out_start.strftime("%H:%M"),
        "created_by": session.created_by.get_username() if session.created_by else "System",
    }


def get_filtered_sessions(request):
    sessions = Session.objects.all()
    section = request.GET.get("section")
    date = parse_date(request.GET.get("date") or "")

    if section:
        sessions = sessions.filter(section=section)
    if date:
        sessions = sessions.filter(date=date)
    return sessions


def build_session_summary(session):
    students = Student.objects.filter(section=session.section).order_by("student_id")
    attendance_map = {
        record.student_id: record
        for record in Attendance.objects.select_related("student").filter(session=session)
    }

    present = []
    late = []
    absent = []

    for student in students:
        record = attendance_map.get(student.id)
        if not record or not record.time_in:
            absent.append(student)
            continue
        item = {
            "student_id": student.student_id,
            "name": student.name,
            "section": student.section,
            "time_in": timezone.localtime(record.time_in).strftime("%Y-%m-%d %I:%M %p"),
            "time_out": timezone.localtime(record.time_out).strftime("%Y-%m-%d %I:%M %p") if record.time_out else "",
            "status": record.status,
        }
        if record.status == "LATE":
            late.append(item)
        else:
            present.append(item)

    absent_payload = [
        {
            "student_id": student.student_id,
            "name": student.name,
            "section": student.section,
        }
        for student in absent
    ]

    return {
        "session": serialize_session(session),
        "counts": {
            "present": len(present),
            "late": len(late),
            "absent": len(absent_payload),
            "total_students": students.count(),
        },
        "present": present,
        "late": late,
        "absent": absent_payload,
    }


def render_report_rows(summary):
    rows = []
    for key in ("present", "late", "absent"):
        entries = summary[key]
        if not entries:
            continue
        for entry in entries:
            rows.append(
                {
                    "session_code": summary["session"]["session_code"],
                    "date": summary["session"]["date"],
                    "section": entry["section"],
                    "student_id": entry["student_id"],
                    "name": entry["name"],
                    "status": key.upper(),
                    "time_in": entry.get("time_in", ""),
                    "time_out": entry.get("time_out", ""),
                }
            )
    return rows


def parse_section_details(section):
    match = re.match(r"^(?P<course>[A-Z]+)-(?P<year>\d)(?P<section>[A-Z])$", section or "")
    if not match:
        return {
            "course": section or "N/A",
            "year_level": "N/A",
            "section_label": section or "N/A",
        }

    year = int(match.group("year"))
    suffix = "th"
    if year == 1:
        suffix = "st"
    elif year == 2:
        suffix = "nd"
    elif year == 3:
        suffix = "rd"

    return {
        "course": match.group("course"),
        "year_level": f"{year}{suffix} Year",
        "section_label": f"{match.group('year')}{match.group('section')}",
    }


def serialize_student(student):
    section_details = parse_section_details(student.section)
    return {
        "student_id": student.student_id,
        "full_name": student.name,
        "course": section_details["course"],
        "year_level": section_details["year_level"],
        "section": student.section,
        "section_label": section_details["section_label"],
        "email": "",
        "date_registered": timezone.localtime(student.registered_at).strftime("%Y-%m-%d %I:%M %p"),
        "status": "Registered",
    }


def build_basic_pdf(lines, title="Attendance Report"):
    def escape_pdf_text(value):
        return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    page_width = 612
    page_height = 792
    margin = 40
    line_height = 14
    usable_height = page_height - (margin * 2)
    lines_per_page = max(1, int(usable_height // line_height))

    pages = []
    for start in range(0, len(lines), lines_per_page):
        pages.append(lines[start : start + lines_per_page])
    if not pages:
        pages = [[]]

    objects = []
    page_ids = []
    content_ids = []
    font_id = 3

    next_object_id = 4
    for _ in pages:
        page_ids.append(next_object_id)
        next_object_id += 1
        content_ids.append(next_object_id)
        next_object_id += 1

    objects.append((1, "<< /Type /Catalog /Pages 2 0 R >>"))
    objects.append((2, f"<< /Type /Pages /Kids [{' '.join(f'{page_id} 0 R' for page_id in page_ids)}] /Count {len(page_ids)} >>"))
    objects.append((font_id, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"))

    for page_id, content_id, page_lines in zip(page_ids, content_ids, pages):
        objects.append(
            (
                page_id,
                f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_width} {page_height}] "
                f"/Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>",
            )
        )

        text_commands = ["BT", "/F1 12 Tf", f"1 0 0 1 {margin} {page_height - margin} Tm", f"({escape_pdf_text(title)}) Tj"]
        current_y_offset = line_height * 2
        for line in page_lines:
            safe_line = escape_pdf_text(line)
            text_commands.append(f"1 0 0 1 {margin} {page_height - margin - current_y_offset} Tm")
            text_commands.append(f"({safe_line}) Tj")
            current_y_offset += line_height
        text_commands.append("ET")
        stream = "\n".join(text_commands).encode("latin-1", errors="replace")
        objects.append((content_id, f"<< /Length {len(stream)} >>\nstream\n{stream.decode('latin-1')}\nendstream"))

    pdf = io.BytesIO()
    pdf.write(b"%PDF-1.4\n")
    offsets = {}
    for object_id, body in objects:
        offsets[object_id] = pdf.tell()
        pdf.write(f"{object_id} 0 obj\n{body}\nendobj\n".encode("latin-1"))

    xref_offset = pdf.tell()
    max_object_id = max(object_id for object_id, _ in objects)
    pdf.write(f"xref\n0 {max_object_id + 1}\n".encode("latin-1"))
    pdf.write(b"0000000000 65535 f \n")
    for object_id in range(1, max_object_id + 1):
        pdf.write(f"{offsets[object_id]:010d} 00000 n \n".encode("latin-1"))
    pdf.write(
        (
            f"trailer\n<< /Size {max_object_id + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF"
        ).encode("latin-1")
    )
    return pdf.getvalue()


def portal_login_view(request):
    if request.user.is_authenticated and request.user.is_staff:
        return redirect("portal-dashboard")
    return render(request, "portal_login.html", {"sections": SECTION_CHOICES})


@staff_required
def portal_dashboard_view(request):
    return render(request, "portal_dashboard.html", {"sections": SECTION_CHOICES})


def student_dashboard_view(request):
    return render(request, "student_dashboard.html", {"sections": SECTION_CHOICES})


@api_view(["GET"])
@permission_classes([AllowAny])
def student_attendance(request):
    """Get attendance data for a specific student."""
    student_id = request.GET.get("student_id")
    if not student_id:
        return Response({"error": "Student ID is required"}, status=400)
    
    try:
        student = Student.objects.get(student_id=student_id)
    except Student.DoesNotExist:
        return Response({"error": "Student not found"}, status=404)
    
    # Build session-aware attendance stats starting from the student's registration date.
    sessions = Session.objects.filter(
        section=student.section,
        date__gte=student.registered_at.date(),
    ).order_by('-date', '-start_time')

    attendance_records = Attendance.objects.filter(
        student=student,
        session__in=sessions,
    ).select_related('session').order_by('-session__date', '-session__start_time')

    session_ids = set(attendance_records.values_list('session_id', flat=True))
    absent_sessions = sessions.exclude(id__in=session_ids)

    total_present = attendance_records.filter(status='PRESENT').count()
    total_late = attendance_records.filter(status='LATE').count()
    total_absent = absent_sessions.count()
    total_sessions = sessions.count()

    attendance_percentage = 0
    if total_sessions > 0:
        attendance_percentage = round(((total_present + total_late) / total_sessions) * 100, 1)

    # Recent logs (last 10 sessions)
    recent_logs = []
    seen = 0
    for session in sessions:
        if seen >= 10:
            break
        record = next((r for r in attendance_records if r.session_id == session.id), None)
        status = record.status if record else 'ABSENT'
        recent_logs.append({
            "date": session.date.isoformat(),
            "session_code": session.session_code,
            "status": status,
            "time_in": record.time_in.isoformat() if record and record.time_in else None,
        })
        seen += 1

    # Trend data for the most recent sessions
    trend_sessions = list(sessions[:6])[::-1]
    trend = []
    for session in trend_sessions:
        record = next((r for r in attendance_records if r.session_id == session.id), None)
        trend.append({
            "label": session.date.strftime("%b %d"),
            "session_code": session.session_code,
            "status": record.status if record else 'ABSENT',
        })

    return Response({
        "student": {
            "student_id": student.student_id,
            "name": student.name,
            "section": student.section,
            "favorite_teacher": student.favorite_teacher,
            "device_fingerprint": student.device_fingerprint,
            "registered_at": student.registered_at.isoformat(),
        },
        "stats": {
            "total_present": total_present,
            "total_late": total_late,
            "total_absent": total_absent,
            "attendance_percentage": attendance_percentage,
            "total_sessions": total_sessions,
        },
        "recent_logs": recent_logs,
        "trend": trend,
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def student_attendance_full(request):
    """Get full attendance history for a specific student with filters."""
    student_id = request.GET.get("student_id")
    from_date_raw = request.GET.get("from_date")
    to_date_raw = request.GET.get("to_date")
    from_date = parse_date(from_date_raw) if from_date_raw else None
    to_date = parse_date(to_date_raw) if to_date_raw else None
    status_filter = request.GET.get("status")
    
    if not student_id:
        return Response({"error": "Student ID is required"}, status=400)
    
    try:
        student = Student.objects.get(student_id=student_id)
    except Student.DoesNotExist:
        return Response({"error": "Student not found"}, status=404)
    
    # Get sessions and attendance history starting at the student's registration date.
    base_sessions = Session.objects.filter(
        section=student.section,
        date__gte=student.registered_at.date(),
    ).select_related().order_by('-date', '-start_time')

    if from_date:
        base_sessions = base_sessions.filter(date__gte=from_date)
    if to_date:
        base_sessions = base_sessions.filter(date__lte=to_date)

    attendance_records = Attendance.objects.filter(
        student=student,
        session__in=base_sessions,
    ).select_related('session')

    record_map = {record.session_id: record for record in attendance_records}

    # Build fully accurate attendance history including absences.
    records = []
    for session in base_sessions:
        record = record_map.get(session.id)
        status = record.status if record else 'ABSENT'
        if status_filter and status_filter != 'all':
            if status_filter == 'present' and status != 'PRESENT':
                continue
            if status_filter == 'late' and status != 'LATE':
                continue
            if status_filter == 'absent' and status != 'ABSENT':
                continue
        records.append({
            "date": session.date.isoformat(),
            "session_code": session.session_code,
            "subject": session.subject or "General Session",
            "status": status,
            "time_in": record.time_in.isoformat() if record and record.time_in else None,
            "time_out": record.time_out.isoformat() if record and record.time_out else None,
        })

    return Response({
        "student_id": student.student_id,
        "records": records,
        "total": len(records),
    })


def student_portal_view(request):
    return render(request, "student.html", {"sections": SECTION_CHOICES})


def landing_view(request):
    """Render the public landing page (index)."""
    return render(request, "index.html", {"sections": SECTION_CHOICES})

@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def api_login(request):
    username = request.data.get("username", "").strip()
    password = request.data.get("password", "")

    user = authenticate(username=username, password=password)
    if user is None:
        return Response({"error": "Invalid credentials"}, status=400)
    if not user.is_staff:
        return Response({"error": "Admin or teacher access only"}, status=403)

    login(request, user)
    return Response(
        {
            "success": True,
            "user": {
                "username": user.get_username(),
                "is_superuser": user.is_superuser,
            },
        }
    )


@csrf_exempt
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def api_logout(request):
    logout(request)
    return Response({"success": True})


@api_view(["GET"])
@permission_classes([AllowAny])
def check_student_exists(request):
    student_id = str(request.query_params.get("student_id", "")).strip()
    if not student_id:
        return Response({"error": "Student ID is required"}, status=400)

    try:
        Student.objects.get(student_id=student_id)
    except Student.DoesNotExist:
        return Response({"error": "Student not found"}, status=404)

    return Response({"exists": True, "student_id": student_id})


@api_view(["GET"])
@permission_classes([AllowAny])
def portal_bootstrap(request):
    # Provide explicit diagnostics for unauthenticated/unauthorized requests
    user = getattr(request, 'user', None)
    if user is None or not getattr(user, 'is_authenticated', False):
        return Response(
            {
                "error": "Not authenticated",
                "detail": "Session cookie missing or not sent. Ensure frontend uses credentials: 'include' and that SameSite=None is set for cookies.",
            },
            status=401,
        )
    if not getattr(user, 'is_staff', False):
        return Response({"error": "Staff only", "detail": "User is not staff."}, status=403)
    
    # Get sessions, filtering out completely ended sessions
    all_sessions = Session.objects.all()
    
    # Find first active session (not CLOSED and not ENDED)
    active_session = None
    for session in all_sessions:
        if session.status != "CLOSED" and session.get_time_status() != "ENDED":
            active_session = session
            break
    
    sessions = list(all_sessions[:12])
    session = active_session or (sessions[0] if sessions else None)

    payload = {
        "user": {
            "username": request.user.get_username(),
            "is_superuser": request.user.is_superuser,
        },
        "sections": [choice[0] for choice in SECTION_CHOICES],
        "sessions": [serialize_session(item) for item in sessions],
        "selected_session": build_session_summary(session) if session else None,
    }
    return Response(payload)


@api_view(["GET", "POST"]) 
@permission_classes([AllowAny])
def debug_request(request):
    # Return cookies and a subset of headers to help diagnose why cookies
    # are not being sent from the browser (SameSite, CORS, host mismatch).
    headers = {k: v for k, v in request.META.items() if k.startswith("HTTP_")}
    try:
        session_items = dict(request.session.items())
    except Exception:
        session_items = {}
    return Response(
        {
            "cookies": request.COOKIES,
            "session": session_items,
            "headers": headers,
        }
    )


@api_view(["POST"])
@csrf_exempt
@permission_classes([AllowAny])
def register_student(request):
    student_id = str(request.data.get("student_id", "")).strip()
    name = request.data.get("name", "").strip()
    email = str(request.data.get("email", "")).strip().lower()
    section = request.data.get("section")
    favorite_teacher = str(request.data.get("favorite_teacher", "")).strip()
    device_fingerprint = str(request.data.get("device_fingerprint", "")).strip()

    if not all([student_id, name, section, favorite_teacher]):
        return Response({"error": "Student ID, full name, section, and favorite teacher are required"}, status=400)

    if not device_fingerprint:
        return Response({"error": "Device fingerprint is required for device binding security"}, status=400)

    # Validate favorite teacher field
    if len(favorite_teacher) < 2 or len(favorite_teacher) > 100:
        return Response({"error": "Favorite teacher name must be between 2 and 100 characters"}, status=400)

    allowed_sections = [item[0] for item in SECTION_CHOICES]
    if section not in allowed_sections:
        return Response({"error": "Invalid section"}, status=400)

    if not re.match(r"^\d{1,10}$", student_id):
        return Response({"error": "Student ID must be numeric and up to 10 digits"}, status=400)

    if Student.objects.filter(student_id=student_id).exists():
        return Response({"error": "Student is already registered"}, status=400)

    # Normalize and check for duplicate names
    def normalize_name(n):
        return " ".join(n.upper().split())
    
    normalized_input_name = normalize_name(name)
    if Student.objects.values_list('name', flat=True).exists():
        for existing_student in Student.objects.all():
            if normalize_name(existing_student.name) == normalized_input_name:
                return Response({"error": "A student with this name is already registered"}, status=400)

    if len(name) < 3 or re.search(r"\d", name):
        return Response({"error": "Enter a valid full name"}, status=400)
    if not re.match(r"^[A-Za-z ./'\-]+$", name):
        return Response({"error": "Name contains unsupported characters"}, status=400)

    name_parts = [part for part in re.split(r"\s+", name) if part and part not in ("JR.", "SR.", "III", "IV", "II", "V")]
    if len(name_parts) < 2:
        return Response({"error": "Please enter first and last name"}, status=400)

    private_key, public_key = generate_keys()
    student = Student.objects.create(
        student_id=student_id,
        name=name,
        email=email if email else None,
        section=section,
        public_key=public_key,
        private_key=private_key,
        device_fingerprint=device_fingerprint,
        favorite_teacher=favorite_teacher,
    )

    return Response(
        {
            "message": "Registered successfully",
            "student": {
                "student_id": student.student_id,
                "name": student.name,
                "section": student.section,
            },
        }
    )



@csrf_exempt
@api_view(["POST"])
@permission_classes([IsAuthenticated, IsStaffUser])
def start_session(request):
    section = request.data.get("section")
    subject = (request.data.get("subject") or "").strip()
    time_in_start = request.data.get("time_in_start")
    time_in_end = request.data.get("time_in_end")
    time_out_start = request.data.get("time_out_start")

    if not all([section, time_in_start, time_in_end, time_out_start]):
        return Response({"error": "Section and session times are required"}, status=400)

    allowed_sections = [item[0] for item in SECTION_CHOICES]
    if section not in allowed_sections:
        return Response({"error": "Invalid section"}, status=400)

    parsed_time_in_start = parse_time(time_in_start)
    parsed_time_in_end = parse_time(time_in_end)
    parsed_time_out_start = parse_time(time_out_start)

    if not all([parsed_time_in_start, parsed_time_in_end, parsed_time_out_start]):
        return Response({"error": "Invalid time format"}, status=400)

    if not (parsed_time_in_start < parsed_time_in_end < parsed_time_out_start):
        return Response({"error": "Session time flow must be start < late threshold < time out"}, status=400)

    # Let the model generate a unique session code
    session = Session.objects.create(
        section=section,
        subject=subject,
        time_in_start=parsed_time_in_start,
        time_in_end=parsed_time_in_end,
        time_out_start=parsed_time_out_start,
        created_by=request.user,
    )

    return Response({"message": "Session created", "session": serialize_session(session)})


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsStaffUser])
def list_sessions(request):
    sessions = get_filtered_sessions(request)[:50]
    return Response({"sessions": [serialize_session(session) for session in sessions]})


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsStaffUser])
def list_students(request):
    section = (request.GET.get("section") or "").strip()
    query = (request.GET.get("q") or "").strip()

    students = Student.objects.all().order_by("-registered_at", "student_id")
    if section:
        students = students.filter(section=section)
    if query:
        students = students.filter(Q(student_id__icontains=query) | Q(name__icontains=query))

    students = list(students[:300])
    return Response(
        {
            "students": [serialize_student(student) for student in students],
            "total": len(students),
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsStaffUser])
def session_dashboard(request):
    session_code = request.GET.get("session_code")
    sessions = get_filtered_sessions(request)

    selected = None
    if session_code:
        selected = sessions.filter(session_code=session_code).first()
        if not selected:
            return Response({"error": "Session not found"}, status=404)
    else:
        selected = sessions.first()

    aggregate = Session.objects.values("section").annotate(total=Count("id")).order_by("section")
    summary = build_session_summary(selected) if selected else None

    return Response(
        {
            "sessions": [serialize_session(session) for session in sessions[:25]],
            "section_totals": list(aggregate),
            "selected_session": summary,
        }
    )


@api_view(["POST"])
@csrf_exempt
@permission_classes([AllowAny])
def generate_qr(request):
    student_id = str(request.data.get("student_id", "")).strip()
    session_code = str(request.data.get("session_code", "")).strip().upper()
    device_fingerprint = str(request.data.get("device_fingerprint", "")).strip()

    if not all([student_id, session_code]):
        return Response({"error": "Session code and student ID are required"}, status=400)

    try:
        student = Student.objects.get(student_id=student_id)
    except Student.DoesNotExist:
        return Response({"error": "Student not found"}, status=404)

    # Device binding check
    if student.device_fingerprint and student.device_fingerprint != device_fingerprint:
        # Check if temporarily authorized for this session
        if request.session.get('temp_authorized_student_id') != student.student_id:
            # Device mismatch - trigger OTP verification
            return Response(
                {
                    "error": "Device mismatch",
                    "device_mismatch": True,
                    "message": "This device is not registered. OTP verification required.",
                },
                status=403
            )

    session = Session.objects.filter(session_code=session_code, status="ACTIVE").first()
    if not session:
        return Response({"error": "Session not found or already closed"}, status=400)
    if student.section != session.section:
        return Response({"error": "Student section does not match the selected session"}, status=400)

    # Use the server-side private key associated with this registered student.
    private_key = student.private_key
    if not private_key:
        return Response({"error": "Server-side key not available for QR generation."}, status=500)

    timestamp = timezone.now().isoformat()
    message = f"{student_id}|{student.section}|{session.session_code}|{timestamp}"

    try:
        signature = sign_message(private_key, message)
    except Exception:
        return Response({"error": "QR generation failed due to invalid server key"}, status=500)

    raw_payload = f"{student_id}|{student.section}|{session.session_code}|{timestamp}|{signature}"
    return Response(
        {
            "student_id": student_id,
            "section": student.section,
            "session_code": session.session_code,
            "timestamp": timestamp,
            "signature": signature,
            "raw_payload": raw_payload,
        }
    )


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def validate_qr(request):
    """Validate that QR code is not older than 30 seconds (anti-screenshot)."""
    raw_payload = str(request.data.get("raw_payload", "")).strip()
    student_id = str(request.data.get("student_id", "")).strip()
    
    if not raw_payload or not student_id:
        return Response({"error": "QR payload and student ID are required"}, status=400)
    
    # Parse the payload: student_id|section|session_code|timestamp|signature
    try:
        parts = raw_payload.split("|")
        if len(parts) != 5:
            return Response({"error": "Invalid QR payload format"}, status=400)
        
        qr_timestamp_str = parts[3]
        qr_timestamp = parse_datetime(qr_timestamp_str)
        
        if not qr_timestamp:
            return Response({"error": "Invalid timestamp in QR code"}, status=400)
        
        # Make timezone-aware if needed
        if qr_timestamp.tzinfo is None:
            qr_timestamp = timezone.make_aware(qr_timestamp)
        
        current_time = timezone.now()
        time_diff = (current_time - qr_timestamp).total_seconds()
        
        # QR code must be fresher than 30 seconds
        if time_diff > 30:
            return Response(
                {
                    "valid": False,
                    "error": "QR code has expired. Please generate a new one.",
                    "age_seconds": int(time_diff),
                },
                status=400
            )
        
        seconds_remaining = 30 - int(time_diff)
        return Response(
            {
                "valid": True,
                "message": "QR code is valid",
                "age_seconds": int(time_diff),
                "seconds_remaining": seconds_remaining,
            }
        )
    except Exception as e:
        return Response(
            {"error": f"Error validating QR code: {str(e)}"},
            status=400
        )


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def generate_otp(request):
    """Generate OTP for device binding verification and send via email."""
    try:
        student_id = str(request.data.get("student_id", "")).strip()
        device_fingerprint = str(request.data.get("device_fingerprint", "")).strip()

        if not student_id or not device_fingerprint:
            return Response({"error": "Student ID and device fingerprint are required"}, status=400)

        try:
            student = Student.objects.get(student_id=student_id)
        except Student.DoesNotExist:
            return Response({"error": "Student not found"}, status=404)
        
        if not student.email:
            return Response(
                {"error": "Student email not found. Please register with your email address first."},
                status=400
            )

        email = str(request.data.get("email", "")).strip().lower()
        favorite_teacher = str(request.data.get("favorite_teacher", "")).strip()

        if not email or not favorite_teacher:
            return Response(
                {"error": "Email and favorite teacher are required to send the verification code."},
                status=400
            )

        if student.email.strip().lower() != email:
            return Response(
                {"error": "The email does not match the registered account."},
                status=400
            )

        if not student.favorite_teacher or student.favorite_teacher.strip().lower() != favorite_teacher.strip().lower():
            return Response(
                {"error": "Favorite teacher does not match our records."},
                status=400
            )

        # Generate a 6-digit OTP
        otp_code = "".join(secrets.choice(string.digits) for _ in range(6))
        
        # Create OTP record with 2-minute expiry
        expires_at = timezone.now() + timezone.timedelta(minutes=2)
        otp_obj = OTPVerification.objects.create(
            student=student,
            device_fingerprint=device_fingerprint,
            otp_code=otp_code,
            expires_at=expires_at,
        )

        # Send OTP via email in a background thread so the request stays responsive.
        send_otp_email_async(student.email, student.name, otp_code)

        try:
            masked_email = f"{student.email[:2]}***@{student.email.split('@')[1]}"
        except Exception:
            masked_email = student.email

        response_data = {
            "message": "OTP has been sent to your registered email address",
            "otp_id": otp_obj.id,
            "expires_in_seconds": 120,
            "masked_email": masked_email,
        }

        if settings.DEBUG:
            response_data["otp_code"] = otp_code  # For local development and testing
        
        return Response(response_data)
    except Exception as exc:
        import traceback
        traceback.print_exc()
        return Response(
            {
                "error": "Server error generating OTP.",
                "details": str(exc) if settings.DEBUG else "Internal server error",
            },
            status=500,
        )


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def verify_otp(request):
    """Verify OTP and favorite teacher, then temporarily authorize device for current session."""
    student_id = str(request.data.get("student_id", "")).strip()
    device_fingerprint = str(request.data.get("device_fingerprint", "")).strip()
    otp_code = str(request.data.get("otp_code", "")).strip()
    favorite_teacher = str(request.data.get("favorite_teacher", "")).strip()

    if not all([student_id, device_fingerprint, otp_code, favorite_teacher]):
        return Response({"error": "Student ID, device fingerprint, OTP code, and favorite teacher are required"}, status=400)

    if not re.match(r"^\d{6}$", otp_code):
        return Response({"error": "OTP must be a 6-digit number"}, status=400)

    try:
        student = Student.objects.get(student_id=student_id)
    except Student.DoesNotExist:
        return Response({"error": "Student not found"}, status=404)

    # Find OTP record for this device
    otp_obj = OTPVerification.objects.filter(
        student=student,
        device_fingerprint=device_fingerprint,
    ).first()

    if not otp_obj:
        return Response({"error": "No OTP request found for this device"}, status=400)

    # Check if OTP is expired
    if otp_obj.is_expired():
        otp_obj.delete()
        return Response(
            {"error": "OTP has expired. Please request a new one."},
            status=400
        )

    # Check attempt limit
    if otp_obj.attempt_count >= 5:
        otp_obj.delete()
        return Response(
            {"error": "Too many failed attempts. Please request a new OTP."},
            status=429
        )

    # Check if OTP code matches
    if otp_obj.otp_code != otp_code:
        otp_obj.attempt_count += 1
        otp_obj.save()
        
        attempts_left = 5 - otp_obj.attempt_count
        return Response(
            {
                "error": "Invalid OTP code",
                "attempts_left": attempts_left,
            },
            status=400
        )

    # OTP verified - now check favorite teacher
    if not student.favorite_teacher or favorite_teacher.strip().lower() != student.favorite_teacher.strip().lower():
        return Response(
            {"error": "Favorite teacher does not match. Device verification failed."},
            status=400
        )

    # Both OTP and favorite teacher verified - temporarily authorize device for this session
    otp_obj.verified = True
    otp_obj.save()
    
    # Set temporary session authorization (DO NOT bind device permanently)
    request.session['temp_authorized_student_id'] = student.student_id

    return Response(
        {
            "message": "Device temporarily authorized for this session",
            "student_id": student.student_id,
            "temporary_authorization": True,
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def clear_temp_auth(request):
    """Clear temporary authorization on page refresh."""
    if 'temp_authorized_student_id' in request.session:
        del request.session['temp_authorized_student_id']
    return Response({"message": "Temporary authorization cleared"})


@csrf_exempt
@api_view(["POST"])
@permission_classes([IsAuthenticated, IsStaffUser])
def verify_attendance(request):
    raw = request.data.get("raw")
    session_code_override = request.data.get("session_code")

    if not raw:
        return Response({"error": "No QR data provided"}, status=400)

    parts = raw.strip().split("|")
    if len(parts) < 5:
        return Response({"error": "Invalid QR format"}, status=400)

    student_id, section, session_code, timestamp = parts[:4]
    signature = unquote("|".join(parts[4:])).replace(" ", "+")

    if session_code_override and session_code != session_code_override:
        return Response({"error": "QR belongs to a different session"}, status=400)

    try:
        student = Student.objects.get(student_id=student_id)
    except Student.DoesNotExist:
        return Response({"error": "Student not found"}, status=400)

    # Updated to check for ACTIVE status but also get the session to check time-based status
    session = Session.objects.filter(session_code=session_code).first()
    if not session:
        return Response({"error": "Invalid session"}, status=400)
    
    if session.status == "CLOSED":
        return Response({"error": "Session is closed"}, status=400)
    
    if student.section != session.section:
        return Response({"error": "Section mismatch"}, status=400)

    qr_time = parse_datetime(timestamp)
    if not qr_time:
        return Response({"error": "Invalid timestamp"}, status=400)
    if qr_time.tzinfo is None:
        qr_time = timezone.make_aware(qr_time)

    now = timezone.localtime()
    
    # Check if QR is within 30 seconds (anti-screenshot system)
    qr_age_seconds = (now - qr_time).total_seconds()
    if qr_age_seconds < -5:  # Allow 5 seconds of clock skew
        return Response({"error": "QR timestamp is in the future. Check device clock."}, status=400)
    if qr_age_seconds > 30:
        return Response(
            {
                "error": "QR code has expired. Please generate a fresh QR pass.",
                "qr_age_seconds": int(qr_age_seconds),
            },
            status=400
        )
    
    # Check if QR is within session validity window (3 hours)
    if abs(qr_age_seconds) > 10800:
        return Response({"error": "QR expired"}, status=400)

    message = f"{student_id}|{section}|{session_code}|{timestamp}"
    if not verify_signature(student.public_key, message, signature):
        return Response({"error": "Invalid signature"}, status=400)

    now_time = now.time()
    
    # Check session status based on current time
    session_time_status = session.get_time_status()
    attendance = Attendance.objects.filter(student=student, session=session).first()

    # Session hasn't started yet
    if now_time < session.time_in_start:
        return Response({"error": "Session has not started yet"}, status=400)

    # Session has ended completely (no operations allowed after session ends)
    if session_time_status == "ENDED":
        return Response({
            "error": "Session Ended",
            "detail": "This session is no longer active. No attendance can be recorded.",
        }, status=400)
    
    # Determine if this is a time-in or time-out based on timeout window
    if now_time < session.time_out_start:
        # Time-in phase (either on-time or late)
        if attendance:
            return Response({"error": "This student already Time In."}, status=400)

        # Determine if marking as PRESENT or LATE
        status = "PRESENT" if now_time <= session.time_in_end else "LATE"
        
        # Show alert if late window
        detail = None
        if status == "LATE":
            detail = f"Late window is open until {session.time_out_start.strftime('%H:%M')}"
        
        attendance = Attendance.objects.create(
            student=student,
            session=session,
            time_in=now,
            status=status,
        )
        
        response_data = {
            "message": f"{status.title()} time-in recorded",
            "student": student.name,
            "student_id": student.student_id,
            "section": student.section,
            "session_code": session.session_code,
            "status": status,
            "time": attendance.time_in.isoformat(),
        }
        if detail:
            response_data["detail"] = detail
        
        return Response(response_data)

    # Time-out phase
    if not attendance:
        return Response({"error": "No time-in record found for this session"}, status=400)
    if attendance.time_out:
        return Response({"error": "Student already timed out for this session"}, status=400)

    attendance.time_out = now
    attendance.save(update_fields=["time_out"])
    return Response(
        {
            "message": "Time-out recorded",
            "student": student.name,
            "student_id": student.student_id,
            "section": student.section,
            "session_code": session.session_code,
            "status": attendance.status,
            "time": attendance.time_out.isoformat(),
        }
    )


def format_name_surname_first(full_name):
    """Convert 'FIRSTNAME MIDDLE LASTNAME [SUFFIX]' to 'LASTNAME, FIRSTNAME'"""
    if not full_name:
        return full_name
    
    parts = full_name.strip().split()
    if not parts:
        return full_name
    
    suffixes = {"JR", "JR.", "SR", "SR.", "III", "IV", "II", "V", "VI", "VII", "VIII", "IX", "X"}
    
    while parts and parts[-1].upper() in suffixes:
        parts.pop()
    
    if len(parts) == 1:
        return parts[0]
    
    surname = parts[-1]
    firstname = parts[0]
    return f"{surname}, {firstname}"


def extract_surname_for_sorting(full_name):
    """Extract surname from name for alphabetical sorting"""
    if not full_name:
        return ""
    
    parts = full_name.strip().split()
    if not parts:
        return ""
    
    suffixes = {"JR", "JR.", "SR", "SR.", "III", "IV", "II", "V", "VI", "VII", "VIII", "IX", "X"}
    
    while parts and parts[-1].upper() in suffixes:
        parts.pop()
    
    return parts[-1] if parts else ""


def export_attendance_report(request):
    if request.method != "GET":
        return JsonResponse({"detail": 'Method "%s" not allowed.' % request.method}, status=405)
    if not request.user.is_authenticated:
        return JsonResponse({"detail": "Authentication credentials were not provided."}, status=403)
    if not request.user.is_staff:
        return JsonResponse({"detail": "You do not have permission to perform this action."}, status=403)

    session_code = request.GET.get("session_code")
    export_format = (request.GET.get("format") or "csv").lower()
    sessions = get_filtered_sessions(request)

    if session_code:
        sessions = sessions.filter(session_code=session_code)
    sessions = list(sessions[:50])
    if not sessions:
        return JsonResponse({"error": "No matching sessions found"}, status=404)

    summaries = [build_session_summary(session) for session in sessions]
    rows = []
    for summary in summaries:
        rows.extend(render_report_rows(summary))
    
    # Format names as SURNAME, FIRSTNAME and sort by surname
    for row in rows:
        row['name'] = format_name_surname_first(row['name'])
    rows.sort(key=lambda r: extract_surname_for_sorting(r['name']).upper())
    
    # Generate filename based on first session (when specific session is downloaded)
    filename_base = "attendance-report"
    if session_code and sessions:
        session = sessions[0]
        date_obj = parse_date(session.date) if isinstance(session.date, str) else session.date
        if date_obj:
            date_str = date_obj.strftime("%m/%d/%Y")
            subject = session.subject or "General"
            filename_base = f"{session_code}-{subject}-{date_str}"

    if export_format == "pdf":
        if canvas is not None:
            buffer = io.BytesIO()
            pdf = canvas.Canvas(buffer, pagesize=letter)
            width, height = letter
            margin = 0.55 * inch
            y = height - margin

            pdf.setFont("Helvetica-Bold", 16)
            pdf.drawString(margin, y, "Attendance Report")
            y -= 0.28 * inch
            pdf.setFont("Helvetica", 10)
            pdf.drawString(margin, y, f"Generated: {timezone.localtime().strftime('%Y-%m-%d %I:%M %p')}")
            y -= 0.24 * inch

            for summary in summaries:
                pdf.setFont("Helvetica-Bold", 12)
                session_title = f"{summary['session']['session_code']} | {summary['session']['section']} | {summary['session']['date']}"
                pdf.drawString(margin, y, session_title)
                y -= 0.2 * inch
                pdf.setFont("Helvetica", 10)

                for group in ("present", "late", "absent"):
                    entries = summary[group]
                    if not entries:
                        continue
                    pdf.drawString(margin + 8, y, group.title())
                    y -= 0.16 * inch
                    for entry in entries:
                        formatted_name = format_name_surname_first(entry['name'])
                        line = f"{entry['student_id']} | {formatted_name}"
                        if entry.get("time_in"):
                            line += f" | IN {entry['time_in']}"
                        if entry.get("time_out"):
                            line += f" | OUT {entry['time_out']}"
                        pdf.drawString(margin + 18, y, line[:110])
                        y -= 0.16 * inch
                        if y < margin + 40:
                            pdf.showPage()
                            y = height - margin
                            pdf.setFont("Helvetica", 10)
                    y -= 0.1 * inch

                if y < margin + 80:
                    pdf.showPage()
                    y = height - margin

            pdf.save()
            pdf_bytes = buffer.getvalue()
        else:
            pdf_lines = [f"Generated: {timezone.localtime().strftime('%Y-%m-%d %I:%M %p')}", ""]
            for summary in summaries:
                pdf_lines.append(
                    f"{summary['session']['session_code']} | {summary['session']['section']} | {summary['session']['date']}"
                )
                for group in ("present", "late", "absent"):
                    entries = summary[group]
                    if not entries:
                        continue
                    pdf_lines.append(f"  {group.title()}")
                    for entry in entries:
                        formatted_name = format_name_surname_first(entry['name'])
                        line = f"    {entry['student_id']} | {formatted_name}"
                        if entry.get("time_in"):
                            line += f" | IN {entry['time_in']}"
                        if entry.get("time_out"):
                            line += f" | OUT {entry['time_out']}"
                        pdf_lines.append(line[:110])
                pdf_lines.append("")
            pdf_bytes = build_basic_pdf(pdf_lines)

        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{filename_base}.pdf"'
        return response

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=["session_code", "date", "section", "student_id", "name", "status", "time_in", "time_out"],
    )
    writer.writeheader()
    writer.writerows(rows)

    response = HttpResponse(output.getvalue(), content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="{filename_base}.csv"'
    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsStaffUser])
def session_report(request, session_code):
    session = Session.objects.filter(session_code=session_code).first()
    if not session:
        return Response({"error": "Session not found"}, status=404)
    return Response(build_session_summary(session))