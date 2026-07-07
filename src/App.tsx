import { useState, useEffect, FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  Clock,
  User,
  Mail,
  ExternalLink,
  Check,
  Copy,
  RotateCcw,
  Trash2,
  Edit3,
  Bookmark,
  Sparkles,
  MapPin,
  TrendingUp,
  Library,
  Calendar,
  X,
  Info,
  ChevronRight,
  Send,
  BookMarked
} from 'lucide-react';
import { Book, BorrowLog, DesignTemplate } from './types';
import { INITIAL_BOOKS, CATEGORIES, SHELVES } from './data';
import { supabase } from './lib/supabase';

// Helper to get random cover gradient
const COVER_GRADIENTS = [
  'from-blue-600 to-indigo-800',
  'from-emerald-600 to-teal-800',
  'from-amber-600 to-red-800',
  'from-rose-600 to-purple-900',
  'from-sky-500 to-blue-700',
  'from-orange-500 to-amber-800',
  'from-purple-600 to-indigo-900',
  'from-teal-600 to-cyan-800',
  'from-cyan-700 to-blue-900',
  'from-red-500 to-rose-700',
];

const getCoverGradientForTitle = (title: string) => {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COVER_GRADIENTS.length;
  return COVER_GRADIENTS[index];
};

const mapDbToBook = (dbBook: any): Book => {
  return {
    id: String(dbBook.id),
    title: dbBook.title || '',
    author: dbBook.author || '',
    translator: dbBook.translator || '',
    publisher: dbBook.publisher || '',
    description: dbBook.synopsis || '',
    keywords: dbBook.keywords || '',
    totalCopies: Number(dbBook.inventory || 1),
    availableCopies: Number(dbBook.available || 1),
    shelfLocation: dbBook.site || 'A架-上层',
    category: dbBook.category || '学术写作',
    coverBg: getCoverGradientForTitle(dbBook.title || ''),
    addedDate: dbBook.created_at ? new Date(dbBook.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    douban: dbBook.douban || ''
  };
};

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'info' | 'error';
}

