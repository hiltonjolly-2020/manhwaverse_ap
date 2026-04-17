import { mangaService, Chapter } from './mangaService';
import { mangahereService, MangaHereResult } from './mangahereService';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

// Score a search result against the list of known titles for this manga.
// Returns a score 0–100. A score below 55 means the result is likely a different series.
function scoreTitleMatch(result: MangaHereResult, knownTitles: string[]): number {
  const resultNorm = result.title.toLowerCase().replace(/[^\w\s]/g, '').trim();
  let best = 0;

  for (const t of knownTitles) {
    const targetNorm = t.toLowerCase().replace(/[^\w\s]/g, '').trim();

    // Exact match
    if (resultNorm === targetNorm) return 100;

    // Result title starts with our title followed by separator (e.g. "solo leveling ragnarok")
    // This is a sequel/variant — penalise so it won't beat an exact match.
    if (resultNorm.startsWith(targetNorm + ' ') || resultNorm.startsWith(targetNorm + ':')) {
      best = Math.max(best, 40);
      continue;
    }

    // Our title starts with the result title (result is a proper substring of ours)
    if (targetNorm.startsWith(resultNorm + ' ') || targetNorm === resultNorm) {
      best = Math.max(best, 85);
      continue;
    }

    // Bidirectional inclusion (not a prefix case)
    if (targetNorm.includes(resultNorm) || resultNorm.includes(targetNorm)) {
      best = Math.max(best, 60);
      continue;
    }

    // All significant query words present in result (loose match)
    const targetWords = targetNorm.split(/\s+/).filter(w => w.length > 2);
    if (targetWords.length > 0 && targetWords.every(w => resultNorm.includes(w))) {
      best = Math.max(best, 55);
    }
  }

  return best;
}

// Score a cached MangaHere title (string) against known titles.
// Uses the same scale as scoreTitleMatch but operates on a plain title string.
function scoreCachedTitle(cachedTitle: string, knownTitles: string[]): number {
  return scoreTitleMatch({ id: '', title: cachedTitle, url: '', foundOn: '' }, knownTitles);
}

// Pick the best match from MangaHere search results.
// Returns null if no result meets the minimum confidence threshold.
function pickBestMatch(results: MangaHereResult[], knownTitles: string[]): MangaHereResult | null {
  const MIN_SCORE = 55;
  let bestResult: MangaHereResult | null = null;
  let bestScore = 0;

  for (const r of results) {
    const score = scoreTitleMatch(r, knownTitles);
    console.log(`[Orchestrator] Title match score for "${r.title}": ${score}`);
    if (score > bestScore) {
      bestScore = score;
      bestResult = r;
    }
  }

  if (bestScore >= MIN_SCORE) return bestResult;
  console.warn(`[Orchestrator] No result met minimum score (${MIN_SCORE}). Best was ${bestScore} for "${bestResult?.title}"`);
  return null;
}

export interface SourceData {
  sourceName: string;
  sourceKey: string;
  chapters: Chapter[];
  chapterCount: number;
  isExternal: boolean;
  isMature?: boolean;
  baseUrl?: string;
}

