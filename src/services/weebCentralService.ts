import axios from 'axios';

const WEEB_CENTRAL_URL = '/api/proxy/weebcentral.com';

export const weebCentralService = {
  async searchManga(title: string) {
    try {
      // WeebCentral search
      const response = await axios.get(`${WEEB_CENTRAL_URL}/search/data`, {
        params: { query: title }
      });
      const results = response.data.results || [];
      
      return results.slice(0, 5).map((m: any) => ({
        id: m.slug,
        title: m.title
      }));
    } catch (error) {
      console.error('[WeebCentral] Search error:', error);
      return [];
    }
  },

  async getChapters(mangaSlug: string) {
    try {
      const response = await axios.get(`${WEEB_CENTRAL_URL}/series/${mangaSlug}/full-chapter-list`);
      // This usually returns an HTML fragment with the chapter list
      const html = response.data;
      
      // Basic regex parsing for chapters (in a real app, use a proper parser)
      const chapterRegex = /href="\/chapters\/(.*?)"/g;
      const chapters = [];
      let match;
      
      while ((match = chapterRegex.exec(html)) !== null) {
        const chapId = match[1];
        // Extract chapter number from ID or text
        const numMatch = chapId.match(/chapter-(\d+)/);
        const num = numMatch ? numMatch[1] : '0';
        
        chapters.push({
          id: `weebcentral:${chapId}`,
          chapter: num,
          volume: '',
          title: `Chapter ${num}`,
          pages: 0,
          publishAt: new Date().toISOString(),
          source: 'Weeb Central'
        });
      }
      
      return chapters;
    } catch (error) {
      console.error('[WeebCentral] Chapters error:', error);
      return [];
    }
  },

  async getChapterPages(chapterId: string) {
    const chapId = chapterId.replace('weebcentral:', '');
    try {
      const response = await axios.get(`${WEEB_CENTRAL_URL}/chapters/${chapId}/images?full=true`);
      const html = response.data;
      
      // Extract image URLs
      const imgRegex = /src="(https:\/\/.*?)"/g;
      const pages = [];
      let match;
      
      while ((match = imgRegex.exec(html)) !== null) {
        pages.push(`/api/proxy-image?url=${encodeURIComponent(match[1])}`);
      }
      
      return pages;
    } catch (error) {
      console.error('[WeebCentral] Pages error:', error);
      throw error;
    }
  }
};
