import os
import json
import re
import argparse
import cv2
import numpy as np
import difflib

# Known ZZZ Disc Names
KNOWN_DISCS = [
    "Astral Voice", "Branch & Blade Song", "Chaos Jazz", "Chaotic Metal", 
    "Dawn's Bloom", "Fanged Metal", "Freedom Blues", "Hormone Punk", 
    "Inferno Metal", "King of the Summit", "Moonlight Lullaby", "Phaethon's Melody", 
    "Polar Metal", "Proto Punk", "Puffer Electro", "Shadow Harmony", 
    "Shining Aria", "Shockstar Disco", "Soul Rock", "Swing Jazz", 
    "Thunder Metal", "White Water Ballad", "Woodpecker Electro", "Yunkui Tales"
]

# Known Sub-Stats (base names only - % is determined from value)
KNOWN_SUBSTATS = [
    "Anomaly Proficiency",
    "CRIT Rate", "CRIT DMG",
    "HP", "ATK", "DEF", "PEN",
]

# Distinct keywords to map back to full names if fuzzy match fails
DISTINCT_KEYWORDS = {
    "ballad": "White Water Ballad",
    "pics": "White Water Ballad", # Common OCR error for "Pics" -> error for "Pieces"? No, maybe "Pics" is misread "Picks"
    "picks": "White Water Ballad",
    "water": "White Water Ballad",
    "jazz": None, # Ambiguous (Chaos/Swing)
    "metal": None, # Ambiguous
    "punk": None, # Ambiguous
    "electro": None, # Ambiguous
    "astral": "Astral Voice",
    "voice": "Astral Voice",
    "branch": "Branch & Blade Song",
    "blade": "Branch & Blade Song",
    "chaos": "Chaos Jazz",
    "chaotic": "Chaotic Metal",
    "dawn": "Dawn's Bloom",
    "bloom": "Dawn's Bloom",
    "fanged": "Fanged Metal",
    "freedom": "Freedom Blues",
    "blues": "Freedom Blues",
    "hormone": "Hormone Punk",
    "inferno": "Inferno Metal",
    "summit": "King of the Summit",
    "moonlight": "Moonlight Lullaby",
    "lullaby": "Moonlight Lullaby",
    "phaethon": "Phaethon's Melody",
    "melody": "Phaethon's Melody",
    "polar": "Polar Metal",
    "proto": "Proto Punk",
    "puffer": "Puffer Electro",
    "shadow": "Shadow Harmony",
    "harmony": "Shadow Harmony",
    "shining": "Shining Aria",
    "aria": "Shining Aria",
    "shockstar": "Shockstar Disco",
    "disco": "Shockstar Disco",
    "soul": "Soul Rock",
    "rock": "Soul Rock",
    "swing": "Swing Jazz",
    "thunder": "Thunder Metal",
    "woodpecker": "Woodpecker Electro",
    "yunkui": "Yunkui Tales",
    "tales": "Yunkui Tales"
}


# Try to import pytesseract, handle if missing
try:
    import pytesseract
except ImportError:
    pytesseract = None

