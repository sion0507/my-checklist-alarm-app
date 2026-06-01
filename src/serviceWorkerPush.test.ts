import { describe, expect, it } from 'vitest';
import serviceWorkerSource from '../public/service-worker.js?raw';

describe('service worker push handling', () => {
  it('handles push notifications with minimal title/body/path payload and opens app clients', () => {
    expect(serviceWorkerSource).toContain("addEventListener('push'");
    expect(serviceWorkerSource).toContain('showNotification');
    expect(serviceWorkerSource).toContain('notification.data?.path');
    expect(serviceWorkerSource).toContain("addEventListener('notificationclick'");
    expect(serviceWorkerSource).toContain('clients.openWindow');
    expect(serviceWorkerSource).not.toContain('localTasks');
    expect(serviceWorkerSource).not.toContain('fullTask');
  });
});
