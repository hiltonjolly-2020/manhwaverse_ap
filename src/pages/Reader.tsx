import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { mangaService, Chapter } from '@/services/mangaService';
import { useSourcePreference } from '@/hooks/useSourcePreference';
import { mangaOrchestrator, SourceData } from '@/services/mangaOrchestrator';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ChevronLeft, 
  ChevronRight, 
  Settings, 
  List, 
  Home, 
  ArrowUp,
  Download,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ReaderPageProps {
  url: string;
  index: number;
  key?: any;
}

const ReaderPage = ({ url, index }: ReaderPageProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  return (
    <div className="relative w-full min-h-[400px] flex items-center justify-center bg-zinc-900/20">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-zinc-800 border-t-[#4FD1C5] rounded-full animate-spin" />
        </div>
      )}
      
      {error ? (
        <div className="flex flex-col items-center justify-center p-12 space-y-4 text-center">
          <p className="text-zinc-500 text-sm">Failed to load page {index + 1}</p>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              setError(false);
              setLoading(true);
              setRetryCount(prev => prev + 1);
            }}
            className="border-zinc-800"
          >
            Retry
          </Button>
        </div>
      ) : (
        <img
          key={`${url}-${retryCount}`}
          src={url}
          alt={`Page ${index + 1}`}
          className={`w-full h-auto block transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setLoading(false)}
          onError={() => {
            setError(true);
            setLoading(false);
          }}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
};

export default function Reader() {
  const { mangaId, chapterId } = useParams<{ mangaId: string; chapterId: string }>();
  const navigate = useNavigate();
  const { preferredSource } = useSourcePreference(mangaId || '');
  const [pages, setPages] = useState<string[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeSource, setActiveSource] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    if (!chapterId || !mangaId) return;
    setLoading(true);
    setError(null);
    try {
      const [pagesData, sourcesData] = await Promise.all([
        mangaOrchestrator.getChapterPages(chapterId),
        mangaOrchestrator.getChapters(mangaId)
      ]);
      
      setPages(pagesData);
      
      // Find the correct source's chapters
      let selectedSource: SourceData | undefined;
      
      // 1. Try to find the source that contains the current chapterId
      selectedSource = sourcesData.find(s => s.chapters.some(c => c.id === chapterId));
      
      // 2. Fallback to preferred source if current chapter isn't in any (unlikely but possible)
      if (!selectedSource) {
        selectedSource = sourcesData.find(s => s.sourceKey === preferredSource);
      }
      
      // 3. Final fallback to first available
      if (!selectedSource && sourcesData.length > 0) {
        selectedSource = sourcesData[0];
      }

      if (selectedSource) {
        setChapters(selectedSource.chapters);
        setActiveSource(selectedSource.sourceName);
      }
    } catch (error: any) {
      console.error('Error fetching chapter pages:', error);
      setError('Failed to load chapter pages. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [chapterId, mangaId]);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const scrollPos = window.scrollY;
      const windowHeight = window.innerHeight;
      const totalHeight = document.documentElement.scrollHeight;
      
      // Rough estimation of current page based on scroll position
      const pageHeight = totalHeight / pages.length;
      const current = Math.min(pages.length, Math.max(1, Math.ceil((scrollPos + windowHeight / 2) / pageHeight)));
      setCurrentPage(current);

      // Hide controls on scroll down, show on scroll up
      if (scrollPos > 100) {
        setShowControls(false);
      } else {
        setShowControls(true);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [pages.length]);

  const currentChapterIndex = chapters.findIndex(c => c.id === chapterId);
  // In a descending list [101, 100, 99], if we are at 100 (index 1):
  // Next chapter (101) is at index - 1
  // Previous chapter (99) is at index + 1
  const nextChapter = currentChapterIndex > 0 ? chapters[currentChapterIndex - 1] : null;
  const prevChapter = currentChapterIndex < chapters.length - 1 ? chapters[currentChapterIndex + 1] : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-zinc-800 border-t-[#4FD1C5] rounded-full animate-spin" />
        <p className="text-zinc-500 animate-pulse font-medium">Loading chapter...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-[#E2E8F0]">Oops! Something went wrong</h2>
          <p className="text-zinc-500 max-w-xs mx-auto">{error}</p>
        </div>
        <div className="flex gap-4">
          <Button onClick={() => fetchData()} className="bg-[#4FD1C5] hover:bg-[#38B2AC] text-black font-bold px-8">
            Try Again
          </Button>
          <Link to={`/manga/${mangaId}`}>
            <Button variant="outline" className="border-zinc-800 text-zinc-400">
              Go Back
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black" ref={containerRef}>
      {/* Top Bar */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="fixed top-0 left-0 right-0 z-50 glass border-b border-zinc-800/50 px-6 py-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <Link to={`/manga/${mangaId}`}>
                <Button variant="ghost" size="icon">
                  <ChevronLeft className="w-6 h-6" />
                </Button>
              </Link>
              <div>
                <h2 className="font-semibold text-sm line-clamp-1">
                  Chapter {chapters[currentChapterIndex]?.chapter}
                </h2>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                    {chapters[currentChapterIndex]?.title}
                  </p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#4FD1C5]/10 text-[#4FD1C5] font-bold border border-[#4FD1C5]/20">
                    {activeSource}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="text-zinc-400">
                <Settings className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-zinc-400">
                <List className="w-5 h-5" />
              </Button>
              <Link to="/">
                <Button variant="ghost" size="icon" className="text-zinc-400">
                  <Home className="w-5 h-5" />
                </Button>
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pages Container */}
      <div className="max-w-3xl mx-auto pt-20 pb-40">
        {pages.map((url, index) => (
          <ReaderPage key={index} url={url} index={index} />
        ))}

        {/* End of Chapter Navigation */}
        <div className="mt-20 px-6 space-y-8 text-center">
          <div className="space-y-2">
            <h3 className="text-2xl font-bold">You've reached the end!</h3>
            <p className="text-zinc-500">What would you like to do next?</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {nextChapter && (
              <Button 
                size="lg" 
                className="w-full sm:w-auto gap-2 px-12 bg-[#4FD1C5] hover:bg-[#38B2AC] text-black font-bold rounded-xl"
                onClick={() => navigate(`/manga/${mangaId}/chapter/${nextChapter.id}`)}
              >
                Next Chapter
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
            <Link to={`/manga/${mangaId}`}>
              <Button variant="secondary" size="lg" className="w-full sm:w-auto gap-2 px-12">
                <Info className="w-4 h-4" />
                Manga Info
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div 
        className="fixed bottom-0 left-0 right-0 z-50 h-1 bg-zinc-800"
        onClick={() => setShowControls(!showControls)}
      >
        <motion.div 
          className="h-full bg-[#4FD1C5]"
          style={{ width: `${pages.length > 0 ? (currentPage / pages.length) * 100 : 0}%` }}
        />
      </div>

      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 glass border border-zinc-800/50 rounded-full px-6 py-3 flex items-center gap-8 shadow-2xl"
          >
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                disabled={!prevChapter}
                onClick={() => prevChapter && navigate(`/manga/${mangaId}/chapter/${prevChapter.id}`)}
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <span className="text-xs font-medium tabular-nums min-w-[60px] text-center">
                {currentPage} / {pages.length}
              </span>
              <Button 
                variant="ghost" 
                size="icon" 
                disabled={!nextChapter}
                onClick={() => nextChapter && navigate(`/manga/${mangaId}/chapter/${nextChapter.id}`)}
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>

            <div className="w-px h-6 bg-zinc-800" />

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="text-zinc-400">
                <Download className="w-5 h-5" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-zinc-400"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                <ArrowUp className="w-5 h-5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
