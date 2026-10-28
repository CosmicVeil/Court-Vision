import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import './SiteHeader.css';
import { getUser, isAuthenticated, logout } from '../utils/auth';
import { NAV_LINKS, getInitials } from '../utils/siteNav';

const readUser = () => (isAuthenticated() ? getUser() : null);

// The one header every page shares. It lives in AppShell, so it stays mounted across routes.
export default function SiteHeader() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [user, setUser] = useState(readUser);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef(null);
  const sentinelRef = useRef(null);

  // Login and logout always change the route, so re-reading auth here keeps the profile current
  // without a shared auth store. A new page also closes anything left open.
  useEffect(() => {
    setUser(readUser());
    setDropdownOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  // Solid header once the sentinel (the top 80px of the page) scrolls away. No scroll listener.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Links also close on click: picking the page you are already on doesn't change the route.
  const closeAll = () => { setDropdownOpen(false); setMenuOpen(false); };

  useEffect(() => {
    if (!dropdownOpen && !menuOpen) return undefined;
    const close = () => { setDropdownOpen(false); setMenuOpen(false); };
    const onPointerDown = event => { if (!headerRef.current?.contains(event.target)) close(); };
    const onKeyDown = event => { if (event.key === 'Escape') close(); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [dropdownOpen, menuOpen]);

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setDropdownOpen(false);
    navigate('/');
  };

  const links = NAV_LINKS.map(link => <NavLink key={link.to} to={link.to} onClick={closeAll}>{link.label}</NavLink>);

  return (
    <>
      <div ref={sentinelRef} className="header-sentinel" aria-hidden="true" />
      <header ref={headerRef} className={`header ${scrolled || menuOpen ? 'scrolled' : ''}`}>
        <div className="header-left">
          <Link to="/" className="header-title">COURT VISION</Link>
        </div>
        <nav className="header-nav" aria-label="Main">{links}</nav>
        <div className="header-actions">
          <button type="button" className="header-menu-btn" aria-label="Menu"
            aria-expanded={menuOpen} aria-controls="site-menu"
            onClick={() => { setMenuOpen(open => !open); setDropdownOpen(false); }}>
            <span className="header-menu-icon" aria-hidden="true" />
          </button>
          <div className="header-profile">
            <button type="button" className="profile-btn" aria-label="Account" aria-expanded={dropdownOpen}
              onClick={() => { setDropdownOpen(open => !open); setMenuOpen(false); }}>
              {user
                ? <div className="profile-initials">{getInitials(user)}</div>
                : <img src="/images/profile_image.jpg" alt="" className="profile-img" />}
            </button>
            {dropdownOpen && (
              <div className="profile-dropdown">
                {user ? (
                  <>
                    <div className="dropdown-user-info">
                      <div className="dropdown-user-name">{user.first_name} {user.last_name}</div>
                      <div className="dropdown-user-email">{user.email}</div>
                    </div>
                    <div className="dropdown-divider" />
                    <Link to="/favourites" className="dropdown-item" onClick={closeAll}>My Favourites</Link>
                    <Link to="/recommendations" className="dropdown-item" onClick={closeAll}>Recommendations</Link>
                    <div className="dropdown-divider" />
                    <button type="button" className="dropdown-item logout-btn" onClick={handleLogout}>Logout</button>
                  </>
                ) : (
                  <>
                    <Link to="/login" className="dropdown-item" onClick={closeAll}>Login</Link>
                    <Link to="/create-account" className="dropdown-item" onClick={closeAll}>Create Account</Link>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <nav id="site-menu" className="header-menu" aria-label="Main" hidden={!menuOpen}>{links}</nav>
      </header>
    </>
  );
}
