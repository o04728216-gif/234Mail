import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  AlignLeft,
  BarChart2,
  Bold,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code2,
  Eye,
  FileText,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Monitor,
  Paperclip,
  Pause,
  PenSquare,
  Play,
  RemoveFormatting,
  RotateCcw,
  Save,
  Send,
  Settings,
  Smartphone,
  Sparkles,
  Square,
  Strikethrough,
  Trash2,
  Underline,
  Upload,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { t } from '../i18n';
import type {
  DashboardSnapshot,
  DispatchSpeedMode,
  DraftItem,
  EmailMode,
  HourlyRateStep,
  LanguageCode,
  QueueJob,
} from '../types';
import { apiRequest } from '../utils/api';

const HOURLY_STEPS: HourlyRateStep[] = [50, 100, 200, 300, 400, 500, 1000];
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
const HOUR_12_SLOTS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const MINUTE_5_SLOTS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const;

type HtmlEditorSubTab = 'visual' | 'code' | 'preview';

function roundUpToFiveMinutes(date: Date): Date {
  const next = new Date(date.getTime());
  next.setSeconds(0, 0);
  const rem = next.getMinutes() % 5;
  if (rem !== 0) {
    next.setMinutes(next.getMinutes() + (5 - rem));
  }
  return next;
}

function getDefaultScheduleDate(): Date {
  const base = new Date(Date.now() + 60 * 60 * 1000);
  base.setSeconds(0, 0);
  const mins = base.getMinutes();
  const rem = mins % 15;
  if (rem !== 0) {
    base.setMinutes(mins + (15 - rem));
  }
  return base;
}

function parseScheduleDate(value: string): Date {
  if (!value) return getDefaultScheduleDate();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return getDefaultScheduleDate();
  return parsed;
}

