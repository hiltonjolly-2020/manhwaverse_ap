import axios from 'axios';
import qs from 'qs';
import { mangaOrchestrator } from './mangaOrchestrator';

const MANGADEX_API_URL = '/api/mangadex';

// 1. Create a dedicated axios instance with qs for parameter serialization
const api = axios.create({
  paramsSerializer: (params) => {
    const serialized = qs.stringify(params, { arrayFormat: 'brackets' });
    return serialized;
  }
});

export interface Manga {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  status: string;
  year: number | null;
  originalLanguage?: string;
  tags: string[];
  author: string;
  rating: string;
  altTitles?: string[];
}

export interface Chapter {
  id: string;
  chapter: string;
  volume: string;
  title: string;
  pages: number;
  publishAt: string;
  scanlationGroup?: string;
  externalUrl?: string;
  source?: string;
}

export const mangaService = {
  _tagCache: null as Record<string, string> | null,
  _tagLoadingPromise: null as Promise<void> | null,

  async _loadTags() {
    if (this._tagCache) return;
    if (this._tagLoadingPromise) return this._tagLoadingPromise;

    this._tagLoadingPromise = (async () => {
      try {
        const response = await api.get(`${MANGADEX_API_URL}/manga/tag`);
        const tags = response.data.data;
        const cache: Record<string, string> = {};
        tags.forEach((t: any) => {
          const name = t.attributes.name.en.toLowerCase();
          cache[name] = t.id;
        });
        this._tagCache = cache;
      } catch (error) {
        console.error('Error loading tags:', error);
      } finally {
        this._tagLoadingPromise = null;
      }
    })();

    return this._tagLoadingPromise;
  },

  async searchManga(
    query: string, 
    limit = 20, 
    offset = 0, 
    order?: any, 
    includedTags?: string[], 
    group?: string,
    status?: string[],
    demographic?: string[],
    year?: number,
    includedTagsMode: 'AND' | 'OR' = 'AND',
    excludedTags?: string[],
    contentRating?: string[],
    originalLanguage?: string[]
  ) {
    const params: any = {
      limit,
      offset,
      'includes': ['cover_art', 'author'],
      'contentRating': contentRating || ['safe', 'suggestive', 'erotica', 'pornographic'],
      'availableTranslatedLanguage': ['en'],
      includedTagsMode,
      ...order
    };

    if (query) params.title = query;
    if (originalLanguage && originalLanguage.length > 0) params.originalLanguage = originalLanguage;
    if (includedTags && includedTags.length > 0) params.includedTags = includedTags;
    if (excludedTags && excludedTags.length > 0) params.excludedTags = excludedTags;
    if (group) params.group = group;
    if (status && status.length > 0) params.status = status;
    if (demographic && demographic.length > 0) params.publicationDemographic = demographic;
    if (year) params.year = year;

    const response = await api.get(`${MANGADEX_API_URL}/manga`, { params });
    return response.data.data.map((manga: any) => this.transformManga(manga));
  },

  async getGroupId(groupName: string): Promise<string | null> {
    try {
      const response = await api.get(`${MANGADEX_API_URL}/group`, {
        params: { name: groupName, limit: 1 }
      });
      return response.data.data[0]?.id || null;
    } catch (error) {
      console.error('Error fetching group ID:', error);
      return null;
    }
  },

  async getTagId(tagName: string): Promise<string | null> {
    await this._loadTags();
    const normalized = tagName.toLowerCase();
    if (normalized === 'gl') return this._tagCache?.['girls\' love'] || null;
    if (normalized === 'bl') return this._tagCache?.['boys\' love'] || null;
    return this._tagCache?.[normalized] || null;
  },

  async getMangaDetails(id: string) {
    const response = await api.get(`${MANGADEX_API_URL}/manga/${id}`, {
      params: {
        'includes': ['cover_art', 'author'],
      },
    });
    return this.transformManga(response.data.data);
  },

  // 2. Rewrite the getChapters function with exact requirements
  async getChapters(mangaId: string) {
    return await mangaOrchestrator.getChapters(mangaId);
  },

  // Internal MangaDex implementation (kept for orchestrator use)
  async getMangaDexChapters(mangaId: string) {
    if (!mangaId || mangaId === 'undefined') {
      console.error('getChapters called with invalid mangaId');
      return [];
    }

    const fetchBatch = async (offset: number, languages: string[] | null) => {
      const params: any = {
        limit: 500,
        offset: offset,
        'order[chapter]': 'desc',
        'includes': ['scanlation_group'],
        'contentRating': ['safe', 'suggestive', 'erotica', 'pornographic']
      };

      if (languages) {
        params['translatedLanguage'] = languages;
      }

      console.log(`[mangaService] Fetching chapters batch: offset=${offset}, languages=${languages}`);
      console.log(`[mangaService] Params:`, params);

      try {
        const url = `${MANGADEX_API_URL}/manga/${mangaId}/feed`;
        console.log(`[mangaService] URL: ${url}`);
        
        const response = await api.get(url, { params });
        
        console.log(`[mangaService] Response Status: ${response.status}`);
        console.log(`[mangaService] Data Count: ${response.data.data?.length || 0}`);
        
        return response.data.data || [];
      } catch (error: any) {
        console.error(`[mangaService] Error fetching chapters:`, error.message);
        if (error.response?.data) {
          console.error(`[mangaService] API Error Details:`, JSON.stringify(error.response.data, null, 2));
        }
        throw error;
      }
    };

    try {
      let allChaptersRaw: any[] = [];
      let offset = 0;
      let hasMore = true;
      const maxChapters = 2000;

      // Initial attempt with English filter
      while (hasMore && allChaptersRaw.length < maxChapters) {
        const batch = await fetchBatch(offset, ['en']);
        if (batch.length === 0) {
          hasMore = false;
        } else {
          allChaptersRaw = [...allChaptersRaw, ...batch];
          offset += 500;
          if (batch.length < 500) hasMore = false;
        }
      }

      // 3. Fallback mechanism - if we have very few chapters, try fetching all and filtering
      if (allChaptersRaw.length < 10) {
        console.warn(`[mangaService] Few English chapters found (${allChaptersRaw.length}). Trying fallback without language filter.`);
        offset = 0;
        hasMore = true;
        const fallbackChapters: any[] = [];
        while (hasMore && fallbackChapters.length < maxChapters) {
          const batch = await fetchBatch(offset, null);
          if (batch.length === 0) {
            hasMore = false;
          } else {
            // Client-side filter for English
            const enChapters = batch.filter((c: any) => c.attributes.translatedLanguage === 'en');
            fallbackChapters.push(...enChapters);
            offset += 500;
            if (batch.length < 500) hasMore = false;
          }
        }
        // If fallback found more, use it
        if (fallbackChapters.length > allChaptersRaw.length) {
          allChaptersRaw = fallbackChapters;
        }
      }

      const chapters: Chapter[] = allChaptersRaw.map((chapter: any) => ({
        id: chapter.id,
        chapter: chapter.attributes.chapter,
        volume: chapter.attributes.volume,
        title: chapter.attributes.title || (chapter.attributes.chapter ? `Chapter ${chapter.attributes.chapter}` : 'Special'),
        pages: chapter.attributes.pages || 0,
        publishAt: chapter.attributes.publishAt,
        scanlationGroup: chapter.relationships.find((r: any) => r.type === 'scanlation_group')?.attributes?.name,
        externalUrl: chapter.attributes.externalUrl
      }));

      // Deduplicate
      const chapterMap = new Map();
      chapters.forEach((c) => {
        const key = c.chapter || c.title || c.id;
        if (!chapterMap.has(key) || c.pages > chapterMap.get(key).pages) {
          chapterMap.set(key, c);
        }
      });

      return Array.from(chapterMap.values()).sort((a, b) => {
        const aNum = parseFloat(a.chapter);
        const bNum = parseFloat(b.chapter);
        if (!isNaN(aNum) && !isNaN(bNum)) return bNum - aNum;
        return new Date(b.publishAt).getTime() - new Date(a.publishAt).getTime();
      });

    } catch (error) {
      console.error('[mangaService] Final error in getChapters:', error);
      return [];
    }
  },

  async getChapterPages(chapterId: string) {
    return await mangaOrchestrator.getChapterPages(chapterId);
  },

  // Internal MangaDex implementation (kept for orchestrator use)
  async getMangaDexChapterPages(chapterId: string) {
    if (!chapterId || chapterId === 'undefined') throw new Error('Invalid chapter ID');
    try {
      const response = await api.get(`${MANGADEX_API_URL}/at-home/server/${chapterId}`);
      const { baseUrl, chapter } = response.data;
      if (!chapter) throw new Error('Chapter data missing');
      const quality = chapter.dataSaver ? 'data-saver' : 'data';
      const pages = chapter.dataSaver || chapter.data;
      return pages.map((page: string) => 
        `/api/proxy-image?url=${encodeURIComponent(`${baseUrl}/${quality}/${chapter.hash}/${page}`)}`
      );
    } catch (error) {
      console.error('Error fetching chapter pages:', error);
      throw error;
    }
  },

  transformManga(manga: any): Manga {
    const attributes = manga.attributes;
    const coverRel = manga.relationships.find((r: any) => r.type === 'cover_art');
    const authorRel = manga.relationships.find((r: any) => r.type === 'author');
    const coverFileName = coverRel?.attributes?.fileName;
    const coverUrl = coverFileName 
      ? `/api/proxy-image?url=${encodeURIComponent(`https://uploads.mangadex.org/covers/${manga.id}/${coverFileName}`)}`
      : 'https://picsum.photos/seed/manga/400/600';

    return {
      id: manga.id,
      title: attributes.title.en || Object.values(attributes.title)[0] as string,
      description: attributes.description.en || Object.values(attributes.description)[0] as string || 'No description available.',
      coverUrl,
      status: attributes.status,
      year: attributes.year,
      originalLanguage: attributes.originalLanguage,
      tags: attributes.tags.map((t: any) => t.attributes.name.en),
      author: authorRel?.attributes?.name || 'Unknown Author',
      rating: attributes.contentRating,
      altTitles: attributes.altTitles?.map((t: any) => Object.values(t)[0] as string) || [],
    };
  },

  async getTrendingManga(limit = 10, offset = 0, includedTags?: string[]) {
    const params: any = {
      limit,
      offset,
      'includes': ['cover_art', 'author'],
      'contentRating': ['safe', 'suggestive', 'erotica', 'pornographic'],
      'originalLanguage': ['ko', 'ja', 'zh'],
      'availableTranslatedLanguage': ['en'],
      'order[followedCount]': 'desc',
    };
    if (includedTags && includedTags.length > 0) params.includedTags = includedTags;
    const response = await api.get(`${MANGADEX_API_URL}/manga`, { params });
    return response.data.data.map((manga: any) => this.transformManga(manga));
  },

  async getLatestReleases(limit = 20, offset = 0) {
    const response = await api.get(`${MANGADEX_API_URL}/manga`, {
      params: {
        limit,
        offset,
        'includes': ['cover_art', 'author'],
        'contentRating': ['safe', 'suggestive', 'erotica', 'pornographic'],
        'originalLanguage': ['ko', 'ja', 'zh'],
        'availableTranslatedLanguage': ['en'],
        'order[updatedAt]': 'desc',
      },
    });
    return response.data.data.map((manga: any) => this.transformManga(manga));
  }
};

// 5. Add a test function that can be called from browser console
(window as any).testChapterFetch = async (mangaId: string) => {
  console.log(`[TEST] Starting test fetch for manga: ${mangaId}`);
  try {
    const params: any = {
      limit: 500,
      offset: 0,
      'order[chapter]': 'desc',
      'includes': ['scanlation_group'],
      'contentRating': ['safe', 'suggestive', 'erotica', 'pornographic'],
      'translatedLanguage': ['en']
    };
    
    const url = `${MANGADEX_API_URL}/manga/${mangaId}/feed`;
    console.log(`[TEST] URL: ${url}`);
    console.log(`[TEST] Params:`, params);
    
    const response = await api.get(url, { params });
    console.log(`[TEST] Response Status: ${response.status}`);
    console.log(`[TEST] Raw Response:`, response.data);
    return response.data;
  } catch (error: any) {
    console.error(`[TEST] Error:`, error.message);
    if (error.response?.data) {
      console.error(`[TEST] API Error Details:`, error.response.data);
    }
    return error.response?.data || error.message;
  }
};
