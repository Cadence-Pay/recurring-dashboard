import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import HomePage from '../app/page';
import { SKELETON_NOTICE } from './notice';

describe('HomePage', () => {
  it('shows the skeleton notice and heading', () => {
    render(<HomePage />);
    expect(screen.getByText(SKELETON_NOTICE)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Stellar Recurring' })).toBeTruthy();
  });
});
