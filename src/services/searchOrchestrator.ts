import { mangaService, Manga } from './mangaService';
import { comickService } from './comickService';
import { mangaseeService } from './mangaseeService';

export const searchOrchestrator = {
  async searchAll(query: string): Promise<Manga[]> {
    console.log(`[SearchOrchestrator] Global search for: ${query}`);
    
    const [mangadexResults, comickResults, mangaseeResults] = await Promise.allSettled([
      mangaService.searchManga(query),
      comickService.searchManga(query),
      mangaseeService.searchManga(query)
    ]);

    const allResults: Manga[] = [];
    const seenIds = new Set<string>();

    // 1. Process MangaDex results (Primary)
    if (mangadexResults.status === 'fulfilled') {
      mangadexResults.value.forEach(m => {
        allResults.push(m);
        seenIds.add(m.id);
      });
    }

    // 2. Process Comick results
    if (comickResults.status === 'fulfilled') {
      comickResults.value.forEach((m: any) => {
        // If Comick provides a MangaDex ID, check if we already have it
        const mdId = m.md_id || m.md_comics?.id;
        if (mdId && seenIds.has(mdId)) return;
        
        // If not, add as a new entry (we'll need to handle these in Details page)
        // For now, we only show results that can be mapped to MangaDex or are unique
        if (!mdId) {
          // Create a pseudo-Manga object
          allResults.push({
            id: `comick:${m.hid}`,
            title: m.title,
            description: m.desc || '',
            coverUrl: `https://meo.comick.pictures/${m.md_covers?.[0]?.b2key || ''}`,
            status: m.status === 1 ? 'ongoing' : 'completed',
            year: m.year,
            tags: m.genres?.map((g: any) => g.name) || [],
            author: 'Unknown',
            rating: 'safe'
          });
        }
      });
    }

    return allResults;
  }
};
