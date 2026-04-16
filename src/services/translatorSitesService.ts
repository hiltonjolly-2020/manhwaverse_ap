import axios from 'axios';
import { Chapter } from './mangaService';

interface TranslatorSite {
  name: string;
  domain: string;
  type: 'madara' | 'custom';
}

const SITES: TranslatorSite[] = [
  { name: 'Asura Scans', domain: 'asuracomic.net', type: 'custom' },
  { name: 'Asura Scans (Alt)', domain: 'asuratoon.com', type: 'custom' },
  // { name: 'Reaper Scans', domain: 'reaperscans.com', type: 'custom' },
  { name: 'Flame Scans', domain: 'flamecomics.xyz', type: 'custom' },
  // { name: 'Immortal Updates', domain: 'immortalupdates.com', type: 'madara' },
  { name: 'Zero Scans', domain: 'zeroscans.com', type: 'custom' },
  { name: 'Luminous Scans', domain: 'luminousscans.net', type: 'madara' },
  { name: 'Luminous Scans (Alt)', domain: 'luminouscomics.org', type: 'madara' },
  { name: 'Omega Scans', domain: 'omegascans.org', type: 'custom' },
  // { name: 'The Blank', domain: 'theblank.net', type: 'madara' }
];

const SITE_COOLDOWN = new Map<string, number>();
const COOLDOWN_TIME = 1000 * 60 * 5; // 5 minutes

export interface SiteChapters {
  siteName: string;
  chapters: Chapter[];
}

