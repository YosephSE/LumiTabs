import React, { useEffect, useMemo, useState } from 'react';
import { LinkList } from './components/LinkList';
import { SettingsPanel } from './components/SettingsPanel';
import { useStorage } from './hooks/useStorage';
import { LinkGroup, SavedLink, ThemeId } from './types';

function LinksIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.5 13.5 13.5 10.5" />
      <path d="M7.2 16.8 4.8 19.2a3 3 0 0 1-4.2-4.2L3 12.6" />
      <path d="m21 11.4 2.4-2.4a3 3 0 1 0-4.2-4.2l-2.4 2.4" />
      <path d="m16.8 7.2-9.6 9.6" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
      <path d="M19.4 15.2a1 1 0 0 0 .2 1.1l.1.1a1.1 1.1 0 0 1 0 1.5l-1.6 1.6a1.1 1.1 0 0 1-1.5 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V21a1.1 1.1 0 0 1-1.1 1.1h-2.2a1.1 1.1 0 0 1-1.1-1.1v-.1a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.1 1.1 0 0 1-1.5 0l-1.6-1.6a1.1 1.1 0 0 1 0-1.5l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H3a1.1 1.1 0 0 1-1.1-1.1v-2.2A1.1 1.1 0 0 1 3 10.1h.1a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1.1 1.1 0 0 1 0-1.5l1.6-1.6a1.1 1.1 0 0 1 1.5 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V3a1.1 1.1 0 0 1 1.1-1.1h2.2A1.1 1.1 0 0 1 14 3v.1a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.1 1.1 0 0 1 1.5 0l1.6 1.6a1.1 1.1 0 0 1 0 1.5l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H21a1.1 1.1 0 0 1 1.1 1.1v2.2a1.1 1.1 0 0 1-1.1 1.1h-.1a1 1 0 0 0-.9.6Z" />
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

function normalizeUrl(value: string) {
  const input = value.trim();
  if (!input) return null;

  const toHttpUrl = (candidate: string) => {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  };

  try {
    return toHttpUrl(input);
  } catch (_err) {
    try {
      return toHttpUrl(`https://${input}`);
    } catch (_err2) {
      return null;
    }
  }
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

  const pushToast = useMemo(
    () => (msg: string) => {
      setToasts((prev) => [...prev, msg]);
      setTimeout(() => {
        setToasts((current) => current.slice(1));
      }, 2200);
    },
    []
  );

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
    const handler = (message: unknown) => {
      const payload = message as { type?: string; url?: string; title?: string };
      if (payload?.type === 'save_current' && payload.url) {
        void handleSaveUrl(payload.url, payload.title || payload.url);
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [addLink, pushToast]);

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

  const handleShortcutUpdate = async (kind: 'toggle' | 'save', value: string) => {
    if (!value.trim()) return;

    try {
      await chrome.commands.update({
        name: kind === 'toggle' ? 'toggle_panel' : 'save_current',
        shortcut: value
      });

      await saveSettings(kind === 'toggle' ? { toggleShortcut: value } : { saveShortcut: value });
      pushToast('Shortcut updated');
    } catch (_err) {
      pushToast('Shortcut unavailable, keeping previous');
    }
  };

  return (
    <div className="app">
      <main className="main">
        <header className="section-header" style={{ marginBottom: 12 }}>
          <h1>LumiPanel</h1>
          {nav === 'links' && (
            <div className="section-actions">
              <button className="btn" onClick={handleSaveCurrent}>
                Save Current
              </button>
              <button className="ghost" onClick={handleSaveAll}>
                Save All
              </button>
            </div>
          )}
        </header>

        {nav === 'links' ? (
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
        ) : (
          <SettingsPanel
            settings={settings}
            groups={groups}
            linksCount={links.length}
            onUpdate={saveSettings}
            onShortcutRequest={handleShortcutUpdate}
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


