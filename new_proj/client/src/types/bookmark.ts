export interface Bookmark {
  id: string;
  url: string;
  title: string;
  description?: string;
  tags: string[];
  createdAt: string;
}

export interface BookmarkFormData {
  url: string;
  title: string;
  description: string;
  tags: string;
}