export default function App() {
  // --- Persistent State ---
  const [books, setBooks] = useState<Book[]>([]);
  const [template, setTemplate] = useState<DesignTemplate>('editorial');

  // Base default categories and shelf locations
  const defaultCategories = ['学术写作', '科学技术', '开放科学', '经管励志', '人文社科', '文学艺术'];
  const defaultShelves = ['A架-上层', 'A架-中层', 'A架-下层', 'B架-上层', 'B架-下层', 'C架-新书区'];

  // Dynamically compute the categories from existing books + default categories
  const currentCategories = Array.from(new Set([
    ...defaultCategories,
    ...books.map(b => b.category).filter(Boolean)
  ]));
  const dynamicCategories = ['全部分类', ...currentCategories];

  // Dynamically compute the shelf locations from existing books + default shelves
  const dynamicShelves = Array.from(new Set([
    ...defaultShelves,
    ...books.map(b => b.shelfLocation).filter(Boolean)
  ]));

  // --- UI State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('全部分类');
  const [sortBy, setSortBy] = useState<'default' | 'title' | 'newest'>('default');
  
  // Modals & Drawer state
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  
  // Form States
  const [bookForm, setBookForm] = useState({
    title: '',
    author: '',
    translator: '',
    publisher: '',
    keywords: '',
    totalCopies: 1,
    availableCopies: 1,
    category: '学术写作',
    shelfLocation: 'A架-上层',
    description: '',
    douban: ''
  });

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [copiedEmail, setCopiedEmail] = useState(false);

  // --- Load Initial Data from Supabase & Subscribe to Realtime ---
  const fetchBooks = async () => {
    try {
      const { data, error } = await supabase
        .from('books')
        .select('*')
        .order('id', { ascending: true });
      
      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        const mappedBooks = data.map(mapDbToBook);
        setBooks(mappedBooks);
      } else {
        // Automatically seed table if it starts completely empty to keep preview lively
        console.log('Database table is empty. Auto-seeding with INITIAL_BOOKS...');
        const seedRows = INITIAL_BOOKS.map(b => ({
          title: b.title,
          author: b.author,
          translator: b.translator || null,
          publisher: b.publisher || null,
          synopsis: b.description || null,
          keywords: b.keywords || null,
          inventory: b.totalCopies,
          available: b.availableCopies,
          site: b.shelfLocation,
          douban: b.douban || null,
          category: b.category
        }));

        const { error: seedError } = await supabase
          .from('books')
          .insert(seedRows);

        if (seedError) {
          console.error('Failed to seed books:', seedError);
          setBooks(INITIAL_BOOKS);
        } else {
          const { data: refetchedData, error: refetchError } = await supabase
            .from('books')
            .select('*')
            .order('id', { ascending: true });
          if (!refetchError && refetchedData) {
            setBooks(refetchedData.map(mapDbToBook));
          } else {
            setBooks(INITIAL_BOOKS);
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch books from Supabase:', err);
      showToast('获取数据库图书失败: ' + (err.message || err), 'error');
      
      // Fallback
      const savedBooks = localStorage.getItem('mdpi_library_books');
      if (savedBooks) {
        setBooks(JSON.parse(savedBooks));
      } else {
        setBooks(INITIAL_BOOKS);
      }
    }
  };

  useEffect(() => {
    fetchBooks();

    const savedTemplate = localStorage.getItem('mdpi_library_template');
    if (savedTemplate) {
      setTemplate(savedTemplate as DesignTemplate);
    } else {
      setTemplate('editorial');
    }

    // Subscribe to database realtime changes
    const subscription = supabase
      .channel('public:books')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'books'
        },
        (payload) => {
          console.log('Realtime change received:', payload);
          fetchBooks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const changeTemplate = (newTemplate: DesignTemplate) => {
    setTemplate(newTemplate);
    localStorage.setItem('mdpi_library_template', newTemplate);
    showToast(`已切换至: ${
      newTemplate === 'editorial' ? '人文雅致 (Editorial Aesthetic)' :
      newTemplate === 'academic' ? '学术经典 (MDPI Blue)' : 
      newTemplate === 'cozy' ? '温馨书香 (Cozy Study)' : '未来极简 (Cyber Tech)'
    }`, 'info');
  };

  // --- Toast helper ---
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  // --- Clipboard helper ---
  const handleCopyEmail = () => {
    navigator.clipboard.writeText('yongzhi.xia@mdpi.com');
    setCopiedEmail(true);
    showToast('管理员邮箱已复制到剪贴板！', 'success');
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  // --- Book CRUD Operations via Supabase ---
  const handleOpenAddModal = () => {
    setEditingBook(null);
    setBookForm({
      title: '',
      author: '',
      translator: '',
      publisher: '',
      keywords: '',
      totalCopies: 1,
      availableCopies: 1,
      category: '学术写作',
      shelfLocation: 'A架-上层',
      description: '',
      douban: ''
    });
    setShowAddEditModal(true);
  };

  const handleOpenEditModal = (book: Book) => {
    setEditingBook(book);
    setBookForm({
      title: book.title,
      author: book.author,
      translator: book.translator || '',
      publisher: book.publisher || '',
      keywords: book.keywords || '',
      totalCopies: book.totalCopies,
      availableCopies: book.availableCopies,
      category: book.category,
      shelfLocation: book.shelfLocation,
      description: book.description || '',
      douban: book.douban || ''
    });
    setShowAddEditModal(true);
  };

  const handleSaveBook = async (e: FormEvent) => {
    e.preventDefault();
    if (!bookForm.title.trim() || !bookForm.author.trim()) {
      showToast('请填写完整的书名与作者！', 'error');
      return;
    }

    const bookPayload = {
      title: bookForm.title.trim(),
      author: bookForm.author.trim(),
      translator: bookForm.translator.trim() || null,
      publisher: bookForm.publisher.trim() || null,
      synopsis: bookForm.description.trim() || null,
      keywords: bookForm.keywords.trim() || null,
      inventory: Number(bookForm.totalCopies),
      available: Number(bookForm.availableCopies),
      site: bookForm.shelfLocation,
      category: bookForm.category,
      douban: bookForm.douban.trim() || null
    };

    try {
      if (editingBook) {
        // Edit mode
        const { error } = await supabase
          .from('books')
          .update(bookPayload)
          .eq('id', editingBook.id);

        if (error) throw error;
        showToast(`已成功修改图书《${bookForm.title}》信息！`, 'success');
      } else {
        // Add mode
        const { error } = await supabase
          .from('books')
          .insert([bookPayload]);

        if (error) throw error;
        showToast(`已成功录入新书《${bookForm.title}》！`, 'success');
      }
      setShowAddEditModal(false);
    } catch (error: any) {
      console.error('Error saving book:', error);
      showToast('保存失败: ' + (error.message || error), 'error');
    }
  };

  const handleDeleteBook = async (id: string, title: string) => {
    if (confirm(`确定要下架并删除图书《${title}》吗？`)) {
      try {
        const { error } = await supabase
          .from('books')
          .delete()
          .eq('id', id);

        if (error) throw error;
        showToast(`图书《${title}》已成功下架！`, 'info');
      } catch (error: any) {
        console.error('Error deleting book:', error);
        showToast('删除失败: ' + (error.message || error), 'error');
      }
    }
  };

  // --- Filtering & Sorting computation ---
  const filteredBooks = books.filter((book) => {
    const matchesSearch = 
      book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (book.keywords && book.keywords.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (book.translator && book.translator.toLowerCase().includes(searchQuery.toLowerCase())) ||
      book.shelfLocation.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === '全部分类' || book.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });


  const sortedBooks = [...filteredBooks].sort((a, b) => {
    if (sortBy === 'title') {
      return a.title.localeCompare(b.title, 'zh');
    }
    if (sortBy === 'newest') {
      return b.addedDate.localeCompare(a.addedDate);
    }
    return 0; // default (manual order in storage)
  });

  // --- Global stats ---
  const totalBookCount = books.reduce((acc, b) => acc + b.totalCopies, 0);
  const totalAvailableCount = books.reduce((acc, b) => acc + b.availableCopies, 0);

  // --- Styling variables mapped to selected design template ---
  const styles = {
    editorial: {
      bodyBg: 'bg-[#FAF8F5] text-[#2C2A29] font-serif min-h-screen selection:bg-[#8E5A3C] selection:text-white',
      card: 'bg-white border border-[#E5E0D5] rounded-none overflow-hidden transition-all duration-500 hover:shadow-[0_15px_40px_-10px_rgba(142,90,60,0.08)] hover:border-[#8E5A3C]/40',
      header: 'bg-[#FAF8F5] text-[#2C2A29] border-b border-[#E5E0D5]',
      brandBadge: 'bg-[#8E5A3C] text-white tracking-[0.15em] font-sans text-[9px] uppercase font-bold py-1 px-3 rounded-none',
      btnPrimary: 'bg-[#2C2A29] hover:bg-[#8E5A3C] text-white font-sans text-xs font-semibold uppercase tracking-[0.15em] transition-all duration-300 rounded-none shadow-xs',
      btnSecondary: 'border border-[#2C2A29]/40 text-[#2C2A29] hover:bg-[#FAF8F5] font-sans text-[10px] font-bold uppercase tracking-widest transition-all duration-300 rounded-none',
      badge: 'bg-[#8E5A3C]/10 text-[#8E5A3C] border border-[#8E5A3C]/20 text-[9px] tracking-wider uppercase py-1 px-2.5 rounded-none font-sans font-bold',
      badgeShelf: 'text-[10px] font-mono text-[#8A8172] border border-[#E5E0D5]/60 bg-[#FAF8F5]/50 px-2 py-0.5 rounded-none',
      textAccent: 'text-[#8E5A3C]',
      input: 'bg-transparent border-b border-[#2C2A29]/30 text-[#2C2A29] pb-1.5 focus:border-[#8E5A3C] focus:outline-none tracking-widest uppercase rounded-none placeholder-[#8A8172]/50 text-xs font-sans',
      sidebarCard: 'border border-[#E5E0D5] p-6 bg-white rounded-none shadow-xs',
      divider: 'border-[#E5E0D5]',
      tagline: 'text-[#8A8172] uppercase tracking-[0.15em] text-xs font-sans font-medium',
      anniversaryBanner: 'bg-[#FAF8F5] border border-[#E5E0D5] text-[#2C2A29] font-serif'
    },
    academic: {
      bodyBg: 'bg-[#F4F7FB] text-slate-800 font-sans min-h-screen selection:bg-[#0f5ca8] selection:text-white',
      card: 'bg-white border border-slate-200/70 rounded-xl overflow-hidden transition-all duration-500 shadow-[0_8px_30px_rgb(0,0,0,0.015)] hover:shadow-[0_20px_40px_rgba(15,92,168,0.07)] hover:border-[#0f5ca8]/30',
      header: 'bg-gradient-to-r from-[#F4F7FB] via-[#EBF2F9] to-[#E2EDF8] text-slate-800 border-b border-slate-200/60',
      brandBadge: 'bg-[#0f5ca8]/10 text-[#0f5ca8] border border-[#0f5ca8]/20 tracking-[0.1em] text-[9px] font-semibold py-1 px-3 rounded-full',
      btnPrimary: 'bg-[#0f5ca8] hover:bg-blue-800 text-white font-sans text-xs font-medium shadow-xs transition-all duration-300 rounded-lg hover:shadow-[0_4px_12px_rgba(15,92,168,0.2)]',
      btnSecondary: 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/80 font-sans text-[10px] font-semibold transition-all duration-300 rounded-lg',
      badge: 'bg-blue-50/80 text-[#0f5ca8] border border-blue-100/60 text-[9px] font-semibold py-1 px-2.5 rounded-md',
      badgeShelf: 'bg-indigo-50/80 text-indigo-700 border border-indigo-100/60 text-[9px] font-semibold py-1 px-2.5 rounded-md',
      textAccent: 'text-[#0f5ca8]',
      input: 'bg-white border border-slate-200 text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-[#0f5ca8] text-xs rounded-lg transition-all p-2.5',
      sidebarCard: 'bg-white border border-slate-200/80 rounded-xl shadow-xs p-6',
      divider: 'border-slate-150',
      tagline: 'text-slate-500 tracking-wide text-xs',
      anniversaryBanner: 'bg-blue-500/5 border border-blue-500/10 text-[#0f5ca8]'
    },
    cozy: {
      bodyBg: 'bg-[#FCFAF6] text-[#42342A] font-serif min-h-screen selection:bg-[#8C6239] selection:text-white',
      card: 'bg-[#FAF6EE] border border-[#E6DEC9] rounded-2xl overflow-hidden transition-all duration-500 cozy-shadow hover:shadow-[0_20px_45px_rgba(140,98,57,0.1)] hover:border-[#8C6239]/40',
      header: 'bg-[#FCFAF6] text-[#42342A] border-b border-[#E6DEC9]',
      brandBadge: 'bg-[#5C4033]/10 text-[#5C4033] border border-[#5C4033]/20 tracking-[0.12em] text-[9px] font-bold py-1 px-3 rounded-full',
      btnPrimary: 'bg-[#8C6239] hover:bg-[#734E2B] text-white font-sans text-xs font-medium cozy-shadow transition-all duration-300 rounded-full',
      btnSecondary: 'bg-[#FAF6EE] hover:bg-[#ECE4D5] text-[#5C4033] border border-[#DDD0B7] font-sans text-[10px] font-semibold transition-all duration-300 rounded-full',
      badge: 'bg-[#F2ECE1] text-[#734E2B] border border-[#E2D5C3] text-[9px] font-medium py-1 px-2.5 rounded-full',
      badgeShelf: 'bg-amber-150/40 text-amber-800 border border-amber-200/40 text-[9px] py-1 px-2.5 rounded-full',
      textAccent: 'text-[#8C6239]',
      input: 'bg-[#FAF6EE] border border-[#DDD0B7] text-[#42342A] focus:ring-2 focus:ring-amber-600/20 focus:border-[#8C6239] text-xs rounded-full px-3 py-1.5 transition-all',
      sidebarCard: 'bg-[#FAF6EE] border border-dashed border-[#DDD0B7] rounded-2xl p-6 shadow-xs',
      divider: 'border-[#E6DEC9]',
      tagline: 'text-[#8C7A6B] tracking-wide text-xs font-sans',
      anniversaryBanner: 'bg-amber-500/5 border border-amber-500/10 text-[#8C6239]'
    },
    minimalist: {
      bodyBg: 'bg-[#F8F9FA] text-black font-sans min-h-screen selection:bg-black selection:text-white',
      card: 'bg-white border border-[#E5E5E5] rounded-none overflow-hidden transition-all duration-500 hover:border-black hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,0.02)]',
      header: 'bg-[#F8F9FA] text-black border-b border-[#E5E5E5]',
      brandBadge: 'bg-black text-white tracking-[0.2em] font-mono text-[8px] uppercase font-bold py-1 px-3 rounded-none',
      btnPrimary: 'bg-black hover:bg-neutral-800 text-white font-mono text-[10px] uppercase font-bold tracking-[0.15em] transition-all duration-300 rounded-none',
      btnSecondary: 'bg-white hover:bg-neutral-50 text-black border border-black font-mono text-[9px] uppercase tracking-widest transition-all duration-300 rounded-none',
      badge: 'bg-neutral-100 text-black border border-neutral-200 text-[8px] tracking-wider uppercase py-1 px-2.5 rounded-none font-mono font-bold',
      badgeShelf: 'bg-neutral-50 text-neutral-500 border border-neutral-200 text-[8px] tracking-wider uppercase py-1 px-2.5 rounded-none font-mono',
      textAccent: 'text-black',
      input: 'bg-white border border-[#E5E5E5] focus:border-black text-xs font-mono rounded-none focus:outline-none transition-all p-2.5',
      sidebarCard: 'bg-white border border-[#E5E5E5] rounded-none p-6 shadow-xs',
      divider: 'border-[#E5E5E5]',
      tagline: 'text-neutral-500 tracking-widest text-[10px] font-mono uppercase',
      anniversaryBanner: 'bg-neutral-100 border border-[#E5E5E5] text-black font-mono text-xs'
    }
  }[template];

  // Dynamic book cover rendering for high-end artistic representation
  const renderBookCover = (book: Book, activeTemplate: DesignTemplate) => {
    const idNum = Number(book.id) || 1;
    const styleIndex = idNum % 4;

    return (
      <div className={`h-32 p-4 relative overflow-hidden flex flex-col justify-between border-b transition-all duration-300 ${
        activeTemplate === 'editorial' ? 'bg-[#FAF8F5] border-[#E5E0D5]' :
        activeTemplate === 'academic' ? 'bg-[#F1F6FA] border-blue-100/60' :
        activeTemplate === 'cozy' ? 'bg-[#FAF6EE] border-[#ECE3D4]' :
        'bg-white border-[#E5E5E5]'
      }`}>
        {/* Dynamic Modern Abstract Art Graphics */}
        <div className="absolute inset-0 pointer-events-none opacity-40 overflow-hidden select-none">
          {styleIndex === 0 && (
            /* Bauhaus Sun and Arch */
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="absolute w-20 h-20 rounded-full bg-gradient-to-tr from-amber-500/20 to-orange-400/20 -right-2 -bottom-2 blur-xs" />
              <div className="absolute w-14 h-24 border border-amber-600/10 rounded-t-full -left-1 top-2" />
            </div>
          )}
          {styleIndex === 1 && (
            /* Swiss Grid & Line Art */
            <div className="absolute inset-0 p-3 flex flex-col justify-between">
              <div className="w-full h-[1px] bg-slate-400/15" />
              <div className="w-full h-[1px] bg-slate-400/15" />
              <div className="w-full h-[1px] bg-slate-400/15" />
              <div className="absolute right-8 top-0 w-[1px] h-full bg-slate-400/15" />
              <div className="absolute left-1/3 top-6 w-8 h-8 rounded-full border border-blue-500/10" />
            </div>
          )}
          {styleIndex === 2 && (
            /* Modernist Minimal Overlap Shapes */
            <div className="absolute inset-0">
              <div className="absolute w-16 h-16 rounded-full bg-emerald-600/10 -left-4 -top-4" />
              <div className="absolute w-14 h-14 bg-teal-500/10 rotate-45 right-4 bottom-1" />
              <div className="absolute right-0 top-0 w-6 h-full bg-slate-200/10 border-l border-slate-300/10" />
            </div>
          )}
          {styleIndex === 3 && (
            /* Classical Serif Typography Accents */
            <div className="absolute inset-0 flex items-end justify-end p-2 pr-4">
              <span className="font-serif italic text-8xl text-amber-900/5 select-none leading-none -mb-4">
                {book.title.charAt(0)}
              </span>
              <div className="absolute left-4 top-3 w-3 h-3 rounded-full bg-rose-500/10" />
            </div>
          )}
        </div>

        {/* Book Metadata Badge */}
        <div className="relative z-10 flex items-start justify-between">
          <span className={`text-[8px] px-2 py-0.5 uppercase tracking-widest font-sans font-semibold border ${
            activeTemplate === 'editorial' ? 'bg-[#8E5A3C]/10 text-[#8E5A3C] border-[#8E5A3C]/20 rounded-none' :
            activeTemplate === 'academic' ? 'bg-[#0f5ca8]/10 text-[#0f5ca8] border-[#0f5ca8]/20 rounded-full' :
            activeTemplate === 'cozy' ? 'bg-[#8C6239]/10 text-[#8C6239] border-[#8C6239]/20 rounded-full' :
            'bg-black text-white border-black rounded-none'
          }`}>
            {book.category}
          </span>
          <span className="text-[10px] font-mono opacity-50 flex items-center gap-1">
            <MapPin className="w-2.5 h-2.5 shrink-0" />
            {book.shelfLocation}
          </span>
        </div>

        {/* Book Title with High-end Typography */}
        <div className="relative z-10 mt-2">
          <h3 className={`leading-tight line-clamp-2 ${
            activeTemplate === 'editorial' ? 'font-serif italic text-base font-bold text-[#1A1A1A]' :
            activeTemplate === 'academic' ? 'font-sans font-bold text-[14px] text-slate-800' :
            activeTemplate === 'cozy' ? 'font-serif text-[#42342A] text-[15px] font-semibold' :
            'font-mono tracking-tight text-xs font-bold text-black'
          }`}>
            {book.title}
          </h3>
        </div>
      </div>
    );
  };

  return (
    <div id="main-container" className={styles.bodyBg}>
      {/* Toast Containers */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className={`p-4 rounded-lg shadow-lg text-sm max-w-sm pointer-events-auto flex items-center gap-3 border ${
                toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                toast.type === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200' :
                'bg-blue-50 text-blue-800 border-blue-200'
              }`}
            >
              {toast.type === 'success' ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <Info className="w-4 h-4 shrink-0" />}
              <span>{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* --- Main Header / Brand Hero --- */}
      <header className={`relative py-10 md:py-14 ${styles.header} transition-colors duration-300 overflow-hidden`}>
        {/* Wuhan Skyline Silhouette Vector Design */}
        <div className={`absolute bottom-0 right-0 h-32 md:h-44 w-full max-w-5xl pointer-events-none select-none ${styles.textAccent} opacity-10 z-0 overflow-hidden`}>
          <svg viewBox="0 0 1000 240" className="w-full h-full" preserveAspectRatio="none">
            <path 
              fill="currentColor"
              d="
                M 0,240 
                L 0,160 L 30,160 L 30,240 
                L 45,240 L 45,130 L 75,130 L 75,240 
                L 90,240 L 90,190 L 120,190 L 120,240 
                
                /* Yellow Crane Tower */
                L 150,240 
                L 150,215 
                L 155,215 
                L 155,190 
                L 150,190 
                Q 160,185 165,190 
                L 165,165 
                L 160,165 
                Q 170,160 175,165 
                L 175,145 
                L 170,145 
                Q 180,140 185,145 
                L 190,145 
                L 200,115 
                L 200,100 
                L 202,100 
                L 202,115 
                L 212,145 
                Q 222,140 232,145 
                L 227,145 
                L 227,165 
                Q 232,160 242,165 
                L 237,165 
                L 237,190 
                Q 242,185 252,190 
                L 247,190 
                L 247,215 
                L 250,215 
                L 250,240 
                
                /* Spacing & Greenland Center */
                L 280,240 
                L 300,240 
                C 315,180 330,100 340,30 
                Q 342,25 344,30 
                C 354,100 369,180 384,240 
                
                /* Modern buildings */
                L 405,240 
                L 405,100 L 435,100 L 435,240 
                L 450,240 
                L 450,150 L 475,150 L 475,240 
                
                /* TV Needle Tower */
                L 515,240 
                L 515,160 L 518,160 L 518,60 L 522,60 L 522,160 L 525,160 L 525,240 
                
                /* Slanted building */
                L 550,240 
                L 550,110 L 600,80 L 600,240 
                
                /* Wuhan Yangtze Bridge starting deck */
                L 620,240 
                L 640,210 
                L 1000,210 
                L 1000,240 
                Z
              "
            />
            {/* Bridge Arches & Pillars under the deck */}
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              d="
                M 640,210 L 1000,210
                M 660,210 Q 680,230 700,210
                M 720,210 Q 740,230 760,210
                M 780,210 Q 800,230 820,210
                M 840,210 Q 860,230 880,210
                M 900,210 Q 920,230 940,210
                M 960,210 Q 980,230 1000,210
              "
            />
            {/* Subtly animated river waves to make it lively and crafted */}
            <path
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="4 8"
              className="animate-[pulse_3s_infinite]"
              d="
                M 10,233 C 50,231 100,235 150,233 C 200,231 250,235 300,233 C 350,231 400,235 450,233
                M 480,235 C 530,233 580,237 630,235 C 680,233 730,237 780,235 C 830,233 880,237 930,235
              "
            />
          </svg>
          {/* Left-side soft gradient overlay to guarantee readability of title/tagline */}
          <div className={`absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r pointer-events-none ${
            template === 'editorial' ? 'from-[#FAF8F5] to-transparent' :
            template === 'academic' ? 'from-[#F4F7FB] to-transparent' :
            template === 'cozy' ? 'from-[#FCFAF6] to-transparent' :
            'from-[#F8F9FA] to-transparent'
          }`} />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              {/* Brand Logo & Milestone Accent */}
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <span className={`font-sans font-extrabold text-2xl md:text-3xl tracking-wider ${
                  template === 'editorial' ? 'text-[#8E5A3C]' :
                  template === 'academic' ? 'text-[#0f5ca8]' :
                  template === 'cozy' ? 'text-[#8C6239]' :
                  'text-black'
                }`}>
                  MDPI
                </span>
                
                <span className={`text-[10px] px-2.5 py-0.5 rounded-none uppercase tracking-widest font-sans font-bold shadow-xs ${styles.brandBadge}`}>
                  光谷办公室 (Guanggu Office)
                </span>
              </div>

              <h1 className="tracking-tight mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className={`text-4xl md:text-6xl font-extrabold tracking-wide ${
                  template === 'editorial' ? 'font-serif italic font-medium text-[#2C2A29]' :
                  template === 'cozy' ? 'font-serif text-[#42342A]' :
                  template === 'academic' ? 'text-slate-800' : 'text-black font-mono font-bold'
                }`}>
                  图书角
                </span>
                <span className={`text-lg md:text-2xl font-light tracking-[0.2em] uppercase opacity-60 ${
                  template === 'editorial' ? 'font-serif text-[#8A8172]' :
                  template === 'cozy' ? 'font-serif text-[#8C7A6B]' :
                  template === 'minimalist' ? 'font-mono' : 'font-sans'
                }`}>
                  Book Corner
                </span>
              </h1>
              <p className={`text-xs md:text-sm max-w-2xl leading-relaxed ${styles.tagline}`}>
                欢迎光临MDPI光谷办公室图书角<br />让好书流通，让思想碰撞 · 知海无涯，学无止境
              </p>
            </div>
          </div>

          {/* Core Mini Metrics Bar - Re-designed light theme styling */}
          <div className={`grid grid-cols-3 gap-4 mt-8 md:mt-12 p-5 transition-all duration-300 ${
            template === 'editorial' ? 'bg-white border border-[#E5E0D5] text-[#2C2A29]' :
            template === 'academic' ? 'bg-white/70 backdrop-blur-md border border-slate-200/60 rounded-xl text-slate-800 shadow-xs' :
            template === 'cozy' ? 'bg-[#FAF6EE]/80 backdrop-blur-md border border-[#E6DEC9] rounded-2xl text-[#42342A] cozy-shadow' :
            'bg-white border border-black rounded-none text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,0.05)]'
          }`}>
            <div>
              <span className="text-[9px] md:text-[11px] block uppercase tracking-widest opacity-60 font-sans font-bold">图书总量 (Total Books)</span>
              <span className={`text-2xl md:text-4xl mt-1 block ${
                template === 'editorial' ? 'font-serif italic font-semibold text-[#8E5A3C]' :
                template === 'cozy' ? 'font-serif font-bold text-[#8C6239]' :
                template === 'academic' ? 'font-sans font-bold text-[#0f5ca8]' : 'font-mono font-bold text-black'
              }`}>
                {totalBookCount} <span className="text-xs font-normal not-italic opacity-60">册</span>
              </span>
            </div>
            <div>
              <span className="text-[9px] md:text-[11px] block uppercase tracking-widest opacity-60 font-sans font-bold">图书分类 (Categories)</span>
              <span className={`text-2xl md:text-4xl mt-1 block ${
                template === 'editorial' ? 'font-serif italic font-semibold text-emerald-800' :
                template === 'cozy' ? 'font-serif font-bold text-emerald-700' :
                template === 'academic' ? 'font-sans font-bold text-emerald-600' : 'font-mono font-bold text-emerald-600'
              }`}>
                {dynamicCategories.length - 1} <span className="text-xs font-normal not-italic opacity-60">类</span>
              </span>
            </div>
            <div>
              <span className="text-[9px] md:text-[11px] block uppercase tracking-widest opacity-60 font-sans font-bold">可借总量 (Available)</span>
              <span className={`text-2xl md:text-4xl mt-1 block ${
                template === 'editorial' ? 'font-serif italic font-semibold text-[#8E5A3C]' :
                template === 'cozy' ? 'font-serif font-bold text-[#8C6239]' :
                template === 'academic' ? 'font-sans font-bold text-[#0f5ca8]' : 'font-mono font-bold text-black'
              }`}>
                {totalAvailableCount} <span className="text-xs font-normal not-italic opacity-60">册</span>
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* --- Main Application Layout --- */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* LEFT SIDEBAR: Desktop Guidelines (Grid column span 1) */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Quick Guidelines */}
            <div className={`p-6 rounded-xl border ${styles.card}`}>
              <h3 className="font-bold text-sm mb-4 flex items-center gap-2 border-b pb-2">
                <Bookmark className={`w-4 h-4 ${styles.textAccent}`} />
                <span>图书角规范 / Book Corner Guidelines</span>
              </h3>
              
              <div className="space-y-4 text-xs opacity-90 leading-relaxed max-h-[550px] overflow-y-auto pr-1">
                <div>
                  <h4 className="font-bold text-[#1A1A1A] dark:text-white mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    一、核心宗旨
                  </h4>
                  <ul className="list-none pl-1 space-y-1 text-slate-600 dark:text-slate-300">
                    <li>• <strong>知识共享：</strong>让好书流通，让思想碰撞。</li>
                    <li>• <strong>自律维护：</strong>共同维护公共阅读资源，爱护图书。</li>
                    <li>• <strong>高效有序：</strong>通过精心分类与整理，让大家能快速便捷地获取和翻阅所需书籍。</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-bold text-[#1A1A1A] dark:text-white mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    二、图书在哪里？
                  </h4>
                  <p className="pl-1 text-slate-600 dark:text-slate-300">
                    • 图书集中存放于3楼办公区展示架内（另有电子图书清单）。
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-[#1A1A1A] dark:text-white mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    三、图书角维护
                  </h4>
                  <ul className="list-none pl-1 space-y-1.5 text-slate-600 dark:text-slate-300">
                    <li>1. <strong>归位管理：</strong>阅读完毕后，请将图书放回对应分类的原书架原位置。</li>
                    <li>2. <strong>保持整洁：</strong>请勿在图书上写字、涂鸦、折页或留下污渍。建议使用书签。</li>
                    <li>3. <strong>管理员协助：</strong>若需录入新书或调整图书架位，请及时联系管理员（夏永知）。</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-bold text-[#1A1A1A] dark:text-white mb-1.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    四、重要约定
                  </h4>
                  <ul className="list-none pl-1 space-y-1.5 text-slate-600 dark:text-slate-300">
                    <li>1. <strong>小心爱护：</strong>请小心使用，避免沾湿、撕损或过度挤压，阅读前请保持手部清洁。</li>
                    <li>2. <strong>损坏与遗失：</strong>若不慎遗失或对图书造成不可恢复的物理破损，请主动联系图书管理员，协商进行相应补充或更换。</li>
                  </ul>
                </div>
              </div>
              
            </div>
          </div>

          {/* MAIN BOOK CATALOG: Toolbar & Grid (Grid column span 3) */}
          <div className="lg:col-span-3 space-y-6">

            {/* FILTER & SEARCH TOOLBAR */}
            <div className={`p-4 md:p-6 rounded-xl border ${styles.card}`}>
              <div className="flex flex-col gap-4">
                
                {/* Search input & Add Book Button */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="搜索书名、作者、译者、书架位置..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={`w-full pl-10 pr-4 py-2.5 rounded-lg text-sm outline-none ${styles.input}`}
                    />
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  
                  <button
                    onClick={handleOpenAddModal}
                    className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 cursor-pointer ${styles.btnPrimary}`}
                  >
                    <Plus className="w-4 h-4" />
                    <span>录入新图书 (Upload Book)</span>
                  </button>
                </div>

                {/* Categories & Toggles */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                  {/* Category Chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {dynamicCategories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3 py-1.5 rounded-full text-xs transition-all cursor-pointer ${
                          selectedCategory === cat
                            ? (template === 'minimalist' ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900')
                            : `bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 border ${styles.divider}`
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Toggles & Sorters */}
                  <div className="flex flex-wrap items-center gap-4">
                    {/* Sorter */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs opacity-65">排序:</span>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className={`text-xs p-1.5 rounded border ${styles.input} outline-none cursor-pointer`}
                      >
                        <option value="default">默认位置</option>
                        <option value="title">按书名 (A-Z)</option>
                        <option value="newest">最新上架</option>
                      </select>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* BOOKS GRID */}
            {sortedBooks.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                  {sortedBooks.map((book) => {
                    return (
                      <motion.div
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.2 }}
                        key={book.id}
                        className={`${styles.card} relative group flex flex-col h-[460px]`}
                      >
                        {/* Book Header Visual Cover representation */}
                        {renderBookCover(book, template)}

                        {/* Hover Description Overlay (Covers cover + info, leaves buttons accessible at the bottom) */}
                        <div className={`absolute inset-x-0 top-0 bottom-[54px] z-20 p-4 flex flex-col justify-between transition-all duration-300 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 pointer-events-none group-hover:pointer-events-auto overflow-hidden ${
                          template === 'editorial' ? 'bg-[#FAF8F5]/98 text-[#2C2A29] border-b border-[#8E5A3C]/40' :
                          template === 'academic' ? 'bg-slate-900/95 text-white backdrop-blur-md rounded-t-xl border-b border-slate-800' :
                          template === 'cozy' ? 'bg-[#FCFAF6]/98 text-[#42342A] rounded-t-2xl border-b border-[#E6DEC9]' :
                          'bg-white text-black border-b border-black'
                        }`}>
                          <div className="space-y-2 flex-grow flex flex-col min-h-0">
                            <div className="flex items-center justify-between border-b pb-1 opacity-80 border-current/20 flex-shrink-0">
                              <span className="text-[10px] font-bold tracking-widest uppercase flex items-center gap-1">
                                <BookOpen className={`w-3 h-3 ${template === 'academic' ? 'text-blue-400' : styles.textAccent}`} />
                                图书简介 · Synopsis
                              </span>
                              <span className="text-[9px] font-semibold opacity-70">{book.category}</span>
                            </div>
                            <div className="overflow-y-auto pr-1 flex-grow min-h-0 text-xs leading-relaxed font-sans scrollbar-thin scrollbar-thumb-slate-400 scrollbar-track-transparent">
                              <p className="whitespace-pre-wrap break-words select-text">
                                {book.description || '暂无详细图书简介，可通过右下角编辑按钮补充。'}
                              </p>
                            </div>
                          </div>

                          <div className="text-[10px] opacity-65 flex justify-between items-center border-t pt-2 border-current/10 font-mono mt-2 flex-shrink-0">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5" />
                              {book.shelfLocation}
                            </span>
                            <span>馆藏数量：{book.totalCopies} 册</span>
                          </div>
                        </div>

                        {/* Book Content details */}
                        <div className="p-4 flex-grow flex flex-col justify-between min-h-0">
                          <div className="space-y-1 text-xs overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 scrollbar-track-transparent">
                            <p className="font-medium">
                              <span className="opacity-60 text-[11px]">作者：</span>
                              <span className={template === 'editorial' ? 'font-sans text-[#1A1A1A]' : ''}>{book.author}</span>
                            </p>
                            {book.translator && (
                              <p className="opacity-90">
                                <span className="opacity-60 text-[11px]">译者：</span>
                                <span className={template === 'editorial' ? 'italic font-serif text-[13px] text-[#1A1A1A]' : ''}>{book.translator}</span>
                              </p>
                            )}
                            {book.publisher && (
                              <p className="opacity-90">
                                <span className="opacity-60 text-[11px]">出版社：</span>
                                <span>{book.publisher}</span>
                              </p>
                            )}
                            {book.keywords && (
                              <p className="opacity-90 flex flex-wrap items-center gap-1.5 pt-0.5">
                                <span className="opacity-60 text-[11px]">关键词：</span>
                                <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-full select-none">{book.keywords}</span>
                              </p>
                            )}
                            <p className="text-[11px] opacity-55">
                              录入时间: {book.addedDate}
                            </p>
                          </div>

                          <div className="mt-4 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 flex-shrink-0 space-y-3">
                            {/* Total copies display */}
                            <div className="flex justify-between items-center text-xs">
                              <span className="opacity-65">馆藏总量 / 可借数:</span>
                              <span className="font-semibold text-right">
                                {book.totalCopies} 册 / {book.availableCopies} 可借
                              </span>
                            </div>

                            {/* Actions Panel */}
                            <div className={`pt-3 border-t ${styles.divider} flex items-center justify-end gap-2 h-9`}>
                            {/* Douban Link */}
                            {book.douban && (
                              <a
                                href={book.douban}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="在豆瓣中查看"
                                className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold hover:underline bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/50 mr-auto"
                              >
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full inline-block animate-pulse"></span>
                                <span>豆瓣读书</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}

                            {/* Edit / Delete actions */}
                            <div className="flex items-center gap-1">
                              {/* Edit details */}
                              <button
                                onClick={() => handleOpenEditModal(book)}
                                title="编辑书籍"
                                className={`p-1.5 text-slate-500 hover:text-slate-800 cursor-pointer transition-colors ${
                                  template === 'editorial' ? 'hover:bg-slate-150 rounded-none' : 'hover:bg-slate-100 rounded'
                                }`}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete book */}
                              <button
                                onClick={() => handleDeleteBook(book.id, book.title)}
                                title="下架书籍"
                                className={`p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer transition-colors ${
                                  template === 'editorial' ? 'hover:bg-rose-50 rounded-none' : 'hover:bg-rose-50 rounded'
                                }`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                  })}
                </AnimatePresence>
              </div>
            ) : (
              // Empty Search / Filter state
              <div className={`p-12 text-center rounded-xl border ${styles.card}`}>
                <BookOpen className="w-12 h-12 text-slate-400 mx-auto mb-4 opacity-50" />
                <h3 className="font-bold text-lg mb-1">未搜寻到匹配图书</h3>
                <p className="text-sm opacity-60 max-w-md mx-auto mb-6">
                  没有找到符合您的筛选或搜索条件的图书。请尝试清除搜索框、更改选中的分类，或者录入一本新书！
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('全部分类');
                    }}
                    className={`px-4 py-2 text-xs rounded-lg cursor-pointer ${styles.btnSecondary}`}
                  >
                    重置所有筛选
                  </button>
                  <button
                    onClick={handleOpenAddModal}
                    className={`px-4 py-2 text-xs rounded-lg cursor-pointer ${styles.btnPrimary}`}
                  >
                    直接录入新书
                  </button>
                </div>
              </div>
            )}

            {filteredBooks.length > 0 && (
              <div className="flex justify-center pt-10 pb-4">
                <button
                  onClick={handleOpenAddModal}
                  className={`w-full max-w-lg py-3.5 px-6 rounded-xl text-sm font-bold flex items-center justify-center gap-2.5 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 cursor-pointer ${styles.btnPrimary}`}
                >
                  <Plus className="w-5 h-5 animate-pulse" />
                  <span>录入新图书 (Upload Book)</span>
                </button>
              </div>
            )}

          </div>

        </div>

        {/* Yongzhi Xia Admin Contact Card at the bottom */}
        <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800">
          <div className={`max-w-xl mx-auto p-6 ${styles.sidebarCard || styles.card}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2.5 rounded-lg bg-blue-500/10 ${styles.textAccent}`}>
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base">图书角管理员</h3>
                <p className="text-xs opacity-75">Book Corner Coordinator</p>
              </div>
            </div>

            <div className={`space-y-4 pt-3 border-t ${styles.divider}`}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] uppercase tracking-wider block opacity-65 mb-1">姓名 (Name)</label>
                  <p className="font-semibold text-sm">Yongzhi Xia (夏永知)</p>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[10px] uppercase tracking-wider block opacity-65 mb-1">管理员邮箱 (Email)</label>
                  <div className="flex items-center justify-between gap-1 p-2 rounded-lg bg-black/5 dark:bg-white/5 border border-slate-200/50 dark:border-slate-800/50">
                    <span className="text-xs font-sans select-all truncate">{`yongzhi.xia@mdpi.com`}</span>
                    <button
                      onClick={handleCopyEmail}
                      title="复制邮箱"
                      className="p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded cursor-pointer transition-colors"
                    >
                      {copiedEmail ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 opacity-60" />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider block opacity-65 mb-1">办公区域 (Location)</label>
                <div className="flex items-center gap-1.5 text-xs">
                  <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span>光谷办公室2F-4（烽火科技大厦）</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </main>

      {/* --- ADD / EDIT BOOK MODAL --- */}
      {showAddEditModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={`w-full max-w-lg p-6 rounded-xl border shadow-2xl relative ${styles.card} max-h-[90vh] overflow-y-auto`}
          >
            <button
              onClick={() => setShowAddEditModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Plus className={`w-5 h-5 ${styles.textAccent}`} />
              <span>{editingBook ? '修改图书信息 (Edit Book)' : '录入新图书 (Upload Book)'}</span>
            </h2>

            <form onSubmit={handleSaveBook} className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold mb-1 opacity-80">
                  书名 (Book Title) *
                </label>
                <input
                  type="text"
                  required
                  value={bookForm.title}
                  onChange={(e) => setBookForm({ ...bookForm, title: e.target.value })}
                  placeholder="请输入中文或英文书名"
                  className={`w-full p-2 text-sm rounded border outline-none ${styles.input}`}
                />
              </div>

              {/* Author & Translator */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1 opacity-80">
                    作者 (Author) *
                  </label>
                  <input
                    type="text"
                    required
                    value={bookForm.author}
                    onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })}
                    placeholder="原作者"
                    className={`w-full p-2 text-sm rounded border outline-none ${styles.input}`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 opacity-80">
                    译者 (Translator)
                  </label>
                  <input
                    type="text"
                    value={bookForm.translator}
                    onChange={(e) => setBookForm({ ...bookForm, translator: e.target.value })}
                    placeholder="选填（若有）"
                    className={`w-full p-2 text-sm rounded border outline-none ${styles.input}`}
                  />
                </div>
              </div>

              {/* Publisher & Keywords */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1 opacity-80">
                    出版社 (Publisher)
                  </label>
                  <input
                    type="text"
                    value={bookForm.publisher}
                    onChange={(e) => setBookForm({ ...bookForm, publisher: e.target.value })}
                    placeholder="选填"
                    className={`w-full p-2 text-sm rounded border outline-none ${styles.input}`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 opacity-80">
                    关键词 (Keywords)
                  </label>
                  <input
                    type="text"
                    value={bookForm.keywords}
                    onChange={(e) => setBookForm({ ...bookForm, keywords: e.target.value })}
                    placeholder="选填，用逗号或顿号隔开"
                    className={`w-full p-2 text-sm rounded border outline-none ${styles.input}`}
                  />
                </div>
              </div>

              {/* Category & Shelf Location */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1 opacity-80">
                    图书分类 (Category) *
                  </label>
                  <input
                    type="text"
                    required
                    list="categories-list"
                    value={bookForm.category}
                    onChange={(e) => setBookForm({ ...bookForm, category: e.target.value })}
                    placeholder="输入或选择分类"
                    className={`w-full p-2 text-sm rounded border outline-none ${styles.input}`}
                  />
                  <datalist id="categories-list">
                    {dynamicCategories.filter(c => c !== '全部分类').map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 opacity-80">
                    书架位置 (Shelf Location) *
                  </label>
                  <input
                    type="text"
                    required
                    list="shelves-list"
                    value={bookForm.shelfLocation}
                    onChange={(e) => setBookForm({ ...bookForm, shelfLocation: e.target.value })}
                    placeholder="输入或选择书架位置"
                    className={`w-full p-2 text-sm rounded border outline-none ${styles.input}`}
                  />
                  <datalist id="shelves-list">
                    {dynamicShelves.map((shelf) => (
                      <option key={shelf} value={shelf} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Copy counts & Douban link */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1 opacity-80">
                    馆藏总册数 (Total Copies) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={bookForm.totalCopies}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setBookForm({ 
                        ...bookForm, 
                        totalCopies: val,
                        availableCopies: editingBook ? bookForm.availableCopies : val
                      });
                    }}
                    className={`w-full p-2 text-sm rounded border outline-none ${styles.input}`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 opacity-80">
                    可借阅册数 (Available) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={bookForm.totalCopies}
                    required
                    value={bookForm.availableCopies}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setBookForm({ 
                        ...bookForm, 
                        availableCopies: val
                      });
                    }}
                    className={`w-full p-2 text-sm rounded border outline-none ${styles.input}`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1 opacity-80">
                    豆瓣链接 (Douban URL)
                  </label>
                  <input
                    type="text"
                    value={bookForm.douban}
                    onChange={(e) => setBookForm({ ...bookForm, douban: e.target.value })}
                    placeholder="选填，例如 https://book.douban.com/..."
                    className={`w-full p-2 text-sm rounded border outline-none ${styles.input}`}
                  />
                </div>
              </div>

              {/* Book Description */}
              <div>
                <label className="block text-xs font-semibold mb-1 opacity-80">
                  图书简介 (Book Description)
                </label>
                <textarea
                  rows={3}
                  value={bookForm.description}
                  onChange={(e) => setBookForm({ ...bookForm, description: e.target.value })}
                  placeholder="请输入图书简介或核心内容摘要，便于同事在悬浮卡片上了解内容..."
                  className={`w-full p-2 text-sm rounded border outline-none ${styles.input} resize-none`}
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex justify-end gap-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  className={`px-4 py-2 text-xs rounded-lg cursor-pointer ${styles.btnSecondary}`}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 text-xs rounded-lg cursor-pointer ${styles.btnPrimary}`}
                >
                  {editingBook ? '确认修改' : '确认录入'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}



      {/* --- Footer Accent --- */}
      <footer className="py-8 border-t border-slate-200/80 dark:border-slate-800/80 mt-12 text-center text-xs opacity-60 font-sans">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p>© 2026 MDPI Wuhan Guanggu Office. All Rights Reserved.</p>
          <p>
            由 AI Studio 协助构建 · 欢迎阅读 · 联系管理员夏永知: <a href="mailto:yongzhi.xia@mdpi.com" className="underline hover:opacity-85 font-semibold">yongzhi.xia@mdpi.com</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
