export const PUBLICATION_CATEGORIES = [
  {
    value: 'journal_article',
    label: 'Journal Article',
    description: 'An article published in an academic or professional journal.',
  },
  {
    value: 'conference_paper',
    label: 'Conference Paper',
    description: 'A paper presented or published through a conference.',
  },
  {
    value: 'review_survey',
    label: 'Review / Survey Paper',
    description: 'A review, systematic review, survey, or meta-analysis.',
  },
  {
    value: 'preprint',
    label: 'Preprint',
    description: 'A manuscript posted to a preprint server before or alongside publication.',
  },
];

export const CATEGORY_LABELS = Object.fromEntries(
  PUBLICATION_CATEGORIES.map((category) => [category.value, category.label]),
);

export const REVIEW_TYPES = [
  ['review', 'Review'],
  ['systematic_review', 'Systematic Review'],
  ['survey', 'Survey'],
  ['meta_analysis', 'Meta-analysis'],
];

export const PUBLICATION_STATUSES = [
  ['preprint', 'Preprint'],
  ['published', 'Published'],
  ['withdrawn', 'Withdrawn'],
];

export function categoryLabel(value) {
  return CATEGORY_LABELS[value] || 'Uncategorized';
}

export function publicationVenue(item) {
  return item.journalName
    || item.conferenceName
    || item.preprintServer
    || item.venue
    || '';
}
