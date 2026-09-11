import { QrCode, MapPin, Check } from 'lucide-react';

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

  const textSizes = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
  };

  return (
    <div className="flex items-center gap-3">
      <div className={`${sizes[size]} relative flex items-center justify-center bg-primary-600 rounded-xl shadow-lg`}>
        <QrCode className="w-1/2 h-1/2 text-white" />
        <div className="absolute -bottom-1 -right-1 w-1/3 h-1/3 bg-success-500 rounded-full flex items-center justify-center border-2 border-white">
          <Check className="w-2/3 h-2/3 text-white" />
        </div>
        <div className="absolute -top-1 -left-1 w-1/4 h-1/4 bg-white rounded-full flex items-center justify-center">
          <MapPin className="w-2/3 h-2/3 text-primary-600" />
        </div>
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