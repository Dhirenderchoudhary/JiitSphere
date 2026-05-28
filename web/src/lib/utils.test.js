import { cn } from './utils';

describe('cn (Tailwind class merger)', () => {
  it('merges tailwind classes properly', () => {
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('handles conditional classes', () => {
    expect(cn('text-sm', true && 'font-bold', false && 'text-lg')).toBe('text-sm font-bold');
  });
});
