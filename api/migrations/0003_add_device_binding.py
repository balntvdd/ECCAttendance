# Generated migration for device binding security and email OTP

from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0002_alter_attendance_options_alter_session_options_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='student',
            name='device_fingerprint',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='student',
            name='email',
            field=models.EmailField(blank=True, max_length=254, null=True),
        ),
        migrations.CreateModel(
            name='OTPVerification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('device_fingerprint', models.CharField(max_length=255)),
                ('otp_code', models.CharField(max_length=6)),
                ('attempt_count', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField()),
                ('verified', models.BooleanField(default=False)),
                ('student', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='otp_verifications', to='api.student')),
            ],
            options={
                'ordering': ('-created_at',),
            },
        ),
    ]

