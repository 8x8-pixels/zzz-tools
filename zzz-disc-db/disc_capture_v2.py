"""
ZZZ Drive Disc Scanner v2 - Real-time Screen Capture Mode
Monitors the game screen and automatically captures disc data.

Usage:
    python disc_capture_v2.py --monitor [--out result_live] [--debug]

Controls:
    - The script automatically detects disc detail panels
    - Press Ctrl+C to stop and save results
"""

import os
import json
import re
import sys
import time
import argparse
import signal
import threading
import cv2
import numpy as np
import difflib

try:
    import mss
except ImportError:
    print("Error: mss is required. Install with: pip install mss")
    sys.exit(1)

try:
    import pytesseract
except ImportError:
    pytesseract = None
    print("Warning: pytesseract not found. OCR will be disabled.")

import tkinter as tk
import queue


class OverlayNotifier:
    """Lightweight tkinter overlay that auto-dismisses. Runs in its own thread."""

    def __init__(self, duration_ms=1500, position="bottom_right"):
        self.duration_ms = duration_ms
        self.position = position
        self._queue = queue.Queue()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def show(self, title, message):
        """Queue a notification to show (non-blocking)."""
        self._queue.put((title, message))

    def _run_loop(self):
        """Tkinter mainloop in dedicated thread."""
        self._root = tk.Tk()
        self._root.withdraw()
        self._root.geometry('0x0+0+0')
        self._root.overrideredirect(True)
        self._root.attributes('-alpha', 0.0)
        self._check_queue()
        self._root.mainloop()

    def _check_queue(self):
        """Poll for new notifications."""
        try:
            while True:
                title, message = self._queue.get_nowait()
                self._create_popup(title, message)
        except queue.Empty:
            pass
        self._root.after(100, self._check_queue)

    def _create_popup(self, title, message):
        popup = tk.Toplevel(self._root)
        popup.overrideredirect(True)
        popup.attributes('-topmost', True)
        popup.attributes('-alpha', 0.88)
        popup.configure(bg='#1a1a2e')

        frame = tk.Frame(popup, bg='#1a1a2e', padx=14, pady=10)
        frame.pack()

        lbl_title = tk.Label(
            frame, text=title, font=('Segoe UI', 11, 'bold'),
            fg='#e0e040', bg='#1a1a2e', anchor='w'
        )
        lbl_title.pack(fill='x', pady=2)

        lbl_msg = tk.Label(
            frame, text=message, font=('Segoe UI', 9),
            fg='#cccccc', bg='#1a1a2e', anchor='w', justify='left'
        )
        lbl_msg.pack(fill='x', pady=2)

        popup.update_idletasks()
        pw = popup.winfo_reqwidth()
        ph = popup.winfo_reqheight()
        sw = popup.winfo_screenwidth()
        sh = popup.winfo_screenheight()
        x = sw - pw - 20
        y = sh - ph - 60
        popup.geometry(f'+{x}+{y}')

        popup.after(self.duration_ms, popup.destroy)

# ─────────────────────────────────────────────
# Known Data
# ─────────────────────────────────────────────

KNOWN_DISCS = [
    "Astral Voice", "Branch & Blade Song", "Chaos Jazz", "Chaotic Metal",
    "Dawn's Bloom", "Fanged Metal", "Freedom Blues", "Hormone Punk",
    "Inferno Metal", "King of the Summit", "Moonlight Lullaby", "Phaethon's Melody",
    "Polar Metal", "Proto Punk", "Puffer Electro", "Shadow Harmony",
    "Shining Aria", "Shockstar Disco", "Soul Rock", "Swing Jazz",
    "Thunder Metal", "White Water Ballad", "Woodpecker Electro", "Yunkui Tales"
]

KNOWN_SUBSTATS = [
    "Anomaly Proficiency",
    "CRIT Rate", "CRIT DMG",
    "HP", "ATK", "DEF", "PEN",
]

