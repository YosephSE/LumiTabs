import { useCallback, useEffect, useState } from 'react';
import { LinkGroup, OnboardingState, SavedLink, Settings, ThemeId } from '../types';
import { extensionApi } from '../utils/extensionApi';

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  font: 'manrope'
};

const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  completed: false,
  version: 1
};

const STORAGE_KEYS = {
  savedLinks: 'savedLinks',
  settings: 'settings',
  linkGroups: 'linkGroups',
  onboardingState: 'onboardingState'
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

function normalizeTheme(theme: unknown): ThemeId {
  if (theme === 'system' || theme === 'light' || theme === 'dark' || theme === 'ocean') {
    return theme;
  }

  if (typeof theme === 'string') {
    const normalized = theme.trim().toLowerCase();
    const suffix = normalized.includes('-')
      ? normalized.slice(normalized.lastIndexOf('-') + 1)
      : normalized;

    if (suffix === 'light' || suffix === 'dark' || suffix === 'ocean') {
      return suffix;
    }
  }

  return DEFAULT_SETTINGS.theme;
}

function setStorageLocalSafely(data: Record<string, unknown>) {
  void Promise.resolve(extensionApi.storage.local.set(data)).catch(() => undefined);
}

function normalizeOnboardingState(value: unknown): OnboardingState {
  if (!value || typeof value !== 'object') {
    return DEFAULT_ONBOARDING_STATE;
  }

  const candidate = value as Partial<OnboardingState>;
  const completedAt = typeof candidate.completedAt === 'number' && Number.isFinite(candidate.completedAt)
    ? candidate.completedAt
    : undefined;

  return {
    completed: Boolean(candidate.completed),
    completedAt,
    version: 1
  };
}

export function useStorage() {
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [groups, setGroups] = useState<LinkGroup[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(DEFAULT_ONBOARDING_STATE);
  const [isStorageReady, setIsStorageReady] = useState(false);

  useEffect(() => {
    void load();

    const listener = (changes: Record<string, { newValue?: unknown }>) => {
      if (changes.savedLinks) {
        const nextLinks = Array.isArray(changes.savedLinks.newValue) ? (changes.savedLinks.newValue as SavedLink[]) : [];
        setLinks(nextLinks);
      }
      if (changes.linkGroups) {
        const nextGroups = Array.isArray(changes.linkGroups.newValue) ? (changes.linkGroups.newValue as LinkGroup[]) : [];
        setGroups(nextGroups);
      }
      if (changes.settings) {
        const nextSettings = (changes.settings.newValue || {}) as Partial<Settings>;
        setSettings({
          ...DEFAULT_SETTINGS,
          ...nextSettings,
          theme: normalizeTheme(nextSettings.theme)
        });
      }
      if (changes.onboardingState) {
        setOnboardingState(normalizeOnboardingState(changes.onboardingState.newValue));
      }
    };
    extensionApi.storage.onChanged.addListener(listener);
    return () => extensionApi.storage.onChanged.removeListener(listener);
  }, []);

  const load = async () => {
    const result = await extensionApi.storage.local.get([
      STORAGE_KEYS.savedLinks,
      STORAGE_KEYS.settings,
      STORAGE_KEYS.linkGroups,
      STORAGE_KEYS.onboardingState
    ]);

    const storedLinks: SavedLink[] = result[STORAGE_KEYS.savedLinks] || [];
    const storedGroups: LinkGroup[] = result[STORAGE_KEYS.linkGroups] || [];
    const rawSettings = (result[STORAGE_KEYS.settings] || {}) as Partial<Settings>;
    const storedSettings: Settings = {
      ...DEFAULT_SETTINGS,
      ...rawSettings,
      theme: normalizeTheme(rawSettings.theme)
    };
    const storedOnboardingState = normalizeOnboardingState(result[STORAGE_KEYS.onboardingState]);

    const validGroupIds = new Set(storedGroups.map((group) => group.id));
    const normalizedLinks = storedLinks.map((link) => {
      if (link.groupId && !validGroupIds.has(link.groupId)) {
        return { ...link, groupId: undefined };
      }

      return link;
    });

    const hasSanitizedLinks = normalizedLinks.some((link, idx) => link.groupId !== storedLinks[idx]?.groupId);
    const hasSanitizedSettings = storedSettings.theme !== rawSettings.theme;

    if (hasSanitizedLinks || hasSanitizedSettings) {
      const nextStorage: Record<string, unknown> = {};

      if (hasSanitizedLinks) {
        nextStorage[STORAGE_KEYS.savedLinks] = normalizedLinks;
      }

      if (hasSanitizedSettings) {
        nextStorage[STORAGE_KEYS.settings] = storedSettings;
      }

      await extensionApi.storage.local.set(nextStorage);
    }

    setLinks(normalizedLinks);
    setGroups(storedGroups);
    setSettings(storedSettings);
    setOnboardingState(storedOnboardingState);
    setIsStorageReady(true);
  };

  const addLinksBulk = useCallback(async (nextLinks: SavedLink[]) => {
    if (nextLinks.length === 0) {
      return { added: 0, skipped: 0 };
    }

    const result = await extensionApi.storage.local.get([STORAGE_KEYS.savedLinks]);
    const storedLinks: SavedLink[] = result[STORAGE_KEYS.savedLinks] || [];
    const seenUrls = new Set(storedLinks.map((savedLink) => savedLink.url));
    const accepted: SavedLink[] = [];
    let skipped = 0;

    for (const link of nextLinks) {
      if (seenUrls.has(link.url)) {
        skipped += 1;
        continue;
      }

      seenUrls.add(link.url);
      accepted.push(link);
    }

    if (accepted.length === 0) {
      return { added: 0, skipped };
    }

    const next = [...accepted.reverse(), ...storedLinks];
    await extensionApi.storage.local.set({ [STORAGE_KEYS.savedLinks]: next });
    setLinks(next);
    return { added: accepted.length, skipped };
  }, []);

  const addLink = useCallback(async (link: SavedLink) => {
    const result = await addLinksBulk([link]);
    return result.added === 1;
  }, [addLinksBulk]);

  const removeLink = useCallback(async (url: string) => {
    setLinks((prev) => {
      const next = prev.filter((l) => l.url !== url);
      setStorageLocalSafely({ [STORAGE_KEYS.savedLinks]: next });
      return next;
    });
  }, []);

  const clearLinks = useCallback(async () => {
    setLinks([]);
    await extensionApi.storage.local.set({ [STORAGE_KEYS.savedLinks]: [] });
  }, []);

  const saveSettings = useCallback(async (next: Partial<Settings>) => {
    setSettings((prev) => {
      const merged = {
        ...prev,
        ...next,
        theme: next.theme ? normalizeTheme(next.theme) : prev.theme
      };
      setStorageLocalSafely({ [STORAGE_KEYS.settings]: merged });
      return merged;
    });
  }, []);

  const completeOnboarding = useCallback(async () => {
    const next: OnboardingState = {
      completed: true,
      completedAt: Date.now(),
      version: 1
    };

    setOnboardingState(next);
    await extensionApi.storage.local.set({ [STORAGE_KEYS.onboardingState]: next });
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
      setStorageLocalSafely({ [STORAGE_KEYS.linkGroups]: next });
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
      setStorageLocalSafely({ [STORAGE_KEYS.linkGroups]: next });
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
        setStorageLocalSafely({ [STORAGE_KEYS.savedLinks]: next });
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
        setStorageLocalSafely({ [STORAGE_KEYS.savedLinks]: next });
      }

      return next;
    });
  }, []);

  return {
    links,
    groups,
    settings,
    addLinksBulk,
    addLink,
    removeLink,
    clearLinks,
    saveSettings,
    onboardingState,
    isStorageReady,
    completeOnboarding,
    createGroup,
    deleteGroup,
    moveLinkToGroup
  };
}

