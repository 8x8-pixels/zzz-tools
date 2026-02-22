import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile, readDir, mkdir, exists } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';

export type OpenedJsonFile = {
  path: string;
  name: string;
  content: string;
};

export async function openJsonFile(): Promise<OpenedJsonFile | null> {
  const path = await open({
    filters: [{ name: 'JSON', extensions: ['json'] }],
    multiple: false,
  });

  if (!path || typeof path !== 'string') return null;
  const content = await readTextFile(path);
  const name = path.split(/[/\\]/).pop() ?? path;
  return { path, name, content };
}

export async function openJsonFiles(): Promise<OpenedJsonFile[]> {
  const paths = await open({
    filters: [{ name: 'JSON', extensions: ['json'] }],
    multiple: true,
  });

  if (!paths) return [];
  const list = Array.isArray(paths) ? paths : [paths];
  const results: OpenedJsonFile[] = [];
  for (const path of list) {
    if (typeof path !== 'string') continue;
    const content = await readTextFile(path);
    const name = path.split(/[/\\]/).pop() ?? path;
    results.push({ path, name, content });
  }
  return results;
}

export async function saveJsonFile(defaultName: string, content: string): Promise<void> {
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (!path) return;
  await writeTextFile(path, content);
}

export async function getDiscsDir(): Promise<string> {
  const base = await appDataDir();
  const dir = await join(base, 'discs');
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

export async function loadDiscsDir(): Promise<OpenedJsonFile[]> {
  const dir = await getDiscsDir();
  const entries = await readDir(dir);
  const jsons: OpenedJsonFile[] = [];
  for (const entry of entries) {
    if (!entry.name || !entry.name.endsWith('.json') || !entry.path) continue;
    const content = await readTextFile(entry.path);
    jsons.push({ path: entry.path, name: entry.name, content });
  }
  return jsons;
}

export async function saveJsonToDiscsDir(fileName: string, content: string): Promise<string> {
  const dir = await getDiscsDir();
  const path = await join(dir, fileName);
  await writeTextFile(path, content);
  return path;
}
