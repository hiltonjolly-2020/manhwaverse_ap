import axios from 'axios';
import { Chapter } from './mangaService';

const DOMAINS = {
  primary: 'm.mangahere.cc',
  fallback: 'newm.mangahere.cc',
  desktop: 'www.mangahere.cc'
};

export interface MangaHereResult {
  id: string;
  title: string;
  url: string;
  foundOn: string;
}

export const mangahereService = {
  async searchManga(title: string): Promise<MangaHereResult[]> {
    const domains = [DOMAINS.desktop, DOMAINS.primary, DOMAINS.fallback];
    
    for (const domain of domains) {
      try {
        const baseUrl = `/api/proxy/${domain}`;
        // Domain-specific search configurations to avoid known 404s
        const searchConfigs = domain.startsWith('www') 
          ? [
              { path: '/search.php', param: 'keyword' },
              { path: '/search.php', param: 'name' }
            ]
          : [
              { path: '/search', param: 'keyword' },
              { path: '/search', param: 'title' }
            ];
        
        // Use Promise.any to try configs in parallel within a domain to save time
        const requests = searchConfigs.map(async (config) => {
          try {
            const isMobile = domain.startsWith('m.');
            const response = await axios.get(`${baseUrl}${config.path}`, {
              params: { [config.param]: title },
              headers: {
                'Cookie': 'is_adult=1;',
                'is-mobile': isMobile ? 'true' : 'false'
              },
              timeout: 8000,
              validateStatus: (status) => status < 500
            });
            if (response.data && response.data.length > 500) return response.data;
            throw new Error('Empty result');
          } catch (e) {
            throw e;
          }
        });

        // Try to get at least one successful HTML response
        let html = '';
        try {
          html = await Promise.any(requests);
        } catch (e) {
          continue; 
        }

        if (html) {
          const results: MangaHereResult[] = [];
          
          // 1. Try specific class-based parsing first
          const items = html.split(/<(?:li|div)\s+class="manga-list-1-item"/);
          if (items.length > 1) {
            for (let i = 1; i < items.length; i++) {
              const item = items[i];
              const idMatch = item.match(/href="\/manga\/(.*?)\/"/);
              const titleMatch = item.match(/class="manga-list-1-item-title">(.*?)<\/p>/) || 
                                item.match(/title="(.*?)"/);
              
              if (idMatch && titleMatch) {
                const id = idMatch[1].replace(/\/$/, '');
                const resultTitle = titleMatch[1].trim().replace(/<.*?>/g, '');
                
                // Broad relevance check
                const cleanQuery = title.toLowerCase().replace(/[^\w\s]/g, '');
                const cleanResult = resultTitle.toLowerCase().replace(/[^\w\s]/g, '');
                const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 2);
                
                const isRelevant = queryWords.length === 0 || 
                                   queryWords.every(word => cleanResult.includes(word)) ||
                                   cleanResult.includes(cleanQuery) ||
                                   cleanQuery.includes(cleanResult);
                
                if (isRelevant && !results.find(r => r.id === id)) {
                  console.log(`[MangaHere] Search matched: ${id} (${resultTitle})`);
                  results.push({ id, title: resultTitle, url: `https://${domain}/manga/${id}/`, foundOn: domain });
                }
              }
            }
          }

          // 2. Fallback to general anchor tags if no results
          if (results.length === 0) {
            const anchorRegex = /<a[^>]+href="\/manga\/([^/]+)\/"[^>]*>(.*?)<\/a>/g;
            let match;
            while ((match = anchorRegex.exec(html)) !== null) {
              const id = match[1];
              if (id === 'comment' || id === 'search' || id === 'rss') continue;
              const rawTitle = match[2].trim().replace(/<.*?>/g, '');
              if (rawTitle.length < 2 || rawTitle.includes('img') || rawTitle.includes('<')) continue;

              const isRelevant = rawTitle.toLowerCase().includes(title.toLowerCase()) || 
                                 title.toLowerCase().includes(rawTitle.toLowerCase()) ||
                                 title.toLowerCase().split(/\s+/).every(w => rawTitle.toLowerCase().includes(w));

              if (isRelevant && !results.find(r => r.id === id)) {
                console.log(`[MangaHere] Fallback search matched: ${id} (${rawTitle})`);
                results.push({ id, title: rawTitle, url: `https://${domain}/manga/${id}/`, foundOn: domain });
              }
            }
          }

          if (results.length > 0) return results;
        }
      } catch (error: any) {
        console.warn(`[MangaHere] Search internal error on ${domain}:`, error.message);
      }
    }
    return [];
  },

  async getChapters(mangaId: string, preferredDomain?: string): Promise<Chapter[]> {
    // Start with preferred domain if known, otherwise use our standard priority
    const domains = Array.from(new Set([
      preferredDomain, 
      DOMAINS.desktop, 
      DOMAINS.primary, 
      DOMAINS.fallback
    ])).filter(Boolean) as string[];
    
    const cleanId = mangaId.replace(/\/$/, '');
    
    for (const domain of domains) {
      try {
        const baseUrl = `/api/proxy/${domain}`;
        // Try both with and without trailing slash, and desktop path
        const paths = [`/manga/${cleanId}/`, `/manga/${cleanId}`, `/manga/${cleanId}/chapterlist/`];
        let html = '';
        
        for (const path of paths) {
          try {
            console.log(`[MangaHere] Fetching chapters from ${domain}${path}`);
            const isMobile = domain.startsWith('m.') || domain.startsWith('newm.');
            const response = await axios.get(`${baseUrl}${path}`, {
              headers: {
                'Referer': `https://${domain}/`,
                'Cookie': 'is_adult=1;',
                'is-mobile': isMobile ? 'true' : 'false'
              },
              validateStatus: (status) => status < 500
            });
            
            if (response.status === 404) {
              console.warn(`[MangaHere] 404 on ${domain}${path}`);
              continue;
            }

            const pageContent = response.data || '';
            if (pageContent.length > 500 && !pageContent.includes('File not found.')) {
              html = pageContent;
              break;
            }
          } catch (e) {}
        }
        
        if (!html) continue;
        
        const chapters: Chapter[] = [];
        
        // 1. Try to find the specific chapter list section to avoid false positives 
        // from 'Recommended' or 'Hot' lists in sidebars/footers
        const chapterSection = 
          html.match(/<ul class="detail-main-list".*?>([\s\S]*?)<\/ul>/) ||
          html.match(/<div class="detail-main-list".*?>([\s\S]*?)<\/div>/) ||
          html.match(/<ul class="detail-list-select".*?>([\s\S]*?)<\/ul>/) ||
          html.match(/<div class="detail-main-list-main".*?>([\s\S]*?)<\/div>/) ||
          html.match(/<div class="chapter-list".*?>([\s\S]*?)<\/div>/) ||
          html.match(/<div id="chapterlist".*?>([\s\S]*?)<\/div>/) ||
          html.match(/<ul id="chapter-list-1".*?>([\s\S]*?)<\/ul>/);
        
        console.log(`[MangaHere] Parsing ${domain}. Section found: ${!!chapterSection}. HTML Size: ${html.length}`);
        
        const searchHtml = (chapterSection ? chapterSection[1] : html)
          .replace(/<div\s+class="comment-list"[\s\S]*?<\/div>/g, '')
          .replace(/<section\s+class="comment"[\s\S]*?<\/section>/g, '');

        // 2. Refined Chapter pattern
        // Matches <a href="/manga/title/cXXX/"><span>Chapter XXX</span></a> 
        // OR <a href="/manga/title/cXXX/1.html">...</a>
        // We ensure that after /c/ there is a digit to avoid "comment" matches
        const chapterUrlRegex = /href="[^"]*?\/manga\/[^/]+\/(?:v\d+\/)?c(\d+[^/"]*?)(?:[/"\.][^"]*)?"[^>]*>(.*?)<\/a>/g;
        let match;
        while ((match = chapterUrlRegex.exec(searchHtml)) !== null) {
          let chapId = match[1].replace(/\//g, '').replace('.html', '');
          let chapTitle = match[2].trim().replace(/<.*?>/g, '').replace(/\s+/g, ' ');
          
          if (!chapId || chapId.length > 30 || chapId.includes('http')) continue;
          
          // Basic validation that it's actually a chapter number or contains digits
          if (!/\d/.test(chapId) && !['new', 'raw'].includes(chapId.toLowerCase())) continue;
          
          // Deduplicate
          if (chapters.find(c => c.chapter === chapId)) continue;
          
          console.log(`[MangaHere] Parsed chapter: ${chapId} (${chapTitle})`);

          chapters.push({
            id: `mangahere:${mangaId}:${chapId}:${domain}`,
            chapter: chapId,
            volume: '',
            title: chapTitle || `Chapter ${chapId}`,
            pages: 0,
            publishAt: new Date().toISOString(),
            source: 'MangaHere'
          });
        }
        
        // 3. Last resort log if no chapters found
        if (chapters.length === 0) {
          console.warn(`[MangaHere] No chapters found in searchHtml from ${domain}. HTML size: ${searchHtml.length}`);
        }
        
        if (chapters.length > 0) {
          console.log(`[MangaHere] Found ${chapters.length} chapters on ${domain}`);
          return chapters.sort((a, b) => {
            const aNum = parseFloat(a.chapter);
            const bNum = parseFloat(b.chapter);
            return isNaN(aNum) || isNaN(bNum) ? 0 : bNum - aNum;
          });
        }
      } catch (error: any) {
        console.warn(`[MangaHere] Chapters failed on ${domain}:`, error.message);
      }
    }
    return [];
  },

  async getChapterPages(mangaId: string, chapterId: string, preferredDomain?: string): Promise<string[]> {
    // Start with preferred domain if known
    const domains = Array.from(new Set([
      preferredDomain,
      DOMAINS.desktop, 
      DOMAINS.primary,
      DOMAINS.fallback
    ])).filter(Boolean) as string[];
    
    for (const domain of domains) {
      try {
        const baseUrl = `/api/proxy/${domain}`;
        const targetUrl = `/manga/${mangaId}/c${chapterId}/`;
        
        console.log(`[MangaHere] Fetching pages for ${mangaId} ch ${chapterId} from ${domain}`);
        const isMobileDomain = domain.startsWith('m.') || domain.startsWith('newm.');
        const response = await axios.get(`${baseUrl}${targetUrl}`, {
          timeout: 15000,
          headers: {
            'Cookie': 'is_adult=1;',
            'is-mobile': isMobileDomain ? 'true' : 'false'
          },
          validateStatus: (status) => status < 500
        });
        
        const html = response.data;
        if (!html || html.length < 500) continue;

        // Extract total pages
        const pageMatch = 
          html.match(/total_pages\s*=\s*(\d+)/) || 
          html.match(/var\s+image_count\s*=\s*(\d+)/) ||
          html.match(/var\s+total_pages\s*=\s*(\d+)/) ||
          html.match(/count\s*:\s*(\d+)/);
        
        const totalPages = pageMatch ? parseInt(pageMatch[1]) : 0;
        
        if (totalPages === 0) {
          // Alternative check for desktop "all pages" or single image
          const singleImgMatch = html.match(/<img[^>]+src="([^"]+dmimg[^"]+)"/);
          if (singleImgMatch) return [singleImgMatch[1]];
          continue;
        }
        
        // MangaHere pages are served one by one. 
        // We will return a list of proxy-reader URLs that will be handled by our proxy server
        // to extract the real image on the fly.
        const pages: string[] = [];
        for (let i = 1; i <= totalPages; i++) {
          // We use a special path /api/proxy-mangahere-image that we'll implement in server.ts
          // which will fetch the HTML page and extract the <img> src.
          pages.push(`/api/proxy-mangahere-image?domain=${domain}&mangaId=${mangaId}&chapterId=${chapterId}&page=${i}`);
        }
        
        console.log(`[MangaHere] Found ${pages.length} pages for ${mangaId}`);
        return pages;
      } catch (error: any) {
        console.warn(`[MangaHere] Pages failed on ${domain}:`, error.message);
      }
    }
    return [];
  }
};
