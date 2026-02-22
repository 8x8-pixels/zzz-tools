import { readTextFile, writeTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';

export type AppSettings = {
  tesseractDir: string;
};

const DEFAULT_SETTINGS: AppSettings = {
  tesseractDir: '',
};

async function getSettingsPath(): Promise<string> {
  const base = await appDataDir();
  return await join(base, 'settings.json');
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const path = await getSettingsPath();
    if (!(await exists(path))) {
      return { ...DEFAULT_SETTINGS };
    }
    const content = await readTextFile(path);
    const parsed = JSON.parse(content) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const base = await appDataDir();
  if (!(await exists(base))) {
    await mkdir(base, { recursive: true });
  }
  const path = await getSettingsPath();
  await writeTextFile(path, JSON.stringify(settings, null, 2));
}
