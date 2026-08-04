import { createRoot } from 'react-dom/client';

// Placeholder entry so the two-entry Vite build (menubar + preferences)
// resolves. Task 13 replaces this with the real menubar React app.
const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

createRoot(container).render(<>Menubar placeholder</>);
