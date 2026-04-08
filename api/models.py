import secrets
import string

from django.conf import settings
from django.db import models
from django.utils import timezone


SECTION_CHOICES = [
    ("WMD-1A", "WMD-1A"),
    ("WMD-1B", "WMD-1B"),
    ("WMD-1C", "WMD-1C"),
    ("WMD-2A", "WMD-2A"),
    ("WMD-2B", "WMD-2B"),
    ("WMD-2C", "WMD-2C"),
    ("BSIT-3A", "BSIT-3A"),
    ("BSIT-3B", "BSIT-3B"),
    ("BSIT-4A", "BSIT-4A"),
    ("BSIT-4B", "BSIT-4B"),
]


def generate_session_code(subject=None):
    """
    Generate a session code in the format: ECC-SUBJECT-XX
    where SUBJECT is uppercase subject name and XX is a random 2-character alphanumeric string.
    """
    subject_part = (subject or "SESSION").upper()
    # Generate 2-character random string (uppercase letters or digits)
    random_part = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(2))
    return f"ECC-{subject_part}-{random_part}"


class Student(models.Model):
    student_id = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=100)
    email = models.EmailField(blank=True, null=True)
    section = models.CharField(max_length=10, choices=SECTION_CHOICES)
    public_key = models.TextField()
    private_key = models.TextField(null=True, blank=True)
    device_fingerprint = models.CharField(max_length=255, null=True, blank=True)
    favorite_teacher = models.CharField(max_length=100, null=True, blank=True)
    registered_at = models.DateTimeField(default=timezone.now, editable=False)

    class Meta:
        ordering = ("student_id",)

    def __str__(self):
        return f"{self.student_id} - {self.name}"


class Session(models.Model):
    # Administrative status (manual control)
    ADMIN_STATUS_CHOICES = [
        ("ACTIVE", "Active"),
        ("CLOSED", "Closed"),
    ]
    
    # Automatic time-based session status
    TIME_STATUS_CHOICES = [
        ("ACTIVE", "Active - On Time Window"),
        ("LATE_WINDOW", "Late Window Open"),
        ("TIMED_OUT", "Timed Out - No Attendance Allowed"),
        ("ENDED", "Session Ended"),
    ]

    session_code = models.CharField(max_length=32, unique=True, editable=False)
    section = models.CharField(max_length=10, choices=SECTION_CHOICES)
    subject = models.CharField(max_length=100, blank=True, null=True)
    date = models.DateField(auto_now_add=True)
    
    # Session timing fields
    time_in_start = models.TimeField(help_text="When attendance window opens (students marked Present)")
    time_in_end = models.TimeField(help_text="Attendance deadline. Before this = Present, After = Late")
    time_out_start = models.TimeField(help_text="Late cutoff. After this = attendance not allowed (Timed Out)")
    
    # DateTime tracking
    start_time = models.DateTimeField(auto_now_add=True, help_text="When session was created")
    
    # Session duration in minutes (for calculating final expiration)
    # Default: 30 minutes after session start
    duration_minutes = models.IntegerField(
        default=30,
        help_text="Total session duration in minutes from start time"
    )
    
    # Administrative status (manual control)
    status = models.CharField(
        max_length=10,
        choices=ADMIN_STATUS_CHOICES,
        default="ACTIVE",
        help_text="Administrative status (manually controlled)"
    )
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="attendance_sessions",
    )

    class Meta:
        ordering = ("-date", "-start_time")

    def save(self, *args, **kwargs):
        if not self.session_code:
            while True:
                session_code = generate_session_code(self.subject)
                if not Session.objects.filter(session_code=session_code).exists():
                    self.session_code = session_code
                    break
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.section} - {self.session_code}"
    
    def get_session_start_datetime(self):
        """Get the session start time as datetime (today at time_in_start)."""
        return timezone.make_aware(
            timezone.datetime.combine(self.date, self.time_in_start)
        )
    
    def get_attendance_deadline_datetime(self):
        """Get attendance deadline as datetime (when Late window begins)."""
        return timezone.make_aware(
            timezone.datetime.combine(self.date, self.time_in_end)
        )
    
    def get_late_cutoff_datetime(self):
        """Get late cutoff as datetime (when Timed Out state begins)."""
        return timezone.make_aware(
            timezone.datetime.combine(self.date, self.time_out_start)
        )
    
    def get_final_expiration_datetime(self):
        """Get final session expiration as datetime (30 minutes after timeout start)."""
        from datetime import timedelta
        late_cutoff = self.get_late_cutoff_datetime()
        return late_cutoff + timedelta(minutes=30)
    
    def get_time_status(self):
        """
        Determine the current time-based status of the session.
        Returns one of: ACTIVE, LATE_WINDOW, TIMED_OUT, ENDED
        """
        if self.status == "CLOSED":
            return "CLOSED"
        
        now = timezone.now()
        session_start = self.get_session_start_datetime()
        attendance_deadline = self.get_attendance_deadline_datetime()
        late_cutoff = self.get_late_cutoff_datetime()
        final_expiration = self.get_final_expiration_datetime()
        
        # Not started yet
        if now < session_start:
            return "ACTIVE"  # Will be active when time comes
        
        # Active/On-time window
        if now <= attendance_deadline:
            return "ACTIVE"
        
        # Late window open
        if now <= late_cutoff:
            return "LATE_WINDOW"
        
        # Timed out but session not yet ended
        if now < final_expiration:
            return "TIMED_OUT"
        
        # Session completely ended
        return "ENDED"
    
    def is_open_for_attendance(self):
        """Check if session currently allows attendance marking."""
        if self.status == "CLOSED":
            return False
        
        time_status = self.get_time_status()
        return time_status in ("ACTIVE", "LATE_WINDOW")
    
    def get_attendance_status(self):
        """Get current attendance status for display (includes manual status)."""
        if self.status == "CLOSED":
            return "CLOSED"
        return self.get_time_status()
    
    def get_schedule_info(self):
        """Get formatted schedule information for admin panel."""
        return {
            "start_time": self.time_in_start.strftime("%H:%M"),
            "attendance_deadline": self.time_in_end.strftime("%H:%M"),
            "late_cutoff": self.time_out_start.strftime("%H:%M"),
            "final_end": self.get_final_expiration_datetime().time().strftime("%H:%M"),
            "current_status": self.get_time_status(),
        }


class Attendance(models.Model):
    STATUS_CHOICES = [
        ("PRESENT", "Present"),
        ("LATE", "Late"),
    ]

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="attendance_records")
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name="attendance_records")
    time_in = models.DateTimeField(null=True, blank=True)
    time_out = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PRESENT")

    class Meta:
        ordering = ("student__student_id",)
        constraints = [
            models.UniqueConstraint(fields=("student", "session"), name="unique_attendance_per_session"),
        ]

    def __str__(self):
        return f"{self.student.student_id} - {self.session.session_code}"


class OTPVerification(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="otp_verifications")
    device_fingerprint = models.CharField(max_length=255)
    otp_code = models.CharField(max_length=6)
    attempt_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    verified = models.BooleanField(default=False)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"OTP for {self.student.student_id} - {self.device_fingerprint[:16]}"
    
    def is_expired(self):
        return timezone.now() > self.expires_at
    
    def is_valid(self):
        return not self.is_expired() and not self.verified and self.attempt_count < 5