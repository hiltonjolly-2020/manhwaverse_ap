import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { MangaCard } from '@/components/MangaCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bookmark, History, Download, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { signInWithGoogle } from '@/lib/firebase';

export default function Library() {
  const [user, loadingAuth] = useAuthState(auth);
  
  const [bookmarks, setBookmarks] = useState<any[]>([]);
  const [loadingBookmarks, setLoadingBookmarks] = useState(true);

  useEffect(() => {
    const fetchBookmarks = async () => {
      if (!user) {
        setLoadingBookmarks(false);
        return;
      }
      setLoadingBookmarks(true);
      try {
        const q = query(
          collection(db, 'bookmarks'), 
          where('userId', '==', user.uid),
          orderBy('addedAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        const bookmarksData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setBookmarks(bookmarksData);
      } catch (error) {
        console.error('Error fetching bookmarks:', error);
      } finally {
        setLoadingBookmarks(false);
      }
    };
    fetchBookmarks();
  }, [user]);

  if (loadingAuth) {
    return (
      <div className="p-6 md:p-12 space-y-8">
        <Skeleton className="h-12 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[300px] w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center space-y-6">
        <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center">
          <Lock className="w-10 h-10 text-zinc-700" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold">Login Required</h2>
          <p className="text-zinc-500 max-w-xs mx-auto">
            You need an account to bookmark manhwa, track your progress, and download chapters.
          </p>
        </div>
        <Button size="lg" className="px-12" onClick={signInWithGoogle}>Login with Google</Button>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-12 space-y-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tighter">Your Library</h1>
        <p className="text-zinc-500">Manage your bookmarks, history, and downloads.</p>
      </div>

      <Tabs defaultValue="bookmarks" className="w-full">
        <TabsList className="bg-zinc-900/50 border-zinc-800 p-1">
          <TabsTrigger value="bookmarks" className="gap-2">
            <Bookmark className="w-4 h-4" />
            Bookmarks
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="w-4 h-4" />
            History
          </TabsTrigger>
          <TabsTrigger value="downloads" className="gap-2">
            <Download className="w-4 h-4" />
            Downloads
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bookmarks" className="mt-8">
          {loadingBookmarks ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-[300px] w-full rounded-xl" />
              ))}
            </div>
          ) : bookmarks && bookmarks.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {bookmarks.map((bookmark: any) => (
                <MangaCard 
                  key={bookmark.mangaId} 
                  manga={{
                    id: bookmark.mangaId,
                    title: bookmark.title,
                    coverUrl: bookmark.coverUrl,
                    description: '',
                    status: '',
                    year: null,
                    tags: [],
                    author: '',
                    rating: ''
                  }} 
                />
              ))}
            </div>
          ) : (
            <div className="py-20 text-center space-y-4">
              <p className="text-zinc-500">You haven't bookmarked any manhwa yet.</p>
              <Link to="/">
                <Button variant="outline">Browse Trending</Button>
              </Link>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-8">
          <div className="py-20 text-center text-zinc-500">
            Reading history is coming soon.
          </div>
        </TabsContent>

        <TabsContent value="downloads" className="mt-8">
          <div className="py-20 text-center text-zinc-500">
            Offline downloads are coming soon.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
