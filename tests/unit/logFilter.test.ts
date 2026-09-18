import { describe, it, expect } from 'vitest';
import { normalizeLogLevel } from '@/components/LogViewer';

describe('normalizeLogLevel', () => {
  it('normalizes lowercase info to INFO', () => {
    expect(normalizeLogLevel('info')).toBe('INFO');
    expect(normalizeLogLevel('INFO')).toBe('INFO');
    expect(normalizeLogLevel('information')).toBe('INFO');
    expect(normalizeLogLevel('Information')).toBe('INFO');
  });

  it('normalizes warn and warning to WARN', () => {
    expect(normalizeLogLevel('warn')).toBe('WARN');
    expect(normalizeLogLevel('warning')).toBe('WARN');
    expect(normalizeLogLevel('WARN')).toBe('WARN');
    expect(normalizeLogLevel('WARNING')).toBe('WARN');
  });

  it('normalizes error variants to ERROR', () => {
    expect(normalizeLogLevel('error')).toBe('ERROR');
    expect(normalizeLogLevel('ERROR')).toBe('ERROR');
    expect(normalizeLogLevel('err')).toBe('ERROR');
    expect(normalizeLogLevel('fatal')).toBe('ERROR');
  });

  it('normalizes stage to STAGE', () => {
    expect(normalizeLogLevel('stage')).toBe('STAGE');
    expect(normalizeLogLevel('STAGE')).toBe('STAGE');
  });

  it('normalizes debug to DEBUG', () => {
    expect(normalizeLogLevel('debug')).toBe('DEBUG');
    expect(normalizeLogLevel('trace')).toBe('DEBUG');
    expect(normalizeLogLevel('DEBUG')).toBe('DEBUG');
  });

  it('defaults undefined or empty to INFO', () => {
    expect(normalizeLogLevel(undefined)).toBe('INFO');
    expect(normalizeLogLevel('')).toBe('INFO');
    expect(normalizeLogLevel('unknown_level')).toBe('INFO');
  });
});

describe('Log filtering invariants', () => {
  const sampleLogs = [
    { id: '1', level: 'info', message: 'Pipeline started', stage: 'DISCOVER' },
    { id: '2', level: 'warning', message: 'Codec fallback used', stage: 'CUT' },
    { id: '3', level: 'error', message: 'Failed to extract frame', stage: 'EDIT' },
    { id: '4', level: 'info', message: 'General informational log', stage: undefined },
    { id: '5', level: 'debug', message: 'FFmpeg command arguments', stage: undefined },
    { id: '6', level: 'stage', message: 'Entering stage SUBTITLE', stage: 'SUBTITLE' },
  ];

  const normalized = sampleLogs.map((l) => ({
    ...l,
    level: normalizeLogLevel(l.level),
  }));

  it('filters by INFO matching all info logs regardless of original casing', () => {
    const infoLogs = normalized.filter((l) => l.level === 'INFO');
    expect(infoLogs.length).toBe(2);
    expect(infoLogs.map((l) => l.id)).toEqual(['1', '4']);
  });

  it('filters by WARN matching warning/warn logs', () => {
    const warnLogs = normalized.filter((l) => l.level === 'WARN');
    expect(warnLogs.length).toBe(1);
    expect(warnLogs[0].id).toBe('2');
  });

  it('filters by ERROR matching error logs', () => {
    const errorLogs = normalized.filter((l) => l.level === 'ERROR');
    expect(errorLogs.length).toBe(1);
    expect(errorLogs[0].id).toBe('3');
  });

  it('filters by STAGE matching explicit stage level or having stage tag', () => {
    const stageLogs = normalized.filter((l) => l.level === 'STAGE' || Boolean(l.stage));
    expect(stageLogs.length).toBe(4);
    expect(stageLogs.map((l) => l.id)).toEqual(['1', '2', '3', '6']);
  });

  it('ALL returns all logs without omission', () => {
    expect(normalized.length).toBe(6);
  });
});
