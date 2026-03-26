import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LinkList } from './components/LinkList';
import { SettingsPanel } from './components/SettingsPanel';
import { useStorage } from './hooks/useStorage';
import { LinkGroup, SavedLink, ThemeId } from './types';
import { normalizeUrl } from './utils/url';

function LinksIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h7" />
      <path d="M4 12h5" />
      <path d="M4 17h7" />
      <path d="M14.8 9.2a2.8 2.8 0 0 1 0-4l1.2-1.2a2.8 2.8 0 1 1 4 4l-1.2 1.2" />
      <path d="M9.2 14.8a2.8 2.8 0 0 1 0 4L8 20a2.8 2.8 0 0 1-4-4l1.2-1.2" />
      <path d="m8 16 8-8" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h6" />
      <path d="M14 6h6" />
      <path d="M4 12h10" />
      <path d="M18 12h2" />
      <path d="M4 18h2" />
      <path d="M10 18h10" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="8" cy="18" r="2" />
    </svg>
  );
}

const NAVS = [
  { id: 'links', label: 'Links', Icon: LinksIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon }
] as const;

type NavId = (typeof NAVS)[number]['id'];
type TransferFormat = 'csv' | 'json';

const GROUP_FILTER_ALL = '__all__';
const GROUP_FILTER_UNGROUPED = '__ungrouped__';
const COMMAND_SAVE_CURRENT = 'save_current';

type ShortcutStatus = {
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
  const fileName = `lumitabs-links-${stamp}.${extension}`;
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
    saveCurrent: 'Not set',
    isMissing: true
  });

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

      const findShortcut = (name: string) => {
        const command = commands.find((entry) => entry.name === name);
        return command?.shortcut || '';
      };

      const saveShortcut = findShortcut(COMMAND_SAVE_CURRENT);

      setShortcutStatus({
        saveCurrent: saveShortcut || 'Not set',
        isMissing: !saveShortcut
      });
    } catch (err) {
      console.warn('Failed to load shortcuts', err);
      setShortcutStatus({
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

  const handleSaveCurrent = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
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

  const handleAddPastedLink = async (value: string) => {
    const normalizedUrl = normalizeUrl(value);
    if (!normalizedUrl) {
      pushToast('Invalid URL');
      return false;
    }

    const title = getDefaultTitle(normalizedUrl);
    await handleSaveUrl(normalizedUrl, title, true, resolveTargetGroupId());
    return true;
  };

  const handleCreateGroup = async (name: string) => {
    const result = await createGroup(name);
    if (!result) {
      pushToast('Group name required');
      return false;
    }

    setActiveGroup(result.group.id);

    if (result.created) {
      pushToast('Group created');
      return true;
    }

    pushToast('Group already exists');
    return false;
  };

  const handleDeleteGroup = async (groupId: string) => {
    await deleteGroup(groupId);
    if (activeGroup === groupId) {
      setActiveGroup(GROUP_FILTER_ALL);
    }
    pushToast('Group deleted');
  };

  const handleClearAllLinks = async () => {
    await clearLinks();
    pushToast('Cleared all links');
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

  const handleRefreshShortcuts = async () => {
    await loadShortcutStatus();
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-title-wrap">
          <h1>LumiPanel</h1>
          <span className="topbar-kicker">Link vault</span>
        </div>
      </header>

      <main className="main">
        {nav === 'links' ? (
          <>
            <section className="quick-actions">
              <button className="btn action-card action-card-primary" onClick={handleSaveCurrent}>
                <span>Save Current</span>
              </button>
              <button className="ghost action-card" onClick={handleSaveAll}>
                <span>Save All Tabs</span>
              </button>
            </section>

            <LinkList
              links={links}
              groups={groups}
              activeGroup={activeGroup}
              allGroupKey={GROUP_FILTER_ALL}
              ungroupedGroupKey={GROUP_FILTER_UNGROUPED}
              onOpen={handleOpen}
              onDelete={removeLink}
              onAdd={handleAddPastedLink}
              onMove={(url, groupId) => void moveLinkToGroup(url, groupId)}
              onGroupChange={setActiveGroup}
            />
          </>
        ) : (
          <SettingsPanel
            settings={settings}
            shortcuts={shortcutStatus}
            groups={groups}
            linksCount={links.length}
            onUpdate={saveSettings}
            onOpenShortcutSettings={handleOpenShortcutSettings}
            onRefreshShortcuts={handleRefreshShortcuts}
            onExportRequest={handleExport}
            onImportRequest={handleImport}
            onCreateGroup={handleCreateGroup}
            onDeleteGroup={handleDeleteGroup}
            onClearAll={handleClearAllLinks}
          />
        )}
      </main>

      <nav className="nav">
        {NAVS.map((item) => (
          <button
            key={item.id}
            className={nav === item.id ? 'active' : ''}
            onClick={() => setNav(item.id)}
            aria-label={item.label}
            title={item.label}
          >
            <item.Icon />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="toast-container">
        {toasts.map((toast, idx) => (
          <div className="toast" key={`${toast}-${idx}`}>
            {toast}
          </div>
        ))}
      </div>
    </div>
  );
}



