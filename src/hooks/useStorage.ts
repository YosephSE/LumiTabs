import { useCallback, useEffect, useState } from 'react';
import { LinkGroup, SavedLink, Settings } from '../types';

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  font: 'manrope'
};

const STORAGE_KEYS = {
  savedLinks: 'savedLinks',
  settings: 'settings',
  linkGroups: 'linkGroups'
};

function normalizeGroupName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

function createGroupId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useStorage() {
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [groups, setGroups] = useState<LinkGroup[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();

    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.savedLinks) {
        setLinks(changes.savedLinks.newValue || []);
      }
      if (changes.linkGroups) {
        setGroups(changes.linkGroups.newValue || []);
      }
      if (changes.settings) {
        setSettings(changes.settings.newValue || DEFAULT_SETTINGS);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const load = async () => {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.savedLinks,
      STORAGE_KEYS.settings,
      STORAGE_KEYS.linkGroups
    ]);

    const storedLinks: SavedLink[] = result[STORAGE_KEYS.savedLinks] || [];
    const storedGroups: LinkGroup[] = result[STORAGE_KEYS.linkGroups] || [];
    const storedSettings: Settings = { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.settings] || {}) };

    const validGroupIds = new Set(storedGroups.map((group) => group.id));
    const normalizedLinks = storedLinks.map((link) => {
      if (link.groupId && !validGroupIds.has(link.groupId)) {
        return { ...link, groupId: undefined };
      }

      return link;
    });

    const hasSanitizedLinks = normalizedLinks.some((link, idx) => link.groupId !== storedLinks[idx]?.groupId);

    if (hasSanitizedLinks) {
      await chrome.storage.local.set({ [STORAGE_KEYS.savedLinks]: normalizedLinks });
    }

    setLinks(normalizedLinks);
    setGroups(storedGroups);
    setSettings(storedSettings);
    migrateLocalStorage(normalizedLinks);
    setLoading(false);
  };

  const addLink = useCallback(async (link: SavedLink) => {
    const result = await chrome.storage.local.get([STORAGE_KEYS.savedLinks]);
    const storedLinks: SavedLink[] = result[STORAGE_KEYS.savedLinks] || [];

    if (storedLinks.some((savedLink) => savedLink.url === link.url)) {
      return false;
    }

    const next = [link, ...storedLinks];
    await chrome.storage.local.set({ [STORAGE_KEYS.savedLinks]: next });
    setLinks(next);
    return true;
  }, []);

  const removeLink = useCallback(async (url: string) => {
    setLinks((prev) => {
      const next = prev.filter((l) => l.url !== url);
      chrome.storage.local.set({ [STORAGE_KEYS.savedLinks]: next });
      return next;
    });
  }, []);

  const clearLinks = useCallback(async () => {
    setLinks([]);
    await chrome.storage.local.set({ [STORAGE_KEYS.savedLinks]: [] });
  }, []);

  const saveSettings = useCallback(async (next: Partial<Settings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...next };
      chrome.storage.local.set({ [STORAGE_KEYS.settings]: merged });
      return merged;
    });
  }, []);

  const createGroup = useCallback(async (name: string) => {
    const normalizedName = normalizeGroupName(name);
    if (!normalizedName) return null;

    let output: { group: LinkGroup; created: boolean } | null = null;

    setGroups((prev) => {
      const existing = prev.find((group) => group.name.toLowerCase() === normalizedName.toLowerCase());
      if (existing) {
        output = { group: existing, created: false };
        return prev;
      }

      const group: LinkGroup = {
        id: createGroupId(),
        name: normalizedName,
        createdAt: Date.now()
      };

      const next = [...prev, group].sort((a, b) => a.name.localeCompare(b.name));
      chrome.storage.local.set({ [STORAGE_KEYS.linkGroups]: next });
      output = { group, created: true };
      return next;
    });

    return output;
  }, []);

  const deleteGroup = useCallback(async (groupId: string) => {
    let didDelete = false;

    setGroups((prev) => {
      if (!prev.some((group) => group.id === groupId)) {
        return prev;
      }

      didDelete = true;
      const next = prev.filter((group) => group.id !== groupId);
      chrome.storage.local.set({ [STORAGE_KEYS.linkGroups]: next });
      return next;
    });

    if (!didDelete) return;

    setLinks((prev) => {
      let didChange = false;
      const next = prev.map((link) => {
        if (link.groupId !== groupId) {
          return link;
        }

        didChange = true;
        return { ...link, groupId: undefined };
      });

      if (didChange) {
        chrome.storage.local.set({ [STORAGE_KEYS.savedLinks]: next });
      }

      return next;
    });
  }, []);

  const moveLinkToGroup = useCallback(async (url: string, groupId?: string) => {
    setLinks((prev) => {
      let didChange = false;

      const next = prev.map((link) => {
        if (link.url !== url) {
          return link;
        }

        if ((link.groupId || undefined) === (groupId || undefined)) {
          return link;
        }

        didChange = true;
        return { ...link, groupId: groupId || undefined };
      });

      if (didChange) {
        chrome.storage.local.set({ [STORAGE_KEYS.savedLinks]: next });
      }

      return next;
    });
  }, []);

  return {
    links,
    groups,
    settings,
    loading,
    addLink,
    removeLink,
    clearLinks,
    saveSettings,
    createGroup,
    deleteGroup,
    moveLinkToGroup
  };
}

function migrateLocalStorage(currentLinks: SavedLink[]) {
  try {
    const raw = window.localStorage.getItem('myLeads');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    const imported: SavedLink[] = Object.keys(parsed).map((url) => ({
      url,
      title: parsed[url],
      createdAt: Date.now()
    }));
    const merged = [...imported, ...currentLinks];
    chrome.storage.local.set({ [STORAGE_KEYS.savedLinks]: merged });
    window.localStorage.removeItem('myLeads');
  } catch (e) {
    console.warn('Migration failed', e);
  }
}
