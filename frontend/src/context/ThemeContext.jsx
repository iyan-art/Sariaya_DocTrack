import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'theme'; // 'light' | 'dark'

function getInitialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Private browsing / storage disabled — fall through to OS preference.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  // Keeps the `dark` class on <html> in sync with state — this is what
  // index.css's `@custom-variant dark` actually keys every `dark:` utility
  // off, and persists the choice so it survives a reload.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private browsing / storage disabled — just won't persist across reloads.
    }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
