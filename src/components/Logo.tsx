interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export default function Logo({ size = 'md', showText = true }: LogoProps) {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  };

  const markSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-2xl',
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
  };

  return (
    <div className="flex items-center gap-3">
      <div className={`${sizes[size]} flex items-center justify-center bg-primary-600 rounded-xl shadow-lg`}>
        <span className={`${markSizes[size]} font-bold text-white leading-none`}>FT</span>
      </div>
      {showText && (
        <div>
          <h1 className={`${textSizes[size]} font-bold text-slate-900 leading-tight`}>
            Field<span className="text-primary-600">Track</span>
          </h1>
          {size === 'lg' && (
            <p className="text-xs text-slate-500">Simple. Secure. Accountable Field Attendance.</p>
          )}
        </div>
      )}
    </div>
  );
}