function formatScheduledDateTime(value: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatRelativeLeadTime(target: Date): string {
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return 'Starting right away';
  const totalMins = Math.round(diffMs / 60000);
  if (totalMins < 60) return `In ${totalMins} min${totalMins === 1 ? '' : 's'}`;
  const totalHours = Math.floor(totalMins / 60);
  const remMins = totalMins % 60;
  if (totalHours < 24) {
    return remMins > 0 ? `In ${totalHours}h ${remMins}m` : `In ${totalHours} hr${totalHours === 1 ? '' : 's'}`;
  }
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours > 0 ? `In ${days}d ${remHours}h` : `In ${days} day${days === 1 ? '' : 's'}`;
}

interface ModernSchedulePickerProps {
  value: string;
  onChange: (nextIso: string) => void;
}

const ModernSchedulePicker: React.FC<ModernSchedulePickerProps> = ({ value, onChange }) => {
  const selected = useMemo(() => parseScheduleDate(value), [value]);
  const [viewCursor, setViewCursor] = useState<{ year: number; month: number }>(() => ({
    year: selected.getFullYear(),
    month: selected.getMonth(),
  }));

  useEffect(() => {
    setViewCursor({
      year: selected.getFullYear(),
      month: selected.getMonth(),
    });
  }, [selected.getFullYear(), selected.getMonth()]);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  const selYear = selected.getFullYear();
  const selMonth = selected.getMonth();
  const selDay = selected.getDate();
  const selHour24 = selected.getHours();
  const selPeriod: 'AM' | 'PM' = selHour24 >= 12 ? 'PM' : 'AM';
  const selHour12 = selHour24 % 12 === 0 ? 12 : selHour24 % 12;
  const selMinute = (Math.round(selected.getMinutes() / 5) * 5) % 60;

  const daysInViewMonth = new Date(viewCursor.year, viewCursor.month + 1, 0).getDate();
  const firstWeekday = new Date(viewCursor.year, viewCursor.month, 1).getDay();
  const monthLabel = new Date(viewCursor.year, viewCursor.month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const canGoPrevMonth =
    viewCursor.year > now.getFullYear() ||
    (viewCursor.year === now.getFullYear() && viewCursor.month > now.getMonth());

  const applyNewDate = (next: Date) => {
    const safe = next.getTime() < Date.now() ? roundUpToFiveMinutes(new Date(Date.now() + 15 * 60000)) : next;
    onChange(safe.toISOString());
    setViewCursor({ year: safe.getFullYear(), month: safe.getMonth() });
  };

  const handleSelectDay = (day: number) => {
    const candidate = new Date(viewCursor.year, viewCursor.month, day, selHour24, selMinute, 0, 0);
    applyNewDate(candidate);
  };

  const handleSelectHour12 = (hour12: number) => {
    const nextHour24 =
      selPeriod === 'AM' ? (hour12 === 12 ? 0 : hour12) : hour12 === 12 ? 12 : hour12 + 12;
    const candidate = new Date(selYear, selMonth, selDay, nextHour24, selMinute, 0, 0);
    applyNewDate(candidate);
  };

  const handleSelectPeriod = (period: 'AM' | 'PM') => {
    const nextHour24 =
      period === 'AM' ? (selHour12 === 12 ? 0 : selHour12) : selHour12 === 12 ? 12 : selHour12 + 12;
    const candidate = new Date(selYear, selMonth, selDay, nextHour24, selMinute, 0, 0);
    applyNewDate(candidate);
  };

  const handleSelectMinute = (minute: number) => {
    const candidate = new Date(selYear, selMonth, selDay, selHour24, minute, 0, 0);
    applyNewDate(candidate);
  };

  const presets = useMemo(() => {
    const cur = new Date();
    const in15m = roundUpToFiveMinutes(new Date(cur.getTime() + 15 * 60000));
    const in1h = roundUpToFiveMinutes(new Date(cur.getTime() + 60 * 60000));
    const in3h = roundUpToFiveMinutes(new Date(cur.getTime() + 3 * 60 * 60000));

    const eve = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 18, 0, 0, 0);
    let eveLabel = 'Today 6:00 PM';
    if (eve.getTime() <= cur.getTime() + 10 * 60000) {
      eve.setDate(eve.getDate() + 1);
      eveLabel = 'Tmrw 6:00 PM';
    }

    const tmrw9am = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1, 9, 0, 0, 0);

    const nextMon = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), 9, 0, 0, 0);
    const daysUntilMon = (8 - nextMon.getDay()) % 7 || 7;
    nextMon.setDate(nextMon.getDate() + daysUntilMon);

    return [
      { id: '15m', label: 'In 15 mins', target: in15m },
      { id: '1h', label: 'In 1 hour', target: in1h },
      { id: '3h', label: 'In 3 hours', target: in3h },
      { id: 'eve', label: eveLabel, target: eve },
      { id: 'tmrw9', label: 'Tomorrow 9 AM', target: tmrw9am },
      { id: 'mon9', label: 'Next Mon 9 AM', target: nextMon },
    ];
  }, []);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-[#111622] p-4 space-y-4">
      {/* Quick One-Click Presets */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-cyan-500" />
            <span>Quick Pick</span>
          </span>
          <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400">
            Click to choose — no typing needed
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {presets.map((preset) => {
            const isMatch = Math.abs(selected.getTime() - preset.target.getTime()) < 60000;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyNewDate(preset.target)}
                className={`min-h-[38px] py-2 px-2.5 rounded-lg border text-[11px] font-mono font-medium transition-all cursor-pointer text-center ${
                  isMatch
                    ? 'border-cyan-500 bg-cyan-500 text-slate-950 font-bold shadow-xs'
                    : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b0f17] text-slate-700 dark:text-slate-200 hover:border-cyan-500/50 hover:text-cyan-600 dark:hover:text-cyan-300'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive Calendar + Clickable Time Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Clickable Month Calendar */}
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0b0f17] p-3.5">
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              disabled={!canGoPrevMonth}
              onClick={() =>
                setViewCursor((prev) =>
                  prev.month === 0
                    ? { year: prev.year - 1, month: 11 }
                    : { year: prev.year, month: prev.month - 1 }
                )
              }
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-cyan-500/50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="text-xs font-display font-bold text-slate-900 dark:text-white">
              {monthLabel}
            </div>

            <button
              type="button"
              onClick={() =>
                setViewCursor((prev) =>
                  prev.month === 11
                    ? { year: prev.year + 1, month: 0 }
                    : { year: prev.year, month: prev.month + 1 }
                )
              }
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-cyan-500/50 cursor-pointer transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
            {WEEKDAY_LABELS.map((wd) => (
              <div
                key={wd}
                className="text-[10px] font-mono font-semibold text-slate-400 dark:text-slate-500 py-1"
              >
                {wd}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstWeekday }).map((_, idx) => (
              <div key={`empty-${idx}`} className="h-9 sm:h-8" />
            ))}

            {Array.from({ length: daysInViewMonth }).map((_, idx) => {
              const day = idx + 1;
              const cellStart = new Date(viewCursor.year, viewCursor.month, day).getTime();
              const isPast = cellStart < todayStart;
              const isToday = cellStart === todayStart;
              const isSelected =
                viewCursor.year === selYear && viewCursor.month === selMonth && day === selDay;

              return (
                <button
                  key={day}
                  type="button"
                  disabled={isPast}
                  onClick={() => handleSelectDay(day)}
                  className={`h-9 sm:h-8 rounded-lg text-xs font-mono tabular-nums flex items-center justify-center transition-all ${
                    isPast
                      ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                      : isSelected
                        ? 'bg-gradient-to-r from-cyan-400 to-indigo-400 text-slate-950 font-extrabold shadow-xs cursor-pointer'
                        : isToday
                          ? 'border border-cyan-500/50 text-cyan-600 dark:text-cyan-300 font-bold hover:bg-cyan-500/10 cursor-pointer'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] cursor-pointer'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Clickable Hour, Minute & AM/PM Picker */}
        <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0b0f17] p-3.5 flex flex-col justify-between space-y-3.5">
          {/* Header + AM/PM Switch */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Select Hour
            </span>
            <div className="inline-flex p-0.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#141926]">
              {(['AM', 'PM'] as const).map((period) => {
                const active = selPeriod === period;
                return (
                  <button
                    key={period}
                    type="button"
                    onClick={() => handleSelectPeriod(period)}
                    className={`min-h-[34px] px-3 py-1 rounded-md text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                      active
                        ? 'bg-cyan-400 text-slate-950'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {period}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 12 Clickable Hour Buttons */}
          <div className="grid grid-cols-4 gap-1.5">
            {HOUR_12_SLOTS.map((hr) => {
              const active = selHour12 === hr;
              return (
                <button
                  key={hr}
                  type="button"
                  onClick={() => handleSelectHour12(hr)}
                  className={`min-h-[38px] py-2 rounded-lg border text-xs font-mono tabular-nums transition-all cursor-pointer ${
                    active
                      ? 'border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 font-extrabold ring-1 ring-cyan-500/40'
                      : 'border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#141926] text-slate-700 dark:text-slate-200 hover:border-cyan-500/40'
                  }`}
                >
                  {hr}
                </button>
              );
            })}
          </div>

          {/* 12 Clickable 5-Minute Buttons */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Select Minutes
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {MINUTE_5_SLOTS.map((min) => {
                const active = selMinute === min;
                const padded = String(min).padStart(2, '0');
                return (
                  <button
                    key={min}
                    type="button"
                    onClick={() => handleSelectMinute(min)}
                    className={`min-h-[36px] py-1.5 rounded-lg border text-[11px] font-mono tabular-nums transition-all cursor-pointer ${
                      active
                        ? 'border-indigo-400 bg-indigo-500/20 text-indigo-700 dark:text-indigo-200 font-extrabold ring-1 ring-indigo-400/40'
                        : 'border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#141926] text-slate-600 dark:text-slate-300 hover:border-indigo-400/40'
                    }`}
                  >
                    :{padded}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Live Selected Schedule Summary Bar */}
      <div className="px-3.5 py-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/[0.08] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-800 dark:text-slate-100">
          <Calendar className="w-4 h-4 text-cyan-500 shrink-0" />
          <span>
            Send Time:{' '}
            <strong className="text-cyan-700 dark:text-cyan-300">
              {formatScheduledDateTime(selected.toISOString())}
            </strong>
          </span>
        </div>
        <span className="px-2.5 py-0.5 rounded-md bg-cyan-500/20 text-cyan-800 dark:text-cyan-200 text-[11px] font-mono font-semibold tabular-nums">
          {formatRelativeLeadTime(selected)}
        </span>
      </div>
    </div>
  );
};

function injectPreviewSampleName(html: string, sampleName: string): string {
  return html.replace(
    /\{first_name\}/gi,
    `<span data-merge-first-name="true">${sampleName}</span>`
  );
}

function restoreMergeTagFromPreviewDom(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  const tokens = clone.querySelectorAll('span[data-merge-first-name="true"]');
  tokens.forEach((node) => {
    const textNode = document.createTextNode('{first_name}');
    node.parentNode?.replaceChild(textNode, node);
  });
  return clone.innerHTML;
}

function extractEmailStylesAndBody(rawHtml: string): { styles: string; bodyHtml: string } {
  if (!rawHtml || rawHtml.trim() === '<p><br></p>' || rawHtml.trim() === '<br>') {
    return { styles: '', bodyHtml: '' };
  }
  const parser = new DOMParser();
  const parsed = parser.parseFromString(rawHtml, 'text/html');
  const styleNodes = Array.from(parsed.querySelectorAll('style, link[rel="stylesheet"]'));
  const styles = styleNodes.map((node) => node.outerHTML).join('\n');
  parsed.body.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => node.remove());
  return {
    styles,
    bodyHtml: parsed.body.innerHTML,
  };
}

interface EditableEmailIframeProps {
  html: string;
  sampleFirstName: string;
  viewportMode: 'desktop' | 'phone';
  syncTriggerRef: React.MutableRefObject<(() => void) | null>;
  onHtmlChange: (nextHtml: string) => void;
  onEditLink: (anchor: HTMLAnchorElement, url: string) => void;
  onEditImage: (img: HTMLImageElement, url: string) => void;
}

const EditableEmailIframe: React.FC<EditableEmailIframeProps> = ({
  html,
  sampleFirstName,
  viewportMode,
  syncTriggerRef,
  onHtmlChange,
  onEditLink,
  onEditImage,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const customStylesRef = useRef<string>('');
  const lastEmittedHtmlRef = useRef<string | null>(null);
  const lastSampleNameRef = useRef<string>(sampleFirstName);
  const callbacksRef = useRef({ onHtmlChange, onEditLink, onEditImage });
  const [desktopHeight, setDesktopHeight] = useState<number>(380);

  callbacksRef.current = { onHtmlChange, onEditLink, onEditImage };

  const fitContent = () => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) return;
    const root = doc.getElementById('esp-email-root') as HTMLDivElement | null;
    if (!root) return;

    const rawClientWidth = doc.documentElement.clientWidth || iframe.clientWidth;
    const availableWidth = Math.max(0, rawClientWidth - 2);
    let appliedZoom = 1;

    if (availableWidth > 0) {
      root.style.zoom = '1';
      root.style.width = '100%';
      const naturalWidth = Math.max(root.scrollWidth, doc.body.scrollWidth);
      if (naturalWidth > availableWidth + 2) {
        appliedZoom = availableWidth / naturalWidth;
        root.style.width = `${naturalWidth}px`;
      }
    } else {
      root.style.zoom = '1';
      root.style.width = '100%';
    }

    const unscaledHeight = root.scrollHeight;
    if (appliedZoom < 1) {
      root.style.zoom = appliedZoom.toFixed(4);
    }

    if (viewportMode === 'desktop') {
      const nextHeight = Math.max(360, Math.ceil(unscaledHeight * appliedZoom) + 6);
      setDesktopHeight((prev) => (Math.abs(prev - nextHeight) > 2 ? nextHeight : prev));
    }
  };

  const attachImageListeners = () => {
    const doc = iframeRef.current?.contentDocument;
    const root = doc?.getElementById('esp-email-root');
    if (!root) return;
    root.querySelectorAll('img').forEach((img) => {
      if (!img.complete) {
        img.addEventListener('load', fitContent, { once: true });
        img.addEventListener('error', fitContent, { once: true });
      }
    });
  };

  const syncBack = () => {
    const doc = iframeRef.current?.contentDocument;
    const root = doc?.getElementById('esp-email-root');
    if (!root) return;
    const restoredBody = restoreMergeTagFromPreviewDom(root).trim();
    const isEmpty = !restoredBody || restoredBody === '<br>' || restoredBody === '<p><br></p>';
    const stylesPrefix = customStylesRef.current ? `${customStylesRef.current}\n` : '';
    const combined = isEmpty && !customStylesRef.current ? '<p><br></p>' : `${stylesPrefix}${restoredBody}`;
    lastEmittedHtmlRef.current = combined;
    callbacksRef.current.onHtmlChange(combined);
    fitContent();
  };

  syncTriggerRef.current = syncBack;

  const ensureDocumentAndRender = (forceWrite: boolean) => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!iframe || !doc) return;

    let root = doc.getElementById('esp-email-root') as HTMLDivElement | null;
    const isFirstInit = !root;

    if (!root) {
      doc.open();
      doc.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style id="esp-base-styles">
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #ffffff;
    color: #0f172a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    overflow-x: hidden !important;
    ${viewportMode === 'desktop' ? 'height: auto !important; overflow-y: hidden !important;' : 'height: 100%; overflow-y: auto;'}
  }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(15, 23, 42, 0.18); border-radius: 9999px; }
  #esp-email-root {
    min-height: ${viewportMode === 'desktop' ? '340px' : '100%'};
    padding: ${viewportMode === 'desktop' ? '18px' : '10px'};
    box-sizing: border-box;
    outline: none;
    word-wrap: break-word;
  }
  #esp-email-root:empty::before {
    content: attr(data-placeholder);
    color: #94a3b8;
    font-style: italic;
    font-size: 12px;
    font-family: monospace;
    pointer-events: none;
  }
  #esp-email-root img {
    cursor: pointer;
  }
</style>
</head>
<body>
  <div id="esp-email-root" contenteditable="true" spellcheck="true" data-placeholder="Paste your email template or type here..."></div>
</body>
</html>`);
      doc.close();

      root = doc.getElementById('esp-email-root') as HTMLDivElement;

      root.addEventListener('input', () => {
        syncBack();
      });

      root.addEventListener('paste', (e: ClipboardEvent) => {
        const clipHtml = e.clipboardData?.getData('text/html') || '';
        const clipText = e.clipboardData?.getData('text/plain') || '';
        if (
          !clipHtml.trim() &&
          /^\s*(<!doctype|<html|<head|<body|<style|<table|<div|<!--)/i.test(clipText)
        ) {
          e.preventDefault();
          lastEmittedHtmlRef.current = null;
          callbacksRef.current.onHtmlChange(clipText);
          return;
        }
        setTimeout(() => {
          attachImageListeners();
          syncBack();
        }, 30);
      });

      root.addEventListener('dblclick', (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        const anchor = target?.closest('a') as HTMLAnchorElement | null;
        if (anchor) {
          e.preventDefault();
          callbacksRef.current.onEditLink(anchor, anchor.getAttribute('href') || 'https://');
        }
      });

      root.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        const anchor = target?.closest('a');
        if (anchor) {
          e.preventDefault();
        }
        if (target && target.tagName === 'IMG') {
          const img = target as HTMLImageElement;
          callbacksRef.current.onEditImage(img, img.getAttribute('src') || '');
        }
      });
    }

    const shouldUpdateContent =
      forceWrite ||
      isFirstInit ||
      html !== lastEmittedHtmlRef.current ||
      sampleFirstName !== lastSampleNameRef.current;

    if (shouldUpdateContent && root) {
      const { styles, bodyHtml } = extractEmailStylesAndBody(html);
      customStylesRef.current = styles;

      doc.head.querySelectorAll('[data-esp-custom="true"]').forEach((node) => node.remove());
      if (styles) {
        const temp = doc.createElement('div');
        temp.innerHTML = styles;
        Array.from(temp.children).forEach((child) => {
          child.setAttribute('data-esp-custom', 'true');
          doc.head.appendChild(child);
        });
      }

      root.innerHTML = bodyHtml ? injectPreviewSampleName(bodyHtml, sampleFirstName) : '';
      lastEmittedHtmlRef.current = html;
      lastSampleNameRef.current = sampleFirstName;
      attachImageListeners();
    }

    fitContent();
    requestAnimationFrame(fitContent);
  };

  useEffect(() => {
    ensureDocumentAndRender(false);
  }, [html, sampleFirstName, viewportMode]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const observer = new ResizeObserver(() => {
      fitContent();
    });
    observer.observe(iframe);
    return () => observer.disconnect();
  }, [viewportMode]);

  return (
    <iframe
      ref={iframeRef}
      title={viewportMode === 'phone' ? 'Phone Email Preview' : 'Desktop Email Preview'}
      height={viewportMode === 'desktop' ? desktopHeight : undefined}
      onLoad={() => ensureDocumentAndRender(true)}
      className={
        viewportMode === 'phone'
          ? 'w-full h-full border-0 block bg-white'
          : 'w-full border-0 block bg-white'
      }
    />
  );
};

interface ComposeEmailViewProps {
  token: string;
  snapshot: DashboardSnapshot;
  lang: LanguageCode;
  isActive?: boolean;
  initialDraft: DraftItem | null;
  onClearInitialDraft: () => void;
  onJobCreated: (job: QueueJob) => void;
  onDraftsUpdated: (drafts: DraftItem[]) => void;
  onNavigateQueue: () => void;
  onNavigateSmtp?: () => void;
  onNavigateSubscription?: () => void;
}

export const ComposeEmailView: React.FC<ComposeEmailViewProps> = ({
  token,
  snapshot,
  lang,
  isActive = true,
  initialDraft,
  onClearInitialDraft,
  onJobCreated,
  onDraftsUpdated,
  onNavigateQueue,
  onNavigateSmtp,
  onNavigateSubscription,
}) => {
  const userOpts = snapshot.user.options;
  const isPaidAndActive =
    snapshot.user.role === 'admin' ||
    (snapshot.user.subscriptionStatus === 'active' &&
      snapshot.user.daysLeft > 0 &&
      (snapshot.user.paymentsCount || 0) > 0);
  const composeStorageKey = `234mail_compose_clean_${snapshot.user.id}`;

  const savedCompose = useMemo(() => {
    try {
      localStorage.removeItem(`234mail_compose_state_${snapshot.user.id}`);
      const raw = localStorage.getItem(composeStorageKey);
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }, [composeStorageKey, snapshot.user.id]);

  const [mode, setMode] = useState<EmailMode>(
    () => (savedCompose?.mode as EmailMode) || 'plain'
  );
  const [htmlSubTab, setHtmlSubTab] = useState<HtmlEditorSubTab>(
    () => (savedCompose?.htmlSubTab as HtmlEditorSubTab) || 'visual'
  );
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'phone'>(
    () => (savedCompose?.previewViewport as 'desktop' | 'phone') || 'desktop'
  );

  // Always type your own recipients
  const [namesText, setNamesText] = useState(() => String(savedCompose?.namesText || ''));
  const [emailsText, setEmailsText] = useState(() => String(savedCompose?.emailsText || ''));

  // From & Reply-To handled right here
  const [fromName, setFromName] = useState(() => String(savedCompose?.fromName || ''));
  const [fromEmail, setFromEmail] = useState(() => String(savedCompose?.fromEmail || ''));
  const [replyToName, setReplyToName] = useState(() => String(savedCompose?.replyToName || ''));
  const [replyToEmail, setReplyToEmail] = useState(() => String(savedCompose?.replyToEmail || ''));

  // Subject & Body
  const [subject, setSubject] = useState(() => String(savedCompose?.subject || ''));
  const [plainBody, setPlainBody] = useState(() => String(savedCompose?.plainBody || ''));
  const [htmlBody, setHtmlBody] = useState(() =>
    typeof savedCompose?.htmlBody === 'string' && savedCompose.htmlBody
      ? savedCompose.htmlBody
      : '<p><br></p>'
  );

  // Speed & Queue controls (10,000/sec fast send vs hourly queue + schedule time)
  const [speedChoice, setSpeedChoice] = useState<'fast_now' | 'hourly'>(() =>
    savedCompose?.speedChoice === 'fast_now' || savedCompose?.speedChoice === 'hourly'
      ? savedCompose.speedChoice
      : userOpts.allowFastBurst
        ? 'fast_now'
        : 'hourly'
  );
  const [hourlyRateLimit, setHourlyRateLimit] = useState<HourlyRateStep>(() =>
    typeof savedCompose?.hourlyRateLimit === 'number'
      ? (savedCompose.hourlyRateLimit as HourlyRateStep)
      : (Math.min(200, userOpts.maxHourlyRate) as HourlyRateStep) || 50
  );
  const [autoStepUp, setAutoStepUp] = useState<boolean>(() => Boolean(savedCompose?.autoStepUp));
  const [scheduleLater, setScheduleLater] = useState<boolean>(() =>
    Boolean(savedCompose?.scheduleLater)
  );
  const [scheduledFor, setScheduledFor] = useState<string>(() =>
    String(savedCompose?.scheduledFor || '')
  );

  const allowedHourlySteps = useMemo(
    () => HOURLY_STEPS.filter((s) => s <= userOpts.maxHourlyRate),
    [userOpts.maxHourlyRate]
  );

  const effectiveMode: EmailMode =
    (mode === 'html' && !userOpts.allowHtml) || (mode === 'tracking' && !userOpts.allowTracking)
      ? 'plain'
      : mode;
  const effectiveSpeedChoice: 'fast_now' | 'hourly' = userOpts.allowFastBurst
    ? speedChoice
    : 'hourly';
  const effectiveHourlyRate: HourlyRateStep = (
    hourlyRateLimit > userOpts.maxHourlyRate ? userOpts.maxHourlyRate : hourlyRateLimit
  ) as HourlyRateStep;

  // Attachments
  const [attachments, setAttachments] = useState<string[]>(() =>
    Array.isArray(savedCompose?.attachments) ? (savedCompose.attachments as string[]) : []
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(
        composeStorageKey,
        JSON.stringify({
          mode,
          htmlSubTab,
          previewViewport,
          namesText,
          emailsText,
          fromName,
          fromEmail,
          replyToName,
          replyToEmail,
          subject,
          plainBody,
          htmlBody,
          speedChoice,
          hourlyRateLimit,
          autoStepUp,
          scheduleLater,
          scheduledFor,
          attachments,
        })
      );
    } catch {
      // Ignore storage quota errors for giant inline images
    }
  }, [
    composeStorageKey,
    mode,
    htmlSubTab,
    previewViewport,
    namesText,
    emailsText,
    fromName,
    fromEmail,
    replyToName,
    replyToEmail,
    subject,
    plainBody,
    htmlBody,
    speedChoice,
    hourlyRateLimit,
    autoStepUp,
    scheduleLater,
    scheduledFor,
    attachments,
  ]);

  // Refs for Visual Editor & Paste & Preview
  const visualEditorRef = useRef<HTMLDivElement | null>(null);
  const visualStylesRef = useRef<string>('');
  const previewSyncTriggerRef = useRef<(() => void) | null>(null);
  const previewSectionRef = useRef<HTMLDivElement | null>(null);
  const replaceImgInputRef = useRef<HTMLInputElement | null>(null);

  // Inline popovers for Link / Image editing (avoids window.prompt in iframe)
  const [toolbarModal, setToolbarModal] = useState<
    | null
    | { type: 'insert_link'; url: string }
    | { type: 'insert_image'; url: string }
    | { type: 'edit_preview_link'; anchor: HTMLAnchorElement; url: string }
    | { type: 'edit_preview_image'; img: HTMLImageElement; url: string }
  >(null);

  const [openSections, setOpenSections] = useState({
    recipients: true,
    sender: true,
    message: true,
    speed: true,
    attachments: true,
  });

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [lastDispatchedJobId, setLastDispatchedJobId] = useState<string | null>(null);

  // Never let "Sending X email(s) now!" or "Queued at X emails/hour!" stay stuck after leaving Compose or finishing the task
  useEffect(() => {
    if (!feedback || feedback.type !== 'ok') return;
    if (!isActive) {
      setFeedback(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setFeedback((prev) => (prev?.type === 'ok' ? null : prev));
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [feedback, isActive]);

  useEffect(() => {
    if (!lastDispatchedJobId || feedback?.type !== 'ok') return;
    const matchingJob = snapshot.jobs.find((j) => j.id === lastDispatchedJobId);
    if (
      matchingJob &&
      (matchingJob.status === 'completed' ||
        matchingJob.status === 'failed' ||
        matchingJob.status === 'paused' ||
        matchingJob.status === 'stopped')
    ) {
      setFeedback(null);
    }
  }, [lastDispatchedJobId, snapshot.jobs, feedback]);

  const parsedNames = useMemo(
    () =>
      namesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    [namesText]
  );

  const parsedEmails = useMemo(
    () =>
      emailsText
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.includes('@')),
    [emailsText]
  );

  const sampleFirstName = parsedNames[0] || 'John';

  useEffect(() => {
    if (initialDraft) {
      setSubject(initialDraft.subject);
      setFromName(initialDraft.fromName);
      setFromEmail(initialDraft.fromEmail);
      setReplyToName(initialDraft.replyToName);
      setReplyToEmail(initialDraft.replyToEmail);
      setNamesText(initialDraft.namesText);
      setEmailsText(initialDraft.recipientsText);
      setMode(initialDraft.mode);
      if (initialDraft.mode === 'plain') {
        setPlainBody(initialDraft.body);
      } else {
        setHtmlBody(initialDraft.body || '<p><br></p>');
      }
      setSpeedChoice(initialDraft.dispatchMode === 'hyper_burst' ? 'fast_now' : 'hourly');
      setAutoStepUp(initialDraft.dispatchMode === 'auto_warmup');
      setHourlyRateLimit(initialDraft.hourlyRateLimit);
      onClearInitialDraft();
    }
  }, [initialDraft, onClearInitialDraft]);

  // Sync htmlBody -> Visual Editor when switching to 'visual' tab or changing mode
  useEffect(() => {
    if ((effectiveMode === 'html' || effectiveMode === 'tracking') && htmlSubTab === 'visual') {
      const el = visualEditorRef.current;
      if (el && document.activeElement !== el) {
        const { styles, bodyHtml } = extractEmailStylesAndBody(htmlBody);
        visualStylesRef.current = styles;
        if (el.innerHTML !== bodyHtml) {
          el.innerHTML = bodyHtml;
        }
      }
    }
  }, [effectiveMode, htmlSubTab, htmlBody]);

  const commitVisualEditorHtml = (rawInner: string) => {
    const trimmed = rawInner.trim();
    const isEmpty = !trimmed || trimmed === '<br>' || trimmed === '<p><br></p>';
    const prefix = visualStylesRef.current ? `${visualStylesRef.current}\n` : '';
    setHtmlBody(isEmpty && !visualStylesRef.current ? '<p><br></p>' : `${prefix}${trimmed}`);
  };

  const execVisualCmd = (command: string, value?: string) => {
    visualEditorRef.current?.focus();
    document.execCommand(command, false, value);
    if (visualEditorRef.current) {
      commitVisualEditorHtml(visualEditorRef.current.innerHTML);
    }
  };

  const syncFromPastePreview = () => {
    previewSyncTriggerRef.current?.();
  };

  const modeDescription: Record<EmailMode, string> = {
    plain: 'Plain text — fast, simple, maximum inbox delivery.',
    html: 'Rich HTML — visual editor or raw HTML code. Supports images and styling.',
    tracking: 'Tracked — Get notified when each recipient opens email.',
  };

  const activeMessagePayload =
    effectiveMode === 'plain' ? plainBody : htmlBody === '<p><br></p>' ? '' : htmlBody;

  const handleSaveDraft = async () => {
    setFeedback(null);
    try {
      const dispatchMode: DispatchSpeedMode =
        effectiveSpeedChoice === 'fast_now'
          ? 'hyper_burst'
          : autoStepUp
            ? 'auto_warmup'
            : 'hourly_queue';

      const res = await apiRequest<{ drafts: DraftItem[] }>(
        '/api/drafts',
        {
          method: 'POST',
          body: JSON.stringify({
            subject: subject || 'Untitled Draft',
            fromName,
            fromEmail,
            replyToName,
            replyToEmail,
            recipientsText: emailsText,
            namesText,
            mode: effectiveMode,
            body: effectiveMode === 'plain' ? plainBody : htmlBody,
            dispatchMode,
            hourlyRateLimit: effectiveHourlyRate,
          }),
        },
        token
      );
      onDraftsUpdated(res.drafts);
      setFeedback({ type: 'ok', text: 'Draft saved.' });
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Could not save draft' });
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!isPaidAndActive) {
      setFeedback({
        type: 'err',
        text: 'Free Trial Mode: Your account must be Paid and Active to send emails. Open Subscription below to activate your paid plan.',
      });
      return;
    }

    if (parsedEmails.length === 0) {
      setFeedback({
        type: 'err',
        text: 'Please enter at least one recipient email address (one per line).',
      });
      return;
    }

    if (!fromEmail.trim()) {
      setFeedback({ type: 'err', text: 'Please enter a From Email address.' });
      return;
    }

    if (!subject.trim()) {
      setFeedback({ type: 'err', text: 'Please enter a Subject Line.' });
      return;
    }

    if (!activeMessagePayload.trim()) {
      setFeedback({ type: 'err', text: 'Please write or paste your email message.' });
      return;
    }

    setSubmitting(true);
    try {
      const recipients = parsedEmails.map((email, idx) => ({
        email,
        firstName: parsedNames[idx] || '',
      }));

      const dispatchMode: DispatchSpeedMode =
        effectiveSpeedChoice === 'fast_now'
          ? 'hyper_burst'
          : autoStepUp
            ? 'auto_warmup'
            : 'hourly_queue';

      const resolvedScheduleIso = scheduleLater
        ? (scheduledFor ? parseScheduleDate(scheduledFor) : getDefaultScheduleDate()).toISOString()
        : null;

      const res = await apiRequest<{ job: QueueJob }>(
        '/api/jobs',
        {
          method: 'POST',
          body: JSON.stringify({
            campaignName: subject.trim(),
            subject: subject.trim(),
            fromName: fromName.trim() || fromEmail.split('@')[0],
            fromEmail: fromEmail.trim(),
            replyToName: replyToName.trim(),
            replyToEmail: replyToEmail.trim() || fromEmail.trim(),
            mode: effectiveMode,
            messageBody: activeMessagePayload,
            recipients,
            dispatchMode,
            hourlyRateLimit: effectiveHourlyRate,
            burstTargetPerSec: 10000,
            timeScaleMultiplier: 1,
            scheduledFor: resolvedScheduleIso,
            attachmentNames: attachments,
          }),
        },
        token
      );

      onJobCreated(res.job);
      setLastDispatchedJobId(res.job.id);
      setFeedback({
        type: 'ok',
        text:
          scheduleLater && resolvedScheduleIso
            ? `Scheduled! Sending starts ${formatScheduledDateTime(resolvedScheduleIso)}.`
            : effectiveSpeedChoice === 'fast_now'
              ? `Sending ${res.job.totalRecipients.toLocaleString()} email(s) now!`
              : `Queued at ${res.job.hourlyRateLimit} emails/hour!`,
      });
      window.setTimeout(() => {
        setFeedback((prev) => (prev?.type === 'ok' ? null : prev));
        onNavigateQueue();
      }, 650);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Could not send emails' });
    } finally {
      setSubmitting(false);
    }
  };

  const isVisualEmpty =
    !htmlBody.trim() || htmlBody.trim() === '<p><br></p>' || htmlBody.trim() === '<br>';

  return (
    <form onSubmit={handleSend} className="w-full max-w-6xl xl:max-w-7xl mx-auto space-y-5 sm:space-y-6">
      {/* Page Title & 1-Click Clear Form */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <span className="text-cyan-500">✉</span>
            <span>Send Email</span>
          </h1>
          <p className="text-xs sm:text-sm font-mono text-slate-500 dark:text-slate-400 mt-1">
            Send from any address.
          </p>
        </div>

        {(namesText ||
          emailsText ||
          fromName ||
          fromEmail ||
          replyToName ||
          replyToEmail ||
          subject ||
          plainBody ||
          !isVisualEmpty ||
          attachments.length > 0) && (
          <button
            type="button"
            onClick={() => {
              setNamesText('');
              setEmailsText('');
              setFromName('');
              setFromEmail('');
              setReplyToName('');
              setReplyToEmail('');
              setSubject('');
              setPlainBody('');
              setHtmlBody('<p><br></p>');
              setAttachments([]);
              setScheduleLater(false);
              setScheduledFor('');
              setFeedback(null);
              visualStylesRef.current = '';
              if (visualEditorRef.current) {
                visualEditorRef.current.innerHTML = '';
              }
              try {
                localStorage.removeItem(composeStorageKey);
              } catch {
                // ignore
              }
            }}
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1119] text-xs font-mono text-slate-600 dark:text-slate-300 hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
          >
            Clear All Inputs
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-xl border text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
            feedback.type === 'ok'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
          }`}
        >
          <span className="leading-relaxed">{feedback.text}</span>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            {!isPaidAndActive && feedback.type === 'err' && onNavigateSubscription && (
              <button
                type="button"
                onClick={onNavigateSubscription}
                className="min-h-[34px] px-3.5 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-bold whitespace-nowrap hover:opacity-95 cursor-pointer"
              >
                Activate Paid Plan →
              </button>
            )}
            {feedback.type === 'err' &&
              feedback.text.toLowerCase().includes('smtp') &&
              onNavigateSmtp && (
                <button
                  type="button"
                  onClick={onNavigateSmtp}
                  className="min-h-[34px] px-3.5 py-1.5 rounded-lg bg-rose-500 text-white font-bold whitespace-nowrap hover:opacity-95 cursor-pointer"
                >
                  Open SMTP Settings →
                </button>
              )}
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setFeedback(null)}
              className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Segmented Mode Bar: Plain | <> HTML | Tracking */}
      <div className="flex p-1 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#11151e] gap-1">
        {(
          [
            { id: 'plain' as const, label: 'Plain', icon: FileText, enabled: true },
            { id: 'html' as const, label: 'HTML', icon: Code2, enabled: userOpts.allowHtml },
            {
              id: 'tracking' as const,
              label: 'Tracking',
              icon: BarChart2,
              enabled: userOpts.allowTracking,
            },
          ].filter((item) => item.enabled)
        ).map((item) => {
          const Icon = item.icon;
          const active = effectiveMode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setMode(item.id);
                setToolbarModal(null);
              }}
              className={`flex-1 min-h-[42px] py-2.5 px-2.5 sm:px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 sm:gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-gradient-to-r from-cyan-400 to-indigo-400 text-slate-950'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Mode Description Bar */}
      <div className="px-4 py-3 rounded-xl border border-cyan-500/25 bg-white dark:bg-[#11151e] text-xs font-mono text-slate-600 dark:text-slate-300">
        {modeDescription[effectiveMode]}
      </div>

      {/* 1. RECIPIENTS (Clean Type-Your-Own Always — No Demo List Buttons) */}
      <section className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setOpenSections((s) => ({ ...s, recipients: !s.recipients }))}
          className="w-full min-h-[36px] flex items-center justify-between text-xs font-mono font-semibold text-cyan-600 dark:text-cyan-400 mb-3 sm:mb-4 cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span>RECIPIENTS</span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${
              openSections.recipients ? 'rotate-180' : ''
            }`}
          />
        </button>

        {openSections.recipients && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                FIRST NAMES — ONE PER LINE
              </label>
              <textarea
                rows={5}
                value={namesText}
                onChange={(e) => setNamesText(e.target.value)}
                placeholder={'John\nJane'}
                className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141821] text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <div className="mt-1 text-right text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                {parsedNames.length} names
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                EMAIL ADDRESSES — ONE PER LINE
              </label>
              <textarea
                rows={5}
                value={emailsText}
                onChange={(e) => setEmailsText(e.target.value)}
                placeholder={'john@example.com\njane@example.com'}
                className="w-full p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141821] text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <div className="mt-1 text-right text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                {parsedEmails.length}
                {userOpts.dailyEmailLimit > 0
                  ? ` / ${userOpts.dailyEmailLimit.toLocaleString()} limit`
                  : ''}{' '}
                emails
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 2. FROM & REPLY-TO */}
      <section className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setOpenSections((s) => ({ ...s, sender: !s.sender }))}
          className="w-full min-h-[36px] flex items-center justify-between text-xs font-mono font-semibold text-cyan-600 dark:text-cyan-400 mb-3 sm:mb-4 cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <User className="w-4 h-4 text-pink-500" />
            <span>FROM &amp; REPLY-TO</span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${
              openSections.sender ? 'rotate-180' : ''
            }`}
          />
        </button>

        {openSections.sender && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                FROM NAME
              </label>
              <input
                type="text"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="Your Name"
                className="w-full min-h-[42px] px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141821] text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                FROM EMAIL
              </label>
              <input
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="any@address.com"
                required
                className="w-full min-h-[42px] px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141821] text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                REPLY-TO NAME
              </label>
              <input
                type="text"
                value={replyToName}
                onChange={(e) => setReplyToName(e.target.value)}
                placeholder="Reply Name"
                className="w-full min-h-[42px] px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141821] text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                REPLY-TO EMAIL
              </label>
              <input
                type="email"
                value={replyToEmail}
                onChange={(e) => setReplyToEmail(e.target.value)}
                placeholder="reply@address.com"
                className="w-full min-h-[42px] px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141821] text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>
        )}
      </section>

      {/* 3. SUBJECT & MESSAGE */}
      <section className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setOpenSections((s) => ({ ...s, message: !s.message }))}
          className="w-full min-h-[36px] flex items-center justify-between text-xs font-mono font-semibold text-cyan-600 dark:text-cyan-400 mb-3 sm:mb-4 cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <AlignLeft className="w-4 h-4 text-amber-400" />
            <span>SUBJECT &amp; MESSAGE</span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${
              openSections.message ? 'rotate-180' : ''
            }`}
          />
        </button>

        {openSections.message && (
          <div className="space-y-4">
            {/* SUBJECT LINE */}
            <div>
              <label className="block text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                SUBJECT LINE
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Your subject here"
                required
                className="w-full min-h-[42px] px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141821] text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            {/* PLAIN MODE */}
            {effectiveMode === 'plain' ? (
              <div>
                <label className="block text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-1.5">
                  MESSAGE BODY
                </label>
                <textarea
                  rows={9}
                  value={plainBody}
                  onChange={(e) => setPlainBody(e.target.value)}
                  placeholder={'Hi {first_name},\n\nYour message here...'}
                  className="w-full p-3.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141821] text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            ) : (
              /* HTML & TRACKING MODES: 3 Sub-Tabs */
              <div className="space-y-3">
                <div className="flex items-center gap-3.5 sm:gap-6 overflow-x-auto no-scrollbar border-b border-slate-200 dark:border-white/[0.08] text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => {
                      setHtmlSubTab('visual');
                      setToolbarModal(null);
                    }}
                    className={`min-h-[40px] pb-2.5 shrink-0 inline-flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                      htmlSubTab === 'visual'
                        ? 'border-cyan-400 text-cyan-600 dark:text-cyan-400 font-semibold'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <PenSquare className="w-3.5 h-3.5 shrink-0" />
                    <span>Visual Editor</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setHtmlSubTab('code');
                      setToolbarModal(null);
                    }}
                    className={`min-h-[40px] pb-2.5 shrink-0 inline-flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                      htmlSubTab === 'code'
                        ? 'border-cyan-400 text-cyan-600 dark:text-cyan-400 font-semibold'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Code2 className="w-3.5 h-3.5 shrink-0" />
                    <span>HTML Code</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setHtmlSubTab('preview');
                      setToolbarModal(null);
                    }}
                    className={`min-h-[40px] pb-2.5 shrink-0 inline-flex items-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                      htmlSubTab === 'preview'
                        ? 'border-emerald-400 text-emerald-600 dark:text-emerald-400 font-semibold'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5 shrink-0" />
                    <span>Paste &amp; Preview</span>
                  </button>
                </div>

                {toolbarModal && (
                  <div className="p-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 flex flex-wrap items-center gap-2 text-xs font-mono">
                    <span className="text-slate-700 dark:text-slate-200">
                      {toolbarModal.type.includes('link') ? 'Link URL:' : 'Image URL:'}
                    </span>
                    <input
                      type="url"
                      value={toolbarModal.url}
                      onChange={(e) =>
                        setToolbarModal((prev) => (prev ? { ...prev, url: e.target.value } : null))
                      }
                      placeholder="https://..."
                      className="w-full sm:flex-1 sm:min-w-[200px] min-h-[38px] px-2.5 py-1.5 rounded border border-slate-300 dark:border-white/15 bg-white dark:bg-[#141821] text-slate-900 dark:text-white"
                    />
                    {toolbarModal.type === 'edit_preview_image' && (
                      <>
                        <input
                          ref={replaceImgInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file || toolbarModal.type !== 'edit_preview_image') return;
                            const reader = new FileReader();
                            reader.onload = () => {
                              if (typeof reader.result === 'string') {
                                toolbarModal.img.src = reader.result;
                                syncFromPastePreview();
                                setToolbarModal(null);
                              }
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => replaceImgInputRef.current?.click()}
                          className="min-h-[38px] px-2.5 py-1.5 rounded border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-white/10"
                        >
                          Upload File
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!toolbarModal.url.trim()) return;
                        if (toolbarModal.type === 'insert_link') {
                          execVisualCmd('createLink', toolbarModal.url.trim());
                        } else if (toolbarModal.type === 'insert_image') {
                          execVisualCmd('insertImage', toolbarModal.url.trim());
                        } else if (toolbarModal.type === 'edit_preview_link') {
                          toolbarModal.anchor.href = toolbarModal.url.trim();
                          syncFromPastePreview();
                        } else if (toolbarModal.type === 'edit_preview_image') {
                          toolbarModal.img.src = toolbarModal.url.trim();
                          syncFromPastePreview();
                        }
                        setToolbarModal(null);
                      }}
                      className="min-h-[38px] px-3 py-1.5 rounded bg-cyan-500 text-slate-950 font-semibold"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => setToolbarModal(null)}
                      className="min-h-[38px] px-2.5 py-1.5 rounded text-slate-500 hover:text-slate-800 dark:hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* SUB-TAB 1: VISUAL EDITOR (Matches Screenshot 2 & 5) */}
                {htmlSubTab === 'visual' && (
                  <div className="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-50 dark:bg-[#141821]">
                    {/* Rich Formatting Toolbar */}
                    <div className="px-3 py-2 border-b border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-[#1c212c] flex flex-wrap items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <select
                        aria-label="Text style"
                        defaultValue="P"
                        onChange={(e) => execVisualCmd('formatBlock', e.target.value)}
                        className="px-2 py-1 rounded bg-transparent text-xs font-sans text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                      >
                        <option value="P" className="bg-white dark:bg-[#1c212c]">
                          Normal
                        </option>
                        <option value="H1" className="bg-white dark:bg-[#1c212c]">
                          Heading 1
                        </option>
                        <option value="H2" className="bg-white dark:bg-[#1c212c]">
                          Heading 2
                        </option>
                        <option value="H3" className="bg-white dark:bg-[#1c212c]">
                          Heading 3
                        </option>
                      </select>

                      <span className="h-4 w-px bg-slate-300 dark:bg-white/10 mx-1" />

                      <button
                        type="button"
                        onClick={() => execVisualCmd('bold')}
                        title="Bold"
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10"
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => execVisualCmd('italic')}
                        title="Italic"
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10"
                      >
                        <Italic className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => execVisualCmd('underline')}
                        title="Underline"
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10"
                      >
                        <Underline className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => execVisualCmd('strikeThrough')}
                        title="Strikethrough"
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10"
                      >
                        <Strikethrough className="w-3.5 h-3.5" />
                      </button>

                      <span className="h-4 w-px bg-slate-300 dark:bg-white/10 mx-1" />

                      {/* Text Color & Highlight */}
                      <label
                        title="Text Color"
                        className="px-1.5 py-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-serif font-bold underline cursor-pointer inline-flex items-center"
                      >
                        <span>A</span>
                        <input
                          type="color"
                          defaultValue="#22d3ee"
                          onChange={(e) => execVisualCmd('foreColor', e.target.value)}
                          className="sr-only"
                        />
                      </label>

                      <label
                        title="Background Highlight"
                        className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-xs font-serif font-bold cursor-pointer inline-flex items-center"
                      >
                        <span>A</span>
                        <input
                          type="color"
                          defaultValue="#fef08a"
                          onChange={(e) => execVisualCmd('hiliteColor', e.target.value)}
                          className="sr-only"
                        />
                      </label>

                      <span className="h-4 w-px bg-slate-300 dark:bg-white/10 mx-1" />

                      <button
                        type="button"
                        onClick={() => execVisualCmd('insertOrderedList')}
                        title="Numbered List"
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10"
                      >
                        <ListOrdered className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => execVisualCmd('insertUnorderedList')}
                        title="Bullet List"
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10"
                      >
                        <List className="w-3.5 h-3.5" />
                      </button>

                      <span className="h-4 w-px bg-slate-300 dark:bg-white/10 mx-1" />

                      <button
                        type="button"
                        onClick={() => setToolbarModal({ type: 'insert_link', url: 'https://' })}
                        title="Insert Link"
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setToolbarModal({ type: 'insert_image', url: 'https://' })}
                        title="Insert Image"
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => execVisualCmd('removeFormat')}
                        title="Clear Formatting"
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-white/10"
                      >
                        <RemoveFormatting className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Visual Compose Surface */}
                    <div className="relative min-h-[240px]">
                      {isVisualEmpty && (
                        <div className="pointer-events-none absolute top-3.5 left-4 text-xs font-mono italic text-slate-400 dark:text-slate-500">
                          Compose HTML email... Use {'{first_name}'} to personalize.
                        </div>
                      )}
                      <div
                        ref={visualEditorRef}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={(e) => {
                          commitVisualEditorHtml(e.currentTarget.innerHTML);
                        }}
                        className="min-h-[240px] p-4 text-sm text-slate-900 dark:text-slate-100 focus:outline-none overflow-x-auto"
                      />
                    </div>
                  </div>
                )}

                {/* SUB-TAB 2: <> HTML CODE (Matches Screenshot 3) */}
                {htmlSubTab === 'code' && (
                  <textarea
                    rows={11}
                    value={htmlBody}
                    onChange={(e) => setHtmlBody(e.target.value)}
                    placeholder="<p>Paste or write your HTML email code here...</p>"
                    className="w-full p-4 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141821] text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                )}

                {/* SUB-TAB 3: PASTE & PREVIEW (Isolated Desktop + Fit-to-Screen Phone) */}
                {htmlSubTab === 'preview' && (
                  <div ref={previewSectionRef} className="space-y-3">
                    {/* Instruction + Desktop / Phone Toggle Header */}
                    <div className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-[#141821] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      <span>
                        Edit text here · double-click links to change them · tap an image to replace it
                      </span>

                      <div className="grid grid-cols-2 sm:flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            syncFromPastePreview();
                            setPreviewViewport('desktop');
                          }}
                          className={`min-h-[36px] px-3 py-1.5 rounded border inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                            previewViewport === 'desktop'
                              ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-semibold'
                              : 'border-slate-200 dark:border-white/10 text-slate-500 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          <Monitor className="w-3.5 h-3.5" />
                          <span>Desktop</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            syncFromPastePreview();
                            setPreviewViewport('phone');
                            setTimeout(() => {
                              previewSectionRef.current?.scrollIntoView({
                                behavior: 'smooth',
                                block: 'center',
                              });
                            }, 40);
                          }}
                          className={`min-h-[36px] px-3 py-1.5 rounded border inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                            previewViewport === 'phone'
                              ? 'border-cyan-500/60 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-semibold'
                              : 'border-slate-200 dark:border-white/10 text-slate-500 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>Phone</span>
                        </button>
                      </div>
                    </div>

                    {previewViewport === 'desktop' ? (
                      /* DESKTOP: Full-Width White Editable Live Preview Card */
                      <div
                        key="desktop-preview-wrapper"
                        className="w-full rounded-lg bg-white shadow-xs border border-slate-200 overflow-hidden"
                      >
                        <EditableEmailIframe
                          html={htmlBody}
                          sampleFirstName={sampleFirstName}
                          viewportMode="desktop"
                          syncTriggerRef={previewSyncTriggerRef}
                          onHtmlChange={setHtmlBody}
                          onEditLink={(anchor, url) =>
                            setToolbarModal({ type: 'edit_preview_link', anchor, url })
                          }
                          onEditImage={(img, url) =>
                            setToolbarModal({ type: 'edit_preview_image', img, url })
                          }
                        />
                      </div>
                    ) : (
                      /* PHONE: Sleek Flagship Phone Frame — Fits Small Real Phones & Desktops Cleanly */
                      <div
                        key="phone-preview-wrapper"
                        className="py-2 flex flex-col items-center justify-center"
                      >
                        <div className="relative mx-auto w-full max-w-[304px] sm:max-w-[356px] h-[min(68dvh,620px)] sm:h-[min(75vh,690px)] min-h-[420px] sm:min-h-[480px] rounded-[40px] sm:rounded-[50px] p-[7px] sm:p-[8px] bg-gradient-to-b from-[#4e4b47] via-[#252422] to-[#3b3936] shadow-2xl ring-1 ring-white/25 flex flex-col select-none shrink-0">
                          {/* Left Side Hardware Buttons */}
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -left-[3px] top-[15%] h-6 w-[3px] rounded-l-sm bg-[#635f59]"
                          />
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -left-[3px] top-[23%] h-11 w-[3px] rounded-l-sm bg-[#635f59]"
                          />
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -left-[3px] top-[33%] h-11 w-[3px] rounded-l-sm bg-[#635f59]"
                          />

                          {/* Right Side Hardware Buttons */}
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -right-[3px] top-[26%] h-14 w-[3px] rounded-r-sm bg-[#635f59]"
                          />
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -right-[2.5px] top-[61%] h-10 w-[2.5px] rounded-r-sm bg-[#78736c]"
                          />

                          {/* Inner Black OLED Bezel */}
                          <div className="w-full flex-1 min-h-0 rounded-[33px] sm:rounded-[42px] bg-black p-[4px] flex flex-col overflow-hidden">
                            {/* Phone Screen */}
                            <div className="w-full flex-1 min-h-0 rounded-[29px] sm:rounded-[38px] bg-white text-slate-950 flex flex-col overflow-hidden">
                              {/* Status Bar + Dynamic Island */}
                              <div className="shrink-0 px-4 sm:px-5 pt-2.5 pb-1.5 bg-white flex items-center justify-between text-[11px] font-sans font-semibold tracking-tight text-slate-950">
                                <span className="w-12 text-left tabular-nums">9:41</span>

                                <div className="h-[19px] w-[76px] rounded-full bg-black flex items-center justify-end pr-2">
                                  <span className="w-2.5 h-2.5 rounded-full bg-[#111827] ring-1 ring-indigo-400/35" />
                                </div>

                                <div className="w-14 flex items-center justify-end gap-1 text-slate-950">
                                  <svg
                                    viewBox="0 0 16 11"
                                    className="w-3.5 h-2.5 fill-current"
                                    aria-hidden="true"
                                  >
                                    <rect x="0.5" y="7" width="2.3" height="3.5" rx="0.7" />
                                    <rect x="4.2" y="5.2" width="2.3" height="5.3" rx="0.7" />
                                    <rect x="7.9" y="3" width="2.3" height="7.5" rx="0.7" />
                                    <rect x="11.6" y="0.8" width="2.3" height="9.7" rx="0.7" />
                                  </svg>
                                  <svg
                                    viewBox="0 0 16 12"
                                    className="w-3.5 h-2.5 fill-current"
                                    aria-hidden="true"
                                  >
                                    <path d="M8 9.4a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8Zm-3.3-1.9a5.2 5.2 0 0 1 6.6 0l1.1-1.2a6.8 6.8 0 0 0-8.8 0l1.1 1.2Zm-2.7-2.6a9 9 0 0 1 12 0l1.1-1.2a10.7 10.7 0 0 0-14.2 0L2 4.9Z" />
                                  </svg>
                                  <div className="flex items-center">
                                    <div className="w-[18px] h-[9px] rounded-[2.5px] border border-slate-900/80 p-[1px] flex items-center">
                                      <div className="w-full h-full rounded-[1px] bg-slate-950" />
                                    </div>
                                    <span className="w-[1.5px] h-[3.5px] rounded-r-xs bg-slate-900/80 ml-[0.5px]" />
                                  </div>
                                </div>
                              </div>

                              {/* Compact Mail Header (No model name text) */}
                              <div className="shrink-0 px-3.5 py-2 bg-slate-50/95 border-b border-slate-200/80 space-y-1 text-left">
                                <div className="flex items-center justify-between text-[11px] font-sans">
                                  <span className="text-[#007AFF] font-medium inline-flex items-center gap-0.5">
                                    <span>‹</span>
                                    <span>Inbox</span>
                                  </span>
                                  <span className="text-[10px] font-sans text-slate-400">9:41 AM</span>
                                </div>

                                <div className="text-[12px] font-sans font-bold text-slate-900 leading-snug truncate">
                                  {subject.trim() || 'Your subject here'}
                                </div>

                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-500 to-indigo-500 text-white text-[9px] font-bold flex items-center justify-center shrink-0 uppercase">
                                    {(fromName.trim() || fromEmail.trim() || 'Y')[0]}
                                  </div>
                                  <div className="min-w-0 flex-1 flex items-center justify-between gap-1 text-[10px] font-sans">
                                    <span className="font-semibold text-slate-800 truncate">
                                      {fromName.trim() || fromEmail.trim() || 'Your Name'}
                                    </span>
                                    <span className="text-slate-400 shrink-0 truncate">
                                      To: {sampleFirstName}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Isolated Sandboxed Email Screen — Scales Wide HTML Cleanly to Phone Width */}
                              <div className="relative flex-1 min-h-0 w-full bg-white overflow-hidden">
                                <EditableEmailIframe
                                  html={htmlBody}
                                  sampleFirstName={sampleFirstName}
                                  viewportMode="phone"
                                  syncTriggerRef={previewSyncTriggerRef}
                                  onHtmlChange={setHtmlBody}
                                  onEditLink={(anchor, url) =>
                                    setToolbarModal({ type: 'edit_preview_link', anchor, url })
                                  }
                                  onEditImage={(img, url) =>
                                    setToolbarModal({ type: 'edit_preview_image', img, url })
                                  }
                                />
                              </div>

                              {/* Bottom Home Indicator */}
                              <div className="shrink-0 py-1.5 bg-white border-t border-slate-100 flex items-center justify-center">
                                <div className="w-28 h-[4px] rounded-full bg-slate-900/85" />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Sample Merge Tag Caption */}
                    <div className="text-center text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      Preview uses{' '}
                      <span className="text-cyan-600 dark:text-cyan-400">{'{first_name}'}</span>{' '}
                      replaced with &quot;{sampleFirstName}&quot; as a sample
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 4. ATTACHMENTS (OPTIONAL) */}
      <section className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setOpenSections((s) => ({ ...s, attachments: !s.attachments }))}
          className="w-full min-h-[36px] flex items-center justify-between text-xs font-mono font-semibold text-cyan-600 dark:text-cyan-400 mb-3 sm:mb-4 cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Paperclip className="w-4 h-4" />
            <span>ATTACHMENTS (OPTIONAL)</span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${
              openSections.attachments ? 'rotate-180' : ''
            }`}
          />
        </button>

        {openSections.attachments && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []).map((f) => f.name);
                if (files.length > 0) {
                  setAttachments((prev) => [...prev, ...files]);
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full min-h-[48px] py-4 px-4 rounded-xl border border-dashed border-slate-300 dark:border-white/15 hover:border-cyan-500/50 text-xs font-mono text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4 text-cyan-500 shrink-0" />
              <span>
                Tap to choose files — <span className="text-cyan-500">browse</span>
              </span>
            </button>
            {attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-mono text-slate-600 dark:text-slate-300">
                {attachments.map((file, i) => (
                  <span key={`${file}-${i}`} className="inline-flex items-center gap-1.5 break-all">
                    <span>{file}</span>
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                      className="text-rose-500 hover:underline shrink-0"
                    >
                      [remove]
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* 5. SENDING SPEED & QUEUE TIME (100% Clickable Modern Speed + Calendar/Time Picker) */}
      <section className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] p-4 sm:p-5 space-y-4">
        <button
          type="button"
          onClick={() => setOpenSections((s) => ({ ...s, speed: !s.speed }))}
          className="w-full min-h-[36px] flex items-center justify-between text-xs font-mono font-semibold text-cyan-600 dark:text-cyan-400 cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>SENDING SPEED &amp; QUEUE TIME</span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${
              openSections.speed ? 'rotate-180' : ''
            }`}
          />
        </button>

        {openSections.speed && (
          <div className="space-y-4 pt-1">
            {/* Speed Mode Cards */}
            <div
              className={`grid grid-cols-1 ${
                userOpts.allowFastBurst ? 'sm:grid-cols-2' : ''
              } gap-3`}
            >
              {userOpts.allowFastBurst && (
                <button
                  type="button"
                  onClick={() => setSpeedChoice('fast_now')}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start justify-between gap-3 ${
                    effectiveSpeedChoice === 'fast_now'
                      ? 'border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500/30'
                      : 'border-slate-200 dark:border-white/10 hover:border-cyan-500/40 hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                      <Zap className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                      <span>Send All Fast (Up to 10,000 / sec)</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                      Send your full list right away at max speed.
                    </div>
                  </div>
                  <span
                    className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                      effectiveSpeedChoice === 'fast_now'
                        ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                        : 'border-slate-300 dark:border-white/15'
                    }`}
                  >
                    {effectiveSpeedChoice === 'fast_now' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSpeedChoice('hourly')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-start justify-between gap-3 ${
                  effectiveSpeedChoice === 'hourly'
                    ? 'border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500/30'
                    : 'border-slate-200 dark:border-white/10 hover:border-cyan-500/40 hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                    <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>Queue Emails Per Hour</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                    Choose exact hourly pace up to {userOpts.maxHourlyRate.toLocaleString()} / hr.
                  </div>
                </div>
                <span
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                    effectiveSpeedChoice === 'hourly'
                      ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                      : 'border-slate-300 dark:border-white/15'
                  }`}
                >
                  {effectiveSpeedChoice === 'hourly' && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </span>
              </button>
            </div>

            {/* Hourly Pace Selector */}
            {effectiveSpeedChoice === 'hourly' && (
              <div className="space-y-3 p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141821]">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <span className="text-slate-600 dark:text-slate-300">Select hourly pace:</span>
                  <button
                    type="button"
                    onClick={() => setAutoStepUp((prev) => !prev)}
                    className={`min-h-[36px] px-3 py-1.5 rounded-lg border text-[11px] font-mono font-semibold inline-flex items-center gap-2 transition-all cursor-pointer ${
                      autoStepUp
                        ? 'border-cyan-500 bg-cyan-500/20 text-cyan-700 dark:text-cyan-300'
                        : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1119] text-slate-600 dark:text-slate-400 hover:border-cyan-500/40'
                    }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-xs border flex items-center justify-center shrink-0 ${
                        autoStepUp
                          ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                          : 'border-slate-400 dark:border-slate-600'
                      }`}
                    >
                      {autoStepUp && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </span>
                    <span>
                      Auto Step-Up (50 → {userOpts.maxHourlyRate.toLocaleString()}/hr)
                    </span>
                  </button>
                </div>

                {!autoStepUp && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                    {allowedHourlySteps.map((step) => (
                      <button
                        key={step}
                        type="button"
                        onClick={() => setHourlyRateLimit(step)}
                        className={`min-h-[40px] py-2 px-2 rounded-lg border text-xs font-mono tabular-nums transition-all cursor-pointer ${
                          effectiveHourlyRate === step
                            ? 'border-cyan-500 bg-cyan-500 text-slate-950 font-bold shadow-xs'
                            : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1119] text-slate-700 dark:text-slate-300 hover:border-cyan-500/40'
                        }`}
                      >
                        {step}/hr
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* When to Start: Send Now vs Modern Clickable Date & Time Selector */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-white/[0.06]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setScheduleLater(false)}
                  className={`min-h-[44px] py-2.5 px-3.5 rounded-xl border text-xs font-mono font-semibold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                    !scheduleLater
                      ? 'border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 ring-1 ring-cyan-500/30'
                      : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-cyan-500/40'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                    <span>Send Immediately</span>
                  </span>
                  {!scheduleLater && <Check className="w-4 h-4 text-cyan-500 shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setScheduleLater(true);
                    if (!scheduledFor || Date.parse(scheduledFor) < Date.now()) {
                      setScheduledFor(getDefaultScheduleDate().toISOString());
                    }
                  }}
                  className={`min-h-[44px] py-2.5 px-3.5 rounded-xl border text-xs font-mono font-semibold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                    scheduleLater
                      ? 'border-cyan-500 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 ring-1 ring-cyan-500/30'
                      : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:border-cyan-500/40'
                  }`}
                >
                  <span className="inline-flex items-center gap-2 truncate">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate">
                      {scheduleLater && scheduledFor
                        ? formatScheduledDateTime(scheduledFor)
                        : 'Choose Send Date & Time'}
                    </span>
                  </span>
                  {scheduleLater && <Check className="w-4 h-4 text-cyan-500 shrink-0" />}
                </button>
              </div>

              {scheduleLater && (
                <ModernSchedulePicker
                  value={scheduledFor}
                  onChange={(nextIso) => setScheduledFor(nextIso)}
                />
              )}
            </div>
          </div>
        )}
      </section>

      {/* Bottom Save Draft + Send Emails (Sending Requires Paid & Active Account) */}
      <div className="space-y-3 pt-1">
        <button
          type="button"
          onClick={handleSaveDraft}
          className="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-xs font-mono text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{t(lang, 'saveDraft')}</span>
        </button>

        <button
          type="submit"
          disabled={submitting}
          className="w-full min-h-[50px] py-4 px-6 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400 text-slate-950 font-display font-extrabold text-sm sm:text-base hover:opacity-95 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2 cursor-pointer"
        >
          <Send className="w-4 h-4" />
          <span>{submitting ? 'Sending...' : t(lang, 'sendEmailsBtn')}</span>
        </button>

        {!isPaidAndActive && (
          <div className="px-4 py-3 rounded-xl border border-amber-500/35 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs font-mono">
            <span className="text-amber-800 dark:text-amber-200">
              Free Trial: Sending emails requires a <strong>Paid &amp; Active</strong> account.
            </span>
            <button
              type="button"
              onClick={() => onNavigateSubscription?.()}
              className="w-full sm:w-auto min-h-[36px] px-3.5 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-bold whitespace-nowrap shrink-0 hover:opacity-95 cursor-pointer"
            >
              Pay &amp; Activate →
            </button>
          </div>
        )}
      </div>
    </form>
  );
};

// ============================================================================
// SIMPLE EMAIL QUEUE VIEW (50 per page pagination)
// ============================================================================
const QUEUE_PAGE_SIZE = 50;

interface QueueMonitorViewProps {
  token: string;
  snapshot: DashboardSnapshot;
  onNavigateSmtp?: () => void;
  onJobUpdated: (job: QueueJob) => void;
  onJobCreated: (job: QueueJob) => void;
  onJobsDeleted?: (deletedIds: string[]) => void;
}

export const QueueMonitorView: React.FC<QueueMonitorViewProps> = ({
  token,
  snapshot,
  onNavigateSmtp,
  onJobUpdated,
  onJobsDeleted,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null);

  const totalJobs = snapshot.jobs.length;
  const totalPages = Math.max(1, Math.ceil(totalJobs / QUEUE_PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedJobs = useMemo(() => {
    const startIdx = (safePage - 1) * QUEUE_PAGE_SIZE;
    return snapshot.jobs.slice(startIdx, startIdx + QUEUE_PAGE_SIZE);
  }, [snapshot.jobs, safePage]);

  const startItemNum = totalJobs === 0 ? 0 : (safePage - 1) * QUEUE_PAGE_SIZE + 1;
  const endItemNum = Math.min(safePage * QUEUE_PAGE_SIZE, totalJobs);

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxButtons = 7;
    let start = Math.max(1, safePage - 3);
    const end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    return pages;
  }, [safePage, totalPages]);

  const controlJob = async (
    jobId: string,
    payload: {
      action?: 'pause' | 'resume' | 'stop' | 'start_now';
      hourlyRateLimit?: HourlyRateStep;
    }
  ) => {
    const res = await apiRequest<{ job: QueueJob }>(
      `/api/jobs/${jobId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      token
    );
    onJobUpdated(res.job);
  };

  const deleteJob = async (jobId: string) => {
    setDeletingJobId(jobId);
    try {
      const res = await apiRequest<{ deletedIds: string[] }>(
        `/api/jobs/${jobId}`,
        { method: 'DELETE' },
        token
      );
      onJobsDeleted?.(res.deletedIds?.length ? res.deletedIds : [jobId]);
    } finally {
      setDeletingJobId(null);
    }
  };

  const renderPaginationBar = () => (
    <div className="px-4 py-3 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
      <div className="text-slate-500 dark:text-slate-400 tabular-nums">
        Showing{' '}
        <span className="font-semibold text-slate-900 dark:text-white">
          {startItemNum.toLocaleString()}–{endItemNum.toLocaleString()}
        </span>{' '}
        of{' '}
        <span className="font-semibold text-cyan-600 dark:text-cyan-400">
          {totalJobs.toLocaleString()}
        </span>{' '}
        queued campaigns ({QUEUE_PAGE_SIZE} per page)
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => setCurrentPage((p) => Math.max(1, Math.min(p, totalPages) - 1))}
          className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#121722] text-slate-700 dark:text-slate-300 hover:border-cyan-500/40 disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Prev</span>
        </button>

        {pageNumbers.map((pageNum) => (
          <button
            key={pageNum}
            type="button"
            onClick={() => setCurrentPage(pageNum)}
            className={`min-h-[38px] min-w-[36px] px-2.5 py-1.5 rounded-lg border text-center tabular-nums transition-colors cursor-pointer ${
              pageNum === safePage
                ? 'border-cyan-500 bg-cyan-500 text-slate-950 font-bold'
                : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#121722] text-slate-700 dark:text-slate-300 hover:border-cyan-500/40'
            }`}
          >
            {pageNum}
          </button>
        ))}

        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => setCurrentPage((p) => Math.min(totalPages, Math.min(p, totalPages) + 1))}
          className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#121722] text-slate-700 dark:text-slate-300 hover:border-cyan-500/40 disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
        >
          <span>Next</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
          Email Queue
        </h1>
        <p className="text-xs sm:text-sm font-mono text-slate-600 dark:text-slate-400 mt-1">
          View your queued and sending emails, adjust hourly speed, or pause anytime — paginated at 50 per page.
        </p>
      </div>

      {renderPaginationBar()}

      <div className="space-y-4">
        {paginatedJobs.map((job, idx) => {
          const rowNumber = (safePage - 1) * QUEUE_PAGE_SIZE + idx + 1;
          const pct =
            job.totalRecipients > 0
              ? Math.min(100, Math.round((job.processedCount / job.totalRecipients) * 100))
              : 0;
          const jobErrors = snapshot.errors.filter((e) => e.jobId === job.id);
          const hasSmtpOrDeliveryError =
            Boolean(job.lastSmtpError) ||
            job.failedCount > 0 ||
            jobErrors.length > 0 ||
            job.status === 'failed';
          const isFinishedState =
            job.status === 'completed' || job.status === 'failed' || job.status === 'stopped';

          const primaryErrorReason =
            job.lastSmtpError ||
            (jobErrors[0]
              ? `${jobErrors[0].smtpCode ? `${jobErrors[0].smtpCode}: ` : ''}${jobErrors[0].errorMessage}`
              : job.pauseReason || 'SMTP server rejected one or more emails.');

          return (
            <div
              key={job.id}
              className={`rounded-xl border bg-white dark:bg-[#0d1119] p-4 sm:p-5 space-y-4 ${
                job.status === 'failed' || job.limitType === 'smtp_error'
                  ? 'border-rose-500/35 dark:border-rose-500/30'
                  : hasSmtpOrDeliveryError
                    ? 'border-amber-500/35 dark:border-amber-500/25'
                    : 'border-slate-200 dark:border-white/[0.08]'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-mono text-slate-500 dark:text-slate-400">
                    <span className="text-slate-400 dark:text-slate-500 tabular-nums">
                      #{rowNumber}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-semibold ${
                        job.status === 'failed' || job.limitType === 'smtp_error'
                          ? 'text-rose-600 dark:text-rose-400'
                          : job.status === 'paused' || (job.status === 'completed' && job.failedCount > 0)
                            ? 'text-amber-600 dark:text-amber-400'
                            : job.status === 'completed'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-cyan-600 dark:text-cyan-400'
                      }`}
                    >
                      {job.status === 'failed'
                        ? 'Failed · Check SMTP Error'
                        : job.status === 'completed' && job.failedCount > 0
                          ? `Completed (${job.failedCount} Failed)`
                          : job.status === 'running'
                            ? 'Sending'
                            : job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="break-all sm:break-normal">From: {job.fromEmail}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {job.dispatchMode === 'hyper_burst'
                        ? 'Fast Send (Up to 10,000/sec)'
                        : `${job.hourlyRateLimit} emails / hour`}
                    </span>
                    {job.scheduledFor && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Starts: {formatScheduledDateTime(job.scheduledFor)}</span>
                      </>
                    )}
                    {job.activeSmtpLabel && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-600 dark:text-emerald-400">
                          Via {job.activeSmtpLabel}
                          {job.failoverCount ? ` (Auto-switched ${job.failoverCount}x)` : ''}
                        </span>
                      </>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1.5 break-words">
                    {job.subject}
                  </h3>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {job.dispatchMode !== 'hyper_burst' &&
                    (job.status === 'running' || job.status === 'paused' || job.status === 'scheduled') && (
                      <select
                        aria-label="Emails per hour"
                        value={job.hourlyRateLimit}
                        onChange={(e) =>
                          controlJob(job.id, {
                            hourlyRateLimit: Number(e.target.value) as HourlyRateStep,
                          })
                        }
                        className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#141a26] text-xs font-mono text-slate-800 dark:text-slate-200"
                      >
                        {HOURLY_STEPS.map((s) => (
                          <option key={s} value={s}>
                            {s} / hour
                          </option>
                        ))}
                      </select>
                    )}

                  {job.status === 'scheduled' && (
                    <button
                      type="button"
                      onClick={() => controlJob(job.id, { action: 'start_now' })}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-cyan-500 text-slate-950 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Send Now</span>
                    </button>
                  )}

                  {job.status === 'running' && (
                    <button
                      type="button"
                      onClick={() => controlJob(job.id, { action: 'pause' })}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-amber-500/40 text-amber-600 dark:text-amber-400 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
                    </button>
                  )}

                  {job.status === 'paused' && (
                    <button
                      type="button"
                      onClick={() => controlJob(job.id, { action: 'resume' })}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Resume</span>
                    </button>
                  )}

                  {job.status === 'failed' && (
                    <button
                      type="button"
                      onClick={() => controlJob(job.id, { action: 'resume' })}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-cyan-500/40 text-cyan-600 dark:text-cyan-400 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry All</span>
                    </button>
                  )}

                  {(job.status === 'running' || job.status === 'paused' || job.status === 'scheduled') && (
                    <button
                      type="button"
                      onClick={() => controlJob(job.id, { action: 'stop' })}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-rose-500/40 text-rose-600 dark:text-rose-400 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Stop</span>
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={deletingJobId === job.id}
                    onClick={() => deleteJob(job.id)}
                    title="Delete from Email Queue & Sent"
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 text-rose-600 dark:text-rose-400 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{deletingJobId === job.id ? '...' : 'Delete'}</span>
                  </button>
                </div>
              </div>

              {(job.status === 'paused' || Boolean(job.pauseReason)) && (
                <div
                  className={`px-3.5 py-2.5 rounded-xl border text-xs font-mono space-y-1.5 ${
                    job.limitType === 'max_quota' || job.limitType === 'smtp_error'
                      ? 'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                      : job.limitType === 'deferred'
                        ? 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                        : 'border-cyan-500/35 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                          job.limitType === 'max_quota' || job.limitType === 'smtp_error'
                            ? 'border-rose-500/40 bg-rose-500/15'
                            : job.limitType === 'deferred'
                              ? 'border-amber-500/40 bg-amber-500/15'
                              : 'border-cyan-500/40 bg-cyan-500/15'
                        }`}
                      >
                        {job.limitType === 'max_quota'
                          ? 'Paused · Daily / Max Quota'
                          : job.limitType === 'smtp_error'
                            ? 'Paused · SMTP Error'
                            : job.limitType === 'deferred'
                              ? 'Paused · Auto-Resumes After Cooldown'
                              : 'Paused · Manual Pause'}
                      </span>
                      {job.autoResumeAt ? (
                        <span className="text-[11px] opacity-90">
                          Auto-resumes at {formatScheduledDateTime(job.autoResumeAt)}
                        </span>
                      ) : (
                        <span className="text-[11px] opacity-90">
                          Waiting for you to click Resume
                        </span>
                      )}
                    </div>
                    {(job.limitType === 'smtp_error' || job.limitType === 'max_quota') &&
                      onNavigateSmtp && (
                        <button
                          type="button"
                          onClick={onNavigateSmtp}
                          className="min-h-[30px] px-2.5 py-1 rounded-lg border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Settings className="w-3 h-3" />
                          <span>Check SMTP Settings →</span>
                        </button>
                      )}
                  </div>
                  <div className="font-semibold leading-relaxed break-words">
                    {job.pauseReason ||
                      'Reason: Paused manually by you — stays paused until you click Resume.'}
                  </div>
                  <div className="text-[11px] opacity-85">
                    {(job.totalRecipients - job.processedCount).toLocaleString()} unsent email(s) are safely saved in queue (starting at email #{(job.processedCount + 1).toLocaleString()}).
                  </div>
                </div>
              )}

              {/* Persistent SMTP / Delivery Error Report — stays visible EVEN AFTER queue progress reaches 100% */}
              {hasSmtpOrDeliveryError && (
                <div className="px-3.5 py-3 rounded-xl border border-rose-500/35 bg-rose-500/[0.08] text-rose-700 dark:text-rose-300 text-xs font-mono space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border border-rose-500/40 bg-rose-500/15 inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>SMTP / Delivery Error</span>
                      </span>
                      {job.failedCount > 0 && (
                        <span className="text-[11px] font-semibold">
                          {job.failedCount.toLocaleString()} failed of{' '}
                          {job.totalRecipients.toLocaleString()}
                        </span>
                      )}
                      {(job.lastSmtpErrorAt || jobErrors[0]?.timestamp) && (
                        <span className="text-[11px] opacity-80">
                          · {job.lastSmtpErrorAt || jobErrors[0]?.timestamp}
                        </span>
                      )}
                      {isFinishedState && (
                        <span className="text-[11px] opacity-85">
                          · Saved on record after completion
                        </span>
                      )}
                    </div>

                    {onNavigateSmtp && (
                      <button
                        type="button"
                        onClick={onNavigateSmtp}
                        className="min-h-[30px] px-2.5 py-1 rounded-lg border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Settings className="w-3 h-3" />
                        <span>SMTP Settings →</span>
                      </button>
                    )}
                  </div>

                  <div className="font-semibold leading-relaxed break-words">
                    Why it happened: {primaryErrorReason}
                  </div>

                  {jobErrors.length > 0 && (
                    <div className="pt-1.5 border-t border-rose-500/20 space-y-1">
                      <div className="text-[10px] uppercase tracking-wider opacity-80 font-semibold">
                        Recent SMTP Server Responses ({jobErrors.length.toLocaleString()}):
                      </div>
                      {jobErrors.slice(0, 5).map((errItem) => (
                        <div
                          key={errItem.id}
                          className="text-[11px] leading-snug break-words opacity-95"
                        >
                          <span className="font-bold">{errItem.recipientEmail}</span> —{' '}
                          {errItem.smtpCode ? `[${errItem.smtpCode}] ` : ''}
                          {errItem.errorMessage}
                        </div>
                      ))}
                      {jobErrors.length > 5 && (
                        <div className="text-[11px] opacity-75">
                          + {(jobErrors.length - 5).toLocaleString()} more error response(s) logged
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 mb-1.5">
                  <span>
                    {job.sentCount.toLocaleString()} of {job.totalRecipients.toLocaleString()} delivered
                    {job.failedCount > 0 ? ` · ${job.failedCount.toLocaleString()} failed` : ''} ({pct}%)
                  </span>
                  <span
                    className={
                      job.status === 'failed'
                        ? 'font-semibold text-rose-600 dark:text-rose-400'
                        : job.status === 'completed' && job.failedCount > 0
                          ? 'font-semibold text-amber-600 dark:text-amber-400'
                          : job.status === 'completed'
                            ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                            : ''
                    }
                  >
                    {job.currentThroughputPerSec > 0
                      ? `${job.currentThroughputPerSec.toLocaleString()} emails/sec`
                      : job.status === 'failed'
                        ? `Failed (${job.failedCount} rejected)`
                        : job.status === 'completed' && job.failedCount > 0
                          ? `Finished (${job.failedCount} failed)`
                          : job.status === 'completed'
                            ? 'Finished'
                            : ''}
                  </span>
                </div>
                <progress
                  value={pct}
                  max={100}
                  className={`block h-2.5 w-full rounded-full overflow-hidden appearance-none [&::-webkit-progress-bar]:bg-slate-100 dark:[&::-webkit-progress-bar]:bg-white/[0.07] [&::-webkit-progress-value]:transition-all bg-slate-100 dark:bg-white/[0.07] ${
                    job.status === 'failed'
                      ? '[&::-webkit-progress-value]:bg-rose-500 [&::-moz-progress-bar]:bg-rose-500'
                      : job.failedCount > 0 && job.status === 'completed'
                        ? '[&::-webkit-progress-value]:bg-amber-500 [&::-moz-progress-bar]:bg-amber-500'
                        : '[&::-webkit-progress-value]:bg-gradient-to-r [&::-webkit-progress-value]:from-cyan-400 [&::-webkit-progress-value]:to-indigo-500 [&::-moz-progress-bar]:bg-cyan-400'
                  }`}
                />
              </div>
            </div>
          );
        })}

        {paginatedJobs.length === 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#0d1119] py-12 text-center text-xs font-mono text-slate-500">
            No campaigns in the email queue yet.
          </div>
        )}
      </div>

      {totalJobs > QUEUE_PAGE_SIZE && renderPaginationBar()}
    </div>
  );
};
