import { CheckCircle2, X } from 'lucide-react';
import { useEffect } from 'react';

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 4_000);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  return <div className="toast" role="status">
    <CheckCircle2 aria-hidden="true" />
    <span>{message}</span>
    <button type="button" aria-label="关闭通知" onClick={onClose}><X aria-hidden="true" /></button>
  </div>;
}
