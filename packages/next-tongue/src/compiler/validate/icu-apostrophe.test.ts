import { describe, expect, it } from 'vitest';
import {
  apostropheHintMessage,
  findQuotingApostrophe,
  likelyUnescapedApostrophe,
  shouldHintApostrophe,
} from './catalog.js';

describe('ICU apostrophe hints (narrowed in 1.0.6)', () => {
  it('no longer flags plain elisions or English contractions', () => {
    for (const s of ["l'été", "don't", "d'un {email}", "L'application s'est fermée pour {name}", "c'è un messaggio", "couldn't send. Email {supportEmail}.", "l''été", "it''s"]) {
      expect(likelyUnescapedApostrophe(s), s).toBe(false);
    }
  });

  it("flags a lone ' directly before {, }, <", () => {
    expect(likelyUnescapedApostrophe("Benvingut a l'{app}")).toBe(true);
    expect(findQuotingApostrophe("Benvingut a l'{app}")).toBe(13);
    expect(likelyUnescapedApostrophe("Voir l'<b>offre</b>")).toBe(true);
    expect(likelyUnescapedApostrophe("{n, select, other {aujourd'}}")).toBe(true);
    expect(likelyUnescapedApostrophe("l''{app}")).toBe(false);
  });

  it("flags '# only inside a plural", () => {
    expect(likelyUnescapedApostrophe("{n, plural, one {l'# fichier} other {# fichiers}}")).toBe(true);
    expect(likelyUnescapedApostrophe("{n, select, other {l'# x}}")).toBe(false);
    expect(likelyUnescapedApostrophe("Ticket l'#1")).toBe(false);
  });

  it('does not flag deliberate quoting', () => {
    expect(likelyUnescapedApostrophe("'{'literal'}'")).toBe(false);
    expect(likelyUnescapedApostrophe("data-ns=\"'<id>.<signature>'\"")).toBe(false);
    expect(likelyUnescapedApostrophe("{n, plural, other {'#' n'est pas}}")).toBe(false);
  });

  it('applies to every locale and suggests doubling', () => {
    expect(shouldHintApostrophe('en')).toBe(true);
    expect(shouldHintApostrophe('ca')).toBe(true);
    const msg = apostropheHintMessage('home.welcome', "Benvingut a l'{app}");
    expect(msg).toContain("l'{app} → l''{app}");
    expect(msg).toContain('"l\'{app}" → "l\'\'{app}"');
  });
});