export const mangaOrchestrator = {
  async getMangaDexSource(mangaDexId: string): Promise<SourceData | null> {
    try {
      const chapters = await mangaService.getMangaDexChapters(mangaDexId);
      if (chapters.length === 0) return null;
      return {
        sourceName: 'MangaDex',
        sourceKey: 'mangadex',
        chapters,
        chapterCount: chapters.length,
        isExternal: false
      };
    } catch (error) {
      console.error('[Orchestrator] MangaDex fetch failed:', error);
      return null;
    }
  },

  async getOtherSources(mangaDexId: string): Promise<SourceData[]> {
    console.log(`[Orchestrator] Fetching other sources for MangaDex ID: ${mangaDexId}`);

    // Fetch manga details FIRST — we need the titles both for cache validation and search.
    let mangaTitle = '';
    let altTitles: string[] = [];
    try {
      const manga = await mangaService.getMangaDetails(mangaDexId);
      mangaTitle = manga.title;
      altTitles = manga.altTitles || [];
      console.log(`[Orchestrator] Manga title: "${mangaTitle}", Alt titles: ${altTitles.length}`);
    } catch (error: any) {
      console.error('[Orchestrator] Manga details fetch failed:', error.message);
      return [];
    }

    if (!mangaTitle) {
      console.warn('[Orchestrator] No manga title found, cannot search other sources');
      return [];
    }

    const allTitles = Array.from(new Set([mangaTitle, ...altTitles])).filter(t => t.length > 2);

    // Check Cache — but VALIDATE the stored title against known titles before trusting it.
    // This prevents stale or wrong entries (e.g. Ragnarok cached against Solo Leveling) from persisting.
    try {
      const cacheRef = doc(db, 'search_cache', mangaDexId);
      const cacheSnap = await getDoc(cacheRef);
      if (cacheSnap.exists()) {
        const cacheData = cacheSnap.data();
        const cachedMangahereTitle: string = cacheData.mangahereTitle || '';
        const cacheScore = cachedMangahereTitle ? scoreCachedTitle(cachedMangahereTitle, allTitles) : 0;

        console.log(`[Orchestrator] Cache hit: ${cacheData.mangahereId} ("${cachedMangahereTitle}") — score: ${cacheScore}`);

        if (cacheScore >= 55) {
          // Cache is valid — use it
          const chapters = await mangahereService.getChapters(cacheData.mangahereId, cacheData.mangahereDomain);
          if (chapters.length > 0) {
            return [{
              sourceName: 'MangaHere',
              sourceKey: 'mangahere',
              chapters,
              chapterCount: chapters.length,
              isExternal: false,
              baseUrl: `https://${cacheData.mangahereDomain}`
            }];
          }
        } else {
          // Cache entry is stale or incorrect — skip it and fall through to a fresh search.
          // A correct entry will be written once the search succeeds (overwriting the bad one).
          console.warn(`[Orchestrator] Cache invalid (score ${cacheScore} < 55), ignoring stale entry for ${mangaDexId}`);
        }
      }
    } catch (e) {
      console.warn('[Orchestrator] Cache check failed:', e);
    }

    console.log(`[Orchestrator] Titles to search: ${allTitles.join(', ')}`);

    const sources: any[] = [
      {
        name: 'MangaHere',
        key: 'mangahere',
        fetch: async () => {
          // Build a SHORT, ranked list of search candidates.
          // MangaHere search only works with Latin/ASCII titles — skip CJK, Arabic, Cyrillic, etc.
          const isLatinTitle = (t: string) => /^[\x20-\x7E\u00C0-\u024F'-]+$/.test(t.trim());

          // Collect only Latin-script titles, de-duplicated, max 5
          const latinTitles = allTitles.filter(isLatinTitle).slice(0, 5);

          // Always try the primary title first (even if non-Latin, use as seed for word slices)
          const primary = allTitles[0] || '';
          const searchTitles: string[] = latinTitles.length > 0 ? latinTitles : [];

          // Add short word-slice fallbacks from the first Latin title
          const firstLatin = latinTitles[0] || (isLatinTitle(primary) ? primary : '');
          if (firstLatin) {
            const words = firstLatin.split(/\s+/).filter(w => w.length >= 2);
            if (words.length > 3) searchTitles.push(words.slice(0, 3).join(' '));
            if (words.length > 2) searchTitles.push(words.slice(0, 2).join(' '));
          }

          // De-duplicate while keeping order
          const seen = new Set<string>();
          const uniqueTitles = searchTitles.filter(t => {
            const key = t.toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          for (const title of uniqueTitles) {
            try {
              console.log(`[Orchestrator] Trying MangaHere search for: "${title}"`);
              const search = await mangahereService.searchManga(title);

              if (search.length > 0) {
                const bestMatch = pickBestMatch(search, allTitles);
                if (!bestMatch) {
                  console.warn(`[Orchestrator] Skipping results for "${title}" — no confident title match.`);
                  continue;
                }

                const id = bestMatch.id;
                console.log(`[Orchestrator] Found on MangaHere: ${id} ("${bestMatch.title}") on ${bestMatch.foundOn}`);

                // Save to cache with the matched title so future loads can be validated.
                if (auth.currentUser) {
                  try {
                    await setDoc(doc(db, 'search_cache', mangaDexId), {
                      mangaDexId,
                      mangahereId: id,
                      mangahereTitle: bestMatch.title,
                      mangahereDomain: bestMatch.foundOn,
                      updatedAt: serverTimestamp()
                    });
                  } catch (e) {
                    console.warn('[Orchestrator] Failed to save cache:', e);
                  }
                }

                const chapters = await mangahereService.getChapters(id, bestMatch.foundOn);
                console.log(`[Orchestrator] MangaHere chapters found: ${chapters.length}`);
                if (chapters.length > 0) return chapters;
              }
            } catch (err: any) {
              console.error(`[Orchestrator] MangaHere fetch error for "${title}":`, err.message);
            }
          }
          return [];
        },
        isExternal: false,
        priority: 2
      }
    ];

    const mainResults = await Promise.allSettled(sources.map(s => s.fetch()));

    const finalSources: SourceData[] = [];

    mainResults.forEach((result, index) => {
      const source = sources[index];
      if (result.status === 'fulfilled') {
        const chapters = result.value as Chapter[];
        if (chapters.length > 0) {
          finalSources.push({
            sourceName: source.name,
            sourceKey: source.key,
            chapters,
            chapterCount: chapters.length,
            isExternal: source.isExternal,
            baseUrl: source.key === 'mangahere' ? 'https://m.mangahere.cc' : undefined
          });
        }
      }
    });

    return finalSources;
  },

  async getChapters(mangaDexId: string): Promise<SourceData[]> {
    const mdSource = await this.getMangaDexSource(mangaDexId);
    const otherSources = await this.getOtherSources(mangaDexId);
    return mdSource ? [mdSource, ...otherSources] : otherSources;
  },

  async getChapterPages(chapterId: string): Promise<string[]> {
    console.log(`[Orchestrator] Fetching pages for chapter ID: ${chapterId}`);

    if (chapterId.startsWith('mangahere:')) {
      const parts = chapterId.split(':');
      return await mangahereService.getChapterPages(parts[1], parts[2], parts[3]);
    }

    if (chapterId.startsWith('translator:')) {
      return [];
    }

    return await mangaService.getMangaDexChapterPages(chapterId);
  }
};
