export interface Book {
  id: string;
  title: string;
  author: string;
  translator?: string;
  publisher?: string;
  keywords?: string;
  totalCopies: number;
  availableCopies: number;
  category: string;
  shelfLocation: string; // e.g. "A-1", "B-3"
  coverBg: string;       // Gradient classes for visual placeholder
  addedDate: string;
  description?: string;  // Brief synopsis of the book
  douban?: string;       // Optional Douban link
}

export interface BorrowLog {
  id: string;
  bookId: string;
  bookTitle: string;
  borrowerName: string;
  borrowerEmail: string;
  borrowDate: string;
  dueDate: string;
  returnDate?: string;
  status: 'borrowing' | 'returned';
}

export type DesignTemplate = 'academic' | 'cozy' | 'minimalist' | 'editorial';