DISTINCT_KEYWORDS = {
    "ballad": "White Water Ballad",
    "pics": "White Water Ballad",
    "picks": "White Water Ballad",
    "water": "White Water Ballad",
    "jazz": None, "metal": None, "punk": None, "electro": None,
    "astral": "Astral Voice", "voice": "Astral Voice",
    "branch": "Branch & Blade Song", "blade": "Branch & Blade Song",
    "chaos": "Chaos Jazz", "chaotic": "Chaotic Metal",
    "dawn": "Dawn's Bloom", "bloom": "Dawn's Bloom",
    "fanged": "Fanged Metal",
    "freedom": "Freedom Blues", "blues": "Freedom Blues",
    "hormone": "Hormone Punk",
    "inferno": "Inferno Metal",
    "summit": "King of the Summit",
    "moonlight": "Moonlight Lullaby", "lullaby": "Moonlight Lullaby",
    "phaethon": "Phaethon's Melody", "melody": "Phaethon's Melody",
    "polar": "Polar Metal", "proto": "Proto Punk",
    "puffer": "Puffer Electro",
    "shadow": "Shadow Harmony", "harmony": "Shadow Harmony",
    "shining": "Shining Aria", "aria": "Shining Aria",
    "shockstar": "Shockstar Disco", "disco": "Shockstar Disco",
    "soul": "Soul Rock", "rock": "Soul Rock",
    "swing": "Swing Jazz", "thunder": "Thunder Metal",
    "woodpecker": "Woodpecker Electro",
    "yunkui": "Yunkui Tales", "tales": "Yunkui Tales"
}

# ─────────────────────────────────────────────
# Scanner Class
# ─────────────────────────────────────────────

