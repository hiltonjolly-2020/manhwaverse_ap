import * as React from 'react';
import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { mangaService, Manga, Chapter } from '@/services/mangaService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bookmark, Play, Share2, Info, List, Star, Check, ChevronLeft, MessageSquare, Send, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { auth, db, handleFirestoreError, OperationType, signInWithGoogle } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc, setDoc, deleteDoc, onSnapshot, collection, query, orderBy, addDoc, serverTimestamp, where, getDocs } from 'firebase/firestore';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';

import { SourceSelector } from '@/components/SourceSelector';
import { useSourcePreference } from '@/hooks/useSourcePreference';
import { mangaOrchestrator, SourceData } from '@/services/mangaOrchestrator';

export default function ManhwaDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user] = useAuthState(auth);
  const [manga, setManga] = useState<Manga | null>(null);
  const [allSources, setAllSources] = useState<SourceData[]>([]);
  const { preferredSource, updatePreference } = useSourcePreference(id || '');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeSource, setActiveSource] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [comment, setComment] = useState('');
  const [page, setPage] = useState(0);
  const chaptersPerPage = 24;

  const [comments, setComments] = useState<any[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);

  useEffect(() => {
    const fetchComments = async () => {
      if (!id) return;
      setCommentsLoading(true);
      try {
        const q = query(
          collection(db, 'comments'),
          where('mangaId', '==', id),
          orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        const commentsData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setComments(commentsData);
      } catch (error) {
        console.error('Error fetching comments:', error);
      } finally {
        setCommentsLoading(false);
      }
    };
    fetchComments();
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [id]);

  useEffect(() => {
    console.log('[ManhwaDetails] Syncing chapters. allSources:', allSources.length, 'preferredSource:', preferredSource, 'activeSource:', activeSource);
    
    if (allSources.length > 0) {
      // Try to find the preferred source first
      const preferred = allSources.find(s => s.sourceKey === preferredSource);
      console.log('[ManhwaDetails] Found preferred match:', preferred?.sourceName, 'chapters:', preferred?.chapters.length);
      
      if (preferred) {
        // Only update if chapters actually changed or activeSource is wrong
        if (chapters !== preferred.chapters) {
          console.log('[ManhwaDetails] Updating chapters from preferred source');
          setChapters(preferred.chapters);
        }
        if (activeSource !== preferred.sourceName) {
          console.log('[ManhwaDetails] Updating activeSource name to:', preferred.sourceName);
          setActiveSource(preferred.sourceName);
        }
      } else if (!activeSource) {
        // Fallback to the first available source (usually MangaDex)
        const first = allSources[0];
        console.log('[ManhwaDetails] Falling back to first source:', first.sourceName);
        setChapters(first.chapters);
        setActiveSource(first.sourceName);
        updatePreference(first.sourceKey);
      }
    }
  }, [allSources, preferredSource, activeSource, chapters, updatePreference]);

  const fetchData = async (isRetry = false) => {
    if (!id) return;
    
    // Always clear sources and chapters when loading a new manga or retrying
    if (isRetry) setIsRetrying(true);
    setAllSources([]);
    setChapters([]);
    setActiveSource('');
    setLoading(true);
    
    try {
      // 1. Fetch basic details
      const mangaData = await mangaService.getMangaDetails(id);
      setManga(mangaData);
      
      // 2. Fetch MangaDex source (Fast)
      const mdSource = await mangaOrchestrator.getMangaDexSource(id);
      if (mdSource) {
        setAllSources([mdSource]);
        
        // If MangaDex is preferred or no preference yet, set it immediately to avoid "0 chapters" flash
        if (!preferredSource || preferredSource === 'mangadex') {
          console.log('[ManhwaDetails] Auto-selecting MangaDex source');
          setChapters(mdSource.chapters);
          setActiveSource(mdSource.sourceName);
        }
        
        setLoading(false); // Stop main loading early if we have MangaDex
      }

      // 3. Fetch other sources in background (Slower)
      setBackgroundLoading(true);
      mangaOrchestrator.getOtherSources(id).then(otherSources => {
        setAllSources(prev => {
          const combined = [...prev];
          otherSources.forEach(s => {
            if (!combined.find(c => c.sourceKey === s.sourceKey)) {
              combined.push(s);
            }
          });
          return combined;
        });
      }).finally(() => {
        setIsRetrying(false);
        setLoading(false);
        setBackgroundLoading(false);
      });

    } catch (error) {
      console.error('Error fetching manga details:', error);
      toast.error("Failed to fetch details.");
      setLoading(false);
      setIsRetrying(false);
    }
  };

  const handleSourceChange = (sourceKey: string) => {
    const selected = allSources.find(s => s.sourceKey === sourceKey);
    if (selected) {
      setChapters(selected.chapters);
      setActiveSource(selected.sourceName);
      updatePreference(sourceKey);
      setPage(0);
      toast.success(`Switched to ${selected.sourceName}`);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please login to comment");
      return;
    }
    if (!comment.trim() || !id) return;

    try {
      await addDoc(collection(db, 'comments'), {
        mangaId: id,
        userId: user.uid,
        userName: user.displayName,
        userPhoto: user.photoURL,
        text: comment.trim(),
        createdAt: serverTimestamp()
      });
      setComment('');
      toast.success("Comment added!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'comments');
    }
  };

  const paginatedChapters = chapters.slice(page * chaptersPerPage, (page + 1) * chaptersPerPage);
  const totalPages = Math.ceil(chapters.length / chaptersPerPage);

  useEffect(() => {
    if (!user || !id) return;
    const bookmarkRef = doc(db, 'bookmarks', `${user.uid}_${id}`);
    const unsubscribe = onSnapshot(bookmarkRef, (doc) => {
      setIsBookmarked(doc.exists());
    }, (error) => {
      console.error("Error listening to bookmark", error);
    });
    return () => unsubscribe();
  }, [user, id]);

  const toggleBookmark = async () => {
    if (!user) {
      toast.error("Please login to bookmark manhwa");
      return;
    }
    if (!manga) return;

    const bookmarkRef = doc(db, 'bookmarks', `${user.uid}_${manga.id}`);
    try {
      if (isBookmarked) {
        await deleteDoc(bookmarkRef);
        toast.success("Removed from bookmarks");
      } else {
        await setDoc(bookmarkRef, {
          userId: user.uid,
          mangaId: manga.id,
          title: manga.title,
          coverUrl: manga.coverUrl,
          addedAt: new Date().toISOString()
        });
        toast.success("Added to bookmarks");
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bookmarks/${user.uid}_${manga.id}`);
    }
  };

  if (loading) {
    return (
      <div className="p-6 md:p-12 space-y-8">
        <div className="flex flex-col md:flex-row gap-8">
          <Skeleton className="w-full md:w-[300px] aspect-[2/3] rounded-xl" />
          <div className="flex-1 space-y-4">
            <Skeleton className="h-12 w-1/2" />
            <Skeleton className="h-4 w-1/4" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!manga) return <div>Manga not found.</div>;

  return (
    <div className="pb-20">
      {/* Backdrop */}
      <div className="relative h-[40vh] overflow-hidden">
        <img
          src={manga.coverUrl}
          className="w-full h-full object-cover blur-2xl opacity-20 scale-110"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        
        {/* Back Button */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute top-8 left-8 z-20 bg-black/20 backdrop-blur-md border border-white/10 hover:bg-black/40 text-white rounded-full w-12 h-12"
          onClick={() => navigate(-1)}
        >
          <ChevronLeft className="w-6 h-6" />
        </Button>
      </div>

      <div className="px-6 md:px-12 -mt-32 relative z-10">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Cover */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full md:w-[300px] shrink-0"
          >
            <img
              src={manga.coverUrl}
              alt={manga.title}
              className="w-full aspect-[2/3] object-cover rounded-2xl shadow-2xl border border-zinc-800"
              referrerPolicy="no-referrer"
            />
          </motion.div>

          {/* Info */}
          <div className="flex-1 space-y-6 pt-4 md:pt-32">
            <div className="space-y-2">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tighter">{manga.title}</h1>
              <div className="flex items-center gap-4 text-zinc-400">
                <span className="flex items-center gap-1">
                  <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                  9.2
                </span>
                <span>•</span>
                <span>{manga.author}</span>
                <span>•</span>
                <span className="capitalize">{manga.status}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {manga.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="bg-zinc-800 border-zinc-700 text-zinc-100 hover:text-[#4FD1C5] hover:border-[#4FD1C5]/50 transition-colors px-3 py-1 text-[11px] font-medium">
                  {tag}
                </Badge>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              {chapters.length > 0 ? (
                <Link to={`/manga/${manga.id}/chapter/${chapters[chapters.length - 1]?.id}`}>
                  <Button size="lg" className="bg-[#4FD1C5] hover:bg-[#38B2AC] text-black border-none px-8 h-12 font-bold gap-2 rounded-xl shadow-lg shadow-[#4FD1C5]/10">
                    <Play className="w-4 h-4 fill-current" />
                    Read Now
                  </Button>
                </Link>
              ) : (
                <Button size="lg" disabled className="bg-zinc-800 text-zinc-500 border-none px-8 h-12 font-bold gap-2 rounded-xl">
                  <Play className="w-4 h-4 fill-current" />
                  No Chapters
                </Button>
              )}
              <Button 
                size="lg" 
                variant="outline"
                className={`gap-2 px-8 h-12 font-bold rounded-xl border-[#2D333B] transition-all ${isBookmarked ? 'bg-[#1A1D23] text-[#4FD1C5] border-[#4FD1C5]' : 'bg-transparent text-[#E2E8F0] hover:bg-[#1A1D23] hover:border-[#4FD1C5]/50'}`}
                onClick={toggleBookmark}
              >
                {isBookmarked ? <Check className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                {isBookmarked ? "Bookmarked" : "Bookmark"}
              </Button>
              <Button size="lg" variant="ghost" className="gap-2 text-[#94A3B8] hover:text-[#4FD1C5] rounded-xl">
                <Share2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-12">
          <Tabs defaultValue="chapters" className="w-full">
            <TabsList className="bg-[#1A1D23] border border-[#2D333B] p-1 h-12 rounded-xl">
              <TabsTrigger value="chapters" className="gap-2 px-6 data-[state=active]:bg-[#2D333B] data-[state=active]:text-[#4FD1C5] text-zinc-400 font-bold transition-all rounded-lg">
                <List className="w-4 h-4" />
                Chapters
              </TabsTrigger>
              <TabsTrigger value="details" className="gap-2 px-6 data-[state=active]:bg-[#2D333B] data-[state=active]:text-[#4FD1C5] text-zinc-400 font-bold transition-all rounded-lg">
                <Info className="w-4 h-4" />
                Details
              </TabsTrigger>
              <TabsTrigger value="comments" className="gap-2 px-6 data-[state=active]:bg-[#2D333B] data-[state=active]:text-[#4FD1C5] text-zinc-400 font-bold transition-all rounded-lg">
                <MessageSquare className="w-4 h-4" />
                Comments ({comments?.length || 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chapters" className="mt-6 space-y-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-zinc-100">Select Source</h3>
                  <div className="flex items-center gap-2">
                    {backgroundLoading && (
                      <span className="text-[10px] text-zinc-500 animate-pulse flex items-center gap-1">
                        <div className="w-1 h-1 rounded-full bg-[#4FD1C5]" />
                        Scanning background sources...
                      </span>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-xs text-[#4FD1C5] hover:text-[#4FD1C5] hover:bg-[#4FD1C5]/10 font-bold gap-2"
                      onClick={() => fetchData(true)}
                      disabled={isRetrying}
                    >
                    <motion.div
                      animate={isRetrying ? { rotate: 360 } : {}}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    >
                      <Play className="w-3 h-3 rotate-90" />
                    </motion.div>
                    Refresh All
                  </Button>
                  </div>
                </div>
                <SourceSelector 
                  sources={allSources} 
                  selectedSourceKey={preferredSource} 
                  onSelect={handleSourceChange} 
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#1A1D23]/50 p-4 rounded-xl border border-[#2D333B]">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-[#4FD1C5] animate-pulse" />
                  <p className="text-sm font-medium text-zinc-300">
                    Showing chapters from: <span className="text-[#4FD1C5] font-bold">{activeSource}</span>
                  </p>
                  <Badge variant="outline" className="text-[10px] bg-[#4FD1C5]/5 border-[#4FD1C5]/20 text-[#4FD1C5]">
                    {chapters.length} Chapters
                  </Badge>
                  {activeSource === 'MangaHere' && chapters.length > 0 && (
                     <Badge variant="outline" className="text-[10px] bg-green-500/10 border-green-500/30 text-green-400 animate-in fade-in zoom-in duration-500">
                       Live Fetch Verified
                     </Badge>
                  )}
                </div>
              </div>

              {chapters.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {paginatedChapters.map((chapter) => {
                      const isExternal = !!chapter.externalUrl;
                      const content = (
                        <div className={`p-4 rounded-xl bg-[#1A1D23] border transition-all flex justify-between items-center group ${isExternal ? 'border-amber-500/30 hover:border-amber-500/50' : 'border-[#2D333B] hover:border-[#4FD1C5]/50'}`}>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className={`font-bold text-sm transition-colors ${isExternal ? 'text-amber-200 group-hover:text-amber-400' : 'text-[#E2E8F0] group-hover:text-[#4FD1C5]'}`}>
                                Chapter {chapter.chapter}
                              </p>
                              {chapter.id.includes('mangahere') && (
                                <Badge variant="outline" className="text-[8px] h-4 px-1 border-green-500/30 bg-green-500/5 text-green-400">HERO</Badge>
                              )}
                              {isExternal && (
                                <Badge variant="outline" className="text-[8px] h-4 px-1 border-amber-500 bg-amber-500/10 text-amber-500 uppercase font-black shadow-[0_0_10px_rgba(245,158,11,0.2)]">External</Badge>
                              )}
                            </div>
                            <p className="text-xs text-[#94A3B8] line-clamp-1">{chapter.title}</p>
                          </div>
                          <span className="text-[10px] text-[#94A3B8] group-hover:text-[#4FD1C5]">
                            {new Date(chapter.publishAt).toLocaleDateString()}
                          </span>
                        </div>
                      );

                      if (isExternal) {
                        return (
                          <a key={chapter.id} href={chapter.externalUrl} target="_blank" rel="noopener noreferrer">
                            {content}
                          </a>
                        );
                      }

                      return (
                        <Link key={chapter.id} to={`/manga/${manga.id}/chapter/${chapter.id}`}>
                          {content}
                        </Link>
                      );
                    })}
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-4 pt-4">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        disabled={page === 0}
                        onClick={() => setPage(p => p - 1)}
                        className="border-[#2D333B] text-[#94A3B8]"
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Prev
                      </Button>
                      <span className="text-xs text-[#94A3B8]">
                        Page {page + 1} of {totalPages}
                      </span>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        disabled={page === totalPages - 1}
                        onClick={() => setPage(p => p + 1)}
                        className="border-[#2D333B] text-[#94A3B8]"
                      >
                        Next
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-20 text-center space-y-6 bg-[#121418] rounded-2xl border border-[#2D333B] border-dashed">
                  <div className="space-y-2">
                    <p className="text-zinc-500">No readable chapters found for this title on the current sources.</p>
                    <p className="text-xs text-zinc-600">Try retrying to check all backup sources again.</p>
                  </div>
                  <Button 
                    variant="outline" 
                    className="border-[#2D333B] hover:border-[#4FD1C5]/50 text-[#4FD1C5] font-bold gap-2" 
                    onClick={() => fetchData(true)}
                    disabled={isRetrying}
                  >
                    <motion.div
                      animate={isRetrying ? { rotate: 360 } : {}}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    >
                      <Play className="w-3 h-3 rotate-90" />
                    </motion.div>
                    {isRetrying ? 'Checking all sources...' : 'Retry All Sources'}
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="details" className="mt-6 max-w-3xl">
              <div className="space-y-6">
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg text-[#E2E8F0]">Synopsis</h3>
                  <p className="text-[#94A3B8] leading-relaxed">
                    {manga.description}
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-1">
                    <p className="text-xs text-[#94A3B8] uppercase tracking-wider">Release Year</p>
                    <p className="font-medium text-[#E2E8F0]">{manga.year || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-[#94A3B8] uppercase tracking-wider">Content Rating</p>
                    <p className="font-medium text-[#E2E8F0] capitalize">{manga.rating}</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="comments" className="mt-6 max-w-3xl space-y-8">
              {user ? (
                <form onSubmit={handleAddComment} className="flex gap-4">
                  <img src={user.photoURL || ''} className="w-10 h-10 rounded-full border border-[#4FD1C5]" />
                  <div className="flex-1 space-y-3">
                    <Input 
                      placeholder="Add a comment..." 
                      className="bg-[#1A1D23] border-[#2D333B] text-[#E2E8F0] focus:border-[#4FD1C5]/50 focus:ring-[#4FD1C5]/20"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                    <div className="flex justify-end">
                      <Button type="submit" size="sm" className="bg-[#4FD1C5] hover:bg-[#38B2AC] text-black font-bold gap-2">
                        <Send className="w-3 h-3" />
                        Post
                      </Button>
                    </div>
                  </div>
                </form>
              ) : (
                <div className="p-8 rounded-2xl border border-dashed border-[#2D333B] text-center space-y-4">
                  <p className="text-[#94A3B8]">Please sign in to join the conversation.</p>
                  <Button variant="outline" className="border-[#2D333B] text-[#E2E8F0] hover:border-[#4FD1C5]/50 hover:text-[#4FD1C5]" onClick={signInWithGoogle}>
                    Sign In
                  </Button>
                </div>
              )}

              <div className="space-y-6">
                {comments?.map((c: any) => (
                  <div key={c.id} className="flex gap-4">
                    <img src={c.userPhoto || ''} className="w-10 h-10 rounded-full border border-[#2D333B]" />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#E2E8F0]">{c.userName}</span>
                        <span className="text-[10px] text-[#94A3B8]">
                          {c.createdAt?.toDate().toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-[#94A3B8] leading-relaxed">{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
