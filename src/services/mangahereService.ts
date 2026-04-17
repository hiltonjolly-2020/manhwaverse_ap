import axios from 'axios';
import { Chapter } from './mangaService';

// Decodes the P.A.C.K.E.R eval(function(p,a,c,k,e,d){}) obfuscation used by MangaHere
function depackPACKER(html: string): string | null {
  const evalMatch = html.match(/eval\(function\(p,a,c,k,e,d?\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)/);
  if (!evalMatch) return null;

  const p = evalMatch[1];
  const a = parseInt(evalMatch[2]);
  const c = parseInt(evalMatch[3]);
  const k = evalMatch[4].split('|');

  function encode(n: number): string {
    return (n < a ? '' : encode(Math.floor(n / a))) +
      ((n = n % a) > 35 ? String.fromCharCode(n + 29) : n.toString(36));
  }

  const d: Record<string, string> = {};
  let i = c;
  while (i--) {
    const enc = encode(i);
    d[enc] = k[i] || enc;
  }

  return p.replace(/\b\w+\b/g, (word) => d[word] !== undefined ? d[word] : word);
}

// Known MangaHere CDN domains — used for image URL extraction after PACKER decode
const MANGAHERE_CDN_PATTERNS = [
  'mfcdn',
  'dmimg',
  'mangahere',
  'mhcdn',
  'fanfox',
];

// Extract image URLs from decoded PACKER JS. Matches any known CDN URL ending with an image ext.
function extractImgUrlsFromUnpacked(unpacked: string): string[] {
  // Build a pattern that matches any CDN domain we know about
  const cdnAlt = MANGAHERE_CDN_PATTERNS.join('|');
  // Match quoted/escaped strings containing a CDN domain and an image extension
  const urlPattern = new RegExp(
    `['"\\\\]([^'"\\\\]*(?:${cdnAlt})[^'"\\\\]*\\.(?:jpg|jpeg|png|webp|gif)[^'"\\\\]*)['"\\\\]`,
    'gi'
  );
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = urlPattern.exec(unpacked)) !== null) {
    urls.push(m[1]);
  }
  return urls;
}

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

