import React from 'react';

export const LexAIFavicon = ({ className = "w-8 h-8", style }: { className?: string; style?: React.CSSProperties }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`text-teal ${className}`}
    style={style}
  >
    <path d="M12 21V3" />
    <path d="M8 21h8" />
    <path d="M4 6h16" />
    <path d="M4 6l-3 8a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2l-3-8Z" />
    <path d="M20 6l-3 8a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2l-3-8Z" />
    <circle cx="12" cy="6" r="1.5" fill="#D4A843" stroke="none" />
  </svg>
);

export const LexAILogo = ({ className = "h-8" }: { className?: string }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <LexAIFavicon className="w-8 h-8" />
    <span className="text-foreground font-serif text-2xl font-bold tracking-tight">
      LexAI
    </span>
  </div>
);

export const BrainIllustration = ({ className = "w-24 h-24" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 100 100"
    fill="none"
    className={className}
  >
    <path
      d="M50 85V15M50 15C35 15 20 25 20 45C20 55 25 65 35 70C40 72.5 45 78 45 85H55C55 78 60 72.5 65 70C75 65 80 55 80 45C80 25 65 15 50 15Z"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-teal opacity-80"
    />
    <circle cx="35" cy="40" r="4" className="fill-teal" />
    <circle cx="65" cy="40" r="4" className="fill-teal" />
    <circle cx="50" cy="30" r="4" fill="#D4A843" />
    <circle cx="45" cy="55" r="3" fill="#D4A843" />
    <circle cx="55" cy="55" r="3" fill="#D4A843" />
    <path d="M35 40L50 30L65 40" className="stroke-teal" strokeWidth="1.5" strokeDasharray="2 2" />
    <path d="M50 30V55" stroke="#D4A843" strokeWidth="1.5" strokeDasharray="2 2" />
  </svg>
);

export const AvatarNarem = ({ className = "w-10 h-10" }: { className?: string }) => (
  <div className={`flex items-center justify-center rounded-full bg-navy-light text-gold font-medium border border-border shadow-sm ${className}`}>
    NR
  </div>
);

export const CorpusIllustration = ({ className = "w-16 h-16" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 64 64"
    fill="none"
    className={className}
  >
    <rect x="16" y="12" width="32" height="40" rx="4" stroke="currentColor" strokeWidth="2" className="text-foreground opacity-60" />
    <rect x="12" y="16" width="32" height="40" rx="4" className="stroke-teal fill-card" strokeWidth="2" />
    <path d="M20 26H36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-foreground opacity-60" />
    <path d="M20 34H36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-foreground opacity-60" />
    <path d="M20 42H28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-foreground opacity-60" />
    <path d="M8 24L48 24" stroke="#D4A843" strokeWidth="2" strokeDasharray="4 4" />
    <circle cx="48" cy="24" r="3" fill="#D4A843" />
  </svg>
);
