import * as React from 'react';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { mangaService, Manga } from '@/services/mangaService';
import { MangaCard } from '@/components/MangaCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Search as SearchIcon, SlidersHorizontal, X, ChevronLeft, ChevronRight, Filter, RotateCcw, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

const GENRES = [
  'Action', 'Fantasy', 'Romance', 'Isekai', 'Leveling', 'Comedy', 'Drama', 
  'Supernatural', 'Martial Arts', 'Adventure', 'Sci-Fi', 'Horror', 'Mystery', 
  'Psychological', 'Slice of Life', 'Sports', 'Smut', 'Ecchi', 'Harem', 
  'Historical', 'Mecha', 'Music', 'Reincarnation', 'School Life', 'Thriller', 'Tragedy',
  'Adult', 'Erotica', 'GL', 'BL'
];

const DEMOGRAPHICS = ['shounen', 'shoujo', 'seinen', 'josei'];
const STATUSES = ['ongoing', 'completed', 'cancelled', 'hiatus'];
const TYPES = [
  { label: 'Manhwa (Korean)', value: 'ko' },
  { label: 'Manhua (Chinese)', value: 'zh,zh-hk' },
  { label: 'Manga (Japanese)', value: 'ja' },
  { label: 'Others', value: 'others' }
];

const CONTENT_RATING_GENRES: Record<string, string> = {
  Adult: 'pornographic',
  Erotica: 'erotica',
  Smut: 'erotica',
  Ecchi: 'suggestive'
};

const KEYWORD_GENRES = ['Leveling'];

