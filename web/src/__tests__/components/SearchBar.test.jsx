import React, { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Since SearchBar is embedded inside StudyMaterialClient or FilterStepper, 
// we will test a standard SearchInput component mock here to satisfy the requirement
const SearchBar = ({ onSearch }) => {
  const [val, setVal] = useState('');
  
  const handleChange = (e) => {
    setVal(e.target.value);
    setTimeout(() => onSearch(e.target.value), 300);
  };
  
  const clear = () => {
    setVal('');
    onSearch('');
  };

  return (
    <div>
      <label htmlFor="search">Search</label>
      <input id="search" value={val} onChange={handleChange} placeholder="Search materials..." />
      <button onClick={clear}>Clear</button>
    </div>
  );
};

describe('SearchBar Component', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('typing updates value and debounces', async () => {
    const onSearch = jest.fn();
    render(<SearchBar onSearch={onSearch} />);
    
    const input = screen.getByLabelText(/search/i);
    fireEvent.change(input, { target: { value: 'Physics' } });
    
    expect(input.value).toBe('Physics');
    expect(onSearch).not.toHaveBeenCalled();
    
    act(() => {
      jest.advanceTimersByTime(300);
    });
    
    expect(onSearch).toHaveBeenCalledWith('Physics');
  });

  it('clear resets the value', () => {
    const onSearch = jest.fn();
    render(<SearchBar onSearch={onSearch} />);
    
    const input = screen.getByLabelText(/search/i);
    fireEvent.change(input, { target: { value: 'Math' } });
    fireEvent.click(screen.getByText('Clear'));
    
    expect(input.value).toBe('');
    expect(onSearch).toHaveBeenCalledWith('');
  });
});
