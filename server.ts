import express from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

// Decodes P.A.C.K.E.R eval(function(p,a,c,k,e,d){}) obfuscation — same as mangahereService.ts
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
  while (i--) { const enc = encode(i); d[enc] = k[i] || enc; }
  return p.replace(/\b\w+\b/g, (word) => d[word] !== undefined ? d[word] : word);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1'
];

const ALLOWED_PROXY_HOSTS = new Set([
  'api.mangadex.org',
  'uploads.mangadex.org',
  'www.mangahere.cc',
  'm.mangahere.cc',
  'newm.mangahere.cc',
  'api.comick.io',
  'api.comick.fun',
  'api.comick.ink',
  'api.comick.app',
  'api.comick.xyz',
  'meo.comick.pictures',
  'www.manga4life.com',
  'www.mangasee123.com',
  'weebcentral.com',
  'asuracomic.net',
  'asuratoon.com',
  'flamecomics.xyz',
  'zeroscans.com',
  'luminousscans.net',
  'luminouscomics.org',
  'omegascans.org',
  'reaperscans.com',
  'immortalupdates.com',
  'theblank.net'
]);

const ALLOWED_CDN_MARKERS = ['mfcdn', 'dmimg', 'mangahere', 'mhcdn', 'fanfox', 'zjcdn', 'fmcdn'];

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1' || host === '[::1]' || host === '0.0.0.0') return true;
  const parts = host.split('.').map(Number);
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [a, b] = parts;
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  return false;
}

function normalizeAllowedHost(host: string): string | null {
  if (!host || /[\/\\@:%\s]/.test(host)) return null;
  const hostname = host.toLowerCase();
  if (isPrivateHostname(hostname)) return null;
  if (ALLOWED_PROXY_HOSTS.has(hostname) || ALLOWED_CDN_MARKERS.some((marker) => hostname.includes(marker))) return hostname;
  return null;
}

function parseAllowedHttpsUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return null;
    if (!normalizeAllowedHost(parsed.hostname)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function safeReferer(rawReferer: string | undefined, fallback: string): string {
  if (!rawReferer) return fallback;
  const parsed = parseAllowedHttpsUrl(rawReferer);
  return parsed ? parsed.toString() : fallback;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 5000;

  // Proxy for MangaDex API to avoid CORS issues
  app.get('/api/mangadex/*', async (req, res) => {
    const path = req.params[0] || '';
    const targetUrl = `https://api.mangadex.org/${path}`;
    
    console.log(`[PROXY] MangaDex Request: ${targetUrl}`);
    console.log(`[PROXY] Query Params:`, JSON.stringify(req.query, null, 2));

    try {
      const response = await axios.get(targetUrl, {
        params: req.query,
        headers: {
          'User-Agent': USER_AGENTS[0],
        }
      });
      
      console.log(`[PROXY] MangaDex Response Status: ${response.status}`);
      console.log(`[PROXY] Data Count: ${response.data.data?.length || 'N/A'}`);
      
      res.json(response.data);
    } catch (error: any) {
      console.error(`[PROXY] MangaDex Error Status: ${error.response?.status || 500}`);
      console.error(`[PROXY] Error Message: ${error.message}`);
      
      if (error.response?.data) {
        console.error('[PROXY] Error Data:', JSON.stringify(error.response.data, null, 2));
      }
      
      res.status(error.response?.status || 500).json({
        error: 'Failed to fetch from MangaDex',
        message: error.message,
        details: error.response?.data
      });
    }
  });

  // MangaHere per-page image extractor (fallback when newImgList is unavailable)
  app.get('/api/proxy-mangahere-image', async (req, res) => {
    const { domain, mangaId, chapterId, page } = req.query;
    if (!mangaId || !chapterId) return res.status(400).send('Missing params');

    const requestedDomain = normalizeAllowedHost((domain as string) || 'www.mangahere.cc');
    if (!requestedDomain || !requestedDomain.includes('mangahere')) return res.status(403).send('Domain not allowed');
    const domainsToTry = Array.from(new Set([
      requestedDomain,
      'm.mangahere.cc',
      'newm.mangahere.cc',
      'www.mangahere.cc'
    ]));
    const pageNum = page || 1;

    let lastError: any;

    for (const domainStr of domainsToTry) {
      const targetUrl = `https://${domainStr}/manga/${mangaId}/c${chapterId}/${pageNum}.html`;
      const referer = `https://${domainStr}/manga/${mangaId}/c${chapterId}/`;
      const isMobile = domainStr.startsWith('m.') || domainStr.startsWith('newm.');

      try {
        console.log(`[MangaHere Image Proxy] Fetching HTML from: ${targetUrl}`);

        const htmlResponse = await axios.get(targetUrl, {
          headers: {
            'Referer': referer,
            'User-Agent': isMobile
              ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1'
              : USER_AGENTS[0],
            'Cookie': 'is_adult=1;',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
          },
          timeout: 12000
        });

        const html = htmlResponse.data as string;
        const idx = Math.max(0, parseInt(pageNum as string) - 1);
        let imageUrl = '';

      const CDN_ALT = ['mfcdn', 'dmimg', 'mangahere', 'mhcdn', 'fanfox'];
      const cdnAltStr = CDN_ALT.join('|');

      // Helper: extract CDN image URLs from an arbitrary JS string
      function extractCdnUrls(src: string): string[] {
        const pat = new RegExp(
          `['"\\\\]([^'"\\\\]*(?:${cdnAltStr})[^'"\\\\]*\\.(?:jpg|jpeg|png|webp|gif)[^'"\\\\]*)['"\\\\]`,
          'gi'
        );
        const out: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = pat.exec(src)) !== null) out.push(m[1].replace(/\\+$/, ''));
        return out;
      }

      // Helper: validate a URL is a real chapter image (not a logo/placeholder/site asset)
      function isChapterImg(url: string): boolean {
        if (!url || url.length < 10) return false;
        if (/logo|loading|placeholder|blank|default|banner|avatar|icon|button|arrow|close/i.test(url)) return false;
        if (!/\.(jpg|jpeg|png|webp|gif)/i.test(url)) return false;
        return true;
      }

      // --- Priority 0: DM5 API — chapterfun.ashx ---
      // MangaHere uses the DM5 reader platform. The PACKER on chapter pages only contains
      // a "guidkey" used to call chapterfun.ashx, which returns actual CDN image URLs.
      // Our server IP can access chapterfun.ashx; the CDN blocks datacenter IPs but not
      // browser IPs, so we redirect the browser to fetch the CDN image directly.
      const unpacked = depackPACKER(html);
      if (unpacked && /var\s+guidkey\s*=/.test(unpacked)) {
        // Extract chapterid from raw HTML
        const chdIdMatch = html.match(/chapterid\s*=\s*(\d+)/);
        const chapterfunCid = chdIdMatch ? chdIdMatch[1] : null;

        // Extract guidkey by joining all hex char literals in the guidkey assignment
        const gkLine = unpacked.match(/var\s+guidkey\s*=\s*([^;]+);/)?.[1] || '';
        const guidkey = (gkLine.match(/'([a-f0-9])'/g) || []).map((s: string) => s.replace(/'/g, '')).join('');

        if (chapterfunCid && guidkey) {
          try {
            console.log(`[MangaHere Image Proxy] DM5 flow: cid=${chapterfunCid} page=${pageNum} key=${guidkey}`);
            const cfUrl = `https://${domainStr}/chapterfun.ashx`;
            const cfResp = await axios.get(cfUrl, {
              params: { cid: chapterfunCid, page: pageNum, key: guidkey },
              headers: {
                'Referer': targetUrl,
                'User-Agent': USER_AGENTS[0],
                'Cookie': 'is_adult=1;',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': '*/*',
              },
              timeout: 10000,
            });

            const cfBody = typeof cfResp.data === 'string' ? cfResp.data : JSON.stringify(cfResp.data);
            const cfDecoded = depackPACKER(cfBody);
            console.log(`[MangaHere Image Proxy] chapterfun decoded (${(cfDecoded || '').length} chars): ${(cfDecoded || '').slice(0, 300)}`);

            if (cfDecoded) {
              // Extract base URL (pix) — CDN path without extension
              const pixMatch = cfDecoded.match(/"(\/\/[^"]+(?:zjcdn|fmcdn|mfcdn|dmimg|mangahere|fanfox)[^"]*)"/);
              // Extract filename array (pvalue) — list of /oNNN.jpg entries
              const pvMatch = cfDecoded.match(/\[((?:"\/[^"]+\.[a-z]+"\s*,?\s*)+)\]/);

              if (pixMatch && pvMatch) {
                const pix = pixMatch[1];
                const filenames: string[] = [];
                const fnReg = /"(\/[^"]+\.[a-z]+)"/g;
                let fnM: RegExpExecArray | null;
                while ((fnM = fnReg.exec(pvMatch[0])) !== null) filenames.push(fnM[1]);

                // Page 1 maps to filenames[0], page N may map to filenames[0] (per-call basis)
                const fname = filenames[0] || '';
                if (fname) {
                  imageUrl = 'https:' + pix + fname;
                  console.log(`[MangaHere Image Proxy] DM5 CDN URL: ${imageUrl}`);
                  // Redirect browser to CDN URL — the browser's IP is not blocked
                  res.setHeader('Location', imageUrl);
                  res.setHeader('Cache-Control', 'public, max-age=86400');
                  res.setHeader('Referrer-Policy', 'no-referrer');
                  return res.status(302).end();
                }
              }
            }
          } catch (dm5Err: any) {
            console.error(`[MangaHere Image Proxy] DM5 API error: ${dm5Err.message}`);
          }
        }
      }

      if (!imageUrl && unpacked) {
        const listMatch = unpacked.match(/(?:newImgList|newImgs)\s*=\s*(\[[\s\S]*?\])/) ||
                          unpacked.match(/imgUrl\s*=\s*(\[[\s\S]*?\])/);
        if (listMatch) {
          try {
            const parsed: string[] = JSON.parse(listMatch[1]);
            const candidate = (parsed[idx] || parsed[0] || '').toString();
            if (isChapterImg(candidate)) imageUrl = candidate;
          } catch (_) {}
        }
      }

      // --- Priority 2: PACKER decode → newImgList[N]='url' array-index assignments ---
      if (!imageUrl && unpacked) {
        const assignmentMatches = [...unpacked.matchAll(/newImgList\[(\d+)\]\s*=\s*['"]([^'"]+)['"]/g)];
        if (assignmentMatches.length > 0) {
          const ordered: string[] = [];
          for (const m of assignmentMatches) {
            ordered[parseInt(m[1])] = m[2];
          }
          const candidate = ordered[idx] || ordered[0] || '';
          if (isChapterImg(candidate)) imageUrl = candidate;
        }
      }

      // --- Priority 3: PACKER decode → CDN URL scan (chapter-image paths only) ---
      if (!imageUrl && unpacked) {
        const cdnUrls = extractCdnUrls(unpacked)
          .filter(u => isChapterImg(u) && /\/(?:store|manga)\//.test(u));
        const candidate = cdnUrls[idx] || cdnUrls[0] || '';
        if (candidate) imageUrl = candidate;
      }

      // --- Priority 4: Plain newImgList JSON in raw HTML (not obfuscated) ---
      if (!imageUrl) {
        const newImgListMatch = html.match(/var\s+newImgList\s*=\s*(\[[\s\S]*?\]);/) ||
                                html.match(/newImgList\s*=\s*(\[[\s\S]*?\]);/);
        if (newImgListMatch) {
          try {
            const urls: string[] = JSON.parse(newImgListMatch[1]);
            const candidate = (urls[idx] || urls[0] || '').toString();
            if (isChapterImg(candidate)) imageUrl = candidate;
          } catch (_) {}
        }
      }

      // --- Priority 5: <img id="image"> — only if src looks like a real chapter image ---
      // Note: MangaHere uses logo.png as the img[id=image] placeholder before JS runs.
      // We ONLY accept it if the src passes the chapter-image validation.
      if (!imageUrl) {
        const imgTagMatches = [
          html.match(/<img[^>]+id=["']image["'][^>]+data-src=["']([^"']+)["']/),
          html.match(/<img[^>]+data-src=["']([^"']+)["'][^>]+id=["']image["']/),
          html.match(/<img[^>]+id=["']image["'][^>]+src=["']([^"']+)["']/),
          html.match(/<img[^>]+src=["']([^"']+)["'][^>]+id=["']image["']/),
        ];
        for (const m of imgTagMatches) {
          if (m && isChapterImg(m[1])) { imageUrl = m[1]; break; }
        }
      }

      // --- Priority 6: JavaScript variable assignments (page-specific) ---
      if (!imageUrl) {
        const varMatch =
          html.match(/cp_image\.src\s*=\s*["']([^"']+)["']/) ||
          html.match(/var\s+pix\s*=\s*["']([^"']+)["']/) ||
          html.match(/(?:imageUrl|image_url|imgSrc)\s*=\s*["']([^"']+\.(?:jpg|jpeg|png|webp|gif)[^"']*)["']/i);
        if (varMatch && isChapterImg(varMatch[1])) imageUrl = varMatch[1];
      }

      if (imageUrl && imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;

        if (!imageUrl) {
          console.warn(`[MangaHere Image Proxy] No image found for ${targetUrl} (page idx ${idx})`);
          continue;
        }

        console.log(`[MangaHere Image Proxy] Found: ${imageUrl}`);

        const parsedImageUrl = parseAllowedHttpsUrl(imageUrl);
        if (!parsedImageUrl) {
          console.warn(`[MangaHere Image Proxy] Blocked unexpected image host: ${imageUrl}`);
          continue;
        }

        const imageResponse = await axios.get(parsedImageUrl.toString(), {
          responseType: 'arraybuffer',
          headers: {
            'Referer': referer,
            'User-Agent': USER_AGENTS[0],
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Cookie': 'is_adult=1;'
          },
          timeout: 20000
        });

        const contentType = imageResponse.headers['content-type'];
        res.setHeader('Content-Type', contentType || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.send(imageResponse.data);
      } catch (error: any) {
        lastError = error;
        console.error(`[MangaHere Image Proxy Error] ${domainStr}: ${error.message}`);
      }
    }

    res.status(lastError ? 500 : 404).send(lastError ? 'Failed to fetch MangaHere image' : 'Image not found in source');
  });

  // Proxy for images (MangaDex, MangaHere CDN, etc.)
  // Accepts optional ?referer= to set the correct Referer header for different CDNs
  app.get('/api/proxy-image', async (req, res) => {
    const imageUrl = req.query.url as string;
    const customReferer = req.query.referer as string | undefined;
    if (!imageUrl) return res.status(400).send('URL is required');
    const parsedImageUrl = parseAllowedHttpsUrl(imageUrl);
    if (!parsedImageUrl) return res.status(403).send('URL host not allowed');

    let referer = safeReferer(customReferer, 'https://mangadex.org/');
    if (!customReferer) {
      try {
        const urlHost = parsedImageUrl.origin;
        if (imageUrl.includes('mfcdn') || imageUrl.includes('dmimg') || imageUrl.includes('mangahere')) {
          referer = 'https://www.mangahere.cc/';
        } else {
          referer = urlHost + '/';
        }
      } catch (_) {}
    }

    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        headers: {
          'Referer': referer,
          'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Dest': 'image',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'cross-site'
        },
        timeout: 20000,
        maxRedirects: 5
      });

      const contentType = response.headers['content-type'];
      res.setHeader('Content-Type', contentType || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(response.data);
    } catch (error: any) {
      console.error(`[Image Proxy Error] URL: ${imageUrl} | Message: ${error.message}`);
      if (error.response) {
        console.error(`[Image Proxy Error] Status: ${error.response.status}`);
      }
      res.status(500).send('Failed to proxy image');
    }
  });

  // Generic Proxy for other sources
  app.all('/api/proxy/:domain/*', async (req, res) => {
    const domain = normalizeAllowedHost(req.params.domain);
    if (!domain) return res.status(403).json({ error: 'Domain not allowed' });
    const path = req.params[0] || '';
    const targetUrl = `https://${domain}/${path}`;
    
    // Determine referer and fetch metadata
    let referer = `https://${domain}/`;
    let fetchMode = 'navigate';
    let fetchSite = 'none';
    let fetchDest = 'document';

    if (domain.includes('comick')) {
      referer = `https://${domain.replace('api.', '')}/`;
      fetchMode = 'cors';
      fetchSite = 'cross-site';
      fetchDest = 'empty';
    } else if (domain.includes('asura')) {
      referer = `https://${domain}/`;
      fetchMode = 'navigate';
      fetchSite = 'none';
      fetchDest = 'document';
    } else if (domain.includes('mangahere')) {
      referer = `https://${domain}/`;
      fetchMode = 'navigate';
      fetchSite = 'none';
      fetchDest = 'document';
      // If it's a mobile domain (m. or newm.) ensure we use mobile headers
      if (domain.startsWith('m.') || domain.startsWith('newm.')) {
        req.headers['is-mobile'] = 'true';
      }
      // Add a cookie to bypass some simple checks
      req.headers['cookie'] = 'is_adult=1;';
    } else if (domain.includes('reaper')) {
      referer = `https://${domain}/`;
      if (path.includes('search') || path.includes('chapters')) {
        fetchMode = 'cors';
        fetchSite = 'same-origin';
        fetchDest = 'empty';
      }
    } else if (domain.includes('flame')) {
      referer = `https://${domain}/`;
    } else if (domain.includes('immortal')) {
      referer = `https://${domain}/`;
    } else if (domain.includes('weebcentral')) {
      referer = `https://${domain}/`;
      if (path.includes('search') || path.includes('series')) {
        fetchMode = 'navigate';
        fetchSite = 'none';
        fetchDest = 'document';
      }
    } else if (domain.includes('omegascans')) {
      referer = `https://${domain}/`;
    } else if (domain.includes('theblank')) {
      referer = `https://${domain}/`;
    } else if (domain.includes('luminous')) {
      referer = `https://${domain}/`;
    } else if (domain.includes('mangasee') || domain.includes('manga4life')) {
      referer = `https://${domain}/search/`;
      if (path.includes('.php')) {
        fetchMode = 'cors';
        fetchSite = 'same-origin';
        fetchDest = 'empty';
      }
    }
    
    if (req.query.referer) referer = safeReferer(req.query.referer as string, referer);

    console.log(`[PROXY] Generic ${req.method} Request: ${targetUrl} | Referer: ${referer}`);

    const maxRetries = 3; // Increased retries
    let lastError: any;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const isMobile = req.headers['is-mobile'] === 'true';
        const userAgent = domain.includes('asura') 
          ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
          : (isMobile 
              ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1'
              : USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]);
          
        const response = await axios({
          method: req.method,
          url: targetUrl,
          params: req.query,
          data: req.body,
          headers: {
            'User-Agent': userAgent,
            'Referer': referer,
            'Cookie': domain.includes('mangahere') ? 'is_adult=1;' : undefined,
            'Accept': domain.includes('asura') 
              ? 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
              : (fetchDest === 'empty' ? 'application/json, text/javascript, */*; q=0.01' : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'),
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': (fetchDest === 'document' || domain.includes('asura')) ? '1' : undefined,
            'Sec-Ch-Ua': domain.includes('asura') 
              ? '"Google Chrome";v="121", "Not A Brand";v="99"'
              : (isMobile 
                  ? '"AppleScript";v="17", "Not-A.Brand";v="99"'
                  : '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"'),
            'Sec-Ch-Ua-Mobile': isMobile ? '?1' : '?0',
            'Sec-Ch-Ua-Platform': isMobile ? '"iOS"' : '"Windows"',
            'Sec-Fetch-Dest': fetchDest,
            'Sec-Fetch-Mode': fetchMode,
            'Sec-Fetch-Site': fetchSite,
            'Sec-Fetch-User': (fetchDest === 'document' || domain.includes('asura')) ? '?1' : undefined,
            'Sec-Purpose': fetchDest === 'document' ? 'prefetch' : undefined,
            'DNT': '1',
            'Cache-Control': 'max-age=0',
            'Pragma': 'no-cache',
            'Priority': 'u=0, i',
            ...(req.headers['cookie'] ? { 'Cookie': req.headers['cookie'] } : {}),
            ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {})
          },
          timeout: 35000, // Increased timeout to 35s
          maxRedirects: 5
        });

        const contentType = response.headers['content-type'];
        if (contentType) res.setHeader('Content-Type', contentType);
        
        if (contentType?.includes('application/json')) {
          return res.json(response.data);
        } else {
          return res.send(response.data);
        }
      } catch (error: any) {
        lastError = error;
        const status = error.response?.status;
        if (status === 403 || status === 503 || status === 429) {
          const waitTime = status === 429 ? 3000 : 1500;
          console.log(`[PROXY] Attempt ${attempt + 1} failed with ${status} for ${domain}. Retrying in ${waitTime}ms...`);
          await new Promise(r => setTimeout(r, waitTime * (attempt + 1))); // Exponential backoff
          continue;
        }
        break; // Don't retry for 404 or other errors
      }
    }

    const status = lastError.response?.status;
    const logPrefix = `[PROXY] ${status === 404 ? 'WARN' : 'ERROR'} from ${domain}/${path}:`;
    
    if (status === 404) {
      console.warn(`${logPrefix} ${lastError.message}`);
    } else {
      console.error(`${logPrefix} ${lastError.message}`);
      if (lastError.response?.data) {
        console.error(`[PROXY] Error Data:`, typeof lastError.response.data === 'string' ? lastError.response.data.substring(0, 200) : JSON.stringify(lastError.response.data).substring(0, 200));
      }
    }

    res.status(status || 500).json({
      error: `Failed to fetch from ${domain}`,
      message: lastError.message,
      details: lastError.response?.data
    });
  });

  const httpServer = http.createServer(app);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const replitDomain = process.env.REPLIT_DEV_DOMAIN;
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