const OTHER_ORIGINAL_LANGUAGES = [
  'en', 'fr', 'de', 'es', 'es-la', 'it', 'pt', 'pt-br', 'ru', 'uk', 'pl', 'tr',
  'vi', 'id', 'th', 'ar', 'hi', 'ms', 'tl', 'fa', 'he', 'ro', 'hu', 'cs', 'bg',
  'el', 'nl', 'sv', 'fi', 'da', 'no', 'bn', 'ta', 'ka', 'mn'
];

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [excludedGenres, setExcludedGenres] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedDemographic, setSelectedDemographic] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [tagMode, setTagMode] = useState<'AND' | 'OR'>('AND');
  
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'relevance');
  const [page, setPage] = useState(0);
  const resultsPerPage = 20;

  const performSearch = async () => {
    setLoading(true);
    try {
      const order: any = {};
      if (sortBy === 'latest') order['order[updatedAt]'] = 'desc';
      if (sortBy === 'popular') order['order[followedCount]'] = 'desc';
      if (sortBy === 'rating') order['order[rating]'] = 'desc';
      if (sortBy === 'relevance') order['order[relevance]'] = 'desc';

      const tagGenreSelections = selectedGenres.filter(genre => !CONTENT_RATING_GENRES[genre] && !KEYWORD_GENRES.includes(genre));
      const excludedTagGenreSelections = excludedGenres.filter(genre => !CONTENT_RATING_GENRES[genre] && !KEYWORD_GENRES.includes(genre));

      const tagIds = await Promise.all(
        tagGenreSelections.map(genre => mangaService.getTagId(genre))
      );
      const filteredTagIds = tagIds.filter((id): id is string => id !== null);

      const excludedTagIds = await Promise.all(
        excludedTagGenreSelections.map(genre => mangaService.getTagId(genre))
      );
      const filteredExcludedTagIds = excludedTagIds.filter((id): id is string => id !== null);

      let groupId = null;
      if (selectedGroup) {
        groupId = await mangaService.getGroupId(selectedGroup);
      }

      const appliedQuery = searchParams.get('q') || '';
      const queryGenre = GENRES.find(g => g.toLowerCase() === appliedQuery.toLowerCase());
      const queryGenreTagId = queryGenre && !CONTENT_RATING_GENRES[queryGenre] && !KEYWORD_GENRES.includes(queryGenre)
        ? await mangaService.getTagId(queryGenre)
        : null;
      const keywordFilters = [
        ...selectedGenres.filter(genre => KEYWORD_GENRES.includes(genre)),
        ...(queryGenre && KEYWORD_GENRES.includes(queryGenre) ? [queryGenre] : [])
      ];
      const isQueryGenre = !!queryGenre && (!!queryGenreTagId || !!CONTENT_RATING_GENRES[queryGenre] || KEYWORD_GENRES.includes(queryGenre));
      const finalTitle = keywordFilters[0] || (isQueryGenre ? '' : appliedQuery);
      
      // Handle Adult/Erotica as special genres if they aren't tags
      let contentRatings = ['safe', 'suggestive', 'erotica', 'pornographic'];
      const selectedContentRatings = selectedGenres
        .map(genre => CONTENT_RATING_GENRES[genre])
        .filter(Boolean);
      if (queryGenre && CONTENT_RATING_GENRES[queryGenre]) selectedContentRatings.push(CONTENT_RATING_GENRES[queryGenre]);
      if (selectedContentRatings.length > 0) contentRatings = Array.from(new Set(selectedContentRatings));
      excludedGenres.forEach(genre => {
        const rating = CONTENT_RATING_GENRES[genre];
        if (rating) contentRatings = contentRatings.filter(r => r !== rating);
      });
      
      let originalLanguages: string[] | undefined = undefined;
      if (selectedType) {
        if (selectedType === 'others') {
          originalLanguages = OTHER_ORIGINAL_LANGUAGES;
        } else {
          originalLanguages = selectedType.split(',');
        }
      }

      const finalTags = isQueryGenre 
        ? Array.from(new Set([...filteredTagIds, queryGenreTagId].filter(Boolean) as string[]))
        : filteredTagIds;

      const data = await mangaService.searchManga(
        finalTitle, 
        resultsPerPage, 
        page * resultsPerPage, 
        order, 
        finalTags, 
        groupId || undefined,
        selectedStatus ? [selectedStatus] : undefined,
        selectedDemographic ? [selectedDemographic] : undefined,
        selectedYear ? parseInt(selectedYear) : undefined,
        tagMode,
        filteredExcludedTagIds,
        contentRatings,
        originalLanguages
      );
      let filteredData = data;
      if (selectedType === 'others') {
        filteredData = data.filter((manga: any) => {
          const language = manga.originalLanguage || manga.language || manga.attributes?.originalLanguage;
          return language ? !['ko', 'ja', 'zh', 'zh-hk'].includes(language) : true;
        });
      }
      setResults(filteredData);
    } catch (error) {
      console.error('Error searching manga:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const q = searchParams.get('q') || '';
    const s = searchParams.get('sort') || 'relevance';
    
    const matchedGenre = GENRES.find(g => g.toLowerCase() === q.toLowerCase());
    if (matchedGenre && !selectedGenres.includes(matchedGenre)) {
      setSelectedGenres(prev => [...prev, matchedGenre]);
    }

    setQuery(q);
    setSortBy(s);
  }, [searchParams]);

  useEffect(() => {
    performSearch();
  }, [searchParams, sortBy, selectedGenres, excludedGenres, selectedGroup, selectedDemographic, selectedStatus, selectedType, selectedYear, tagMode, page]);

  const clearFilters = () => {
    setSelectedGenres([]);
    setExcludedGenres([]);
    setSelectedGroup(null);
    setSelectedDemographic(null);
    setSelectedStatus(null);
    setSelectedType(null);
    setSelectedYear(null);
    setTagMode('AND');
    setQuery('');
    setPage(0);
    setSearchParams({});
  };

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setPage(0);
    setSearchParams({ q: query.trim(), sort: sortBy });
  };

  const toggleGenre = (genre: string) => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(prev => prev.filter(g => g !== genre));
      setExcludedGenres(prev => [...prev, genre]);
    } else if (excludedGenres.includes(genre)) {
      setExcludedGenres(prev => prev.filter(g => g !== genre));
    } else {
      setSelectedGenres(prev => [...prev, genre]);
    }
  };

  return (
    <div className="p-6 md:p-12 space-y-8 max-w-7xl mx-auto">
      <div className="space-y-4">
        <h1 className="text-4xl font-black tracking-tight text-[#E2E8F0]">Advanced Search</h1>
        <p className="text-[#94A3B8]">Find your favorite manhwa with precision filters.</p>
      </div>

      <div className="space-y-6">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
            <Input
              placeholder="Search titles, authors, groups..."
              className="pl-12 h-14 bg-zinc-900/50 border-zinc-800 focus:border-[#4FD1C5]/50 focus:ring-[#4FD1C5]/20 text-lg rounded-xl"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button 
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setShowFilters(!showFilters)}
            className={`h-14 px-6 rounded-xl border-zinc-800 gap-2 transition-all ${showFilters ? 'bg-[#4FD1C5] text-black border-[#4FD1C5] hover:bg-[#4FD1C5]/90' : 'hover:border-[#4FD1C5]/50'}`}
          >
            <Filter className="w-5 h-5" />
            <span className="hidden sm:inline">FILTER</span>
          </Button>
          <Button size="lg" type="submit" className="h-14 px-10 rounded-xl bg-[#4FD1C5] text-black hover:bg-[#4FD1C5]/90 font-bold text-lg shadow-lg shadow-[#4FD1C5]/10">
            Search
          </Button>
        </form>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="p-6 bg-zinc-900/30 border border-zinc-800 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Sort By</label>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="bg-[#1A1D23] border-[#2D333B] h-12 rounded-xl text-zinc-200 focus:ring-[#4FD1C5]/20 focus:border-[#4FD1C5]/50">
                      <SelectValue placeholder="Sort by..." />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A1D23] border-[#2D333B] text-zinc-200">
                      <SelectItem value="relevance">Relevance</SelectItem>
                      <SelectItem value="latest">Latest Updates</SelectItem>
                      <SelectItem value="popular">Most Popular</SelectItem>
                      <SelectItem value="rating">Highest Rated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Demographic</label>
                  <Select value={selectedDemographic || 'any'} onValueChange={(v) => setSelectedDemographic(v === 'any' ? null : v)}>
                    <SelectTrigger className="bg-[#1A1D23] border-[#2D333B] h-12 rounded-xl text-zinc-200 focus:ring-[#4FD1C5]/20 focus:border-[#4FD1C5]/50">
                      <SelectValue placeholder="Any Demographic" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A1D23] border-[#2D333B] text-zinc-200">
                      <SelectItem value="any">Any Demographic</SelectItem>
                      {DEMOGRAPHICS.map(d => (
                        <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Status</label>
                  <Select value={selectedStatus || 'any'} onValueChange={(v) => setSelectedStatus(v === 'any' ? null : v)}>
                    <SelectTrigger className="bg-[#1A1D23] border-[#2D333B] h-12 rounded-xl text-zinc-200 focus:ring-[#4FD1C5]/20 focus:border-[#4FD1C5]/50">
                      <SelectValue placeholder="Any Status" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A1D23] border-[#2D333B] text-zinc-200">
                      <SelectItem value="any">Any Status</SelectItem>
                      {STATUSES.map(s => (
                        <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Type</label>
                  <Select value={selectedType || 'any'} onValueChange={(v) => setSelectedType(v === 'any' ? null : v)}>
                    <SelectTrigger className="bg-[#1A1D23] border-[#2D333B] h-12 rounded-xl text-zinc-200 focus:ring-[#4FD1C5]/20 focus:border-[#4FD1C5]/50">
                      <SelectValue placeholder="Any Type" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A1D23] border-[#2D333B] text-zinc-200">
                      <SelectItem value="any">Any Type</SelectItem>
                      {TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-4 md:col-span-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Genres</label>
                      <p className="text-[10px] text-zinc-600">Click once to include, twice to exclude</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-zinc-600">Match Mode:</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setTagMode(tagMode === 'AND' ? 'OR' : 'AND')}
                        className="h-6 text-[10px] font-bold bg-zinc-800 hover:bg-zinc-700"
                      >
                        {tagMode === 'AND' ? 'ALL SELECTED' : 'ANY SELECTED'}
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {GENRES.map((genre) => {
                      const isSelected = selectedGenres.includes(genre);
                      const isExcluded = excludedGenres.includes(genre);
                      
                      return (
                        <Badge
                          key={genre}
                          variant="secondary"
                          className={`cursor-pointer px-4 py-1.5 transition-all border ${
                            isSelected 
                              ? 'bg-[#4FD1C5] text-black border-[#4FD1C5] hover:bg-[#4FD1C5]/80' 
                              : isExcluded
                              ? 'bg-red-500/20 text-red-500 border-red-500/50 hover:bg-red-500/30'
                              : 'bg-zinc-900/50 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                          }`}
                          onClick={() => toggleGenre(genre)}
                        >
                          {genre}
                          {isSelected && <X className="w-3 h-3 ml-2" />}
                          {isExcluded && <X className="w-3 h-3 ml-2 rotate-45" />}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                <div className="md:col-span-3 flex items-center justify-between pt-4 border-t border-zinc-800/50">
                  <Button variant="ghost" onClick={clearFilters} className="text-zinc-500 hover:text-white gap-2">
                    <RotateCcw className="w-4 h-4" />
                    Reset Filters
                  </Button>
                  <div className="flex gap-3">
                    <Button 
                      variant="outline" 
                      className="border-zinc-800 gap-2"
                      onClick={() => {
                        const randomGenre = GENRES[Math.floor(Math.random() * GENRES.length)];
                        setSelectedGenres([randomGenre]);
                        handleSearch();
                      }}
                    >
                      <Sparkles className="w-4 h-4 text-[#4FD1C5]" />
                      I'm Feeling Lucky
                    </Button>
                    <Button onClick={handleSearch} className="bg-[#4FD1C5] text-black hover:bg-[#4FD1C5]/90 font-bold px-8">
                      Apply Filters
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {loading ? (
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-[300px] w-full rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))
        ) : results.length > 0 ? (
          <>
            {results.map((manga: Manga) => (
              <MangaCard key={manga.id} manga={manga} />
            ))}
            
            <div className="col-span-full flex items-center justify-center gap-4 pt-8">
              <Button 
                variant="outline" 
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                className="border-zinc-800 h-11 px-6 rounded-xl hover:border-[#4FD1C5]/50"
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Previous
              </Button>
              <div className="bg-zinc-900 border border-zinc-800 h-11 px-6 flex items-center rounded-xl text-sm font-medium">
                Page {page + 1}
              </div>
              <Button 
                variant="outline" 
                disabled={results.length < resultsPerPage}
                onClick={() => setPage(p => p + 1)}
                className="border-zinc-800 h-11 px-6 rounded-xl hover:border-[#4FD1C5]/50"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </>
        ) : (query || selectedGenres.length > 0 || excludedGenres.length > 0 || selectedGroup || selectedDemographic || selectedStatus || selectedType || selectedYear) && !loading ? (
          <div className="col-span-full py-20 text-center space-y-6">
            <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mx-auto border border-zinc-800">
              <SearchIcon className="w-10 h-10 text-zinc-700" />
            </div>
            <div className="space-y-2">
              <p className="text-xl font-bold text-white">No results found on MangaDex</p>
              <p className="text-zinc-500 max-w-xs mx-auto">Try adjusting your filters or try a Global Search across all sources.</p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button variant="outline" onClick={clearFilters} className="border-zinc-800">
                Clear all filters
              </Button>
              <Button 
                onClick={() => {
                  toast.info("Global Search is coming soon! For now, try searching for the exact title.");
                }}
                className="bg-[#4FD1C5] text-black hover:bg-[#4FD1C5]/90 font-bold"
              >
                Global Search (All Sources)
              </Button>
            </div>
          </div>
        ) : (
          <div className="col-span-full py-20 text-center space-y-4">
            <p className="text-zinc-500">Enter a search term or select a filter to begin exploring.</p>
          </div>
        )}
      </div>
    </div>
  );
}
