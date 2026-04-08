from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0006_alter_session_duration_minutes'),
    ]

    operations = [
        migrations.AddField(
            model_name='student',
            name='private_key',
            field=models.TextField(blank=True, null=True),
        ),
    ]
