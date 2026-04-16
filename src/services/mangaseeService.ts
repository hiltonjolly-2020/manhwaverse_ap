import axios from 'axios';

const MANGASEE_DOMAINS = ['www.manga4life.com', 'www.mangasee123.com'];

export const mangaseeService = {
  async searchManga(title: string) {
    for (const domain of MANGASEE_DOMAINS) {
      const baseUrl = `/api/proxy/${domain}`;
      try {
        // Try multiple potential search endpoints
        let response;
        try {
          response = await axios.get(`${baseUrl}/_search.php`);
        } catch (e) {
          try {
            response = await axios.get(`${baseUrl}/search.php`);
          } catch (e2) {
            try {
              response = await axios.get(`${baseUrl}/search/search.php`);
            } catch (e3) {
              // Final fallback: Fetch the search page and extract directory data
              console.log(`[MangaSee] PHP endpoints failed on ${domain}, trying to parse search page...`);
              let pageResponse;
              try {
                pageResponse = await axios.get(`${baseUrl}/search/`);
              } catch (e4) {
                try {
                  pageResponse = await axios.get(`${baseUrl}/directory/`);
                } catch (e5) {
                  // Try main page as last resort
                  pageResponse = await axios.get(`${baseUrl}/`);
                }
              }
              const html = pageResponse.data;
              const dirMatch = html.match(/vm\.Directory = (\[.*?\]);/);
              if (dirMatch) {
                response = { data: JSON.parse(dirMatch[1]) };
              } else {
                // Try alternative directory pattern
                const altDirMatch = html.match(/vm\.FullDirectory = (\[.*?\]);/);
                if (altDirMatch) {
                  response = { data: JSON.parse(altDirMatch[1]) };
                } else {
                  throw new Error('Could not find directory data on search page');
                }
              }
            }
          }
        }
        
        const allManga = response.data; 
        if (!Array.isArray(allManga)) {
          // If it's not an array, maybe it's a JSON string or wrapped object
          if (typeof allManga === 'string') {
            try {
              const parsed = JSON.parse(allManga);
              if (Array.isArray(parsed)) {
                return this.processMangaList(parsed, title, domain);
              }
            } catch (e) {}
          }
          continue;
        }
        
        return this.processMangaList(allManga, title, domain);
      } catch (error) {
        console.warn(`[MangaSee] Search failed on ${domain}, trying next...`);
      }
    }
    return [];
  },

  processMangaList(allManga: any[], title: string, domain: string) {
    const results = allManga.filter((m: any) => {
      const mangaTitle = m.s || m.title || '';
      return mangaTitle.toLowerCase().includes(title.toLowerCase());
    }).slice(0, 5);
    
    return results.map((m: any) => ({
      id: m.i || m.slug || m.id, // slug
      title: m.s || m.title || m.s,
      domain: domain // Store which domain worked
    }));
  },

  async getChapters(mangaSlug: string) {
    for (const domain of MANGASEE_DOMAINS) {
      const baseUrl = `/api/proxy/${domain}`;
      try {
        const response = await axios.get(`${baseUrl}/manga/${mangaSlug}`);
        const html = response.data;
        
        // Try multiple regex patterns for chapters
        let chapterMatch = html.match(/vm\.Chapters = (\[.*?\]);/);
        if (!chapterMatch) {
          // Try alternative pattern
          chapterMatch = html.match(/vm\.Directory = (\[.*?\]);/);
        }
        
        if (!chapterMatch) continue;
        
        const rawChapters = JSON.parse(chapterMatch[1]);
        if (!Array.isArray(rawChapters)) continue;
        
        return rawChapters.map((c: any) => {
          // MangaSee uses a specific encoding for chapter numbers: 100010 -> 1.0
          const chapterStr = c.Chapter || '';
          const chapterNum = parseInt(chapterStr.substring(1, 5));
          const odd = chapterStr.substring(5);
          const finalNum = odd === '0' ? chapterNum.toString() : `${chapterNum}.${odd}`;
          
          return {
            id: `mangasee:${mangaSlug}-chapter-${chapterStr}`,
            chapter: finalNum,
            volume: '',
            title: c.ChapterName || `Chapter ${finalNum}`,
            pages: 0,
            publishAt: c.Date,
            source: 'MangaSee',
            domain: domain
          };
        });
      } catch (error) {
        console.warn(`[MangaSee] Chapters failed on ${domain}, trying next...`);
      }
    }
    return [];
  },

  async getChapterPages(chapterId: string) {
    // chapterId format: mangasee:slug-chapter-100010
    const [slug, chapCode] = chapterId.replace('mangasee:', '').split('-chapter-');
    
    for (const domain of MANGASEE_DOMAINS) {
      const baseUrl = `/api/proxy/${domain}`;
      try {
        const response = await axios.get(`${baseUrl}/read-online/${slug}-chapter-${chapCode}.html`);
        const html = response.data;
        
        const chapterDataMatch = html.match(/vm\.CurChapter = (\{.*?\});/);
        const pathNameMatch = html.match(/vm\.CurPathName = "(.*?)";/);
        
        if (!chapterDataMatch || !pathNameMatch) continue;
        
        const curChapter = JSON.parse(chapterDataMatch[1]);
        const pathName = pathNameMatch[1];
        const pageCount = parseInt(curChapter.Page);
        
        const pages = [];
        for (let i = 1; i <= pageCount; i++) {
          const pageNum = i.toString().padStart(3, '0');
          const chapterCode = curChapter.Chapter.substring(1, 5);
          const odd = curChapter.Chapter.substring(5);
          const chapterPath = odd === '0' ? chapterCode : `${chapterCode}.${odd}`;
          
          pages.push(`/api/proxy-image?url=${encodeURIComponent(`https://${pathName}/manga/${slug}/${chapterPath}-${pageNum}.png`)}`);
        }
        
        return pages;
      } catch (error) {
        console.warn(`[MangaSee] Pages failed on ${domain}, trying next...`);
      }
    }
    throw new Error('Failed to fetch pages from all MangaSee domains');
  }
};
