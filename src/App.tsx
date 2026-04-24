
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStorage } from './hooks/useStorage';
import { FontId, LinkGroup, SavedLink, ThemeId } from './types';
import {
  ExtensionCommand,
  extensionApi,
  getAllCommands,
  getShortcutSettingsFallbackUrl,
  getShortcutSettingsHint,
  openShortcutSettings
} from './utils/extensionApi';
import { formatDistanceToNow } from './utils/time';
import { normalizeUrl } from './utils/url';

const NAVS = [
  { id: 'links', label: 'Links', icon: 'list_alt' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
] as const;

type NavId = (typeof NAVS)[number]['id'];
type TransferFormat = 'csv' | 'json';
type SaveCurrentStatus = 'saved' | 'duplicate' | 'unavailable' | 'failed';
type OnboardingActionFeedback = {
  tone: 'success' | 'warning' | 'error' | 'info';
  icon: string;
  message: string;
};

const GROUP_FILTER_ALL = '__all__';
const GROUP_FILTER_UNGROUPED = '__ungrouped__';
const COMMAND_ACTIVATE_EXTENSION = '_execute_action';
const COMMAND_SAVE_CURRENT = 'save_current';
const GROUP_COLOR_PALETTE = ['#5fb8ff', '#57d6a4', '#f4a261', '#b388ff', '#ff7aa2', '#ffd166', '#4dd0e1', '#8bc34a'];

const FONT_OPTIONS: { id: FontId; label: string }[] = [
  { id: 'manrope', label: 'Manrope' },
  { id: 'source-sans', label: 'Source Sans 3' },
  { id: 'work-sans', label: 'Work Sans' }
];

const THEME_OPTIONS: {
  id: ThemeId;
  label: string;
  icon: string;
  previewClass: string;
}[] = [
  { id: 'system', label: 'Match System', icon: 'brightness_auto', previewClass: 'theme-preview-system' },
  { id: 'light', label: 'Light', icon: 'light_mode', previewClass: 'theme-preview-light' },
  { id: 'dark', label: 'Dark', icon: 'dark_mode', previewClass: 'theme-preview-dark' },
  { id: 'ocean', label: 'Ocean', icon: 'water', previewClass: 'theme-preview-ocean' }
];

type OnboardingStepAction = 'save-current' | 'settings';

const ONBOARDING_STEPS: {
  icon: string;
  title: string;
  description: string;
  highlights: string[];
  action?: {
    label: string;
    icon: string;
    type: OnboardingStepAction;
  };
}[] = [
  {
    icon: 'dashboard',
    title: 'Welcome to Tabs',
    description: 'Keep useful pages close in a lightweight side panel that stays out of your browsing flow.',
    highlights: ['Save pages without leaving your current tab', 'Open the panel from the toolbar or shortcut']
  },
  {
    icon: 'bookmark_add',
    title: 'Save links fast',
    description: 'Capture the current tab or every open tab in the current window.',
    highlights: ['Duplicates are skipped automatically', 'Saved pages keep their title and favicon when available'],
    action: {
      label: 'Try Save Current',
      icon: 'bookmark',
      type: 'save-current'
    }
  },
  {
    icon: 'folder_special',
    title: 'Organize and find',
    description: 'Use groups, search, and quick actions to keep saved pages easy to scan.',
    highlights: ['Filter links by group or search text', 'Open, move, or delete links from each row']
  },
  {
    icon: 'tune',
    title: 'Make it yours',
    description: 'Choose a theme, pick a font, and manage keyboard shortcuts from Settings.',
    highlights: ['Themes and fonts apply across the side panel', 'Shortcut values stay managed by your browser'],
    action: {
      label: 'Open Settings',
      icon: 'settings',
      type: 'settings'
    }
  }
];

type ShortcutStatus = {
  activateExtension: string;
  saveCurrent: string;
  isMissing: boolean;
};

type ImportedLinkRecord = {
  url: string;
  title: string;
  createdAt: number;
  groupId?: string;
  groupName?: string;
  faviconUrl?: string;
};

type JsonImportPayload = {
  links: ImportedLinkRecord[];
  groups: LinkGroup[];
};

function computeTheme(theme: ThemeId) {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return theme;
}

function normalizeGroupName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

function createImportGroupId() {
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultTitle(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url;
  } catch (_err) {
    return url;
  }
}

function getCompactUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${parsed.hostname.replace(/^www\./, '')}${path}`;
  } catch (_err) {
    return url;
  }
}

function getGroupColor(groupId: string) {
  let hash = 0;

  for (let i = 0; i < groupId.length; i += 1) {
    hash = (hash * 31 + groupId.charCodeAt(i)) >>> 0;
  }

  return GROUP_COLOR_PALETTE[hash % GROUP_COLOR_PALETTE.length];
}

function getGroupAccentStyle(color?: string): React.CSSProperties | undefined {
  if (!color) return undefined;

  return { ['--group-accent' as string]: color } as React.CSSProperties;
}

function getAvatarInitial(title: string, url: string) {
  const source = title.trim() || getDefaultTitle(url);
  const match = source.match(/[A-Za-z0-9]/);
  return match ? match[0].toUpperCase() : '?';
}

function getFaviconCandidates(url: string, faviconUrl?: string) {
  const candidates = new Set<string>();

  if (typeof faviconUrl === 'string' && faviconUrl.trim()) {
    candidates.add(faviconUrl.trim());
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return Array.from(candidates);
    }

    candidates.add(`${parsed.origin}/favicon.ico`);
    candidates.add(`${parsed.origin}/favicon.svg`);
    candidates.add(`${parsed.origin}/apple-touch-icon.png`);
    candidates.add(`https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(parsed.origin)}&sz=64`);
  } catch (_err) {
    candidates.add(`https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(url)}&sz=64`);
  }

  return Array.from(candidates);
}

type LinkIconProps = {
  url: string;
  title: string;
  faviconUrl?: string;
};

function LinkIcon({ url, title, faviconUrl }: LinkIconProps) {
  const sources = useMemo(() => getFaviconCandidates(url, faviconUrl), [url, faviconUrl]);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

  const source = sources[sourceIndex];

  if (!source) {
    return <div className="lp-link-avatar" aria-hidden="true">{getAvatarInitial(title, url)}</div>;
  }

  return (
    <img
      className="lp-link-icon"
      src={source}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setSourceIndex((current) => current + 1)}
    />
  );
}

function toSavedLink(candidate: {
  url?: unknown;
  title?: unknown;
  createdAt?: unknown;
  groupId?: unknown;
  faviconUrl?: unknown;
}) {
  const normalizedUrl = normalizeUrl(String(candidate.url || ''));
  if (!normalizedUrl) return null;

  const title = typeof candidate.title === 'string' && candidate.title.trim()
    ? candidate.title.trim()
    : getDefaultTitle(normalizedUrl);

  const createdAt = typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt)
    ? candidate.createdAt
    : Date.now();

  const groupId = typeof candidate.groupId === 'string' && candidate.groupId.trim()
    ? candidate.groupId.trim()
    : undefined;

  const faviconUrl = typeof candidate.faviconUrl === 'string' && candidate.faviconUrl.trim()
    ? candidate.faviconUrl.trim()
    : undefined;

  return { url: normalizedUrl, title, createdAt, groupId, faviconUrl } as SavedLink;
}

function escapeCsvField(value: string) {
  const escaped = value.replace(/"/g, '""');
  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

function serializeLinksAsCsv(links: SavedLink[], groups: LinkGroup[]) {
  const groupsById = new Map(groups.map((group) => [group.id, group.name]));
  const lines = ['url,title,createdAt,group'];

  for (const link of links) {
    const groupName = link.groupId ? groupsById.get(link.groupId) || '' : '';

    lines.push(
      [
        escapeCsvField(link.url),
        escapeCsvField(link.title),
        String(link.createdAt),
        escapeCsvField(groupName)
      ].join(',')
    );
  }

  return lines.join('\n');
}

function parseCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function parseCsvLinks(text: string) {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ''));
  if (rows.length === 0) return [];

  const normalizedHeader = rows[0].map((entry) => entry.trim().toLowerCase());
  const hasHeader = normalizedHeader.includes('url');

  const urlIndex = hasHeader ? normalizedHeader.indexOf('url') : 0;
  const titleIndex = hasHeader ? normalizedHeader.indexOf('title') : 1;
  const createdAtIndex = hasHeader ? normalizedHeader.indexOf('createdat') : 2;
  const groupIndex = hasHeader ? normalizedHeader.indexOf('group') : 3;
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const links: ImportedLinkRecord[] = [];

  for (const dataRow of dataRows) {
    const parsed = toSavedLink({
      url: dataRow[urlIndex]?.trim(),
      title: titleIndex >= 0 ? dataRow[titleIndex] : undefined,
      createdAt: createdAtIndex >= 0 && dataRow[createdAtIndex]
        ? Number(dataRow[createdAtIndex])
        : undefined
    });

    if (parsed) {
      const groupName = groupIndex >= 0 ? normalizeGroupName(dataRow[groupIndex] || '') : '';
      links.push({
        ...parsed,
        groupName: groupName || undefined
      });
    }
  }

  return links;
}

function parseJsonPayload(text: string): JsonImportPayload {
  const raw = JSON.parse(text) as unknown;

  const rawGroups =
    raw && typeof raw === 'object' && Array.isArray((raw as { linkGroups?: unknown }).linkGroups)
      ? (raw as { linkGroups: unknown[] }).linkGroups
      : [];

  const groups: LinkGroup[] = [];
  const seenGroupNames = new Set<string>();

  for (const value of rawGroups) {
    if (!value || typeof value !== 'object') continue;

    const groupCandidate = value as { id?: unknown; name?: unknown; createdAt?: unknown };
    const name = normalizeGroupName(String(groupCandidate.name || ''));
    if (!name) continue;

    const key = name.toLowerCase();
    if (seenGroupNames.has(key)) continue;

    seenGroupNames.add(key);
    groups.push({
      id: typeof groupCandidate.id === 'string' && groupCandidate.id.trim()
        ? groupCandidate.id.trim()
        : createImportGroupId(),
      name,
      createdAt:
        typeof groupCandidate.createdAt === 'number' && Number.isFinite(groupCandidate.createdAt)
          ? groupCandidate.createdAt
          : Date.now()
    });
  }

  const values = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { savedLinks?: unknown }).savedLinks)
      ? (raw as { savedLinks: unknown[] }).savedLinks
      : [];

  const links: ImportedLinkRecord[] = [];

  for (const value of values) {
    if (!value || typeof value !== 'object') continue;

    const parsed = toSavedLink(value as { url?: unknown; title?: unknown; createdAt?: unknown; groupId?: unknown });
    if (parsed) {
      links.push(parsed);
    }
  }

  return { links, groups };
}

function downloadFile(content: string, mimeType: string, extension: TransferFormat) {
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `tabs-links-${stamp}.${extension}`;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

type OnboardingModalProps = {
  onComplete: () => Promise<void>;
  onTrySaveCurrent: () => Promise<SaveCurrentStatus>;
  onOpenSettings: () => Promise<void>;
};

function OnboardingModal({ onComplete, onTrySaveCurrent, onOpenSettings }: OnboardingModalProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isActionRunning, setIsActionRunning] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<OnboardingActionFeedback | null>(null);
  const currentStep = ONBOARDING_STEPS[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;

  const handleComplete = useCallback(async () => {
    if (isCompleting) return;

    setIsCompleting(true);
    try {
      await onComplete();
    } finally {
      setIsCompleting(false);
    }
  }, [isCompleting, onComplete]);

  useEffect(() => {
    setActionFeedback(null);
    setIsActionRunning(false);
  }, [stepIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void handleComplete();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleComplete]);

  const getSaveCurrentFeedback = (status: SaveCurrentStatus): OnboardingActionFeedback => {
    if (status === 'saved') {
      return {
        tone: 'success',
        icon: 'check_circle',
        message: 'Saved this tab. Finish onboarding to see it in your Links list.'
      };
    }

    if (status === 'duplicate') {
      return {
        tone: 'info',
        icon: 'info',
        message: 'This tab was already saved, so Tabs skipped the duplicate.'
      };
    }

    if (status === 'unavailable') {
      return {
        tone: 'warning',
        icon: 'warning',
        message: 'This page cannot be saved. Try it on a normal website tab.'
      };
    }

    return {
      tone: 'error',
      icon: 'error',
      message: 'Tabs could not save this tab. You can still add links manually later.'
    };
  };

  const handleStepAction = async () => {
    if (!currentStep.action || isActionRunning) return;

    setIsActionRunning(true);
    setActionFeedback(null);

    if (currentStep.action.type === 'save-current') {
      try {
        const status = await onTrySaveCurrent();
        setActionFeedback(getSaveCurrentFeedback(status));
      } finally {
        setIsActionRunning(false);
      }
      return;
    }

    try {
      await onOpenSettings();
    } finally {
      setIsActionRunning(false);
    }
  };

  return (
    <div className="lp-onboarding-backdrop" role="presentation">
      <section
        className="lp-onboarding-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-description"
      >
        <div className="lp-onboarding-topline">
          <span>Step {stepIndex + 1} of {ONBOARDING_STEPS.length}</span>
          <button className="lp-onboarding-skip" onClick={() => void handleComplete()} disabled={isCompleting}>
            Skip
          </button>
        </div>

        <div className="lp-onboarding-progress" aria-label="Onboarding progress">
          {ONBOARDING_STEPS.map((step, index) => (
            <button
              key={step.title}
              className={index === stepIndex ? 'active' : ''}
              onClick={() => setStepIndex(index)}
              aria-label={`Go to ${step.title}`}
              aria-current={index === stepIndex ? 'step' : undefined}
            />
          ))}
        </div>

        <div className="lp-onboarding-icon">
          <span className="material-symbols-outlined filled">{currentStep.icon}</span>
        </div>

        <h3 id="onboarding-title">{currentStep.title}</h3>
        <p id="onboarding-description">{currentStep.description}</p>

        <ul className="lp-onboarding-list">
          {currentStep.highlights.map((highlight) => (
            <li key={highlight}>
              <span className="material-symbols-outlined">check_circle</span>
              <span>{highlight}</span>
            </li>
          ))}
        </ul>

        {currentStep.action ? (
          <button className="lp-onboarding-action" onClick={() => void handleStepAction()} disabled={isActionRunning}>
            <span className="material-symbols-outlined">{currentStep.action.icon}</span>
            <span>{isActionRunning ? 'Working...' : currentStep.action.label}</span>
          </button>
        ) : null}

        {actionFeedback ? (
          <div className={`lp-onboarding-feedback ${actionFeedback.tone}`} role="status">
            <span className="material-symbols-outlined">{actionFeedback.icon}</span>
            <span>{actionFeedback.message}</span>
          </div>
        ) : null}

        <div className="lp-onboarding-actions">
          <button
            className="lp-secondary-btn"
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            disabled={isFirstStep || isCompleting}
          >
            Back
          </button>
          <button
            className="lp-onboarding-primary"
            onClick={() => {
              if (isLastStep) {
                void handleComplete();
                return;
              }

              setStepIndex((current) => Math.min(ONBOARDING_STEPS.length - 1, current + 1));
            }}
            disabled={isCompleting}
          >
            {isLastStep ? 'Finish' : 'Next'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function App() {
  const {
    links,
    groups,
    settings,
    onboardingState,
    isStorageReady,
    addLink,
    addLinksBulk,
    removeLink,
    clearLinks,
    saveSettings,
    completeOnboarding,
    createGroup,
    deleteGroup,
    moveLinkToGroup
  } = useStorage();

  const [nav, setNav] = useState<NavId>('links');
  const [activeGroup, setActiveGroup] = useState<string>(GROUP_FILTER_ALL);
  const [toasts, setToasts] = useState<string[]>([]);
  const [shortcutStatus, setShortcutStatus] = useState<ShortcutStatus>({
    activateExtension: 'Action click',
    saveCurrent: 'Not set',
    isMissing: true
  });

  const [newLink, setNewLink] = useState('');
  const [newLinkError, setNewLinkError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [transferFormat, setTransferFormat] = useState<TransferFormat>('csv');
  const [isImporting, setIsImporting] = useState(false);

  const addInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const groupsById = useMemo(() => new Map(groups.map((group) => [group.id, group.name])), [groups]);
  const groupColorById = useMemo(() => {
    const colorMap = new Map<string, string>();

    for (const group of groups) {
      colorMap.set(group.id, getGroupColor(group.id));
    }

    return colorMap;
  }, [groups]);

  const filteredLinks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return links.filter((link) => {
      const matchesGroup =
        activeGroup === GROUP_FILTER_ALL
          ? true
          : activeGroup === GROUP_FILTER_UNGROUPED
            ? !link.groupId
            : link.groupId === activeGroup;

      if (!matchesGroup) return false;
      if (!query) return true;

      return link.title.toLowerCase().includes(query) || link.url.toLowerCase().includes(query);
    });
  }, [links, searchQuery, activeGroup]);

  const pushToast = useMemo(
    () => (msg: string) => {
      setToasts((prev) => [...prev, msg]);
      setTimeout(() => {
        setToasts((current) => current.slice(1));
      }, 2200);
    },
    []
  );

  const loadShortcutStatus = useCallback(async () => {
    try {
      const commands = (await getAllCommands()) as ExtensionCommand[];

      const activateCommand = commands.find((entry) => entry.name === COMMAND_ACTIVATE_EXTENSION);
      const command = commands.find((entry) => entry.name === COMMAND_SAVE_CURRENT);
      const activateShortcut = activateCommand?.shortcut || '';
      const saveShortcut = command?.shortcut || '';

      setShortcutStatus({
        activateExtension: activateShortcut || 'Action click',
        saveCurrent: saveShortcut || 'Not set',
        isMissing: !saveShortcut
      });
    } catch (err) {
      console.warn('Failed to load shortcuts', err);
      setShortcutStatus({
        activateExtension: 'Unavailable',
        saveCurrent: 'Unavailable',
        isMissing: true
      });
    }
  }, []);

  const resolveTargetGroupId = () => {
    if (activeGroup === GROUP_FILTER_ALL || activeGroup === GROUP_FILTER_UNGROUPED) {
      return undefined;
    }

    return activeGroup;
  };

  const handleSaveUrl = async (
    url: string,
    title: string,
    showToast = true,
    groupId?: string,
    faviconUrl?: string
  ) => {
    const success = await addLink({ url, title, createdAt: Date.now(), groupId, faviconUrl } as SavedLink);

    if (showToast) {
      pushToast(success ? 'Saved link' : 'Already exists');
    }

    return success;
  };

  useEffect(() => {
    const handler = (
      message: unknown,
      _sender: unknown,
      sendResponse: (response?: unknown) => void
    ) => {
      const payload = message as { type?: string; status?: string };
      if (payload?.type !== 'shortcut_save_result') {
        return;
      }

      if (payload.status === 'saved') {
        pushToast('Saved link');
      } else if (payload.status === 'duplicate') {
        pushToast('Already exists');
      } else if (payload.status === 'unavailable') {
        pushToast('Cannot save this page');
      } else {
        pushToast('Failed to save link');
      }

      sendResponse({ handled: true });
    };

    extensionApi.runtime.onMessage.addListener(handler);
    return () => extensionApi.runtime.onMessage.removeListener(handler);
  }, [pushToast]);

  useEffect(() => {
    void loadShortcutStatus();
  }, [loadShortcutStatus]);

  useEffect(() => {
    if (nav === 'settings') {
      void loadShortcutStatus();
    }
  }, [nav, loadShortcutStatus]);

  useEffect(() => {
    const refreshOnFocus = () => {
      void loadShortcutStatus();
    };

    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadShortcutStatus();
      }
    };

    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisibility);

    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisibility);
    };
  }, [loadShortcutStatus]);

  useEffect(() => {
    if (activeGroup === GROUP_FILTER_ALL || activeGroup === GROUP_FILTER_UNGROUPED) {
      return;
    }

    if (!groups.some((group) => group.id === activeGroup)) {
      setActiveGroup(GROUP_FILTER_ALL);
    }
  }, [activeGroup, groups]);

  useEffect(() => {
    const resolvedTheme = computeTheme(settings.theme);
    document.body.setAttribute('data-theme', resolvedTheme);
    document.body.setAttribute('data-font', settings.font);
  }, [settings.theme, settings.font]);

  useEffect(() => {
    if (isSearchOpen && nav === 'links') {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen, nav]);

  useEffect(() => {
    if (isAddOpen && nav === 'links') {
      addInputRef.current?.focus();
    }
  }, [isAddOpen, nav]);

  useEffect(() => {
    if (!isClearAllModalOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isClearingAll) {
        setIsClearAllModalOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isClearAllModalOpen, isClearingAll]);

  const handleSaveCurrent = async (): Promise<SaveCurrentStatus> => {
    try {
      const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) {
        pushToast('Cannot save this page');
        return 'unavailable';
      }

      const success = await handleSaveUrl(
        tab.url,
        tab.title || tab.url,
        true,
        resolveTargetGroupId(),
        typeof tab.favIconUrl === 'string' ? tab.favIconUrl : undefined
      );

      return success ? 'saved' : 'duplicate';
    } catch (err) {
      console.warn('Failed to save current tab', err);
      pushToast('Failed to save link');
      return 'failed';
    }
  };

  const handleSaveAll = async () => {
    const tabs = await extensionApi.tabs.query({ currentWindow: true });
    const targetGroupId = resolveTargetGroupId();
    const nextLinks: SavedLink[] = [];

    for (const tab of tabs) {
      if (!tab.url) {
        continue;
      }

      nextLinks.push({
        url: tab.url,
        title: tab.title || tab.url,
        createdAt: Date.now(),
        groupId: targetGroupId,
        faviconUrl: typeof tab.favIconUrl === 'string' ? tab.favIconUrl : undefined
      });
    }

    await addLinksBulk(nextLinks);
    pushToast('Saved all open tabs');
  };

  const handleOpen = (url: string) => {
    void Promise.resolve(extensionApi.tabs.create({ url })).catch(() => {
      pushToast('Failed to open tab');
    });
  };

  const handleMoveLinkToGroup = (url: string, groupId?: string) => {
    void moveLinkToGroup(url, groupId);
  };

  const handleAddLink = async () => {
    if (!newLink.trim() || isAdding) return;

    const normalizedUrl = normalizeUrl(newLink);
    if (!normalizedUrl) {
      setNewLinkError('Enter a valid URL (http or https).');
      return;
    }

    setIsAdding(true);
    const title = getDefaultTitle(normalizedUrl);
    const didAdd = await handleSaveUrl(normalizedUrl, title, true, resolveTargetGroupId());
    setIsAdding(false);

    if (didAdd) {
      setNewLink('');
      setNewLinkError('');
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || isCreatingGroup) return;

    setIsCreatingGroup(true);
    try {
      const result = await createGroup(newGroupName);
      if (!result) {
        pushToast('Group name required');
        return;
      }

      setActiveGroup(result.group.id);

      if (result.created) {
        setNewGroupName('');
        pushToast('Group created');
      } else {
        pushToast('Group already exists');
      }
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (deletingGroupId) return;

    setDeletingGroupId(groupId);
    try {
      await deleteGroup(groupId);
      if (activeGroup === groupId) {
        setActiveGroup(GROUP_FILTER_ALL);
      }
      pushToast('Group deleted');
    } finally {
      setDeletingGroupId(null);
    }
  };

  const handleClearAllLinks = () => {
    if (isClearingAll || links.length === 0) return;

    setIsClearAllModalOpen(true);
  };

  const handleCloseClearAllModal = () => {
    if (isClearingAll) return;

    setIsClearAllModalOpen(false);
  };

  const handleConfirmClearAllLinks = async () => {
    if (isClearingAll || links.length === 0) return;

    setIsClearingAll(true);
    try {
      await clearLinks();
      pushToast('Cleared all links');
      setIsClearAllModalOpen(false);
    } finally {
      setIsClearingAll(false);
    }
  };

  const handleExport = (format: TransferFormat) => {
    if (format === 'csv') {
      downloadFile(serializeLinksAsCsv(links, groups), 'text/csv;charset=utf-8', format);
    } else {
      downloadFile(
        JSON.stringify({ savedLinks: links, linkGroups: groups }, null, 2),
        'application/json;charset=utf-8',
        format
      );
    }

    pushToast(`Exported ${links.length} links as ${format.toUpperCase()}`);
  };

  const handleImport = async (format: TransferFormat, file: File) => {
    try {
      const text = await file.text();
      const payload: JsonImportPayload =
        format === 'csv'
          ? { links: parseCsvLinks(text), groups: [] }
          : parseJsonPayload(text);

      if (payload.links.length === 0) {
        pushToast('No valid links found in file');
        return;
      }

      let createdGroups = 0;
      const groupsByName = new Map(
        groups.map((group) => [normalizeGroupName(group.name).toLowerCase(), group])
      );
      const existingGroupIds = new Set(groups.map((group) => group.id));
      const sourceGroupMap = new Map<string, string>();

      const ensureGroupByName = async (rawName: string) => {
        const normalizedName = normalizeGroupName(rawName);
        if (!normalizedName) return undefined;

        const key = normalizedName.toLowerCase();
        const existing = groupsByName.get(key);
        if (existing) {
          return existing.id;
        }

        const created = await createGroup(normalizedName);
        if (!created) {
          return undefined;
        }

        groupsByName.set(key, created.group);
        if (created.created) {
          createdGroups += 1;
        }

        return created.group.id;
      };

      for (const importedGroup of payload.groups) {
        const resolvedId = await ensureGroupByName(importedGroup.name);
        if (resolvedId) {
          sourceGroupMap.set(importedGroup.id, resolvedId);
        }
      }

      const linksToImport: SavedLink[] = [];

      for (const link of payload.links) {
        let resolvedGroupId: string | undefined;

        if (link.groupName) {
          resolvedGroupId = await ensureGroupByName(link.groupName);
        } else if (link.groupId && sourceGroupMap.has(link.groupId)) {
          resolvedGroupId = sourceGroupMap.get(link.groupId);
        } else if (link.groupId && existingGroupIds.has(link.groupId)) {
          resolvedGroupId = link.groupId;
        }

        linksToImport.push({
          url: link.url,
          title: link.title,
          createdAt: link.createdAt,
          groupId: resolvedGroupId,
          faviconUrl: link.faviconUrl
        });
      }

      const { added: importedCount, skipped: skippedCount } = await addLinksBulk(linksToImport);

      if (importedCount === 0) {
        pushToast('All imported links already exist');
        return;
      }

      const details: string[] = [];
      if (skippedCount > 0) {
        details.push(`skipped ${skippedCount}`);
      }
      if (createdGroups > 0) {
        details.push(`created ${createdGroups} groups`);
      }

      const detailText = details.length > 0 ? ` (${details.join(', ')})` : '';
      pushToast(`Imported ${importedCount} links${detailText}`);
    } catch (_err) {
      pushToast(`Failed to import ${format.toUpperCase()} file`);
    }
  };

  const handleOpenShortcutSettings = async () => {
    const opened = await openShortcutSettings();
    if (opened) {
      return;
    }

    const fallbackUrl = getShortcutSettingsFallbackUrl();

    try {
      await extensionApi.tabs.create({ url: fallbackUrl });
      pushToast(`Opened ${fallbackUrl}`);
    } catch (err) {
      console.warn('Failed to open shortcut settings', err);
      pushToast(`Open shortcut settings manually. ${getShortcutSettingsHint()}`);
    }
  };

  const handleImportFile = async (format: TransferFormat, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || isImporting) return;

    setIsImporting(true);
    try {
      await handleImport(format, file);
    } finally {
      setIsImporting(false);
    }
  };

  const handleToggleSearch = () => {
    if (nav !== 'links') {
      setNav('links');
      setIsSearchOpen(true);
      return;
    }

    setIsSearchOpen((prev) => {
      const next = !prev;
      if (!next) {
        setSearchQuery('');
      }
      return next;
    });
  };

  const handleHeaderAdd = () => {
    if (nav !== 'links') {
      setNav('links');
      setIsAddOpen(true);
      return;
    }

    setIsAddOpen((prev) => {
      const next = !prev;
      if (!next) {
        setNewLink('');
        setNewLinkError('');
      }
      return next;
    });
  };

  const handleOpenSettingsFromOnboarding = async () => {
    setNav('settings');
    await loadShortcutStatus();
    await completeOnboarding();
  };

  const showOnboarding = isStorageReady && !onboardingState.completed;

  return (
    <div className="lp-shell">
      <header className="lp-header">
        <div className="lp-title-row">
          <div className="lp-title">Tabs</div>
          {nav === 'settings' ? (
            <>
              <span className="lp-crumb-divider">/</span>
              <span className="lp-crumb">Settings</span>
            </>
          ) : null}
        </div>

        <div className="lp-header-actions">
          <button className="lp-icon-btn" onClick={handleToggleSearch} aria-label="Search links" title="Search links">
            <span className="material-symbols-outlined">search</span>
          </button>
          <button className="lp-icon-btn" onClick={handleHeaderAdd} aria-label="Add link" title="Add link">
            <span className="material-symbols-outlined">add</span>
          </button>
        </div>
      </header>

      <main className="lp-main">
        {nav === 'links' ? (
          <div className="lp-links-view">
            <div className="lp-quick-actions">
              <button className="lp-quick-action lp-quick-action-primary" onClick={() => void handleSaveCurrent()}>
                <span className="material-symbols-outlined">bookmark</span>
                <span>Save Current</span>
              </button>
              <button className="lp-quick-action lp-quick-action-secondary" onClick={() => void handleSaveAll()}>
                <span className="material-symbols-outlined">library_add</span>
                <span>Save All</span>
              </button>
            </div>

            {isAddOpen ? (
              <>
                <div className="lp-add-row">
                  <input
                    ref={addInputRef}
                    className={`lp-add-input ${newLinkError ? 'has-error' : ''}`}
                    placeholder="Paste URL here..."
                    value={newLink}
                    onChange={(event) => {
                      const value = event.target.value;
                      setNewLink(value);

                      if (!value.trim()) {
                        setNewLinkError('');
                        return;
                      }

                      if (normalizeUrl(value)) {
                        setNewLinkError('');
                      } else {
                        setNewLinkError('Enter a valid URL (http or https).');
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleAddLink();
                      }
                    }}
                    aria-invalid={newLinkError ? 'true' : 'false'}
                  />
                  <button
                    className="lp-add-button"
                    onClick={() => void handleAddLink()}
                    disabled={!newLink.trim() || Boolean(newLinkError) || isAdding}
                  >
                    {isAdding ? 'Adding...' : 'Add'}
                  </button>
                </div>
                {newLinkError ? <div className="lp-error-text">{newLinkError}</div> : null}
              </>
            ) : null}

            {isSearchOpen ? (
              <div className="lp-search-row">
                <input
                  ref={searchInputRef}
                  className="lp-search-input"
                  placeholder="Search links..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
            ) : null}

            <div className="lp-chip-row">
              <button
                className={`lp-chip ${activeGroup === GROUP_FILTER_ALL ? 'active' : ''}`}
                onClick={() => setActiveGroup(GROUP_FILTER_ALL)}
              >
                All
              </button>
              <button
                className={`lp-chip ${activeGroup === GROUP_FILTER_UNGROUPED ? 'active' : ''}`}
                onClick={() => setActiveGroup(GROUP_FILTER_UNGROUPED)}
              >
                Ungrouped
              </button>
              {groups.map((group) => {
                const isActive = activeGroup === group.id;
                const groupColor = groupColorById.get(group.id);

                return (
                  <button
                    key={group.id}
                    className={`lp-chip ${isActive ? 'active lp-chip-group-active' : ''}`}
                    style={isActive ? getGroupAccentStyle(groupColor) : undefined}
                    onClick={() => setActiveGroup(group.id)}
                  >
                    {group.name}
                  </button>
                );
              })}
            </div>

            <div className="lp-link-list" role="list">
              {filteredLinks.map((link) => {
                const groupName = link.groupId ? groupsById.get(link.groupId) : undefined;
                const groupColor = link.groupId ? groupColorById.get(link.groupId) : undefined;

                return (
                  <article className="lp-link-card" key={link.url} role="listitem">
                    <div className="lp-link-main">
                      <div className="lp-link-icon-wrap">
                        <LinkIcon url={link.url} title={link.title} faviconUrl={link.faviconUrl} />
                      </div>

                      <div className="lp-link-copy">
                        <h3 title={link.title}>{link.title}</h3>
                        <div className="lp-link-meta">
                          <span>{formatDistanceToNow(link.createdAt)}</span>
                          <span className="lp-dot" aria-hidden="true" />
                          {groupName ? (
                            <span className="lp-link-tag" style={getGroupAccentStyle(groupColor)}>{groupName}</span>
                          ) : (
                            <span className="lp-link-url" title={link.url}>{getCompactUrl(link.url)}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="lp-link-actions">
                      <div className="lp-group-picker">
                        <button
                          className="lp-link-action"
                          aria-label="Assign group"
                          title="Assign group"
                          aria-haspopup="true"
                        >
                          <span className={`material-symbols-outlined ${link.groupId ? 'filled' : ''}`}>folder</span>
                        </button>

                        <div className="lp-group-picker-menu" role="menu" aria-label={`Assign group for ${link.title}`}>
                          <button
                            className={`lp-group-picker-item ${!link.groupId ? 'active' : ''}`}
                            onClick={() => handleMoveLinkToGroup(link.url)}
                            role="menuitemradio"
                            aria-checked={!link.groupId}
                          >
                            <span className={`material-symbols-outlined lp-group-picker-check ${!link.groupId ? 'active' : ''}`}>check</span>
                            <span>Ungrouped</span>
                          </button>

                          {groups.map((group) => {
                            const isSelected = link.groupId === group.id;
                            const groupColorValue = groupColorById.get(group.id);
                            return (
                              <button
                                key={group.id}
                                className={`lp-group-picker-item ${isSelected ? 'active' : ''}`}
                                onClick={() => handleMoveLinkToGroup(link.url, group.id)}
                                role="menuitemradio"
                                aria-checked={isSelected}
                              >
                                <span
                                  className={`material-symbols-outlined lp-group-picker-check ${isSelected ? 'active' : ''}`}
                                  style={getGroupAccentStyle(groupColorValue)}
                                >
                                  check
                                </span>
                                <span>{group.name}</span>
                              </button>
                            );
                          })}

                          {groups.length === 0 ? (
                            <div className="lp-group-picker-empty">No groups yet</div>
                          ) : null}
                        </div>
                      </div>

                      <button
                        className="lp-link-action"
                        onClick={() => handleOpen(link.url)}
                        aria-label="Open link"
                        title="Open link"
                      >
                        <span className="material-symbols-outlined">open_in_new</span>
                      </button>
                      <button
                        className="lp-link-action danger"
                        onClick={() => removeLink(link.url)}
                        aria-label="Delete link"
                        title="Delete link"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </article>
                );
              })}

              {filteredLinks.length === 0 ? (
                <div className="lp-empty-state">No links match this view.</div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="lp-settings-view">
            <section className="lp-card lp-settings-section">
              <h2>Theme Selection</h2>
              <div className="lp-theme-grid">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    className={`lp-theme-option ${settings.theme === option.id ? 'active' : ''}`}
                    onClick={() => saveSettings({ theme: option.id })}
                  >
                    <div className={`lp-theme-preview ${option.previewClass}`}>
                      <span className="material-symbols-outlined">{option.icon}</span>
                    </div>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </section>

            <div className="lp-settings-columns">
              <section className="lp-card lp-settings-section">
                <h2>Font Selection</h2>
                <div className="lp-font-list">
                  {FONT_OPTIONS.map((option) => (
                    <label key={option.id} className="lp-font-option">
                      <span>{option.label}</span>
                      <input
                        type="radio"
                        name="font"
                        checked={settings.font === option.id}
                        onChange={() => saveSettings({ font: option.id })}
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className="lp-card lp-settings-section">
                <h2>Shortcuts</h2>
                <div className="lp-shortcut-list">
                  <div className="lp-shortcut-item">
                    <label>Activate Extension</label>
                    <div className="lp-shortcut-input-wrap">
                      <input value={shortcutStatus.activateExtension} readOnly />
                      <span className="material-symbols-outlined">keyboard</span>
                    </div>
                  </div>
                  <div className="lp-shortcut-item">
                    <label>Save Current Page</label>
                    <div className="lp-shortcut-input-wrap">
                      <input value={shortcutStatus.saveCurrent} readOnly />
                      <span className="material-symbols-outlined">bookmark</span>
                    </div>
                  </div>
                </div>
                <div className="lp-shortcut-actions">
                  <button className="lp-secondary-btn" onClick={() => void handleOpenShortcutSettings()}>Manage Shortcuts</button>
                  <button className="lp-secondary-btn" onClick={() => void loadShortcutStatus()}>Refresh</button>
                </div>
                <p className={`lp-muted-note ${shortcutStatus.isMissing ? 'error' : ''}`}>
                  {shortcutStatus.isMissing
                    ? `Shortcut is not set. ${getShortcutSettingsHint()}`
                    : `Shortcut values are managed by your browser. ${getShortcutSettingsHint()}`}
                </p>
              </section>
            </div>

            <section className="lp-card lp-settings-section">
              <div className="lp-section-head">
                <h2>Group Management</h2>
                <button
                  className="lp-chip-action"
                  onClick={() => void handleCreateGroup()}
                  disabled={!newGroupName.trim() || isCreatingGroup}
                >
                  <span className="material-symbols-outlined">add_circle</span>
                  <span>{isCreatingGroup ? 'Creating...' : 'New Group'}</span>
                </button>
              </div>

              <div className="lp-group-create-row">
                <input
                  className="lp-search-input"
                  placeholder="Group Name"
                  value={newGroupName}
                  onChange={(event) => setNewGroupName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleCreateGroup();
                    }
                  }}
                />
              </div>

              {groups.length === 0 ? (
                <div className="lp-empty-state">No groups yet.</div>
              ) : (
                <div className="lp-group-grid">
                  {groups.map((group) => (
                    <div className="lp-group-item" key={group.id}>
                      <div className="lp-group-item-main">
                        <span className="lp-group-dot" style={getGroupAccentStyle(groupColorById.get(group.id))} />
                        <span>{group.name}</span>
                      </div>
                      <button
                        className="lp-link-action danger"
                        onClick={() => void handleDeleteGroup(group.id)}
                        title={`Delete ${group.name}`}
                        disabled={Boolean(deletingGroupId)}
                      >
                        <span className="material-symbols-outlined">
                          {deletingGroupId === group.id ? 'hourglass_top' : 'delete'}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="lp-settings-columns lp-bottom-columns">
              <section className="lp-card lp-settings-section">
                <h2>Data Transfer</h2>
                <div className="lp-format-toggle">
                  <button
                    className={transferFormat === 'csv' ? 'active' : ''}
                    onClick={() => setTransferFormat('csv')}
                  >
                    CSV FORMAT
                  </button>
                  <button
                    className={transferFormat === 'json' ? 'active' : ''}
                    onClick={() => setTransferFormat('json')}
                  >
                    JSON FORMAT
                  </button>
                </div>

                <div className="lp-transfer-grid">
                  <button
                    className="lp-transfer-button"
                    onClick={() => {
                      const targetRef = transferFormat === 'csv' ? csvInputRef : jsonInputRef;
                      targetRef.current?.click();
                    }}
                    disabled={isImporting}
                  >
                    <span className="material-symbols-outlined">upload</span>
                    <span>{isImporting ? 'Importing...' : 'Import Data'}</span>
                  </button>

                  <button className="lp-transfer-button" onClick={() => handleExport(transferFormat)}>
                    <span className="material-symbols-outlined">download</span>
                    <span>Export Data</span>
                  </button>
                </div>

                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="lp-hidden-input"
                  onChange={(event) => void handleImportFile('csv', event)}
                />
                <input
                  ref={jsonInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="lp-hidden-input"
                  onChange={(event) => void handleImportFile('json', event)}
                />
              </section>

              <section className="lp-card lp-settings-section lp-danger-zone">
                <h2>Danger Zone</h2>
                <p>Irreversible actions. Please proceed with caution. All cloud-synced data will be purged.</p>
                <button
                  className="lp-danger-button"
                  onClick={() => void handleClearAllLinks()}
                  disabled={links.length === 0 || isClearingAll}
                >
                  <span className="material-symbols-outlined">delete_forever</span>
                  <span>{isClearingAll ? 'Clearing...' : 'Clear All Links'}</span>
                </button>
              </section>
            </div>
          </div>
        )}
      </main>

      {isClearAllModalOpen ? (
        <div className="lp-modal-backdrop" role="presentation" onClick={handleCloseClearAllModal}>
          <section
            className="lp-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-all-links-title"
            aria-describedby="clear-all-links-description"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="clear-all-links-title">Clear all links?</h3>
            <p id="clear-all-links-description">
              This will permanently remove all saved links. This action cannot be undone.
            </p>

            <div className="lp-modal-actions">
              <button className="lp-secondary-btn" onClick={handleCloseClearAllModal} disabled={isClearingAll}>
                Cancel
              </button>
              <button
                className="lp-danger-button lp-modal-danger-button"
                onClick={() => void handleConfirmClearAllLinks()}
                disabled={isClearingAll}
              >
                <span className="material-symbols-outlined">delete_forever</span>
                <span>{isClearingAll ? 'Clearing...' : 'Clear All Links'}</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showOnboarding ? (
        <OnboardingModal
          onComplete={completeOnboarding}
          onTrySaveCurrent={handleSaveCurrent}
          onOpenSettings={handleOpenSettingsFromOnboarding}
        />
      ) : null}

      <nav className="lp-nav">
        {NAVS.map((item) => {
          const active = nav === item.id;

          return (
            <button
              key={item.id}
              className={active ? 'active' : ''}
              onClick={() => setNav(item.id)}
              aria-label={item.label}
              title={item.label}
            >
              <span className={`material-symbols-outlined ${active ? 'filled' : ''}`}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="lp-toast-container">
        {toasts.map((toast, idx) => (
          <div className="lp-toast" key={`${toast}-${idx}`}>
            {toast}
          </div>
        ))}
      </div>
    </div>
  );
}
