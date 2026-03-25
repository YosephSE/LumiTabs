function isValidIpv4(hostname: string) {
  const octets = hostname.split('.');
  if (octets.length !== 4) {
    return false;
  }

  return octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) {
      return false;
    }

    const numeric = Number(octet);
    return numeric >= 0 && numeric <= 255;
  });
}

function hasValidHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized === 'localhost') {
    return true;
  }

  if (normalized.includes(':')) {
    return true;
  }

  if (isValidIpv4(normalized)) {
    return true;
  }

  return normalized.includes('.') && !normalized.startsWith('.') && !normalized.endsWith('.');
}

export function normalizeUrl(value: string) {
  const input = value.trim();
  if (!input) {
    return null;
  }

  const toHttpUrl = (candidate: string) => {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }

    if (!hasValidHostname(parsed.hostname)) {
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
