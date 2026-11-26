// SectionLayout stacks the nav above the content when the two can't sit side by side, measured on the layout itself:
// on a wide screen with a narrow main column, flex-wrap alone would leave the sticky nav column floating over the cards.
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SectionLayout } from './SectionNav';

function layoutWidth(px: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(px);
}

const stackedOf = (container: HTMLElement) =>
  (container.querySelector('.v2-seclayout') as HTMLElement).dataset.stacked ?? null;

describe('SectionLayout', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the nav beside the content when both fit', () => {
    layoutWidth(1000);
    const { container } = render(<SectionLayout nav={<nav />} contentBasis={560}>content</SectionLayout>);
    expect(stackedOf(container)).toBeNull();
  });

  it('stacks the nav when the content column is too narrow for nav and content', () => {
    layoutWidth(700);
    const { container } = render(<SectionLayout nav={<nav />} contentBasis={560}>content</SectionLayout>);
    expect(stackedOf(container)).toBe('true');
  });
});
