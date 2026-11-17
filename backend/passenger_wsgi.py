"""Titik masuk aplikasi untuk hosting cPanel ("Setup Python App" / Passenger).

Passenger mencari variabel `application` di file ini. Panduan: docs/DEPLOY-CPANEL.md.
Server sendiri (Gunicorn + Nginx) tidak memakai file ini.
"""

import os
import sys

# Passenger menjalankan file ini dari folder backend/, tetapi folder itu belum tentu ada di sys.path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

from config.wsgi import application  # noqa: E402,F401