class DiscScanner:
    def __init__(self, args):
        self.args = args
        self.out_dir = args.out
        self.img_dir = os.path.join(self.out_dir, "panels")
        self.dbg_dir = os.path.join(self.out_dir, "debug")
        
        # Ensure directories exist
        os.makedirs(self.out_dir, exist_ok=True)
        os.makedirs(self.img_dir, exist_ok=True)
        if self.args.debug:
            os.makedirs(self.dbg_dir, exist_ok=True)

        # OCR configuration
        if not args.no_ocr:
            if args.tesseract:
                pytesseract.pytesseract.tesseract_cmd = args.tesseract
            else:
                # Auto-detect on Windows
                tess_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
                if os.path.exists(tess_path):
                    pytesseract.pytesseract.tesseract_cmd = tess_path
        
        # State tracking
        self.results = []
        self.last_center = None
        self.stable_frames = 0
        self.captured_current = False
        self.disc_counter = 0

    def preprocess_image(self, img, inv=False):
        """
        Preprocess image for OCR: Grayscale -> Scale -> Blur -> Threshold
        """
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # 2x scaling for better OCR on small text
        scale = 2.0
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        
        # Simple thresholding often works better for high contrast UI than Otsu
        # But let's try a dynamic approach. ZZZ UI is dark background, white text.
        # Ensure text is black on white for Tesseract
        
        # Invert if the image is mostly dark (white text on dark bg)
        if np.mean(gray) < 127:
            gray = 255 - gray
            
        # Binary threshold logic
        # Apply a binary threshold to separate text
        _, th = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
        
        if inv:
             th = 255 - th
             
        return th

    def find_yellow_highlight(self, frame):
        """
        Detects the yellow selection highlight in the left grid.
        Returns the bounding box and center if found.
        """
        # Downscale for performance
        scale = 0.5
        small = cv2.resize(frame, None, fx=scale, fy=scale)
        hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)

        # ZZZ Yellow Highlight Range (Widen slightly to be safe)
        lower_yellow = np.array([15, 120, 120])
        upper_yellow = np.array([45, 255, 255])
        
        mask = cv2.inRange(hsv, lower_yellow, upper_yellow)
        
        # Morphology to remove noise
        kernel = np.ones((3,3), np.uint8) # Smaller kernel to preserve details
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

        # Region of Interest (ROI) filtering
        # The disc list is on the left side, taking up about 60-70% width
        h, w = mask.shape
        mask[:, int(w * 0.70):] = 0 # Ignore right side (details panel)
        mask[int(h * 0.85):, :] = 0 # Ignore bottom bar (mostly)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        best = None
        max_score = 0

        for c in contours:
            area = cv2.contourArea(c)
            # Filter by area size (relative to scaled image)
            if area < 200: continue 

            x, y, w_rect, h_rect = cv2.boundingRect(c)
            aspect_ratio = w_rect / float(h_rect)
            
            # Disc selection is roughly square-ish or slightly rectangular
            # Allow for slightly wider aspect ratios
            if 0.6 < aspect_ratio < 1.6:
                # Score based on area and centrality (optional)
                score = area
                
                if score > max_score:
                    max_score = score
                    cx = int((x + w_rect/2) / scale)
                    cy = int((y + h_rect/2) / scale)
                    best = {
                        "bbox": (int(x/scale), int(y/scale), int(w_rect/scale), int(h_rect/scale)),
                        "center": (cx, cy),
                        "area": area
                    }
        
        return best

    def crop_details_panel(self, frame):
        """
        Crops the right-side details panel.
        Based on typical 16:9 layout.
        """
        h, w = frame.shape[:2]
        
        # Details panel is roughly the right 30%
        # Capture from top (10%) to get Name/Slot
        x1 = int(w * 0.70)
        x2 = int(w * 0.99) # Right edge
        y1 = int(h * 0.10) # Start higher to catch Header/Name
        y2 = int(h * 0.92) # Go lower to catch Set Effect
        
        return frame[y1:y2, x1:x2].copy()



    def match_known_name(self, lines):
        """
        Matches standard ZZZ disc names from the first few lines of OCR text.
        """
        # Focus on first 4 lines
        header_text = " ".join(lines[:4]).lower()
        header_clean = re.sub(r'[^a-z\s]', ' ', header_text)
        tokens = header_clean.split()
        
        # 1. Check for Distinct Keywords
        for token in tokens:
            if len(token) < 3: continue
            if token in DISTINCT_KEYWORDS and DISTINCT_KEYWORDS[token]:
                return DISTINCT_KEYWORDS[token]

        best_name = None
        best_score = 0
        
        # 2. Sequential Word Match (Existing Logic)
        for name in KNOWN_DISCS:
            name_clean = re.sub(r'[^a-z\s]', ' ', name.lower())
            name_words = name_clean.split()
            if not name_words: continue
            
            current_pos = 0
            matched_count = 0
            possible = True
            
            for word in name_words:
                pos = header_clean.find(word, current_pos)
                if pos != -1:
                    matched_count += 1
                    current_pos = pos + len(word)
                else:
                    possible = False
                    break
            
            if matched_count > best_score:
                best_score = matched_count
                best_name = name
            elif matched_count == best_score and matched_count > 0:
                 if best_name and len(name) > len(best_name):
                    best_name = name
        
        if best_name:
            return best_name

        # 3. Fuzzy Matching (Existing Logic)
        if best_name is None:
            matches = difflib.get_close_matches(header_clean, [n.lower() for n in KNOWN_DISCS], n=1, cutoff=0.45)
            if matches:
                for n in KNOWN_DISCS:
                    if n.lower() == matches[0]:
                        return n

        return None

    def parse_text_data(self, text, frame_idx):
        """
        Parses the raw OCR text into structured data.
        """
        # DEBUG: Log raw OCR text
        with open(os.path.join(self.out_dir, "ocr_debug.log"), "a", encoding="utf-8") as f:
            f.write(f"--- Frame {frame_idx} ---\n{text}\n---------------------\n")

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
        
        # 1. Try to find a known disc name
        known_name = self.match_known_name(lines)
        if known_name:
            data["name"] = known_name

        # Regex patterns

        # Slot: "[1]", "|1|", "1", "l1l" - relaxed
        # Look for a single digit 1-6 surrounded by brackets or isolated
        # We need to be careful not to match random numbers.
        # Strict context: usually at the end of a line or after the name
        slot_pattern = re.compile(r'(?:\[|[\|lI])\s*([1-6])\s*(?:\]|[\|lI])')
        
        # Level: "Lv. 15/15" or just "15"
        level_pattern = re.compile(r'(?:Lv\.?|Level)\s*(\d+)(?:/\d+)?', re.IGNORECASE)

        
        # Main Stat Value: Big number, potentially with %
        # We assume Main Stat name is on one line, value on the next or same
        # But often OCR sees: "HP 2200" or "ATK 10%"
        
        # Sub-stats usually start with a stat name, have a +X (rolls), and a value
        # "CRIT Rate +1 4.8%"
        # Relaxed regex to handle optional +rolls better and verify stat name
        # Allow missing space between "Name" and "+1" or "Value"
        # Also allow for cases where space is missing between roll and value: "+14.8%"
        substat_pattern = re.compile(r'([A-Za-z\s\.]+?)(?:\+?\s*(\d))?\s*([+\-]?[\d\.,]+%?)')

        # Heuristic parsing state
        section = "HEADER" # HEADER, MAIN, SUBS, SET
        
        # Helper to clean name strings
        def clean_name(s):
            # Allow letters, spaces, apostrophes, hyphens. Remove others.
            return re.sub(r'[^A-Za-z\s\'\-]', '', s).strip()

        for i, line in enumerate(lines):
            # 1. Detect Slot
            m_slot = slot_pattern.search(line)
            if m_slot and data["slot"] is None:
                data["slot"] = int(m_slot.group(1))
                
                if data["name"] == "Unknown":
                    # Capture part BEFORE the slot marker [X]
                    # "Ballad [1] pOrn" -> "Ballad "
                    name_part = line[:m_slot.start()].strip()
                    name_part = clean_name(name_part)
                    
                    if i > 0:
                        prev = lines[i-1].strip()
                        # If prev line has "Level" or "Rec", ignore it
                        if "Level" in prev or "Rec" in prev or len(prev) < 3:
                            data["name"] = name_part
                        elif not any(char.isdigit() for char in prev):
                            # Combine with previous line if it looks like text
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

            # 2. Detect Level
            # Also catch level on the same line if missed by previous checks
            m_lvl = level_pattern.search(line)
            if m_lvl and data["level"] is None:
                data["level"] = int(m_lvl.group(1))
                continue

            # 3. Main Stat
            # Look for explicit "Main Stat" label
            if "Main Stat" in line:
                section = "MAIN"
                continue
            
            if section == "MAIN":
                # Exclude if it looks like Level line
                if "Lv." in line or "Level" in line:
                     continue

                # Trying to capture the Main Stat Name and Value
                # It might be split across lines or on one line
                # Simple heuristic: Look for lines with numbers
                if any(char.isdigit() for char in line):
                    # Likely the value line or "Name Value"
                    # Try to split
                    parts = line.split()
                    if len(parts) >= 2:
                        val = parts[-1]
                        name = " ".join(parts[:-1])
                        # refined name cleaning
                        name = re.sub(r'[^A-Za-z\s]', '', name).strip()
                        if name and val:
                            data["main_stat"] = {"name": name, "value": val}
                            section = "SUBS" # Move to subs after finding main
                    continue

            # 4. Sub Stats
            if "Sub-Stats" in line:
                section = "SUBS"
                continue
            
            if section == "SUBS":
                # Stop if we hit "Set Effect"
                if "Set Effect" in line or "2-Pc" in line:
                    section = "SET"
                    continue
                
                # Try to match known sub-stat name at start of line
                found_stat = None
                remainder = ""
                
                for stat in sorted(KNOWN_SUBSTATS, key=len, reverse=True):
                    # Case-insensitive check: does the line start with this stat name?
                    if line.upper().startswith(stat.upper()):
                        found_stat = stat
                        remainder = line[len(stat):]
                        break
                    # Also handle missing spaces: "CRITRate" -> "CRIT Rate"
                    stat_nospace = stat.replace(" ", "")
                    line_nospace = re.sub(r'\s', '', line)
                    if line_nospace.upper().startswith(stat_nospace.upper()):
                        found_stat = stat
                        # Find where the stat name ends in the original line
                        # Count characters consumed (ignoring spaces)
                        consumed = 0
                        orig_idx = 0
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
                
                # Parse remainder: e.g. " +1 4.8%" or " 19" or "+2 27"
                remainder = remainder.strip()
                
                # Extract rolls (+N)
                rolls = 0
                m_rolls = re.match(r'\+\s*(\d)\s*(.*)', remainder)
                if m_rolls:
                    rolls = int(m_rolls.group(1))
                    remainder = m_rolls.group(2).strip()
                
                # Extract value (number with optional % or comma)
                m_val = re.search(r'[\d][,.\d]*%?', remainder)
                if m_val:
                    s_val = m_val.group(0)
                    s_name = found_stat
                    
                    # Distinguish flat vs % for HP/ATK/DEF
                    if "%" in s_val and s_name in ["HP", "ATK", "DEF"]:
                        s_name += "%"
                    
                    data["sub_stats"].append({
                        "name": s_name,
                        "value": s_val,
                        "rolls": rolls
                    })



        # Fallback Name extraction if still generic
        if data["name"] == "Unknown" and len(lines) > 0:
            # First line often contains name if not caught by slot regex
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

    def deduplicate_results(self):
        """
        Removes duplicates based on Main Stat + Sub Stats.
        """
        unique = []
        seen = set()
        
        print(f"Deduplicating {len(self.results)} entries...")
        
        for item in self.results:
            ms = item.get("main_stat", {})
            ms_sig = (ms.get("name"), ms.get("value"))
            
            # Sub stats signature: sorted list of (name, value, rolls)
            subs = item.get("sub_stats", [])
            ss_sig = tuple(sorted([(x.get("name"), x.get("value"), x.get("rolls", 0)) for x in subs]))
            
            # Combine
            sig = (ms_sig, ss_sig)
            
            if sig not in seen and len(subs) > 0:
                seen.add(sig)
                unique.append(item)
            elif len(subs) == 0:
                 # If no subs found, maybe OCR failure? Keep if unique but suspicious
                 pass
        
        print(f"Reduced to {len(unique)} unique discs.")
        self.results = unique

    def run(self):
        cap = cv2.VideoCapture(self.args.video)
        if not cap.isOpened():
            print(f"Error: Could not open video {self.args.video}")
            return

        fps = cap.get(cv2.CAP_PROP_FPS)
        # Fallback if FPS is not detected
        if fps < 1: fps = 60.0
        
        frame_count = 0
        
        # Process every Nth frame
        # fps=60 -> 5 frames = 0.083s. 
        # fps=30 -> 5 frames = 0.166s.
        process_interval = 5 
        
        print(f"Video FPS: {fps}. Processing every {process_interval} frames.")
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
                
            frame_count += 1
            if frame_count % process_interval != 0:
                continue

            # 1. Detect Selection
            highlight = self.find_yellow_highlight(frame)
            
            if not highlight:
                # Reset stability if selection lost
                if self.stable_frames > 0:
                    # print(f"Frame {frame_count}: Lost highlight")
                    pass
                self.stable_frames = 0
                self.captured_current = False
                continue
                
            # 2. Check Stability
            cx, cy = highlight["center"]
            if self.last_center:
                # Dist check
                dist = np.sqrt((cx - self.last_center[0])**2 + (cy - self.last_center[1])**2)
                
                # If distance is small, it's stable
                if dist < 30: 
                    self.stable_frames += 1
                else:
                    # Moved significant amount
                    # print(f"Frame {frame_count}: Moved d={dist:.1f}")
                    self.stable_frames = 0
                    self.captured_current = False
            else:
                self.stable_frames = 1
                
            self.last_center = (cx, cy)
            
            # 3. Capture & Process
            # If stable for ~0.25s (3 checks * 0.08s), capture
            if self.stable_frames >= 3 and not self.captured_current:
                print(f"Stable frame found at {frame_count} (center: {cx},{cy})")
                self.captured_current = True
                
                # Crop details
                details_img = self.crop_details_panel(frame)
                
                # Save crop for debugging/reference
                crop_fname = f"disc_{self.disc_counter:03d}_frame{frame_count}.png"
                cv2.imwrite(os.path.join(self.img_dir, crop_fname), details_img)
                
                parsed_data = {}
                if pytesseract:
                    # Preprocess for OCR
                    processed = self.preprocess_image(details_img)
                    if self.args.debug:
                        cv2.imwrite(os.path.join(self.dbg_dir, f"proc_{crop_fname}"), processed)

                    # Run OCR
                    # psm 6 = Assume a single uniform block of text.
                    text = pytesseract.image_to_string(processed, config='--psm 6')
                    
                    parsed_data = self.parse_text_data(text, frame_count)
                    parsed_data["image_path"] = crop_fname
                    parsed_data["id"] = self.disc_counter
                
                self.results.append(parsed_data)
                self.disc_counter += 1
                print(f"Captured Disc #{self.disc_counter}: {parsed_data.get('name', 'Unknown')}")

        cap.release()
        
        # Remove duplicates
        self.deduplicate_results()
        
        # Save results
        json_path = os.path.join(self.out_dir, "discs_v2.json")
        with open(json_path, "w", encoding="utf-8") as f:
            mapped_results = [self._transform_disc_for_output(item) for item in self.results]
            json.dump(mapped_results, f, indent=2, ensure_ascii=False)
            
        print(f"Finished. Saved {len(self.results)} discs to {json_path}")

def main():
    parser = argparse.ArgumentParser(description="ZZZ Disc Scanner")
    parser.add_argument("--video", required=True, help="Path to mp4 video")
    parser.add_argument("--out", default="output", help="Output directory")
    parser.add_argument("--debug", action="store_true", help="Save debug images")
    parser.add_argument("--no_ocr", action="store_true", help="Skip OCR (image extraction only)")
    parser.add_argument("--tesseract", help="Path to tesseract executable")
    
    args = parser.parse_args()
    
    scanner = DiscScanner(args)
    scanner.run()

if __name__ == "__main__":
    main()
