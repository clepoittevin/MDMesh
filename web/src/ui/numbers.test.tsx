// Numbers the console writes outside a message's own {count, plural} follow the console's language.
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';
import { describe, expect, it } from 'vitest';
import { Pagination } from './Pagination';
import { FleetSummary } from './Stats';

const inLocale = (locale: string, ui: ReactElement) =>
  render(<IntlProvider locale={locale} defaultLocale="en" onError={() => {}}>{ui}</IntlProvider>);

describe('Pagination', () => {
  it('groups the thousands of its counts', () => {
    inLocale('en', <Pagination page={2} pageSize={1000} total={12345} onPageChange={() => {}} />);
    expect(screen.getByText('1,001–2,000')).toBeTruthy();
    expect(screen.getByText('12,345')).toBeTruthy();
  });
});

describe('FleetSummary', () => {
  const legend = [{ key: 'online', label: 'Online', count: 1, tone: 'ok' as const }];

  it('writes its shares as the language does: "50%" in English, "50 %" in French', () => {
    const english = inLocale('en', <FleetSummary total={2} legend={legend} />);
    expect(english.container.querySelector('.v2-fleet__pct')?.textContent).toBe('50%');
    english.unmount();
    const french = inLocale('fr', <FleetSummary total={2} legend={legend} />);
    expect(french.container.querySelector('.v2-fleet__pct')?.textContent).toMatch(/^50\s%$/);
  });
});
