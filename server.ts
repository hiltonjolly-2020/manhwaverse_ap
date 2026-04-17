import express from 'express';
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

async function startServer() {
  const app = express();
  const PORT = 5000;

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

    const domainStr = (domain as string) || 'www.mangahere.cc';
    const pageNum = page || 1;
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

      // Pattern 1: Decode P.A.C.K.E.R block → extract newImgs[pageIndex]
      // MangaHere mobile packs ALL page URLs into one eval'd block on page 1 only.
      // Each individual page also contains the same packed block so we can extract
      // the specific image for this page number.
      const unpacked = depackPACKER(html);
      if (unpacked && (/var\s+newImgs\s*=/.test(unpacked) || /newImgs\s*=/.test(unpacked))) {
        // Extract URLs — decoded JS has \' escape sequences, so exclude backslash from capture
        const urlPattern = /['"\\]([^'"\\]*mangahere[^'"\\]*\.(?:jpg|jpeg|png|webp|gif)[^'"\\]*)['"\\]/gi;
        const imgUrls: string[] = [];
        let mm: RegExpExecArray | null;
        while ((mm = urlPattern.exec(unpacked)) !== null) imgUrls.push(mm[1]);
        if (imgUrls[idx]) imageUrl = imgUrls[idx];
      }

      // Pattern 2: Plain newImgList (desktop site fallback)
      if (!imageUrl) {
        const newImgListMatch = html.match(/var\s+newImgList\s*=\s*(\[[\s\S]*?\]);/) ||
                                html.match(/newImgList\s*=\s*(\[[\s\S]*?\]);/);
        if (newImgListMatch) {
          try {
            const urls: string[] = JSON.parse(newImgListMatch[1]);
            if (urls[idx]) imageUrl = urls[idx];
          } catch (_) {}
        }
      }

      // Pattern 3: JavaScript variable assignments
      if (!imageUrl) {
        const varMatch =
          html.match(/cp_image\.src\s*=\s*["']([^"']+)["']/) ||
          html.match(/var\s+pix\s*=\s*["']([^"']+)["']/) ||
          html.match(/(?:imageUrl|image_url)\s*=\s*["']([^"']+)["']/);
        if (varMatch) imageUrl = varMatch[1];
      }

      if (imageUrl && imageUrl.startsWith('//')) imageUrl = 'https:' + imageUrl;

      if (!imageUrl) {
        console.error(`[MangaHere Image Proxy] No image found for ${targetUrl} (page idx ${idx})`);
        return res.status(404).send('Image not found in source');
      }

      console.log(`[MangaHere Image Proxy] Found: ${imageUrl}`);

      const imageResponse = await axios.get(imageUrl, {
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
      res.send(imageResponse.data);
    } catch (error: any) {
      console.error(`[MangaHere Image Proxy Error] ${error.message}`);
      res.status(500).send('Failed to fetch MangaHere image');
    }
  });

  // Proxy for images (MangaDex, MangaHere CDN, etc.)
  // Accepts optional ?referer= to set the correct Referer header for different CDNs
  app.get('/api/proxy-image', async (req, res) => {
    const imageUrl = req.query.url as string;
    const customReferer = req.query.referer as string | undefined;
    if (!imageUrl) return res.status(400).send('URL is required');

    // Determine the right referer: use custom if provided, otherwise infer from the URL host
    let referer = customReferer || 'https://mangadex.org/';
    if (!customReferer) {
      try {
        const urlHost = new URL(imageUrl).origin;
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
    const domain = req.params.domain;
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
    
    if (req.query.referer) referer = req.query.referer as string;

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

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
