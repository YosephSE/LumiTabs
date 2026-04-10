export type SavedLink = {
  url: string;
  title: string;
  createdAt: number;
  groupId?: string;
  faviconUrl?: string;
};

export type LinkGroup = {
  id: string;
  name: string;
  createdAt: number;
};

export type ThemeId = 'system' | 'light' | 'dark' | 'ocean';

export type FontId = 'manrope' | 'source-sans' | 'work-sans';

export type Settings = {
  theme: ThemeId;
  font: FontId;
};
