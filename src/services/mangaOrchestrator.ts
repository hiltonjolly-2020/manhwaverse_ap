import { mangaService, Chapter } from './mangaService';
import { mangahereService } from './mangahereService';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

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
    
    // Check Cache First
    try {
      const cacheRef = doc(db, 'search_cache', mangaDexId);
      const cacheSnap = await getDoc(cacheRef);
      if (cacheSnap.exists()) {
        const cacheData = cacheSnap.data();
        console.log(`[Orchestrator] Found cache for ${mangaDexId}: ${cacheData.mangahereId}`);
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
      }
    } catch (e) {
      console.warn('[Orchestrator] Cache check failed:', e);
    }

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
    console.log(`[Orchestrator] Titles to search: ${allTitles.join(', ')}`);

    const sources: any[] = [
      { 
        name: 'MangaHere', 
        key: 'mangahere',
        fetch: async () => {
          // Prepare search variations: Full title, then each major word if nothing found
          const searchTitles = [...allTitles];
          if (allTitles[0]) {
             const words = allTitles[0].split(/\s+/).filter(w => w.length >= 2);
             if (words.length > 2) searchTitles.push(words[0] + ' ' + words[1] + ' ' + words[2]);
             if (words.length > 1) searchTitles.push(words[0] + ' ' + words[1]);
          }
          // Also try "Tower of God" specifically if it's there
          const engTitle = allTitles.find(t => t.toLowerCase() === 'tower of god');
          if (engTitle && !searchTitles.includes(engTitle)) searchTitles.unshift(engTitle);

          for (const title of searchTitles) {
            try {
              console.log(`[Orchestrator] Trying MangaHere search for: "${title}"`);
              const search = await mangahereService.searchManga(title);
              
              if (search.length > 0) {
                // Try to find the best match for ANY of our known titles
                const bestMatch = search.find(r => {
                  const resultTitle = r.title.toLowerCase();
                  return allTitles.some(t => {
                    const target = t.toLowerCase();
                    return resultTitle.includes(target) || target.includes(resultTitle);
                  });
                }) || search[0];
                
                const id = bestMatch.id;
                console.log(`[Orchestrator] Found on MangaHere: ${id} (${bestMatch.title}) on ${bestMatch.foundOn}`);
                
                // Save to Cache if logged in
                if (auth.currentUser) {
                  try {
                    await setDoc(doc(db, 'search_cache', mangaDexId), {
                      mangaDexId,
                      mangahereId: id,
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

    // Process main sources
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
      // parts[1] = mangaId, parts[2] = chapNum, parts[3] = domain
      return await mangahereService.getChapterPages(parts[1], parts[2], parts[3]);
    }
    
    if (chapterId.startsWith('translator:')) {
      return []; 
    }
    
    // Default to MangaDex
    return await mangaService.getMangaDexChapterPages(chapterId);
  }
};
