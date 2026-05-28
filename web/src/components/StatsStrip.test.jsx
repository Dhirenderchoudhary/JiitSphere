import React from 'react';
import { render, screen } from '@testing-library/react';
import StatsStrip from './StatsStrip';

describe('StatsStrip Component', () => {
  it('renders the correct statistics', () => {
    render(<StatsStrip total={100} degrees={4} subjects={25} />);
    
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    
    expect(screen.getByText(/Total Material/i)).toBeInTheDocument();
    expect(screen.getByText(/Programs/i)).toBeInTheDocument();
    expect(screen.getByText(/Subjects/i)).toBeInTheDocument();
  });
});
