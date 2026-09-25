/**
 * The shape of a set of plural forms for one noun.
 *
 * This lives in its own module because both the formatter and the English
 * dictionary need it, and the English dictionary is imported *by* the formatter.
 * Putting the type in the formatter would make the two import each other; a
 * single type-only cycle happens to be legal today but is a trap for the next
 * person who adds a runtime value to either file.
 *
 * Every category is optional and the formatter falls back to `other`. That is
 * what lets English spell out only the two forms it can actually produce while
 * Arabic supplies all six — the surplus keys are legal, not excess properties.
 */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> &
  Record<string, string | undefined>;
