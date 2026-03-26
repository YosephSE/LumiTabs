
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStorage } from './hooks/useStorage';
import { FontId, LinkGroup, SavedLink, ThemeId } from './types';
import { formatDistanceToNow } from './utils/time';
import { normalizeUrl } from './utils/url';

const NAVS = [
  { id: 'links', label: 'Links', icon: 'list_alt' },
  { id: 'settings', label: 'Settings', icon: 'settings' }
] as const;

type NavId = (typeof NAVS)[number]['id'];
type TransferFormat = 'csv' | 'json';

const GROUP_FILTER_ALL = '__all__';
const GROUP_FILTER_UNGROUPED = '__ungrouped__';
const COMMAND_ACTIVATE_EXTENSION = '_execute_action';
const COMMAND_SAVE_CURRENT = 'save_current';

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
  { id: 'notebar-light', label: 'Light', icon: 'light_mode', previewClass: 'theme-preview-light' },
  { id: 'notebar-dark', label: 'Dark', icon: 'dark_mode', previewClass: 'theme-preview-dark' },
  { id: 'notebar-ocean', label: 'Ocean', icon: 'water', previewClass: 'theme-preview-ocean' }
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
};

type JsonImportPayload = {
  links: ImportedLinkRecord[];
  groups: LinkGroup[];
};

function computeTheme(theme: ThemeId) {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'notebar-dark' : 'notebar-light';
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

function getAvatarInitial(title: string, url: string) {
  const source = title.trim() || getDefaultTitle(url);
  const match = source.match(/[A-Za-z0-9]/);
  return match ? match[0].toUpperCase() : '?';
}

type LinkIconProps = {
  url: string;
  title: string;
};

function LinkIcon({ url, title }: LinkIconProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [url]);

  if (hasError) {
    return <div className="lp-link-avatar" aria-hidden="true">{getAvatarInitial(title, url)}</div>;
  }

  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url)}&sz=64`;

  return (
    <img
      className="lp-link-icon"
      src={favicon}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
    />
  );
}

function toSavedLink(candidate: { url?: unknown; title?: unknown; createdAt?: unknown; groupId?: unknown }) {
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

  return { url: normalizedUrl, title, createdAt, groupId } as SavedLink;
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

export default function App() {
  const {
    links,
    groups,
    settings,
    addLink,
    removeLink,
    clearLinks,
    saveSettings,
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
      const commands = await new Promise<chrome.commands.Command[]>((resolve) => {
        chrome.commands.getAll((entries) => {
          resolve(entries || []);
        });
      });

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

  const handleSaveUrl = async (url: string, title: string, showToast = true, groupId?: string) => {
    const success = await addLink({ url, title, createdAt: Date.now(), groupId } as SavedLink);

    if (showToast) {
      pushToast(success ? 'Saved link' : 'Already exists');
    }

    return success;
  };

  useEffect(() => {
    const handler = (
      message: unknown,
      _sender: chrome.runtime.MessageSender,
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

    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
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

  const handleSaveCurrent = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      pushToast('Cannot save this page');
      return;
    }

    await handleSaveUrl(tab.url, tab.title || tab.url, true, resolveTargetGroupId());
  };

  const handleSaveAll = async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const targetGroupId = resolveTargetGroupId();

    for (const tab of tabs) {
      if (tab.url) {
        await handleSaveUrl(tab.url, tab.title || tab.url, false, targetGroupId);
      }
    }

    pushToast('Saved all open tabs');
  };

  const handleOpen = (url: string) => {
    chrome.tabs.create({ url });
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

      let importedCount = 0;
      let skippedCount = 0;

      for (const link of payload.links) {
        let resolvedGroupId: string | undefined;

        if (link.groupName) {
          resolvedGroupId = await ensureGroupByName(link.groupName);
        } else if (link.groupId && sourceGroupMap.has(link.groupId)) {
          resolvedGroupId = sourceGroupMap.get(link.groupId);
        } else if (link.groupId && existingGroupIds.has(link.groupId)) {
          resolvedGroupId = link.groupId;
        }

        const didAdd = await addLink({
          url: link.url,
          title: link.title,
          createdAt: link.createdAt,
          groupId: resolvedGroupId
        });

        if (didAdd) {
          importedCount += 1;
        } else {
          skippedCount += 1;
        }
      }

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

  const handleOpenShortcutSettings = () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }, () => {
      if (!chrome.runtime.lastError) {
        return;
      }

      console.warn('Failed to open shortcut settings', chrome.runtime.lastError);
      pushToast('Open chrome://extensions/shortcuts manually');
    });
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
              {groups.map((group) => (
                <button
                  key={group.id}
                  className={`lp-chip ${activeGroup === group.id ? 'active' : ''}`}
                  onClick={() => setActiveGroup(group.id)}
                >
                  {group.name}
                </button>
              ))}
            </div>

            <div className="lp-link-list" role="list">
              {filteredLinks.map((link) => {
                const groupName = link.groupId ? groupsById.get(link.groupId) : undefined;

                return (
                  <article className="lp-link-card" key={link.url} role="listitem">
                    <div className="lp-link-main">
                      <div className="lp-link-icon-wrap">
                        <LinkIcon url={link.url} title={link.title} />
                      </div>

                      <div className="lp-link-copy">
                        <h3 title={link.title}>{link.title}</h3>
                        <div className="lp-link-meta">
                          <span>{formatDistanceToNow(link.createdAt)}</span>
                          <span className="lp-dot" aria-hidden="true" />
                          {groupName ? (
                            <span className="lp-link-tag">{groupName}</span>
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
                            return (
                              <button
                                key={group.id}
                                className={`lp-group-picker-item ${isSelected ? 'active' : ''}`}
                                onClick={() => handleMoveLinkToGroup(link.url, group.id)}
                                role="menuitemradio"
                                aria-checked={isSelected}
                              >
                                <span className={`material-symbols-outlined lp-group-picker-check ${isSelected ? 'active' : ''}`}>check</span>
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
                  <button className="lp-secondary-btn" onClick={handleOpenShortcutSettings}>Manage in Chrome</button>
                  <button className="lp-secondary-btn" onClick={() => void loadShortcutStatus()}>Refresh</button>
                </div>
                <p className={`lp-muted-note ${shortcutStatus.isMissing ? 'error' : ''}`}>
                  {shortcutStatus.isMissing
                    ? 'Shortcut is not set. Assign it in chrome://extensions/shortcuts.'
                    : 'Shortcut values are managed in chrome://extensions/shortcuts.'}
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
                        <span className="lp-group-dot" />
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
