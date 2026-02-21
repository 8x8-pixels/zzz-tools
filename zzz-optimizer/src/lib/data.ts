/**
 * JSON データの静的ロードと動的ファイル読み込み
 */
import type { CharacterDef, Disc, DiscSetDef, Effect, WEngineDef } from './calc/types';

// 静的 JSON インポート（Vite がビルド時に解決）
import charactersRaw from '../../data/characters.json';
import wenginesRaw from '../../data/wengines.json';
import discSetsRaw from '../../data/disc_sets.json';
import effectLibraryRaw from '../../data/effect_library.json';

export const characters: CharacterDef[] = (charactersRaw as { characters: CharacterDef[] }).characters;
export const wengines: WEngineDef[] = (wenginesRaw as { wengines: WEngineDef[] }).wengines;
export const discSets: DiscSetDef[] = (discSetsRaw as { discSets: DiscSetDef[] }).discSets;
export const effectLibrary: Effect[] = (effectLibraryRaw as { effects: Effect[] }).effects;

/**
 * data/discs/*.json を全自動インポート。
 * ファイルを追加するだけでコード変更不要。
 * キー = 各ディスクの name フィールド（セット名）
 */
const _discModules = import.meta.glob('../../data/discs/*.json', { eager: true });
export const bundledDiscs: Map<string, Disc[]> = new Map(
  Object.values(_discModules).map((mod) => {
    const discs = (mod as { default: Disc[] }).default;
    const setName = discs[0]?.name ?? '(unknown)';
    return [setName, discs] as [string, Disc[]];
  })
);

/**
 * ブラウザの File API で JSON ファイルを読み込み、Disc[] として返す。
 */
export async function loadDiscFile(file: File): Promise<Disc[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as Disc[];
        resolve(data);
      } catch (err) {
        reject(new Error(`JSON パースエラー: ${file.name}`));
      }
    };
    reader.onerror = () => reject(new Error(`ファイル読み込みエラー: ${file.name}`));
    reader.readAsText(file);
  });
}
