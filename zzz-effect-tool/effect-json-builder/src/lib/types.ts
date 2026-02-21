// ── Enum / Key ──────────────────────────────────────

export type StatKey =
  | "atk_flat" | "atk_pct_base" | "atk_pct_bonus"
  | "hp_flat"  | "hp_pct_base"  | "hp_pct_bonus"
  | "def_flat" | "def_pct"
  | "crit_rate" | "crit_dmg"
  | "dmg_bonus"
  | "pen_rate" | "pen_flat"
  | "impact"
  | "energy_regen"
  | "adrenaline_regen"
  | "def_down" | "res_down"
  | "anomaly_mastery" | "anomaly_proficiency"
  | "break_vuln"
  | "element_dmg_bonus";

export type Element = "ice" | "fire" | "electric" | "physical" | "ether";

export type Target = "mainDps" | "team" | "enemy";

export type ConditionMode = "toggle" | "uptime";

// ── Select-box constants ────────────────────────────

export const STAT_KEYS: { value: StatKey; label: string }[] = [
  { value: "atk_flat",             label: "ATK (flat)" },
  { value: "atk_pct_base",         label: "ATK % (base)" },
  { value: "atk_pct_bonus",        label: "ATK % (bonus)" },
  { value: "hp_flat",              label: "HP (flat)" },
  { value: "hp_pct_base",          label: "HP % (base)" },
  { value: "hp_pct_bonus",         label: "HP % (bonus)" },
  { value: "def_flat",             label: "DEF (flat)" },
  { value: "def_pct",              label: "DEF %" },
  { value: "crit_rate",            label: "Crit Rate" },
  { value: "crit_dmg",             label: "Crit DMG" },
  { value: "dmg_bonus",            label: "DMG Bonus" },
  { value: "pen_rate",             label: "PEN Rate" },
  { value: "pen_flat",             label: "PEN (flat)" },
  { value: "impact",               label: "Impact" },
  { value: "energy_regen",         label: "Energy Regen" },
  { value: "adrenaline_regen",     label: "Adrenaline Regen" },
  { value: "def_down",             label: "DEF Down" },
  { value: "res_down",             label: "RES Down" },
  { value: "anomaly_mastery",      label: "Anomaly Mastery" },
  { value: "anomaly_proficiency",  label: "Anomaly Proficiency" },
  { value: "break_vuln",           label: "Break Vuln" },
  { value: "element_dmg_bonus",    label: "Element DMG Bonus" },
];

export const ELEMENTS: { value: Element; label: string }[] = [
  { value: "ice",       label: "Ice" },
  { value: "fire",      label: "Fire" },
  { value: "electric",  label: "Electric" },
  { value: "physical",  label: "Physical" },
  { value: "ether",     label: "Ether" },
];

export const TARGETS: { value: Target; label: string }[] = [
  { value: "mainDps", label: "Main DPS" },
  { value: "team",    label: "Team" },
  { value: "enemy",   label: "Enemy" },
];

export const CONDITION_MODES: { value: ConditionMode; label: string }[] = [
  { value: "toggle", label: "Toggle" },
  { value: "uptime", label: "Uptime" },
];

// ── Disc Set names ──────────────────────────────────

export const DISC_SET_NAMES: string[] = [
  "Astral Voice",
  "Branch & Blade Song",
  "Chaos Jazz",
  "Chaotic Metal",
  "Dawn's Bloom",
  "Fanged Metal",
  "Freedom Blues",
  "Hormone Punk",
  "Inferno Metal",
  "King of the Summit",
  "Moonlight Lullaby",
  "Phaethon's Melody",
  "Polar Metal",
  "Proto Punk",
  "Puffer Electro",
  "Shadow Harmony",
  "Shining Aria",
  "Shockstar Disco",
  "Soul Rock",
  "Swing Jazz",
  "Thunder Metal",
  "White Water Ballad",
  "Woodpecker Electro",
  "Yunkui Tales",
];

// ── Percentage stat keys (value shown/input as %) ───

export const PERCENT_STAT_KEYS: Set<StatKey> = new Set([
  "atk_pct_base", "atk_pct_bonus", "hp_pct_base", "hp_pct_bonus", "def_pct",
  "crit_rate", "crit_dmg",
  "dmg_bonus",
  "pen_rate",
  "energy_regen", "adrenaline_regen",
  "def_down", "res_down",
  "break_vuln",
  "element_dmg_bonus",
]);

// ── Data types ──────────────────────────────────────

export type Mod = {
  key: StatKey;
  op: "add";
  value: number;
  element?: Element;
};

export type Condition = {
  mode: ConditionMode;
  defaultUptime?: number;
};

export type Effect = {
  id: string;
  label: string;
  target: Target;
  enabledByDefault?: boolean;
  condition?: Condition;
  mods: Mod[];
  notes?: string;
  tags?: string[];
};

// ── Character class ─────────────────────────────────

export type CharacterClass =
  | "Attack"
  | "Support"
  | "Stun"
  | "Anomaly"
  | "Rupture"
  | "Defense";

export const CHARACTER_CLASSES: { value: CharacterClass; label: string }[] = [
  { value: "Attack",  label: "Attack" },
  { value: "Support", label: "Support" },
  { value: "Stun",    label: "Stun" },
  { value: "Anomaly", label: "Anomaly" },
  { value: "Rupture", label: "Rupture" },
  { value: "Defense", label: "Defense" },
];

// ── Base Stats (Lv60 / Core F) ──────────────────────

export type BaseStats = {
  hp: number;
  atk: number;
  def: number;
  impact: number;
  anomalyMastery: number;
  anomalyProficiency: number;
  critRate: number;           // 0..1
  critDmg: number;            // 0..1
  penRate?: number;           // 0..1
  energyRegen?: number;       // 0..1
  adrenalineRegen?: number;   // 0..1
};

export function defaultBaseStats(): BaseStats {
  return {
    hp: 0,
    atk: 0,
    def: 0,
    impact: 0,
    anomalyMastery: 0,
    anomalyProficiency: 0,
    critRate: 0.05,
    critDmg: 0.50,
  };
}

// ── Container types ─────────────────────────────────

export type CharacterDef = {
  id: string;
  name: string;
  element: Element;
  class: CharacterClass;
  baseStats: BaseStats;
  effects: Effect[];
  mindscape?: Record<number, Effect[]>;
};

export type WEngineDef = {
  id: string;
  name: string;
  baseMods: Mod[];
  effects: Effect[];
};

export type DiscSetDef = {
  setId: string;
  name: string;
  effects2pc: Effect[];
  effects4pc: Effect[];
};

// ── App State ───────────────────────────────────────

export type TabId = "library" | "characters" | "wengines" | "discSets";

export type AppState = {
  version: 1;
  effectLibrary: Effect[];
  characters: CharacterDef[];
  wengines: WEngineDef[];
  discSets: DiscSetDef[];
  selectedTab: TabId;
  selectedId?: string;
  dirty: boolean;
};
