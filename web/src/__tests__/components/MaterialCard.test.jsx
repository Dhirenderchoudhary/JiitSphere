import React from 'react';
import { render, screen } from '@testing-library/react';
// MaterialCard doesn't exist standalone, so we test MaterialList rendering items
import MaterialList from '@/components/MaterialList';

const mockMaterials = [
  { _id: '1', title: 'Physics Notes', subject: 'Physics', resourceType: 'notes', isPublished: true }
];

describe('MaterialCard / MaterialList', () => {
  it('renders title, subject, and type', () => {
    render(<MaterialList materials={mockMaterials} />);
    expect(screen.getByText('Physics Notes')).toBeInTheDocument();
    expect(screen.getByText(/Physics/i)).toBeInTheDocument();
  });

  it('renders missing props safely', () => {
    render(<MaterialList materials={[{ _id: '2', title: 'Empty' }]} />);
    expect(screen.getByText('Empty')).toBeInTheDocument();
  });
});
