import * as React from 'react';
import { useState, useEffect } from 'react';
import { mangaService, Manga } from '@/services/mangaService';
import { MangaCard } from '@/components/MangaCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Link, useNavigate } from 'react-router-dom';
import { Play, Info, Star, ChevronRight, Search as SearchIcon, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Home() {
  const [trending, setTrending] = useState<Manga[]>([]);
  const [latest, setLatest] = useState<Manga[]>([]);
  const [genreTops, setGenreTops] = useState<Record<string, Manga[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [trendingData, latestData] = await Promise.all([
          mangaService.getTrendingManga(10),
          mangaService.getLatestReleases(10)
        ]);
        setTrending(trendingData);
        setLatest(latestData);

        // Fetch top for a few popular genres
        const genres = ['Action', 'Fantasy', 'Romance'];
        const genrePromises = genres.map(async (genre) => {
          const tagId = await mangaService.getTagId(genre);
          if (tagId) {
            const data = await mangaService.getTrendingManga(5, 0, [tagId]);
            return { genre, data };
          }
          return { genre, data: [] };
        });

        const genreResults = await Promise.all(genrePromises);
        const genreMap: Record<string, Manga[]> = {};
        genreResults.forEach(res => {
          genreMap[res.genre] = res.data;
        });
        setGenreTops(genreMap);

      } catch (error) {
        console.error('Error fetching home data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const featuredManga = trending[0];

  return (
    <div className="space-y-12 pb-20">
      {/* Hero / Featured Card */}
      <section className="relative h-[400px] md:h-[500px] rounded-[40px] overflow-hidden border border-[#2D333B] group shadow-2xl">
        {loading ? (
          <Skeleton className="w-full h-full" />
        ) : featuredManga ? (
          <>
            <img 
              src={featuredManga.coverUrl} 
              alt={featuredManga.title}
              className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-1000 group-hover:scale-110"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 featured-gradient flex flex-col justify-end p-8 md:p-16">
              <div className="max-w-2xl space-y-6">
                <div className="flex items-center gap-3">
                  <Badge className="bg-[#4FD1C5] hover:bg-[#4FD1C5] text-black border-none px-4 py-1 text-[10px] uppercase font-bold tracking-[0.2em]">
                    Trending Today
                  </Badge>
                  <div className="flex items-center gap-1 text-yellow-500">
                    <Star className="w-4 h-4 fill-current" />
                    <span className="text-sm font-bold">9.8</span>
                  </div>
                </div>
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-[#E2E8F0] leading-none">
                  {featuredManga.title}
                </h1>
                <p className="text-[#94A3B8] text-lg line-clamp-2 leading-relaxed max-w-xl">
                  {featuredManga.description}
                </p>
                <div className="flex flex-wrap gap-4 pt-4">
                  <Link to={`/manga/${featuredManga.id}`}>
                    <Button className="bg-[#4FD1C5] hover:bg-[#38B2AC] text-black border-none px-10 h-14 text-lg font-bold rounded-2xl shadow-lg shadow-[#4FD1C5]/20">
                      <Play className="w-5 h-5 mr-2 fill-current" />
                      Start Reading
                    </Button>
                  </Link>
                  <Link to={`/manga/${featuredManga.id}`}>
                    <Button variant="outline" className="bg-white/5 backdrop-blur-md border-white/10 text-[#E2E8F0] hover:bg-white/10 px-10 h-14 text-lg font-bold rounded-2xl">
                      <Info className="w-5 h-5 mr-2" />
                      Details
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </section>

      {/* Prominent Search Bar */}
      <section className="max-w-4xl mx-auto w-full px-4">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-zinc-500" />
            <Input
              placeholder="Search your favorite manhwa..."
              className="pl-14 h-16 bg-zinc-900/50 border-zinc-800 focus:border-[#4FD1C5]/50 focus:ring-[#4FD1C5]/20 text-xl rounded-2xl"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button 
            type="button" 
            variant="outline" 
            className="h-16 px-6 rounded-2xl border-zinc-800 hover:border-[#4FD1C5]/50 gap-2"
            onClick={() => navigate('/search')}
          >
            <Filter className="w-6 h-6 text-[#4FD1C5]" />
            <span className="hidden sm:inline font-bold">FILTER</span>
          </Button>
          <Button type="submit" className="h-16 px-10 rounded-2xl bg-[#4FD1C5] text-black hover:bg-[#38B2AC] font-bold text-lg">
            Search
          </Button>
        </form>
      </section>

      {/* Latest Releases */}
      <section className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-3xl font-black tracking-tight text-[#E2E8F0]">New Releases</h2>
            <p className="text-[#94A3B8] text-sm">Freshly updated chapters for you</p>
          </div>
          <Link to="/search?sort=latest">
            <Button variant="ghost" className="text-[#4FD1C5] hover:text-[#38B2AC] hover:bg-[#4FD1C5]/10 font-bold group">
              View All 
              <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-4">
                <Skeleton className="aspect-[3/4] w-full rounded-2xl" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))
          ) : (
            latest.map((manga) => (
              <MangaCard key={manga.id} manga={manga} />
            ))
          )}
        </div>
      </section>

      {/* Genre Tops */}
      {Object.entries(genreTops).map(([genre, mangas]) => (
        <section key={genre} className="space-y-8">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-3xl font-black tracking-tight text-[#E2E8F0]">Top in {genre}</h2>
              <p className="text-[#94A3B8] text-sm">Most popular {genre.toLowerCase()} titles</p>
            </div>
            <Link to={`/search?q=${genre}&sort=popular`}>
              <Button variant="ghost" className="text-[#4FD1C5] hover:text-[#38B2AC] hover:bg-[#4FD1C5]/10 font-bold group">
                Explore {genre}
                <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8">
            {(mangas as Manga[]).map((manga) => (
              <MangaCard key={manga.id} manga={manga} />
            ))}
          </div>
        </section>
      ))}

      {/* Popular Genres */}
      <section className="space-y-8 bg-[#121418] p-12 rounded-[40px] border border-[#2D333B]">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-black tracking-tight text-[#E2E8F0]">Browse by Genre</h2>
          <p className="text-[#94A3B8]">Find exactly what you're looking for</p>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          {['Action', 'Fantasy', 'Romance', 'Adventure', 'Comedy', 'Drama', 'Slice of Life', 'Supernatural', 'Martial Arts', 'Isekai', 'Leveling', 'Sci-Fi', 'Horror', 'Mystery', 'Psychological', 'Sports', 'Smut', 'Ecchi', 'Harem', 'Historical', 'Thriller', 'Adult', 'Erotica', 'GL', 'BL'].map((genre) => (
            <Link key={genre} to={`/search?q=${genre}`}>
              <Button 
                variant="outline" 
                className="bg-[#1A1D23] border-[#2D333B] text-[#94A3B8] hover:text-[#E2E8F0] hover:bg-[#4FD1C5] hover:border-[#4FD1C5] hover:text-black rounded-2xl px-8 h-12 font-bold transition-all duration-300"
              >
                {genre}
              </Button>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
