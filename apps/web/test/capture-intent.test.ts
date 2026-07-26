import { describe, expect, it } from 'vitest';
import { detectCaptureIntent, stripAskPrefix } from '../lib/capture-intent';

describe('detectCaptureIntent', () => {
  it('treats a trailing question mark as a question', () => {
    expect(detectCaptureIntent('how am I doing?')).toBe('ask');
    expect(detectCaptureIntent('did I train this week?')).toBe('ask');
  });

  it('reads a question opener as a question', () => {
    for (const q of [
      'what is on my plate today',
      'how many workouts did I do',
      'when is my next dentist appointment',
      'should I move my 3pm',
      'show me this week',
      'explain my spending',
    ]) {
      expect(detectCaptureIntent(q), q).toBe('ask');
    }
  });

  it('files ordinary captures', () => {
    for (const c of [
      'gym at 6',
      'call mom tomorrow',
      'feeling good today',
      'buy milk',
      'dentist thursday 2pm',
      'Sarah prefers email over calls',
    ]) {
      expect(detectCaptureIntent(c), c).toBe('file');
    }
  });

  it('does not mistake short imperatives for questions', () => {
    // "can opener" and "will call" open with question words but are captures.
    expect(detectCaptureIntent('can opener')).toBe('file');
    expect(detectCaptureIntent('will call')).toBe('file');
  });

  it('files "remind me to…" even though it opens with a question word', () => {
    expect(detectCaptureIntent('remind me to call the bank')).toBe('file');
    expect(detectCaptureIntent('remember that Sam is allergic to nuts')).toBe('file');
    expect(detectCaptureIntent('schedule a haircut friday')).toBe('file');
  });

  it('still honours a legacy "?" prefix', () => {
    // No longer required, but people who learned it should not be punished.
    expect(detectCaptureIntent('?how am I doing')).toBe('ask');
    expect(detectCaptureIntent('? gym at 6')).toBe('ask');
  });

  it('files empty and whitespace input rather than asking', () => {
    expect(detectCaptureIntent('')).toBe('file');
    expect(detectCaptureIntent('   ')).toBe('file');
  });
});

describe('stripAskPrefix', () => {
  it('removes a leading ? and its space', () => {
    expect(stripAskPrefix('?how am I doing')).toBe('how am I doing');
    expect(stripAskPrefix('?  how am I doing')).toBe('how am I doing');
    expect(stripAskPrefix('how am I doing')).toBe('how am I doing');
  });
});
