const fs = require('fs');
let content = fs.readFileSync('src/app/(dashboard)/issues/page.tsx', 'utf8');

content = content.replace(/var\(--bg-card,#fff\)/g, 'var(--bg-secondary)');
content = content.replace(/var\(--border,#e5e7eb\)/g, 'var(--border)');
content = content.replace(/var\(--bg-primary,#f9fafb\)/g, 'var(--bg-primary)');
content = content.replace(/var\(--brand-red,#e53e3e\)/g, 'var(--brand-red)');

// Status & Priority
content = content.replace(/color: \"#ef4444\", bg: \"#fef2f2\"/g, 'color: \"var(--accent-red)\", bg: \"var(--accent-red-dim)\"');
content = content.replace(/color: \"#dc2626\", bg: \"#fee2e2\"/g, 'color: \"var(--accent-red)\", bg: \"var(--accent-red-dim)\"');
content = content.replace(/color: \"#22c55e\", bg: \"#f0fdf4\"/g, 'color: \"var(--accent-green)\", bg: \"var(--accent-green-dim)\"');
content = content.replace(/color: \"#f59e0b\", bg: \"#fffbeb\"/g, 'color: \"var(--accent-amber)\", bg: \"var(--accent-amber-dim)\"');

// Dropdowns & active states
content = content.replace(/#f5f3ff/g, 'rgba(99, 102, 241, 0.1)');
content = content.replace(/#6366f1/g, '#818cf8'); // indigo text
content = content.replace(/#ede9fe/g, 'rgba(99, 102, 241, 0.12)'); // listening bg

// Success banner
content = content.replace(/background: \"#f0fdf4\", border: \"1px solid #bbf7d0\"/g, 'background: \"var(--accent-green-dim)\", border: \"1px solid rgba(34, 197, 94, 0.2)\"');
content = content.replace(/color: \"#16a34a\"/g, 'color: \"var(--accent-green)\"');

// Doc Connected badge
content = content.replace(/background: \"#f0fdf4\", color: \"#16a34a\"/g, 'background: \"var(--accent-green-dim)\", color: \"var(--accent-green)\"');
content = content.replace(/border: \"1px solid #bbf7d0\"/g, 'border: \"1px solid rgba(34, 197, 94, 0.2)\"');

// Icon backgrounds
content = content.replace(/background: \"#e8f0fe\"/g, 'background: \"rgba(66, 133, 244, 0.12)\"');

// Buttons outline bg fallback
content = content.replace(/background: \"var\(--bg-primary,#f9fafb\)\"/g, 'background: \"var(--bg-primary)\"');
// White fallback in buttons
content = content.replace(/\|\| \"#fff\"/g, '|| \"var(--bg-secondary)\"');
content = content.replace(/s === \"all\" \? \"#fff\"/g, 's === \"all\" ? \"var(--bg-secondary)\"');
content = content.replace(/\|\| \"#000\"/g, '|| \"var(--text-primary)\"');

fs.writeFileSync('src/app/(dashboard)/issues/page.tsx', content);
