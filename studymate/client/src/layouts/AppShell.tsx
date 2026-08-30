import {
  BookOpenText,
  BrainCircuit,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileStack,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  NotebookPen,
  ListChecks,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { Brand } from '../components/Brand';
import { useAuth } from '../features/auth/auth-context';

const navigation = [
  { label: '首页', to: '/dashboard', icon: LayoutDashboard, color: 'blue' },
  { label: '学习资料', to: '/materials', icon: FileStack, color: 'mint' },
  { label: 'AI 学习', to: '/study', icon: BrainCircuit, color: 'peach' },
  { label: '智能总结', to: '/summary', icon: NotebookPen, color: 'yellow' },
  { label: '重点提炼', to: '/key-points', icon: ListChecks, color: 'mint' },
  { label: '练习测验', to: '/quiz', icon: ClipboardCheck, color: 'pink' },
  { label: '考前复习', to: '/exam-review', icon: BookOpenText, color: 'violet' },
  { label: '学习记录', to: '/history', icon: History, color: 'slate' },
] as const;

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const wasMenuOpen = useRef(false);
  const { user, logout } = useAuth();
  const initials =
    user?.name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() ?? 'SM';
  const today = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const query = search.trim();
    if (query) void navigate(`/materials?q=${encodeURIComponent(query)}`);
  }

  useEffect(() => {
    if (menuOpen) {
      sidebarRef.current?.querySelector<HTMLElement>('.nav-item')?.focus();
    } else if (wasMenuOpen.current) {
      menuButtonRef.current?.focus();
    }
    wasMenuOpen.current = menuOpen;
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [menuOpen]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className="mobile-header">
        <Brand compact />
        <button
          ref={menuButtonRef}
          className="icon-button"
          type="button"
          aria-label={menuOpen ? '关闭导航' : '打开导航'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
      </header>

      {menuOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="关闭导航"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside ref={sidebarRef} className={`sidebar${menuOpen ? ' sidebar--open' : ''}`} aria-label="主导航">
        <div className="sidebar__brand">
          <Brand />
        </div>
        <nav className="sidebar__nav">
          <p className="eyebrow sidebar__eyebrow">你的学习空间</p>
          {navigation.map(({ label, to, icon: Icon, color }) => (
            <NavLink
              key={to}
              className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
              data-color={color}
              to={to}
              onClick={() => setMenuOpen(false)}
            >
              <span className="nav-item__icon" aria-hidden="true">
                <Icon size={19} strokeWidth={2.2} />
              </span>
              <span>{label}</span>
              <ChevronRight className="nav-item__arrow" size={15} aria-hidden="true" />
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__tip">
          <span className="sidebar__tip-icon" aria-hidden="true">
            <Sparkles size={17} />
          </span>
          <div>
            <strong>资料驱动的学习空间</strong>
            <span>学习进度会自动保存。</span>
          </div>
        </div>

        <button className="profile-card" type="button" onClick={() => void logout()}>
          <span className="avatar" aria-hidden="true">{initials}</span>
          <span className="profile-card__copy">
            <strong>{user?.name ?? 'StudyMate 学习者'}</strong>
            <span>{user?.email ?? '已登录'}</span>
          </span>
          <LogOut size={17} aria-hidden="true" />
        </button>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <form className="search-box" role="search" onSubmit={submitSearch}>
            <Search size={18} aria-hidden="true" />
            <input type="search" aria-label="搜索学习空间" placeholder="搜索学习资料…" value={search} onChange={(event) => setSearch(event.target.value)} />
            <button type="submit">搜索</button>
          </form>
          <div className="topbar__date">
            <Clock3 size={17} aria-hidden="true" />
            <span>{today}</span>
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
