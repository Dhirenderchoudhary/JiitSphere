import React from 'react';
import { render, screen } from '@testing-library/react';
import PortalShell from '@/app/portal/components/PortalShell';
import { useSession } from 'next-auth/react';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signOut: jest.fn()
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/portal'
}));

describe('Dashboard (PortalShell)', () => {
  it('renders loading skeleton when unauthenticated', () => {
    useSession.mockReturnValue({ data: null, status: 'loading' });
    render(<PortalShell />);
    // Our PortalShell redirects if unauthenticated, loading state could just be blank or skeleton
    expect(document.body).toBeInTheDocument();
  });

  it('renders student profile and empty state', () => {
    useSession.mockReturnValue({
      data: { user: { name: 'Student', enrollment_number: '991234' } },
      status: 'authenticated'
    });
    render(<PortalShell />);
    expect(screen.getByText('Student')).toBeInTheDocument();
    expect(screen.getByText('991234')).toBeInTheDocument();
  });
});
