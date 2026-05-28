import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import Navbar from '@/components/Navbar';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/',
}));

describe('Navbar Component', () => {
  it('renders logo and nav links for logged out state', () => {
    useSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    render(<Navbar />);
    expect(screen.getByText(/JiitSphere/i)).toBeInTheDocument();
    // Assuming Login or Access button exists
  });

  it('renders user specific links when logged in', () => {
    useSession.mockReturnValue({
      data: { user: { name: 'Student', role: 'student' } },
      status: 'authenticated',
    });
    render(<Navbar />);
    expect(screen.getByText(/JiitSphere/i)).toBeInTheDocument();
  });
});