class LiveDiscScanner:
    def __init__(self, args):
        self.args = args
        self.out_dir = args.out
        self.img_dir = os.path.join(self.out_dir, "panels")
        self.dbg_dir = os.path.join(self.out_dir, "debug")

        os.makedirs(self.out_dir, exist_ok=True)
        os.makedirs(self.img_dir, exist_ok=True)
        if self.args.debug:
            os.makedirs(self.dbg_dir, exist_ok=True)

        # OCR setup
        if pytesseract and not args.no_ocr:
            if args.tesseract:
                pytesseract.pytesseract.tesseract_cmd = args.tesseract
            else:
                tess_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
                if os.path.exists(tess_path):
                    pytesseract.pytesseract.tesseract_cmd = tess_path

        # State
        self.results = []
        self.last_center = None
        self.stable_frames = 0
        self.captured_current = False
        self.disc_counter = 0
        self.running = True
        self.last_sig = None  # For dedup of consecutive identical captures
        self.overlay = OverlayNotifier(duration_ms=1500)

        # Monitor number (0-indexed, default primary)
        self.monitor_num = getattr(args, 'monitor_num', 0)

    # ─────────────────────────────────────────
    # Screen Capture
    # ─────────────────────────────────────────

    def capture_screen(self, sct):
        """Capture the full screen as a BGR numpy array."""
        # Monitor 0 = all monitors combined, 1 = primary, 2 = secondary, etc.
        mon = sct.monitors[self.monitor_num + 1]  # mss uses 1-indexed for individual monitors
        screenshot = sct.grab(mon)
        img = np.array(screenshot)
        # mss returns BGRA, convert to BGR
        return cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)

    # ─────────────────────────────────────────
    # Image Processing (same as v1)
    # ─────────────────────────────────────────

    def preprocess_image(self, img):
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        scale = 2.0
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        if np.mean(gray) < 127:
            gray = 255 - gray
        _, th = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
        return th

    def find_yellow_highlight(self, frame):
        """Detects the yellow selection highlight in the left grid."""
        scale = 0.5
        small = cv2.resize(frame, None, fx=scale, fy=scale)
        hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)

        lower_yellow = np.array([15, 120, 120])
        upper_yellow = np.array([45, 255, 255])
        mask = cv2.inRange(hsv, lower_yellow, upper_yellow)

        kernel = np.ones((3, 3), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

        h, w = mask.shape
        mask[:, int(w * 0.70):] = 0
        mask[int(h * 0.85):, :] = 0

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        best = None
        max_score = 0

        for c in contours:
            area = cv2.contourArea(c)
            if area < 200:
                continue
            x, y, w_rect, h_rect = cv2.boundingRect(c)
            aspect_ratio = w_rect / float(h_rect)
            if 0.6 < aspect_ratio < 1.6:
                score = area
                if score > max_score:
                    max_score = score
                    cx = int((x + w_rect / 2) / scale)
                    cy = int((y + h_rect / 2) / scale)
                    best = {
                        "bbox": (int(x / scale), int(y / scale), int(w_rect / scale), int(h_rect / scale)),
                        "center": (cx, cy),
                        "area": area
                    }
        return best

    def crop_details_panel(self, frame):
        """Crops the right-side details panel."""
        h, w = frame.shape[:2]
        x1 = int(w * 0.70)
        x2 = int(w * 0.99)
        y1 = int(h * 0.10)
        y2 = int(h * 0.92)
        return frame[y1:y2, x1:x2].copy()

    # ─────────────────────────────────────────
    # Name Matching (same as v1)
    # ─────────────────────────────────────────

    def match_known_name(self, lines):
        header_text = " ".join(lines[:4]).lower()
        header_clean = re.sub(r'[^a-z\s]', ' ', header_text)
        tokens = header_clean.split()

        # 1. Distinct Keywords
        for token in tokens:
            if len(token) < 3:
                continue
            if token in DISTINCT_KEYWORDS and DISTINCT_KEYWORDS[token]:
                return DISTINCT_KEYWORDS[token]

        best_name = None
        best_score = 0

        # 2. Sequential Word Match
        for name in KNOWN_DISCS:
            name_clean = re.sub(r'[^a-z\s]', ' ', name.lower())
            name_words = name_clean.split()
            if not name_words:
                continue
            current_pos = 0
            matched_count = 0
            for word in name_words:
                pos = header_clean.find(word, current_pos)
                if pos != -1:
                    matched_count += 1
                    current_pos = pos + len(word)
                else:
                    break
            if matched_count > best_score:
                best_score = matched_count
                best_name = name
            elif matched_count == best_score and matched_count > 0:
                if best_name and len(name) > len(best_name):
                    best_name = name

        if best_name:
            return best_name

        # 3. Fuzzy Matching
        matches = difflib.get_close_matches(header_clean, [n.lower() for n in KNOWN_DISCS], n=1, cutoff=0.45)
        if matches:
            for n in KNOWN_DISCS:
                if n.lower() == matches[0]:
                    return n
        return None

    # ─────────────────────────────────────────
    # Text Parsing (same as v1)
    # ─────────────────────────────────────────

    def parse_text_data(self, text, capture_id):
        # Log raw OCR
        with open(os.path.join(self.out_dir, "ocr_debug.log"), "a", encoding="utf-8") as f:
            f.write(f"--- Capture {capture_id} ---\n{text}\n---------------------\n")

        lines = [line.strip() for line in text.split('\n') if line.strip()]

        data = {
            "name": "Unknown",
            "slot": None,
            "level": None,
            "rarity": "S",
            "main_stat": {},
            "sub_stats": [],
            "set_effect": None
        }

        known_name = self.match_known_name(lines)
        if known_name:
            data["name"] = known_name

        slot_pattern = re.compile(r'(?:\[|[\|lI])\s*([1-6])\s*(?:\]|[\|lI])')
        level_pattern = re.compile(r'(?:Lv\.?|Level)\s*(\d+)(?:/\d+)?', re.IGNORECASE)

        section = "HEADER"

        def clean_name(s):
            return re.sub(r'[^A-Za-z\s\'\-]', '', s).strip()

        for i, line in enumerate(lines):
            # Slot
            m_slot = slot_pattern.search(line)
            if m_slot and data["slot"] is None:
                data["slot"] = int(m_slot.group(1))
                if data["name"] == "Unknown":
                    name_part = clean_name(line[:m_slot.start()].strip())
                    if i > 0:
                        prev = lines[i - 1].strip()
                        if "Level" in prev or "Rec" in prev or len(prev) < 3:
                            data["name"] = name_part
                        elif not any(c.isdigit() for c in prev):
                            cleaned_prev = clean_name(prev)
                            if len(cleaned_prev) > 2:
                                data["name"] = f"{cleaned_prev} {name_part}".strip()
                            else:
                                data["name"] = name_part
                        else:
                            data["name"] = name_part
                    elif len(name_part) > 2:
                        data["name"] = name_part
                continue

            # Level
            m_lvl = level_pattern.search(line)
            if m_lvl and data["level"] is None:
                data["level"] = int(m_lvl.group(1))
                continue

            # Main Stat section
            if "Main Stat" in line:
                section = "MAIN"
                continue

            if section == "MAIN":
                if "Lv." in line or "Level" in line:
                    continue
                if any(c.isdigit() for c in line):
                    parts = line.split()
                    if len(parts) >= 2:
                        val = parts[-1]
                        name = re.sub(r'[^A-Za-z\s]', '', " ".join(parts[:-1])).strip()
                        if name and val:
                            data["main_stat"] = {"name": name, "value": val}
                            section = "SUBS"
                    continue

            # Sub-Stats section
            if "Sub-Stats" in line:
                section = "SUBS"
                continue

            if section == "SUBS":
                if "Set Effect" in line or "2-Pc" in line:
                    section = "SET"
                    continue

                found_stat = None
                remainder = ""

                for stat in sorted(KNOWN_SUBSTATS, key=len, reverse=True):
                    if line.upper().startswith(stat.upper()):
                        found_stat = stat
                        remainder = line[len(stat):]
                        break
                    stat_nospace = stat.replace(" ", "")
                    line_nospace = re.sub(r'\s', '', line)
                    if line_nospace.upper().startswith(stat_nospace.upper()):
                        found_stat = stat
                        consumed = 0
                        for orig_idx, ch in enumerate(line):
                            if ch == ' ':
                                continue
                            consumed += 1
                            if consumed >= len(stat_nospace):
                                remainder = line[orig_idx + 1:]
                                break
                        break

                if not found_stat:
                    continue

                remainder = remainder.strip()

                rolls = 0
                m_rolls = re.match(r'\+\s*(\d)\s*(.*)', remainder)
                if m_rolls:
                    rolls = int(m_rolls.group(1))
                    remainder = m_rolls.group(2).strip()

                m_val = re.search(r'[\d][,.\d]*%?', remainder)
                if m_val:
                    s_val = m_val.group(0)
                    s_name = found_stat
                    if "%" in s_val and s_name in ["HP", "ATK", "DEF"]:
                        s_name += "%"
                    data["sub_stats"].append({
                        "name": s_name,
                        "value": s_val,
                        "rolls": rolls
                    })

        if data["name"] == "Unknown" and len(lines) > 0:
            candidate = lines[0]
            if "Level" not in candidate and "Rec" not in candidate:
                data["name"] = candidate

        return data

    def _parse_value(self, value):
        if value is None:
            return None
        clean = str(value).replace(",", "").strip()
        try:
            if clean.endswith("%"):
                return float(clean[:-1]) / 100.0
            return float(clean)
        except ValueError:
            return None

    def _map_stat_key(self, name, value, is_main=False):
        if not name:
            return None, None

        element_map = {
            "Physical DMG Bonus": "physical",
            "Fire DMG Bonus": "fire",
            "Ice DMG Bonus": "ice",
            "Electric DMG Bonus": "electric",
            "Ether DMG Bonus": "ether",
        }

        if name in element_map:
            return "element_dmg_bonus", element_map[name]

        stat_map = {
            "ATK": "atk_flat",
            "ATK%": "atk_pct_base",
            "HP": "hp_flat",
            "HP%": "hp_pct_base",
            "DEF": "def_flat",
            "DEF%": "def_pct",
            "CRIT Rate": "crit_rate",
            "CRIT DMG": "crit_dmg",
            "PEN": "pen_flat",
            "PEN Ratio": "pen_rate",
            "Impact": "impact",
            "Anomaly Mastery": "anomaly_mastery",
            "Anomaly Proficiency": "anomaly_proficiency",
            "Energy Regen": "energy_regen",
        }

        if is_main and name in ["ATK", "HP", "DEF"]:
            if str(value).strip().endswith("%"):
                if name == "ATK":
                    return "atk_pct_base", None
                if name == "HP":
                    return "hp_pct_base", None
                return "def_pct", None
            return stat_map.get(name, name), None

        return stat_map.get(name, name), None

    def _transform_disc_for_output(self, disc):
        output = {
            "name": disc.get("name"),
            "slot": disc.get("slot"),
            "level": disc.get("level"),
            "rarity": disc.get("rarity"),
        }

        if "id" in disc:
            output["id"] = disc.get("id")

        main = disc.get("main_stat", {})
        if main:
            stat_key, element = self._map_stat_key(main.get("name"), main.get("value"), is_main=True)
            main_out = {
                "stat_key": stat_key,
                "value": self._parse_value(main.get("value"))
            }
            if element:
                main_out["element"] = element
            output["main_stat"] = main_out

        sub_stats = []
        for sub in disc.get("sub_stats", []):
            stat_key, element = self._map_stat_key(sub.get("name"), sub.get("value"), is_main=False)
            sub_out = {
                "stat_key": stat_key,
                "value": self._parse_value(sub.get("value")),
                "rolls": sub.get("rolls", 0)
            }
            if element:
                sub_out["element"] = element
            sub_stats.append(sub_out)
        output["sub_stats"] = sub_stats

        return output

    # ─────────────────────────────────────────
    # Deduplication
    # ─────────────────────────────────────────

    def _make_signature(self, item):
        """Create a unique signature for dedup."""
        ms = item.get("main_stat", {})
        ms_sig = (ms.get("name"), ms.get("value"))
        subs = item.get("sub_stats", [])
        ss_sig = tuple(sorted([(x.get("name"), x.get("value"), x.get("rolls", 0)) for x in subs]))
        return (ms_sig, ss_sig)

    def deduplicate_results(self):
        unique = []
        seen = set()
        print(f"Deduplicating {len(self.results)} entries...")
        for item in self.results:
            subs = item.get("sub_stats", [])
            if len(subs) == 0:
                continue
            sig = self._make_signature(item)
            if sig not in seen:
                seen.add(sig)
                unique.append(item)
        print(f"Reduced to {len(unique)} unique discs.")
        self.results = unique

    # ─────────────────────────────────────────
    # Save
    # ─────────────────────────────────────────

    def save_results(self):
        self.deduplicate_results()
        json_path = os.path.join(self.out_dir, "discs.json")
        with open(json_path, "w", encoding="utf-8") as f:
            mapped_results = [self._transform_disc_for_output(item) for item in self.results]
            json.dump(mapped_results, f, indent=2, ensure_ascii=False)
        print(f"Saved {len(self.results)} discs to {json_path}")

    # ─────────────────────────────────────────
    # Process a single frame
    # ─────────────────────────────────────────

    def process_frame(self, frame):
        """
        Process a screen capture frame.
        Returns True if a new disc was captured.
        """
        highlight = self.find_yellow_highlight(frame)

        if not highlight:
            self.stable_frames = 0
            self.captured_current = False
            return False

        cx, cy = highlight["center"]

        if self.last_center:
            dist = np.sqrt((cx - self.last_center[0]) ** 2 + (cy - self.last_center[1]) ** 2)
            if dist < 30:
                self.stable_frames += 1
            else:
                self.stable_frames = 0
                self.captured_current = False
        else:
            self.stable_frames = 1

        self.last_center = (cx, cy)

        # Need stable for ~1 second at 2fps = 2 checks
        if self.stable_frames >= 2 and not self.captured_current:
            self.captured_current = True

            details_img = self.crop_details_panel(frame)

            crop_fname = f"disc_{self.disc_counter:03d}.png"
            cv2.imwrite(os.path.join(self.img_dir, crop_fname), details_img)

            if pytesseract and not self.args.no_ocr:
                processed = self.preprocess_image(details_img)
                if self.args.debug:
                    cv2.imwrite(os.path.join(self.dbg_dir, f"proc_{crop_fname}"), processed)

                text = pytesseract.image_to_string(processed, config='--psm 6')
                parsed_data = self.parse_text_data(text, self.disc_counter)
                parsed_data["image_path"] = crop_fname
                parsed_data["id"] = self.disc_counter

                # Quick dedup: skip if identical to last capture
                sig = self._make_signature(parsed_data)
                if sig == self.last_sig:
                    return False
                self.last_sig = sig

                if len(parsed_data.get("sub_stats", [])) > 0:
                    self.results.append(parsed_data)
                    self.disc_counter += 1
                    name = parsed_data.get('name', 'Unknown')
                    subs = len(parsed_data.get('sub_stats', []))
                    main = parsed_data.get('main_stat', {})
                    main_str = f"{main.get('name', '?')} {main.get('value', '?')}" if main else '?'
                    print(f"  [#{self.disc_counter}] {name} | {subs} sub-stats | total: {len(self.results)}")
                    
                    # Overlay notification (non-blocking)
                    sub_names = ', '.join(s['name'] for s in parsed_data.get('sub_stats', []))
                    self.overlay.show(
                        f"Disc #{self.disc_counter}: {name}",
                        f"Main: {main_str} | Subs: {sub_names}"
                    )
                    
                    return True
                else:
                    print(f"  (skipped - no sub-stats detected)")

        return False

    # ─────────────────────────────────────────
    # Main Loop: Auto Monitor
    # ─────────────────────────────────────────

    def run_monitor(self):
        """Continuously monitor the screen for disc panels."""
        interval = getattr(self.args, 'interval', 0.5)  # seconds between captures

        print("=" * 50)
        print("  ZZZ Drive Disc Scanner v2 - Live Monitor")
        print("=" * 50)
        print(f"  Output:   {os.path.abspath(self.out_dir)}")
        print(f"  Monitor:  #{self.monitor_num} (primary)")
        print(f"  Interval: {interval}s")
        print(f"  Debug:    {'ON' if self.args.debug else 'OFF'}")
        print("-" * 50)
        print("  Monitoring... Press Ctrl+C to stop and save.")
        print("-" * 50)

        with mss.mss() as sct:
            try:
                while self.running:
                    frame = self.capture_screen(sct)
                    self.process_frame(frame)
                    time.sleep(interval)
            except KeyboardInterrupt:
                pass

        print("\n" + "=" * 50)
        print("  Stopping monitor...")
        self.save_results()
        print("=" * 50)

    # ─────────────────────────────────────────
    # Legacy: Video Mode (kept for compatibility)
    # ─────────────────────────────────────────

    def run_video(self):
        """Process a video file (legacy mode)."""
        cap = cv2.VideoCapture(self.args.video)
        if not cap.isOpened():
            print(f"Error: Could not open video {self.args.video}")
            return

        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps < 1:
            fps = 60.0

        frame_count = 0
        process_interval = 5

        print(f"Video FPS: {fps}. Processing every {process_interval} frames.")

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame_count += 1
            if frame_count % process_interval != 0:
                continue

            self.process_frame(frame)

        cap.release()
        self.save_results()


# ─────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ZZZ Disc Scanner v2")

    # Mode selection
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--monitor", action="store_true", help="Live screen monitoring mode")
    mode.add_argument("--video", type=str, help="Process a video file (legacy mode)")

    # Common options
    parser.add_argument("--out", default="result_live", help="Output directory (default: result_live)")
    parser.add_argument("--debug", action="store_true", help="Save debug images")
    parser.add_argument("--no_ocr", action="store_true", help="Skip OCR (image capture only)")
    parser.add_argument("--tesseract", help="Path to tesseract executable")
    parser.add_argument("--interval", type=float, default=0.5, help="Capture interval in seconds (default: 0.5)")
    parser.add_argument("--monitor_num", type=int, default=0, help="Monitor number (0=primary, default: 0)")

    args = parser.parse_args()

    scanner = LiveDiscScanner(args)

    if args.monitor:
        scanner.run_monitor()
    elif args.video:
        scanner.run_video()


if __name__ == "__main__":
    main()
