
#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate
python manage.py loaddata backupup.json
<<<<<<< HEAD
=======
python -m pip install --upgrade pip setuptools wheel
>>>>>>> f304655a0ac9be528e3657e8988e4df20773b50f
