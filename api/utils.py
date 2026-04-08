from ecdsa import SigningKey, VerifyingKey, NIST256p
import base64
import logging
import threading
from django.core.mail import send_mail
from django.conf import settings

logger = logging.getLogger(__name__)


def generate_keys():
    sk = SigningKey.generate(curve=NIST256p)
    vk = sk.verifying_key

    return sk.to_string().hex(), vk.to_string().hex()


def sign_message(private_key_hex, message):
    sk = SigningKey.from_string(bytes.fromhex(private_key_hex), curve=NIST256p)
    signature = sk.sign(message.encode())

    return base64.b64encode(signature).decode()


def verify_signature(public_key_hex, message, signature):
    try:
        vk = VerifyingKey.from_string(bytes.fromhex(public_key_hex), curve=NIST256p)
        return vk.verify(base64.b64decode(signature), message.encode())
    except Exception:
        return False


def send_otp_email(student_email, student_name, otp_code):
    """
    Send OTP code to student's email for device verification.
    
    Args:
        student_email: Student's email address
        student_name: Student's name (for personalization)
        otp_code: 6-digit OTP code
    
    Returns:
        bool: True if email sent successfully, False otherwise
    """
    if not student_email:
        return False
    
    subject = "ECC Attendance System - Device Verification Code"
    
    html_message = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
        <div style="max-width: 500px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <h2 style="color: #0c1d50; margin-bottom: 10px;">Device Verification Required</h2>
            <p style="color: #666; font-size: 14px; margin-bottom: 20px;">Hi <strong>{student_name}</strong>,</p>
            
            <p style="color: #666; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
                You're trying to access the ECC Attendance System from a new device. 
                To complete the verification, please enter the code below:
            </p>
            
            <div style="background-color: #f0f4ff; border: 2px solid #3b82f6; border-radius: 6px; padding: 20px; text-align: center; margin-bottom: 20px;">
                <p style="color: #999; font-size: 12px; margin: 0 0 10px 0;">One-Time Password (OTP)</p>
                <p style="color: #0c1d50; font-size: 32px; font-weight: bold; letter-spacing: 4px; margin: 0; font-family: 'Courier New', monospace;">
                    {otp_code}
                </p>
            </div>
            
            <p style="color: #999; font-size: 12px; margin-bottom: 20px;">
                ⏱️ This code expires in <strong>2 minutes</strong>
            </p>
            
            <p style="color: #999; font-size: 12px; line-height: 1.6; border-top: 1px solid #eee; padding-top: 15px; margin-bottom: 0;">
                If you didn't request this, you can safely ignore this email. 
                Your account remains secure.
            </p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 11px; text-align: center; margin: 0;">
                ECC Attendance System | Security Team
            </p>
        </div>
    </body>
    </html>
    """
    
    plain_message = f"""
    Device Verification Required
    
    Hi {student_name},
    
    You're trying to access the ECC Attendance System from a new device.
    To complete the verification, please enter this code:
    
    {otp_code}
    
    This code expires in 2 minutes.
    
    If you didn't request this, you can safely ignore this email.
    Your account remains secure.
    
    --- ECC Attendance System | Security Team
    """
    
    try:
        print("Sending OTP email with backend:", settings.EMAIL_BACKEND)
        print("SMTP host:", settings.EMAIL_HOST)
        print("SMTP user:", settings.EMAIL_HOST_USER)
        send_mail(
            subject=subject,
            message=plain_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[student_email],
            html_message=html_message,
            fail_silently=False,
        )
        return True
    except Exception as e:
        logger.exception("Error sending OTP email")
        print("Error sending OTP email:", str(e))
        return False


def send_otp_email_async(student_email, student_name, otp_code):
    """Send OTP email on a background thread."""
    def _send():
        try:
            send_otp_email(student_email, student_name, otp_code)
        except Exception as exc:
            logger.exception("Background OTP email send failed")

    thread = threading.Thread(target=_send, daemon=True)
    thread.start()
    return thread
