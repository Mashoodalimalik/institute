'use client';

import { useState, useEffect } from 'react';
import { Bell, BellRing, BellOff, Sparkles, Check } from 'lucide-react';
import vapidKeysJson from '@/lib/vapid-keys.json';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function NotificationBell() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'default'>('default');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
      checkExistingSubscription();
    }
  }, []);

  const checkExistingSubscription = async () => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          setIsSubscribed(true);
        }
      } catch (err) {
        console.error('Error checking SW subscription:', err);
      }
    }
  };

  const subscribeUser = async () => {
    setLoading(true);
    setMsg('');

    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('Web Push is not supported in this browser.');
        setLoading(false);
        return;
      }

      // Request permission
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result !== 'granted') {
        alert('Notification permission was denied.');
        setLoading(false);
        return;
      }

      // Register or get Service Worker
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Public VAPID Key
      const vapidPublicKey =
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || vapidKeysJson.publicKey;

      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      });

      // Save to Supabase / Demo store backend
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userId: 'parent-001', // Demo parent profile
        }),
      });

      if (res.ok) {
        setIsSubscribed(true);
        setMsg('Notifications enabled!');
        setTimeout(() => setMsg(''), 4000);
      } else {
        const data = await res.json();
        alert('Failed to save push subscription: ' + (data.error || 'Server error'));
      }
    } catch (err: any) {
      console.error('Error subscribing to push:', err);
      alert('Subscription Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const unsubscribeUser = async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
      }

      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'parent-001' }),
      });

      setIsSubscribed(false);
      setMsg('Notifications disabled');
      setTimeout(() => setMsg(''), 4000);
    } catch (err: any) {
      console.error('Error unsubscribing:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex items-center gap-2">
      {msg && (
        <span className="text-xs text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full animate-fade-in hidden sm:inline-block">
          {msg}
        </span>
      )}

      {isSubscribed ? (
        <button
          onClick={unsubscribeUser}
          disabled={loading}
          title="Web Push Notifications Enabled (Click to disable)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 text-xs font-semibold transition-all shadow-sm"
        >
          <BellRing size={14} className="text-emerald-400" />
          <span className="hidden sm:inline">Push Active</span>
          <Check size={12} className="text-emerald-400" />
        </button>
      ) : (
        <button
          onClick={subscribeUser}
          disabled={loading}
          title="Enable Real-Time Web Push Notifications"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600/20 border border-brand-500/30 text-brand-300 hover:bg-brand-600/30 text-xs font-semibold transition-all shadow-sm"
        >
          <Bell size={14} className="text-brand-400 animate-pulse" />
          <span className="hidden sm:inline">Enable Push Notifications</span>
          <Sparkles size={12} className="text-brand-400" />
        </button>
      )}
    </div>
  );
}
