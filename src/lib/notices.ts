// Format and parsing of the third-party license list (third-party-notices.txt). The list is generated at build time by scripts/third-party-notices.ts;
// the original text is hard-wrapped at 80 columns and would wrap a second time on a phone screen, so it is parsed into a structure and reflowed by the page to the screen width.

// Each section starts with NOTICE_RULE, and the component list is separated from the license text by NOTICE_THIN_RULE;
// for components with a NOTICE file, the license text is followed by another NOTICE_THIN_RULE and a NOTICE_LABEL line that introduces it.
export const NOTICE_RULE = '='.repeat(80);
export const NOTICE_THIN_RULE = '-'.repeat(80);
export const NOTICE_LABEL = 'NOTICE';

export interface NoticeComponent {
  title: string;
  details: string[];
}

export interface NoticeSection {
  components: NoticeComponent[];
  paragraphs: string[];
  notice: string[];
}

export interface Notices {
  intro: string[];
  sections: NoticeSection[];
}

export function parseNotices(text: string): Notices {
  const [introText, ...sectionTexts] = text.replaceAll('\r\n', '\n').split(`${NOTICE_RULE}\n`);

  return { intro: paragraphs(introText), sections: sectionTexts.map(parseSection) };
}

function parseSection(text: string): NoticeSection {
  const [header, body = '', notice = ''] = text.split(`\n${NOTICE_THIN_RULE}\n`);

  // In the component list, unindented lines are component names, and indented lines are their license and source.
  const components: NoticeComponent[] = [];
  for (const line of header.split('\n').filter((item) => item.trim() !== '')) {
    if (line.startsWith(' ') && components.length > 0) {
      components[components.length - 1].details.push(line.trim());
    } else {
      components.push({ title: line.trim(), details: [] });
    }
  }

  return {
    components,
    paragraphs: paragraphs(body),
    notice: paragraphs(notice.replace(new RegExp(`^${NOTICE_LABEL}\\n`), '')),
  };
}

// Splits into paragraphs at blank lines and joins hard line breaks within a paragraph into spaces; decorative lines made only of dashes, equals signs and the like are dropped.
function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !/^[-=_*~]{3,}$/.test(line))
        .join(' '),
    )
    .filter((paragraph) => paragraph !== '');
}
