import axios from 'axios';

const COMICK_DOMAINS = ['api.comick.io', 'api.comick.fun', 'api.comick.ink', 'api.comick.app', 'api.comick.xyz'];

export interface ComickChapter {
  id: string;
  hid: string;
  chap: string;
  vol: string | null;
  title: string | null;
  created_at: string;
  group_name: string[];
}

export const comickService = {
  async searchManga(title: string) {
    for (const domain of COMICK_DOMAINS) {
      const baseUrl = `/api/proxy/${domain}`;
      try {
        const response = await axios.get(`${baseUrl}/v1.0/search`, {
          params: { q: title, t: 'true', limit: 5 }
        });
        return response.data;
      } catch (error) {
        console.warn(`[Comick] Search failed on ${domain}, trying next...`);
      }
    }
    return [];
  },

  async getChapters(mangaHid: string) {
    for (const domain of COMICK_DOMAINS) {
      const baseUrl = `/api/proxy/${domain}`;
      try {
        const response = await axios.get(`${baseUrl}/manga/${mangaHid}/chapters`, {
          params: { lang: 'en', limit: 1000 }
        });
        
        const chapters = response.data.chapters || [];
        return chapters.map((c: any) => ({
          id: `comick:${c.hid}`,
          chapter: c.chap,
          volume: c.vol || '',
          title: c.title || `Chapter ${c.chap}`,
          pages: 0, 
          publishAt: c.created_at,
          scanlationGroup: c.group_name?.[0],
          source: 'Comick.io'
        }));
      } catch (error) {
        console.warn(`[Comick] Chapters failed on ${domain}, trying next...`);
      }
    }
    return [];
  },

  async getChapterPages(chapterHid: string) {
    for (const domain of COMICK_DOMAINS) {
      const baseUrl = `/api/proxy/${domain}`;
      try {
        const response = await axios.get(`${baseUrl}/chapter/${chapterHid}`);
        const images = response.data.chapter.images || [];
        return images.map((img: any) => 
          `/api/proxy-image?url=${encodeURIComponent(`https://meo.comick.pictures/${img.url}`)}`
        );
      } catch (error) {
        console.warn(`[Comick] Pages failed on ${domain}, trying next...`);
      }
    }
    throw new Error('Failed to fetch pages from all Comick domains');
  }
};
