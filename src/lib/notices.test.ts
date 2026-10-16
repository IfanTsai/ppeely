import { describe, expect, it } from 'vitest';
import { NOTICE_LABEL, NOTICE_RULE, NOTICE_THIN_RULE, parseNotices } from './notices';

const SAMPLE = [
  'Third-party software notices',
  '',
  'This app includes the software',
  'listed below.',
  '',
  NOTICE_RULE,
  'alpha 1.0.0',
  '  License: MIT',
  '  Source: https://example.com/alpha',
  'beta 2.0.0',
  '  License: MIT',
  NOTICE_THIN_RULE,
  '',
  'MIT License',
  '',
  'Permission is hereby granted,',
  'free of charge.',
  '',
  NOTICE_RULE,
  'gamma',
  '  License: Apache-2.0',
  NOTICE_THIN_RULE,
  '',
  'Apache License',
  '----------------',
  'Version 2.0',
  '',
  NOTICE_THIN_RULE,
  NOTICE_LABEL,
  '',
  'Gamma',
  'Copyright 2020 Example',
  '',
].join('\n');

describe('parseNotices', () => {
  it('splits the intro, components and license paragraphs', () => {
    const notices = parseNotices(SAMPLE);

    expect(notices.intro).toEqual(['Third-party software notices', 'This app includes the software listed below.']);
    expect(notices.sections).toHaveLength(2);
    expect(notices.sections[0].components).toEqual([
      { title: 'alpha 1.0.0', details: ['License: MIT', 'Source: https://example.com/alpha'] },
      { title: 'beta 2.0.0', details: ['License: MIT'] },
    ]);
    expect(notices.sections[0].paragraphs).toEqual(['MIT License', 'Permission is hereby granted, free of charge.']);
    expect(notices.sections[0].notice).toEqual([]);
  });

  it('drops decorative rules inside license text and reads the NOTICE part', () => {
    const [, gamma] = parseNotices(SAMPLE).sections;

    expect(gamma.paragraphs).toEqual(['Apache License Version 2.0']);
    expect(gamma.notice).toEqual(['Gamma Copyright 2020 Example']);
  });
});
