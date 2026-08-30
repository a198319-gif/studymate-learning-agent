import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

type BrandProps = {
  compact?: boolean;
};

export function Brand({ compact = false }: BrandProps) {
  return (
    <Link className="brand" to="/dashboard" aria-label="StudyMate 首页">
      <span className="brand__mark" aria-hidden="true">
        <Sparkles size={compact ? 17 : 20} strokeWidth={2.4} />
      </span>
      <span className="brand__word">StudyMate</span>
      {!compact && <span className="brand__dot" aria-hidden="true" />}
    </Link>
  );
}
