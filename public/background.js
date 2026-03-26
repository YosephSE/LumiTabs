const STORAGE_KEYS = {
  savedLinks: 'savedLinks'
};

const COMMAND_NAMES = {
  saveCurrent: 'save_current'
};

const SHORTCUTS_PAGE_URL = 'chrome://extensions/shortcuts';
let feedbackResetTimer = null;
const FEEDBACK_DURATION_MS = 3500;

chrome.runtime.onInstalled.addListener(async () => {
  await configurePanelBehavior();
  await notifyMissingShortcuts();
});

chrome.runtime.onStartup.addListener(async () => {
  await configurePanelBehavior();
  await notifyMissingShortcuts();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === COMMAND_NAMES.saveCurrent) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await saveActiveTab(tab);
    notifyPanels({
      type: 'shortcut_save_result',
      status: result.status
    });
    await showSaveFeedback(result.status);
  }
});

async function configurePanelBehavior() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (err) {
    console.warn('setPanelBehavior failed', err);
  }

  await chrome.action.setBadgeText({ text: '' });
}

async function saveActiveTab(tab) {
  if (!tab?.url) {
    return { status: 'unavailable' };
  }

  try {
    const result = await chrome.storage.local.get([STORAGE_KEYS.savedLinks]);
    const storedLinks = Array.isArray(result[STORAGE_KEYS.savedLinks]) ? result[STORAGE_KEYS.savedLinks] : [];

    const alreadySaved = storedLinks.some((entry) => (
      entry && typeof entry === 'object' && entry.url === tab.url
    ));

    if (alreadySaved) {
      return { status: 'duplicate' };
    }

    const nextLink = {
      url: tab.url,
      title: tab.title || tab.url,
      createdAt: Date.now()
    };

    await chrome.storage.local.set({
      [STORAGE_KEYS.savedLinks]: [nextLink, ...storedLinks]
    });

    return { status: 'saved' };
  } catch (err) {
    console.warn('Save current shortcut failed', err);
    return { status: 'failed' };
  }
}

function notifyPanels(message) {
  chrome.runtime.sendMessage(message, () => {
    void chrome.runtime.lastError;
  });
}

async function showSaveFeedback(status) {
  let badgeText = 'OK';
  let badgeColor = '#2d8a4f';

  if (status === 'duplicate') {
    badgeText = 'DUP';
    badgeColor = '#8a6d1f';
  } else if (status === 'unavailable') {
    badgeText = 'NO';
    badgeColor = '#8a3d2d';
  } else if (status === 'failed') {
    badgeText = 'ERR';
    badgeColor = '#8a2d2d';
  }

  try {
    await chrome.action.setBadgeBackgroundColor({ color: badgeColor });
    await chrome.action.setBadgeText({ text: badgeText });

    if (feedbackResetTimer) {
      clearTimeout(feedbackResetTimer);
    }

    feedbackResetTimer = setTimeout(() => {
      feedbackResetTimer = null;
      void chrome.action.setBadgeText({ text: '' });
    }, FEEDBACK_DURATION_MS);
  } catch (err) {
    console.warn('Action badge feedback failed', err);
  }
}

function getCommands() {
  return new Promise((resolve) => {
    chrome.commands.getAll((commands) => {
      resolve(commands || []);
    });
  });
}

async function notifyMissingShortcuts() {
  try {
    const commands = await getCommands();
    const targets = new Set([COMMAND_NAMES.saveCurrent]);

    const missing = commands.filter((command) => {
      if (!command.name || !targets.has(command.name)) {
        return false;
      }

      return !command.shortcut;
    });

    if (missing.length === 0) {
      return;
    }

    await chrome.notifications.create('shortcut-assignment-warning', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/img/icon.png'),
      title: 'Tabs shortcuts not set',
      message: `Assign shortcuts in ${SHORTCUTS_PAGE_URL}`
    });
  } catch (err) {
    console.warn('Shortcut availability check failed', err);
  }
}