const SEARCH_CACHE = new Map<string, { data: SiteChapters[], timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 10; // 10 minutes

export const translatorSitesService = {
  async getAllChapters(titles: string[]): Promise<SiteChapters[]> {
    const mainTitle = titles[0];
    const cacheKey = titles.sort().join('|');
    
    const cached = SEARCH_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`[TranslatorSites] Returning cached results for: ${mainTitle}`);
      return cached.data;
    }
    
    // Expand titles with cleaned versions
    const expandedTitles = new Set<string>();
    titles.forEach(t => {
      expandedTitles.add(t);
      // Remove common prefixes
      const cleaned = t.replace(/^(The|A|An)\s+/i, '').trim();
      if (cleaned !== t) expandedTitles.add(cleaned);
      // Remove special characters
      const alphanumeric = t.replace(/[^a-zA-Z0-9\s]/g, '').trim();
      if (alphanumeric !== t) expandedTitles.add(alphanumeric);
    });

    const finalTitles = Array.from(expandedTitles);
    console.log(`[TranslatorSites] Searching for "${mainTitle}" (+ ${finalTitles.length - 1} variations) across all translator sites...`);
    
    // Use parallel fetching with a larger staggered delay to avoid 429 errors
    const promises = SITES.map((site, index) => {
      return new Promise<SiteChapters | null>(async (resolve) => {
        // Check cooldown
        const cooldownUntil = SITE_COOLDOWN.get(site.domain);
        if (cooldownUntil && Date.now() < cooldownUntil) {
          console.log(`[TranslatorSites] Skipping ${site.name} due to cooldown`);
          return resolve(null);
        }

        // Staggered start: 800ms between each site start (increased from 300ms)
        await new Promise(r => setTimeout(r, index * 800));
        
        try {
          let chapters: Chapter[] = [];
          for (const title of finalTitles) {
            chapters = await this.fetchFromSite(site, title);
            if (chapters && chapters.length > 0) break;
          }

          if (chapters && chapters.length > 0) {
            resolve({ siteName: site.name, chapters });
          } else {
            resolve(null);
          }
        } catch (error: any) {
          if (error.response?.status === 429) {
            console.warn(`[TranslatorSites] ${site.name} returned 429, cooling down...`);
            SITE_COOLDOWN.set(site.domain, Date.now() + COOLDOWN_TIME);
          }
          console.warn(`[TranslatorSites] Failed to fetch from ${site.name}:`, error.message);
          resolve(null);
        }
      });
    });

    const results = await Promise.all(promises);
    const finalResults = results.filter((r): r is SiteChapters => r !== null);
    
    if (finalResults.length > 0) {
      SEARCH_CACHE.set(cacheKey, { data: finalResults, timestamp: Date.now() });
    }
    
    return finalResults;
  },

  async getChapters(titles: string | string[]): Promise<Chapter[]> {
    const titleArray = typeof titles === 'string' ? [titles] : titles;
    const all = await this.getAllChapters(titleArray);
    return all[0]?.chapters || [];
  },

  async fetchFromSite(site: TranslatorSite, title: string): Promise<Chapter[]> {
    const baseUrl = `/api/proxy/${site.domain}`;
    
    if (site.type === 'madara') {
      return await this.fetchMadara(baseUrl, title, site.name);
    } else {
      // Custom implementations for major sites
      if (site.name === 'Asura Scans') return await this.fetchAsura(baseUrl, title);
      if (site.name === 'Reaper Scans') return await this.fetchReaper(baseUrl, title);
      if (site.name === 'Zero Scans') return await this.fetchZero(baseUrl, title);
      if (site.name === 'Omega Scans') return await this.fetchOmega(baseUrl, title);
      if (site.name === 'Flame Scans') return await this.fetchFlame(baseUrl, title);
    }
    
    return [];
  },

  async fetchFlame(baseUrl: string, title: string): Promise<Chapter[]> {
    try {
      // Flame Scans search (Next.js)
      let manga;
      try {
        // Try search API first
        const searchResponse = await axios.get(`${baseUrl}/api/search`, {
          params: { q: title }
        });
        manga = searchResponse.data?.[0];
      } catch (e) {
        // Fallback: search via main page with series filter
        const searchResponse = await axios.get(`${baseUrl}/series/?s=${encodeURIComponent(title)}`);
        const html = searchResponse.data;
        // More specific match for series links
        const match = html.match(/href="https:\/\/flamecomics\.xyz\/series\/(.*?)\/"/) || 
                      html.match(/href="\/series\/(.*?)\/"/) ||
                      html.match(/href="\/series\/(.*?)"/) ||
                      html.match(/series\/(.*?)\//);
        if (match) {
          const slug = match[1].split('"')[0].split(' ')[0].replace(/\/$/, '');
          manga = { slug };
        }
      }

      if (!manga || !manga.slug) return [];
      
      // Clean slug
      const cleanSlug = manga.slug.replace(/^\//, '').replace(/\/$/, '');
      const detailsResponse = await axios.get(`${baseUrl}/series/${cleanSlug}`);
      const html = detailsResponse.data;
      
      const chapters: Chapter[] = [];
      // Updated regex to be more flexible
      const chapterRegex = /href="\/series\/.*?\/chapter-(.*?)\/?"/g;
      let match;
      while ((match = chapterRegex.exec(html)) !== null) {
        const chapNum = match[1].replace(/\/$/, '').split('"')[0];
        chapters.push({
          id: `translator:Flame Scans:${chapNum}`,
          chapter: chapNum,
          volume: '',
          title: `Chapter ${chapNum}`,
          pages: 0,
          publishAt: new Date().toISOString(),
          source: 'Flame Scans',
          externalUrl: `https://flamecomics.xyz/series/${cleanSlug}/chapter-${chapNum}`
        });
      }
      return chapters;
    } catch (error) {
      return [];
    }
  },

  async fetchOmega(baseUrl: string, title: string): Promise<Chapter[]> {
    try {
      // Omega Scans search (Next.js)
      let manga;
      const searchTypes = ['manga', 'comic'];
      
      for (const type of searchTypes) {
        try {
          const searchResponse = await axios.get(`${baseUrl}/api/query`, {
            params: {
              query: title,
              type: type
            }
          });
          // Check if data is nested or direct
          const results = searchResponse.data.data || searchResponse.data;
          manga = Array.isArray(results) ? results[0] : null;
          if (manga) break;
        } catch (e) {
          // Fallback search
          try {
            const searchResponse = await axios.get(`${baseUrl}/query`, {
              params: {
                query: title,
                type: type
              }
            });
            const results = searchResponse.data.data || searchResponse.data;
            manga = Array.isArray(results) ? results[0] : null;
            if (manga) break;
          } catch (e2) {}
        }
      }

      if (!manga) return [];
      
      const rawSlug = manga.series_slug || manga.slug;
      if (!rawSlug) return [];
      
      const slug = rawSlug.replace(/^\//, '').replace(/\/$/, '').split('/').pop();
      if (!slug) return [];

      const chaptersResponse = await axios.get(`${baseUrl}/series/${slug}`);
      const html = chaptersResponse.data;
      
      // Extract chapters from Next.js data or HTML
      const chapters: Chapter[] = [];
      // More robust regex for Omega chapters
      const chapterRegex = /href="\/series\/.*?\/chapter\/(.*?)\/?"/g;
      let match;
      while ((match = chapterRegex.exec(html)) !== null) {
        const chapSlug = match[1].replace(/\/$/, '').split('"')[0];
        chapters.push({
          id: `translator:Omega Scans:${chapSlug}`,
          chapter: chapSlug.replace('chapter-', ''),
          volume: '',
          title: `Chapter ${chapSlug.replace('chapter-', '')}`,
          pages: 0,
          publishAt: new Date().toISOString(),
          source: 'Omega Scans',
          externalUrl: `https://omegascans.org/series/${slug}/chapter/${chapSlug}`
        });
      }
      return chapters;
    } catch (error) {
      return [];
    }
  },

  async fetchMadara(baseUrl: string, title: string, siteName: string): Promise<Chapter[]> {
    try {
      // 1. Search for the manga
      let manga;
      try {
        const searchResponse = await axios.get(`${baseUrl}/wp-admin/admin-ajax.php`, {
          params: {
            action: 'wp-manga-search-manga',
            title: title
          }
        });
        
        const searchData = searchResponse.data;
        if (searchData.success && searchData.data && searchData.data.length > 0) {
          manga = searchData.data[0];
        }
      } catch (e) {
        // Fallback search via URL query
        const searchResponse = await axios.get(`${baseUrl}/?s=${encodeURIComponent(title)}&post_type=wp-manga`);
        const html = searchResponse.data;
        const mangaMatch = html.match(/href="(.*?\/manga\/.*?\/)"/);
        if (mangaMatch) {
          manga = { url: mangaMatch[1] };
        }
      }

      if (!manga) return [];
      
      const mangaId = manga.id || manga.post_id;
      let html = '';

      if (mangaId) {
        // 2. Get chapters via AJAX
        try {
          const chaptersResponse = await axios.post(`${baseUrl}/wp-admin/admin-ajax.php`, 
            new URLSearchParams({
              action: 'manga_get_chapters',
              manga: mangaId
            }).toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
          );
          html = chaptersResponse.data;
        } catch (e) {
          // Fallback: fetch manga page directly
          const mangaUrl = manga.url || `${baseUrl}/manga/${manga.slug || manga.post_name}/`;
          const pageResponse = await axios.get(mangaUrl.startsWith('http') ? `/api/proxy/${mangaUrl.replace('https://', '').replace('http://', '')}` : mangaUrl);
          html = pageResponse.data;
        }
      } else if (manga.url) {
        const pageResponse = await axios.get(manga.url.startsWith('http') ? `/api/proxy/${manga.url.replace('https://', '').replace('http://', '')}` : manga.url);
        html = pageResponse.data;
      }
      
      if (!html) return [];

      const chapterRegex = /href="(.*?)".*?>(.*?)<\/a>/g;
      const chapters: Chapter[] = [];
      let match;
      
      while ((match = chapterRegex.exec(html)) !== null) {
        const url = match[1];
        if (!url.includes('/chapter/')) continue;
        
        const name = match[2].trim().replace(/<.*?>/g, '');
        const numMatch = name.match(/(\d+(\.\d+)?)/);
        const num = numMatch ? numMatch[1] : '0';
        
        chapters.push({
          id: `translator:${siteName}:${url}`,
          chapter: num,
          volume: '',
          title: name,
          pages: 0,
          publishAt: new Date().toISOString(),
          source: siteName,
          externalUrl: url
        });
      }
      
      return chapters;
    } catch (error) {
      return [];
    }
  },

  async fetchAsura(baseUrl: string, title: string): Promise<Chapter[]> {
    try {
      // Asura search
      const searchResponse = await axios.get(`${baseUrl}/?s=${encodeURIComponent(title)}`);
      const html = searchResponse.data;
      
      const domain = baseUrl.split('/').pop();
      
      // Try multiple patterns for Asura search results
      const mangaMatch = html.match(new RegExp(`href="(https:\\/\\/${domain}\\/series\\/.*?)"`)) || 
                         html.match(/href="(\/series\/.*?)"/);
                         
      if (!mangaMatch) return [];
      
      let mangaUrl = mangaMatch[1];
      if (!mangaUrl.startsWith('http')) {
        mangaUrl = `https://${domain}${mangaUrl}`;
      }
      
      const detailsResponse = await axios.get(`/api/proxy/${mangaUrl.replace('https://', '')}`);
      const detailsHtml = detailsResponse.data;
      
      const chapterRegex = new RegExp(`href="(https:\\/\\/${domain}\\/series\\/.*?\\/chapter\\/(\\d+))"`, 'g');
      const chapters: Chapter[] = [];
      let match;
      
      while ((match = chapterRegex.exec(detailsHtml)) !== null) {
        chapters.push({
          id: `translator:Asura Scans:${match[1]}`,
          chapter: match[2],
          volume: '',
          title: `Chapter ${match[2]}`,
          pages: 0,
          publishAt: new Date().toISOString(),
          source: 'Asura Scans',
          externalUrl: match[1]
        });
      }
      return chapters;
    } catch (error) {
      return [];
    }
  },

  async fetchReaper(baseUrl: string, title: string): Promise<Chapter[]> {
    // Reaper Scans often has heavy protection, but let's try a basic search
    try {
      const searchResponse = await axios.get(`${baseUrl}/search/comics`, {
        params: { query: title }
      });
      const manga = searchResponse.data.data?.[0];
      if (!manga) return [];
      
      const chaptersResponse = await axios.get(`${baseUrl}/comics/${manga.slug}/chapters`);
      const rawChapters = chaptersResponse.data.data || [];
      
      return rawChapters.map((c: any) => ({
        id: `translator:Reaper Scans:${c.id}`,
        chapter: c.chapter_number,
        volume: '',
        title: c.title || `Chapter ${c.chapter_number}`,
        pages: 0,
        publishAt: c.created_at,
        source: 'Reaper Scans',
        externalUrl: `https://reaperscans.com/comics/${manga.slug}/chapters/${c.slug}`
      }));
    } catch (error) {
      return [];
    }
  },

  async fetchZero(baseUrl: string, title: string): Promise<Chapter[]> {
    try {
      const searchResponse = await axios.get(`${baseUrl}/wp-admin/admin-ajax.php`, {
        params: { action: 'zeroscans_search', query: title }
      });
      const manga = searchResponse.data.results?.[0];
      if (!manga) return [];
      
      const chaptersResponse = await axios.get(`${baseUrl}/comics/${manga.slug}`);
      const html = chaptersResponse.data;
      // Zero Scans often uses a JSON blob in the HTML
      const dataMatch = html.match(/window\.__DATA__ = (\{.*?\});/);
      if (!dataMatch) return [];
      
      const data = JSON.parse(dataMatch[1]);
      const rawChapters = data.chapters || [];
      
      return rawChapters.map((c: any) => ({
        id: `translator:Zero Scans:${c.id}`,
        chapter: c.chapter_number,
        volume: '',
        title: c.name || `Chapter ${c.chapter_number}`,
        pages: 0,
        publishAt: c.created_at,
        source: 'Zero Scans',
        externalUrl: `https://zeroscans.com/comics/${manga.slug}/${c.slug}`
      }));
    } catch (error) {
      return [];
    }
  }
};
