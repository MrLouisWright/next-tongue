import { describe, expect, it } from 'vitest';
import {
  likelyUnescapedApostrophe,
  shouldHintApostrophe,
} from './catalog.js';

describe('ICU apostrophe hints', () => {
  it('detects prose apostrophes', () => {
    expect(likelyUnescapedApostrophe("l'été")).toBe(true);
    expect(likelyUnescapedApostrophe("don't")).toBe(true);
    expect(likelyUnescapedApostrophe("l''été")).toBe(false);
    expect(likelyUnescapedApostrophe("it''s")).toBe(false);
  });

  it('skips bare English contractions without placeholders', () => {
    expect(shouldHintApostrophe('en')).toBe(false);
    expect(shouldHintApostrophe('en', "don't worry")).toBe(false);
    expect(shouldHintApostrophe('en-GB')).toBe(false);
    expect(shouldHintApostrophe('fr')).toBe(true);
    expect(shouldHintApostrophe('fr-CA')).toBe(true);
    expect(shouldHintApostrophe('it')).toBe(true);
  });

  it('warns English when a prose apostrophe coexists with {placeholders}', () => {
    expect(
      shouldHintApostrophe(
        'en',
        "We couldn't send your message. Email {supportEmail}.",
      ),
    ).toBe(true);
  });
});
