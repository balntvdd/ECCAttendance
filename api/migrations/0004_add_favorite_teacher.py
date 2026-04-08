# Generated migration for favorite teacher security verification

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0003_add_device_binding'),
    ]

    operations = [
        migrations.AddField(
            model_name='student',
            name='favorite_teacher',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
    ]
