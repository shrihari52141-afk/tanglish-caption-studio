const DEVICE_ID_KEY = 'caption_studio_device_id';

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDeviceInfo() {
  const ua = navigator.userAgent;
  let brand = 'Unknown';
  let model = 'Unknown';

  if (/Android/.test(ua)) {
    const match = ua.match(/;\s*([^;)]+)\s*Build/);
    if (match) {
      const parts = match[1].trim().split(' ');
      brand = parts[0] || 'Unknown';
      model = parts.slice(1).join(' ') || 'Unknown';
    }
    const brandMatch = ua.match(/([^/]+)\//);
    if (brandMatch && brand === 'Unknown') brand = brandMatch[1];
  } else if (/iPhone|iPad/.test(ua)) {
    brand = 'Apple';
    model = /iPhone/.test(ua) ? 'iPhone' : 'iPad';
  } else {
    brand = 'Web';
    model = navigator.platform || 'Desktop';
  }

  const osMatch = ua.match(/Android\s([\d.]+)/);
  const osVersion = osMatch ? `Android ${osMatch[1]}` : (/iPhone|iPad/.test(ua) ? 'iOS' : 'Web');

  return { brand, model, deviceId: getDeviceId(), osVersion, userAgent: ua };
}

export interface TelegramNotifyDetails {
  fileName: string;
  fileSize: string;
  audioSize: string;
  aiProcessingCount: number;
  isExport?: boolean;
  source?: 'mic' | 'video' | 'audio';
  language?: string;
  translationMode?: string;
  aiModel?: string;
  mediaDuration?: string;
  emojiStyle?: string;
  useEmojis?: boolean;
  usePunctuation?: boolean;
  captionWords?: number;
  exportMethod?: 'local' | 'cloud' | 'none';
}

export async function notifyTelegram(details: TelegramNotifyDetails) {
  try {
    const info = getDeviceInfo();
    await fetch('/api/telegram/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...info,
        ...details,
      }),
    });
  } catch (err) {
    console.warn('Telegram notify failed:', err);
  }
}
