# Sidecar Build (disc_capture)

Build the OCR sidecar from the Python script in `sidecar/disc_capture/disc_capture_v2.py`.

## Steps

1. Create a venv and install dependencies (from the original OCR project or your own):

```
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
pip install pyinstaller
```

2. Build the executable:

```
pyinstaller disc_capture_v2.py --onefile --noconsole --name disc_capture
```

3. Rename and place the exe in `native-app/sidecar`:

```
dist/disc_capture.exe
  -> native-app/sidecar/disc_capture-x86_64-pc-windows-msvc.exe
```

Tauri sidecar uses the platform suffix in the filename.
