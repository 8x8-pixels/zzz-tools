/**
 * JSON データの静的ロードとパース
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
 * Disc JSON をパースして Disc[] を返す。
 */
export function parseDiscJson(content: string, sourceName = 'unknown'): Disc[] {
  try {
    const data = JSON.parse(content) as Disc[];
    if (!Array.isArray(data)) {
      throw new Error('Disc JSON は配列である必要があります。');
    }
    return data;
  } catch (err) {
    throw new Error(`JSON パースエラー: ${sourceName}`);
  }
}

export function getDiscSetName(discs: Disc[]): string {
  return discs[0]?.name ?? '(unknown)';
}