// Helper to parse chapter entries from HTML
// Uses the specific mangaId in the URL regex to only capture chapters for this manga,
// not related titles or sidebar recommendations.
function parseChaptersFromHtml(html: string, mangaId: string, domain: string): Chapter[] {
  const chapters: Chapter[] = [];

  // Escape special regex chars in the manga ID
  const escapedId = mangaId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Match chapter links: /manga/{mangaId}/c{num}/ or /manga/{mangaId}/v{vol}/c{num}/
  // Using the specific manga ID prevents pulling in chapters from other series.
  const chapterUrlRegex = new RegExp(
    `href="[^"]*?/manga/${escapedId}/(?:v\\d+/)?c(\\d+(?:\\.\\d+)?)/?[^"]*?"[^>]*>([\\s\\S]*?)</a>`,
    'g'
  );

  // Strip comment sections to avoid false positives
  const searchHtml = html
    .replace(/<div[^>]+class="comment[^"]*"[\s\S]*?<\/div>/gi, '')
    .replace(/<section[^>]+class="comment[\s\S]*?<\/section>/gi, '');

  let match;
  while ((match = chapterUrlRegex.exec(searchHtml)) !== null) {
    const chapId = match[1];
    const chapTitle = match[2].trim().replace(/<[^>]+>/g, '').replace(/\s+/g, ' ') || `Chapter ${chapId}`;

    if (!chapId || chapId.length > 20) continue;
    if (chapters.find(c => c.chapter === chapId)) continue;

    chapters.push({
      id: `mangahere:${mangaId}:${chapId}:${domain}`,
      chapter: chapId,
      volume: '',
      title: chapTitle,
      pages: 0,
      publishAt: new Date().toISOString(),
      source: 'MangaHere'
    });
  }
  return chapters;
}

export const mangahereService = {
  async searchManga(title: string): Promise<MangaHereResult[]> {
    const domains = [DOMAINS.desktop, DOMAINS.primary, DOMAINS.fallback];
    
    for (const domain of domains) {
      try {
        const baseUrl = `/api/proxy/${domain}`;
        const searchConfigs = domain.startsWith('www')
          ? [{ path: '/search.php', param: 'keyword' }, { path: '/search.php', param: 'name' }]
          : [{ path: '/search', param: 'keyword' }, { path: '/search', param: 'title' }];
        
        const requests = searchConfigs.map(async (config) => {
          const isMobile = domain.startsWith('m.');
          const response = await axios.get(`${baseUrl}${config.path}`, {
            params: { [config.param]: title },
            headers: { 'Cookie': 'is_adult=1;', 'is-mobile': isMobile ? 'true' : 'false' },
            timeout: 8000,
            validateStatus: (status) => status < 500
          });
          if (response.data && response.data.length > 500) return response.data;
          throw new Error('Empty result');
        });

        let html = '';
        try {
          html = await Promise.any(requests);
        } catch (e) {
          continue;
        }

        if (html) {
          const results: MangaHereResult[] = [];
          
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
                
                const cleanQuery = title.toLowerCase().replace(/[^\w\s]/g, '');
                const cleanResult = resultTitle.toLowerCase().replace(/[^\w\s]/g, '');
                const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 2);
                
                const isRelevant = queryWords.length === 0 ||
                  queryWords.every(word => cleanResult.includes(word)) ||
                  cleanResult.includes(cleanQuery) ||
                  cleanQuery.includes(cleanResult);
                
                if (isRelevant && !results.find(r => r.id === id)) {
                  results.push({ id, title: resultTitle, url: `https://${domain}/manga/${id}/`, foundOn: domain });
                }
              }
            }
          }

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
    const domains = Array.from(new Set([
      preferredDomain,
      DOMAINS.desktop,
      DOMAINS.primary,
      DOMAINS.fallback
    ])).filter(Boolean) as string[];

    const cleanId = mangaId.replace(/\/$/, '');

    for (const domain of domains) {
      try {
        const isMobile = domain.startsWith('m.') || domain.startsWith('newm.');
        const baseUrl = `/api/proxy/${domain}`;
        const headers = {
          'Referer': `https://${domain}/`,
          'Cookie': 'is_adult=1;',
          'is-mobile': isMobile ? 'true' : 'false'
        };

        // Fetch a page of the chapter list, with pagination support
        const fetchPage = async (page: number): Promise<string> => {
          const paths = page === 1
            ? [`/manga/${cleanId}/`, `/manga/${cleanId}`, `/manga/${cleanId}/chapterlist/`]
            : [`/manga/${cleanId}/?page=${page}`, `/manga/${cleanId}?page=${page}`];

          for (const path of paths) {
            try {
              console.log(`[MangaHere] Fetching chapters page ${page} from ${domain}${path}`);
              const response = await axios.get(`${baseUrl}${path}`, {
                headers,
                validateStatus: s => s < 500,
                timeout: 15000
              });
              const content = response.data || '';
              if (response.status !== 404 && content.length > 500 && !content.includes('File not found.')) {
                return content;
              }
            } catch (e) {}
          }
          return '';
        };

        const firstHtml = await fetchPage(1);
        if (!firstHtml) continue;

        let allChapters = parseChaptersFromHtml(firstHtml, cleanId, domain);
        console.log(`[MangaHere] Page 1 chapters: ${allChapters.length} from ${domain}`);

        // Detect total chapter count from the page to know if pagination is needed.
        // MangaHere desktop often embeds this in the page.
        const totalMatch =
          firstHtml.match(/Total:\s*(\d+)\s*(?:chapters?)?/i) ||
          firstHtml.match(/(\d+)\s*chapters?\s*total/i) ||
          firstHtml.match(/chapter[_-]?count["']?\s*[:=]\s*["']?(\d+)/i) ||
          firstHtml.match(/>\s*(\d+)\s*Chapters?\s*</i);
        const totalChapters = totalMatch ? parseInt(totalMatch[1]) : null;

        // Check for explicit page 2+ links in the HTML
        const hasPage2 = /[?&]page=2/.test(firstHtml) || /href="[^"]*\?page=2[^"]*"/.test(firstHtml);

        // Also try: if total chapters reported by page is much more than what we parsed,
        // try a few more pages anyway.
        const likelySinglePage = !hasPage2 && (!totalChapters || totalChapters <= allChapters.length + 5);

        if (!likelySinglePage) {
          console.log(`[MangaHere] Pagination detected. Total: ${totalChapters}, Fetched: ${allChapters.length}`);
          let page = 2;
          const maxPages = 20;
          while (page <= maxPages) {
            const pageHtml = await fetchPage(page);
            if (!pageHtml) break;
            const pageChapters = parseChaptersFromHtml(pageHtml, cleanId, domain);
            if (pageChapters.length === 0) break;

            for (const ch of pageChapters) {
              if (!allChapters.find(c => c.chapter === ch.chapter)) {
                allChapters.push(ch);
              }
            }

            console.log(`[MangaHere] Page ${page} added ${pageChapters.length} chapters. Total: ${allChapters.length}`);

            const hasNextPage = new RegExp(`[?&]page=${page + 1}`).test(pageHtml) ||
              new RegExp(`href="[^"]*\\?page=${page + 1}[^"]*"`).test(pageHtml);
            if (!hasNextPage) break;
            page++;
          }
        }

        if (allChapters.length > 0) {
          console.log(`[MangaHere] Total chapters found: ${allChapters.length} on ${domain}`);
          return allChapters.sort((a, b) => {
            const aNum = parseFloat(a.chapter);
            const bNum = parseFloat(b.chapter);
            return isNaN(aNum) || isNaN(bNum) ? 0 : bNum - aNum;
          });
        }

        console.warn(`[MangaHere] No chapters found on ${domain} for ${cleanId}. HTML size: ${firstHtml.length}`);
      } catch (error: any) {
        console.warn(`[MangaHere] Chapters failed on ${domain}:`, error.message);
      }
    }
    return [];
  },

  async getChapterPages(mangaId: string, chapterId: string, preferredDomain?: string): Promise<string[]> {
    const domains = Array.from(new Set([
      preferredDomain,
      DOMAINS.desktop,
      DOMAINS.primary,
      DOMAINS.fallback
    ])).filter(Boolean) as string[];

    for (const domain of domains) {
      try {
        const isMobile = domain.startsWith('m.') || domain.startsWith('newm.');
        const baseUrl = `/api/proxy/${domain}`;

        const chapterPaths = [
          `/manga/${mangaId}/c${chapterId}/1.html`,
          `/manga/${mangaId}/c${chapterId}/`,
        ];

        let html = '';
        for (const path of chapterPaths) {
          try {
            console.log(`[MangaHere] Fetching chapter pages from ${domain}${path}`);
            const response = await axios.get(`${baseUrl}${path}`, {
              timeout: 15000,
              headers: {
                'Cookie': 'is_adult=1;',
                'is-mobile': isMobile ? 'true' : 'false'
              },
              validateStatus: s => s < 500
            });
            if (response.data && response.data.length > 500) {
              html = response.data;
              break;
            }
          } catch (e) {}
        }

        if (!html) continue;

        const refererUrl = `https://${domain}/manga/${mangaId}/c${chapterId}/`;

        // --- Method 1: Decode P.A.C.K.E.R obfuscated JS block ---
        // After decoding we search for any CDN image URLs (not just newImgs variable name).
        const unpacked = depackPACKER(html);
        if (unpacked) {
          const urls = extractImgUrlsFromUnpacked(unpacked);
          const cleaned = urls
            .filter(u => u.length > 10)
            .map(u => u.startsWith('//') ? `https:${u}` : u)
            // Remove trailing backslashes that cause 403 errors
            .map(u => u.replace(/\\+$/, ''));
          if (cleaned.length > 0) {
            console.log(`[MangaHere] Decoded PACKER → ${cleaned.length} images on ${domain}`);
            return cleaned.map(url =>
              `/api/proxy-image?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(refererUrl)}`
            );
          }
        }

        // --- Method 2: Plain newImgList (desktop site, not obfuscated) ---
        const newImgListMatch =
          html.match(/var\s+newImgList\s*=\s*(\[[\s\S]*?\]);/) ||
          html.match(/newImgList\s*=\s*(\[[\s\S]*?\]);/);
        if (newImgListMatch) {
          try {
            const urls: string[] = JSON.parse(newImgListMatch[1]);
            const cleaned = urls
              .filter(u => typeof u === 'string' && u.length > 10)
              .map(u => u.startsWith('//') ? `https:${u}` : u)
              .map(u => u.replace(/\\+$/, ''));
            if (cleaned.length > 0) {
              console.log(`[MangaHere] Extracted ${cleaned.length} images from newImgList on ${domain}`);
              return cleaned.map(url =>
                `/api/proxy-image?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(refererUrl)}`
              );
            }
          } catch (e) {
            console.warn('[MangaHere] Failed to parse newImgList JSON');
          }
        }

        // --- Method 3: Per-page proxy using imagecount (reliable fallback) ---
        const pageMatch =
          html.match(/var\s+imagecount\s*=\s*(\d+)/) ||
          html.match(/var\s+total_pages\s*=\s*(\d+)/) ||
          html.match(/total_pages\s*=\s*(\d+)/) ||
          html.match(/var\s+image_count\s*=\s*(\d+)/);

        const totalPages = pageMatch ? parseInt(pageMatch[1]) : 0;

        if (totalPages > 0) {
          console.log(`[MangaHere] Using per-page proxy for ${totalPages} pages on ${domain}`);
          const pages: string[] = [];
          for (let i = 1; i <= totalPages; i++) {
            pages.push(`/api/proxy-mangahere-image?domain=${domain}&mangaId=${mangaId}&chapterId=${chapterId}&page=${i}`);
          }
          return pages;
        }

        console.warn(`[MangaHere] Could not determine pages for ${mangaId} ch${chapterId} on ${domain}. HTML: ${html.length} bytes`);
      } catch (error: any) {
        console.warn(`[MangaHere] Pages failed on ${domain}:`, error.message);
      }
    }
    return [];
  }
};
